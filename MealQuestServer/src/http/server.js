const http = require("node:http");
const { URL } = require("node:url");
const {
  loadServerEnv,
  resolveServerRuntimeEnv
} = require("../config/runtimeEnv");

loadServerEnv();

const { createTenantPolicyManager } = require("../core/tenantPolicy");
const { createTenantRouter } = require("../core/tenantRouter");
const { createWebSocketHub } = require("../core/websocketHub");
const { createCampaignService } = require("../services/campaignService");
const { createInvoiceService } = require("../services/invoiceService");
const { createMerchantService } = require("../services/merchantService");
const { createAiStrategyService } = require("../services/aiStrategyService");
const { createAllianceService } = require("../services/allianceService");
const { createPaymentService } = require("../services/paymentService");
const { createPrivacyService } = require("../services/privacyService");
const { createSupplierService } = require("../services/supplierService");
const {
  createSocialAuthService
} = require("../services/socialAuthService");
const { createInMemoryDb } = require("../store/inMemoryDb");
const { createPostgresDb } = require("../store/postgresDb");
const { createTenantRepository } = require("../store/tenantRepository");
const {
  getUpgradeAuthContext,
  uniqueDbs,
} = require("./serverHelpers");
const { createHttpRequestHandler } = require("./createHttpRequestHandler");

