const {
  readJsonBody,
  sendJson,
  ensureRole,
  buildTenantPolicyPatch,
  applyMigrationStep,
  cutoverMerchantToDedicatedDb,
} = require("../serverHelpers");

function createTenantRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  tenantRouter,
  actualDb,
  postgresOptions,
  appendAuditLog,
}) {
  async function runWithRootFreshState(runner) {
    if (typeof actualDb.runWithFreshState === "function") {
      return actualDb.runWithFreshState(async (workingDb) => runner(workingDb));
    }
    return runner(actualDb);
  }

  async function runWithRootFreshRead(runner) {
    if (typeof actualDb.runWithFreshRead === "function") {
      return actualDb.runWithFreshRead(async (workingDb) => runner(workingDb));
    }
    return runner(actualDb);
  }

  return async function handleTenantRoutes({ method, url, req, auth, res }) {
    if (method === "GET" && url.pathname === "/api/merchant/tenant-policy") {
      ensureRole(auth, ["OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }

      sendJson(res, 200, {
        merchantId,
        policy: tenantPolicyManager.getPolicy(merchantId),
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/tenant-policy") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }

      const patch = buildTenantPolicyPatch(body);
      const policy = await runWithRootFreshState(async (rootDb) => {
        const appliedPolicy = tenantPolicyManager.setMerchantPolicy(merchantId, patch);
        if (!rootDb.tenantPolicies || typeof rootDb.tenantPolicies !== "object") {
          rootDb.tenantPolicies = {};
        }
        rootDb.tenantPolicies[merchantId] = {
          ...appliedPolicy,
        };
        rootDb.save();
        return appliedPolicy;
      });
      appendAuditLog({
        merchantId,
        action: "TENANT_POLICY_SET",
        status: "SUCCESS",
        auth,
        details: {
          patch,
        },
      });

      sendJson(res, 200, {
        merchantId,
        policy,
      });
      return true;
    }

    if (method === "GET" && url.pathname === "/api/merchant/migration/status") {
      ensureRole(auth, ["OWNER"]);
      const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (!(await tenantRepository.getMerchant(merchantId))) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const snapshot = await runWithRootFreshRead(async (rootDb) => ({
        migration: rootDb.tenantMigrations[merchantId] || {
          phase: "IDLE",
          step: "INIT",
          note: "",
          updatedAt: null,
        },
        dedicatedDbFilePath:
          (rootDb.tenantRouteFiles && rootDb.tenantRouteFiles[merchantId]) || null,
      }));
      sendJson(res, 200, {
        merchantId,
        dedicatedDbAttached: tenantRouter.hasDbOverride(merchantId),
        dedicatedDbFilePath: snapshot.dedicatedDbFilePath,
        migration: snapshot.migration,
        policy: tenantPolicyManager.getPolicy(merchantId),
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/migration/step") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (!(await tenantRepository.getMerchant(merchantId))) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const result = await runWithRootFreshState(async (rootDb) =>
        applyMigrationStep({
          actualDb: rootDb,
          tenantPolicyManager,
          merchantId,
          step: body.step,
          note: body.note,
        })
      );
      appendAuditLog({
        merchantId,
        action: "MIGRATION_STEP",
        status: "SUCCESS",
        auth,
        details: {
          step: result.migration.step,
          phase: result.migration.phase,
          note: result.migration.note,
        },
      });

      sendJson(res, 200, {
        merchantId,
        dedicatedDbAttached: tenantRouter.hasDbOverride(merchantId),
        ...result,
      });
      return true;
    }

    if (method === "POST" && url.pathname === "/api/merchant/migration/cutover") {
      ensureRole(auth, ["OWNER"]);
      const body = await readJsonBody(req);
      const merchantId = auth.merchantId || body.merchantId;
      if (!merchantId) {
        sendJson(res, 400, { error: "merchantId is required" });
        return true;
      }
      if (auth.merchantId && auth.merchantId !== merchantId) {
        sendJson(res, 403, { error: "merchant scope denied" });
        return true;
      }
      if (!(await tenantRepository.getMerchant(merchantId))) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const { cutoverResult, finalState } = await runWithRootFreshState(async (rootDb) => {
        let cutoverOutput = null;
        let finalOutput = null;
        try {
          applyMigrationStep({
            actualDb: rootDb,
            tenantPolicyManager,
            merchantId,
            step: "FREEZE_WRITE",
            note: body.note || "auto freeze for cutover",
          });
          cutoverOutput = await cutoverMerchantToDedicatedDb({
            actualDb: rootDb,
            tenantRouter,
            merchantId,
            postgresOptions,
          });
          applyMigrationStep({
            actualDb: rootDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_VERIFYING",
            note: "cutover verification",
          });
          applyMigrationStep({
            actualDb: rootDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_CUTOVER",
            note: "cutover completed",
          });
          finalOutput = applyMigrationStep({
            actualDb: rootDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after cutover",
          });
        } catch (error) {
          applyMigrationStep({
            actualDb: rootDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after cutover failure",
          });
          throw error;
        }
        return {
          cutoverResult: cutoverOutput,
          finalState: finalOutput,
        };
      });

      appendAuditLog({
        merchantId,
        action: "MIGRATION_CUTOVER",
        status: "SUCCESS",
        auth,
        details: {
          dedicatedDbFilePath: cutoverResult.dedicatedDbFilePath,
          phase: finalState.migration.phase,
        },
      });

      sendJson(res, 200, {
        merchantId,
        ...cutoverResult,
        ...finalState,
      });
      return true;
    }

    return false;
  };
}

module.exports = {
  createTenantRoutesHandler,
};
