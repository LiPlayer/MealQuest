const http = require("node:http");
const { URL } = require("node:url");

const { createInMemoryDb } = require("../store/inMemoryDb");
const { createPaymentService } = require("../services/paymentService");
const { createCampaignService } = require("../services/campaignService");
const { createMerchantService } = require("../services/merchantService");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function createAppServer({ db = createInMemoryDb() } = {}) {
  const paymentService = createPaymentService(db);
  const campaignService = createCampaignService(db);
  const merchantService = createMerchantService(db);

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || "GET";
      const url = new URL(req.url || "/", "http://localhost");

      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, now: new Date().toISOString() });
        return;
      }

      if (method === "GET" && url.pathname === "/api/state") {
        const merchantId = url.searchParams.get("merchantId");
        const userId = url.searchParams.get("userId");
        if (!merchantId || !userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        const merchant = db.merchants[merchantId];
        const user = db.users[userId];
        if (!merchant || !user) {
          sendJson(res, 404, { error: "merchant or user not found" });
          return;
        }
        sendJson(res, 200, {
          merchant,
          user,
          dashboard: merchantService.getDashboard({ merchantId }),
          campaigns: db.campaigns.filter((item) => item.merchantId === merchantId)
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/quote") {
        const body = await readJsonBody(req);
        const result = paymentService.getQuote(body);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/verify") {
        const body = await readJsonBody(req);
        const result = paymentService.verifyPayment({
          ...body,
          idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/refund") {
        const body = await readJsonBody(req);
        const result = paymentService.refundPayment({
          ...body,
          idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/dashboard") {
        const merchantId = url.searchParams.get("merchantId");
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        sendJson(res, 200, merchantService.getDashboard({ merchantId }));
        return;
      }

      const proposalMatch = url.pathname.match(
        /^\/api\/merchant\/proposals\/([^/]+)\/confirm$/
      );
      if (method === "POST" && proposalMatch) {
        const body = await readJsonBody(req);
        const proposalId = proposalMatch[1];
        const result = merchantService.confirmProposal({
          merchantId: body.merchantId,
          proposalId,
          operatorId: body.operatorId || "system"
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/kill-switch") {
        const body = await readJsonBody(req);
        const result = merchantService.setKillSwitch({
          merchantId: body.merchantId,
          enabled: body.enabled
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/tca/trigger") {
        const body = await readJsonBody(req);
        const result = campaignService.triggerEvent(body);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Request failed" });
    }
  });

  function start(port = 0) {
    return new Promise((resolve, reject) => {
      server.listen(port, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to read server address"));
          return;
        }
        resolve(address.port);
      });
    });
  }

  function stop() {
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  return {
    db,
    server,
    start,
    stop,
    services: {
      paymentService,
      campaignService,
      merchantService
    }
  };
}

if (require.main === module) {
  const app = createAppServer();
  const port = Number(process.env.PORT || 3030);
  app
    .start(port)
    .then((startedPort) => {
      // eslint-disable-next-line no-console
      console.log(`MealQuestServer listening on port ${startedPort}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to start server:", error);
      process.exit(1);
    });
}

module.exports = {
  createAppServer
};