const MERCHANT_ROLES = ["CLERK", "MANAGER", "OWNER"];
const CASHIER_ROLES = ["CUSTOMER", "CLERK", "MANAGER", "OWNER"];
function createAppServer({
  db = null,
  postgresOptions = {},
  tenantDbMap = {},
  tenantPolicyMap = {},
  defaultTenantPolicy = {},
  jwtSecret = process.env.MQ_JWT_SECRET || "mealquest-dev-secret",
  paymentCallbackSecret =
    process.env.MQ_PAYMENT_CALLBACK_SECRET || "mealquest-payment-callback-secret",
  onboardSecret = process.env.MQ_ONBOARD_SECRET || "",
  paymentProvider = null,
  socialAuthService = null,
  socialAuthOptions = {},
  aiStrategyOptions = {}
} = {}) {
  const actualDb = db || createInMemoryDb();
  if (typeof actualDb.save !== "function") {
    actualDb.save = () => { };
  }
  if (!actualDb.tenantRouteFiles || typeof actualDb.tenantRouteFiles !== "object") {
    actualDb.tenantRouteFiles = {};
  }
  const hydratedTenantDbMap = {};
  for (const [merchantId, snapshotRef] of Object.entries(actualDb.tenantRouteFiles)) {
    if (!merchantId || !snapshotRef || typeof snapshotRef !== "object") {
      continue;
    }
    if (snapshotRef.type !== "INLINE_SNAPSHOT") {
      continue;
    }
    const tenantDb = createInMemoryDb(snapshotRef.state || null);
    tenantDb.save = () => {
      snapshotRef.state = tenantDb.serialize();
      actualDb.tenantRouteFiles[merchantId] = snapshotRef;
      actualDb.save();
    };
    hydratedTenantDbMap[merchantId] = tenantDb;
  }
  const mergedTenantDbMap = {
    ...hydratedTenantDbMap,
    ...(tenantDbMap || {})
  };
  const managedDbs = uniqueDbs([actualDb, ...Object.values(mergedTenantDbMap)]);

  const tenantRouter = createTenantRouter({
    defaultDb: actualDb,
    tenantDbMap: mergedTenantDbMap
  });
  const tenantRepository = createTenantRepository({
    tenantRouter
  });
  const persistedTenantPolicyMap =
    actualDb.tenantPolicies && typeof actualDb.tenantPolicies === "object"
      ? actualDb.tenantPolicies
      : {};
  const mergedTenantPolicyMap = {
    ...persistedTenantPolicyMap,
    ...(tenantPolicyMap || {})
  };
  actualDb.tenantPolicies = { ...mergedTenantPolicyMap };
  const tenantPolicyManager = createTenantPolicyManager({
    tenantPolicyMap: mergedTenantPolicyMap,
    defaultTenantPolicy
  });
  actualDb.save();
  const serviceCache = new WeakMap();
  const activeSocialAuthService =
    socialAuthService ||
    createSocialAuthService({
      timeoutMs: socialAuthOptions.timeoutMs,
      providers: socialAuthOptions.providers
    });
  const aiStrategyService = createAiStrategyService(aiStrategyOptions);
  const getServicesForDb = (scopedDb) => {
    let services = serviceCache.get(scopedDb);
    if (!services) {
      services = {
        paymentService: createPaymentService(scopedDb, { paymentProvider }),
        campaignService: createCampaignService(scopedDb),
        merchantService: createMerchantService(scopedDb, { aiStrategyService }),
        allianceService: createAllianceService(scopedDb),
        invoiceService: createInvoiceService(scopedDb),
        privacyService: createPrivacyService(scopedDb),
        supplierService: createSupplierService(scopedDb)
      };
      serviceCache.set(scopedDb, services);
    }
    return services;
  };
  const getServicesForMerchant = (merchantId) => {
    const scopedDb = tenantRouter.getDbForMerchant(merchantId);
    return getServicesForDb(scopedDb);
  };
  const services = getServicesForDb(actualDb);
  const wsHub = createWebSocketHub();
  const allSockets = new Set();
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    requestsByPath: {},
    errorsTotal: 0
  };
  const appendAuditLog = ({ merchantId, action, status, auth, details }) => {
    tenantRepository.appendAuditLog({
      merchantId,
      action,
      status,
      role: auth && auth.role,
      operatorId: auth && (auth.operatorId || auth.userId),
      details
    });
  };

  const server = http.createServer(
    createHttpRequestHandler({
      jwtSecret,
      paymentCallbackSecret,
      onboardSecret,
      metrics,
      tenantPolicyManager,
      tenantRepository,
      getServicesForDb,
      getServicesForMerchant,
      wsHub,
      actualDb,
      tenantRouter,
      activeSocialAuthService,
      appendAuditLog,
      MERCHANT_ROLES,
      CASHIER_ROLES,
      postgresOptions,
    })
  );


  server.on("upgrade", (req, socket) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      if (parsedUrl.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      const auth = getUpgradeAuthContext(req, jwtSecret, parsedUrl);
      const merchantId = parsedUrl.searchParams.get("merchantId");
      if (merchantId && auth.merchantId && merchantId !== auth.merchantId) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      const scopedMerchantId = auth.merchantId || merchantId;
      const wsPolicy = tenantPolicyManager.evaluate({
        merchantId: scopedMerchantId,
        operation: "WS_CONNECT"
      });
      if (!wsPolicy.allowed) {
        const statusLine =
          wsPolicy.statusCode === 429
            ? "HTTP/1.1 429 Too Many Requests\r\n\r\n"
            : "HTTP/1.1 403 Forbidden\r\n\r\n";
        socket.write(statusLine);
        socket.destroy();
        return;
      }
      wsHub.handleUpgrade(req, socket, {
        ...auth,
        merchantId: scopedMerchantId
      });
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("connection", (socket) => {
    allSockets.add(socket);
    socket.on("close", () => allSockets.delete(socket));
  });

  function start(port = 0, host) {
    return new Promise((resolve, reject) => {
      const listenHost =
        typeof host === "string" && host.trim()
          ? host.trim()
          : "127.0.0.1";
      const onListening = () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to read server address"));
          return;
        }
        resolve(address.port);
      };
      server.listen(port, listenHost, onListening);
    });
  }

  function stop() {
    return new Promise((resolve, reject) => {
      wsHub.closeAll();
      for (const socket of [...allSockets]) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        const dynamicManaged = uniqueDbs([
          ...managedDbs,
          ...(tenantRouter.listOverrideDbs ? tenantRouter.listOverrideDbs() : []),
        ]);
        Promise.all(
          dynamicManaged.map(async (dbItem) => {
            if (dbItem && typeof dbItem.flush === "function") {
              await dbItem.flush();
            }
            if (dbItem && typeof dbItem.close === "function") {
              await dbItem.close();
            }
          }),
        )
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  return {
    db: actualDb,
    server,
    start,
    stop,
    wsHub,
    tenantRouter,
    tenantRepository,
    tenantPolicyManager,
    services: {
      ...services,
      getServicesForMerchant
    }
  };
}

async function createAppServerAsync(options = {}) {
  const runtimeEnv = resolveServerRuntimeEnv(process.env);
  const inputPostgresOptions = options.postgresOptions || {};
  const socialAuthOptions = {
    timeoutMs:
      (options.socialAuthOptions && options.socialAuthOptions.timeoutMs) ||
      runtimeEnv.authHttpTimeoutMs,
    providers:
      (options.socialAuthOptions && options.socialAuthOptions.providers) ||
      runtimeEnv.authProviders
  };

  const postgresOptions = {
    connectionString:
      inputPostgresOptions.connectionString ||
      runtimeEnv.dbUrl,
    schema:
      inputPostgresOptions.schema ||
      runtimeEnv.dbSchema ||
      "public",
    table:
      inputPostgresOptions.table ||
      runtimeEnv.dbStateTable ||
      "mealquest_state_snapshots",
    snapshotKey:
      inputPostgresOptions.snapshotKey ||
      runtimeEnv.dbSnapshotKey ||
      "main",
    maxPoolSize:
      inputPostgresOptions.maxPoolSize ||
      runtimeEnv.dbPoolMax ||
      5,
    enforceRls:
      inputPostgresOptions.enforceRls === undefined
        ? runtimeEnv.dbEnforceRls
        : Boolean(inputPostgresOptions.enforceRls),
    autoCreateDatabase:
      inputPostgresOptions.autoCreateDatabase === undefined
        ? runtimeEnv.dbAutoCreate
        : Boolean(inputPostgresOptions.autoCreateDatabase),
    adminConnectionString:
      (typeof inputPostgresOptions.adminConnectionString === "string" &&
        inputPostgresOptions.adminConnectionString.trim()) ||
      runtimeEnv.dbAdminUrl ||
      null,
  };

  const rootDb =
    options.db ||
    (await createPostgresDb({
      ...postgresOptions,
      onPersistError: (error) => {
        // eslint-disable-next-line no-console
        console.error("[postgres-db] persist failed:", error.message);
      },
    }));

  if (!rootDb.tenantRouteFiles || typeof rootDb.tenantRouteFiles !== "object") {
    rootDb.tenantRouteFiles = {};
  }

  const persistedTenantDbMap = {};
  for (const [merchantId, snapshotRef] of Object.entries(rootDb.tenantRouteFiles)) {
    if (!merchantId || typeof snapshotRef !== "string" || !snapshotRef.trim()) {
      continue;
    }
    persistedTenantDbMap[merchantId] = await createPostgresDb({
      ...postgresOptions,
      snapshotKey: snapshotRef.trim(),
      onPersistError: (error) => {
        // eslint-disable-next-line no-console
        console.error("[postgres-db] tenant persist failed:", error.message);
      },
    });
  }

  return createAppServer({
    ...options,
    db: rootDb,
    postgresOptions,
    socialAuthOptions,
    aiStrategyOptions: options.aiStrategyOptions || runtimeEnv.aiStrategy,
    tenantDbMap: {
      ...persistedTenantDbMap,
      ...(options.tenantDbMap || {}),
    },
  });
}

if (require.main === module) {
  const runtimeEnv = resolveServerRuntimeEnv(process.env);
  let appInstance = null;
  let shuttingDown = false;

  const shutdownGracefully = async (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}, shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error("[server] graceful shutdown timeout, forcing exit.");
      process.exit(1);
    }, 10000);
    if (typeof forceExitTimer.unref === "function") {
      forceExitTimer.unref();
    }

    try {
      if (appInstance && typeof appInstance.stop === "function") {
        await appInstance.stop();
      }
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      // eslint-disable-next-line no-console
      console.error("[server] graceful shutdown failed:", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    shutdownGracefully("SIGINT");
  });
  process.once("SIGTERM", () => {
    shutdownGracefully("SIGTERM");
  });

  createAppServerAsync({
    postgresOptions: {
      connectionString: runtimeEnv.dbUrl,
      schema: runtimeEnv.dbSchema,
      table: runtimeEnv.dbStateTable,
      snapshotKey: runtimeEnv.dbSnapshotKey,
      maxPoolSize: runtimeEnv.dbPoolMax,
      enforceRls: runtimeEnv.dbEnforceRls,
      autoCreateDatabase: runtimeEnv.dbAutoCreate,
      adminConnectionString: runtimeEnv.dbAdminUrl || null,
    },
    jwtSecret: runtimeEnv.jwtSecret,
    paymentCallbackSecret: runtimeEnv.paymentCallbackSecret,
    onboardSecret: runtimeEnv.onboardSecret,
    socialAuthOptions: {
      timeoutMs: runtimeEnv.authHttpTimeoutMs,
      providers: runtimeEnv.authProviders
    },
    aiStrategyOptions: runtimeEnv.aiStrategy
  })
    .then((app) => {
      appInstance = app;
      return app.start(runtimeEnv.port, runtimeEnv.host);
    })
    .then((startedPort) => {
      // eslint-disable-next-line no-console
      console.log(`MealQuestServer listening on ${runtimeEnv.host}:${startedPort}`);
      // eslint-disable-next-line no-console
      console.log("[db] driver=postgres");
    })
    .catch(async (error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to start server:", error);
      if (appInstance && typeof appInstance.stop === "function") {
        try {
          await appInstance.stop();
        } catch {
          // ignore stop errors during startup failure
        }
      }
      process.exit(1);
    });
}

module.exports = {
  createAppServer,
  createAppServerAsync,
};
