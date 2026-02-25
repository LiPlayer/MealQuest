const {
  readJsonBody,
  sendJson,
  ensureRole,
  buildTenantPolicyPatch,
  applyMigrationStep,
  cutoverMerchantToDedicatedDb,
  rollbackMerchantToSharedDb,
} = require("../serverHelpers");

function createTenantRoutesHandler({
  tenantPolicyManager,
  tenantRepository,
  tenantRouter,
  actualDb,
  postgresOptions,
  appendAuditLog,
}) {
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
      const policy = tenantPolicyManager.setMerchantPolicy(merchantId, patch);
      actualDb.tenantPolicies[merchantId] = {
        ...policy,
      };
      actualDb.save();
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
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const migration = actualDb.tenantMigrations[merchantId] || {
        phase: "IDLE",
        step: "INIT",
        note: "",
        updatedAt: null,
      };
      sendJson(res, 200, {
        merchantId,
        dedicatedDbAttached: tenantRouter.hasDbOverride(merchantId),
        dedicatedDbFilePath:
          (actualDb.tenantRouteFiles && actualDb.tenantRouteFiles[merchantId]) || null,
        migration,
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
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      const result = applyMigrationStep({
        actualDb,
        tenantPolicyManager,
        merchantId,
        step: body.step,
        note: body.note,
      });
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
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      let cutoverResult = null;
      let finalState = null;
      try {
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "FREEZE_WRITE",
          note: body.note || "auto freeze for cutover",
        });
        cutoverResult = await cutoverMerchantToDedicatedDb({
          actualDb,
          tenantRouter,
          merchantId,
          postgresOptions,
        });
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "MARK_VERIFYING",
          note: "cutover verification",
        });
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "MARK_CUTOVER",
          note: "cutover completed",
        });
        finalState = applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "UNFREEZE_WRITE",
          note: "restore write traffic after cutover",
        });
      } catch (error) {
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "MARK_ROLLBACK",
          note: `cutover failed: ${error.message}`,
        });
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "UNFREEZE_WRITE",
          note: "restore write traffic after cutover failure",
        });
        throw error;
      }

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

    if (method === "POST" && url.pathname === "/api/merchant/migration/rollback") {
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
      if (!tenantRepository.getMerchant(merchantId)) {
        sendJson(res, 404, { error: "merchant not found" });
        return true;
      }

      let rollbackResult = null;
      let finalState = null;
      try {
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "FREEZE_WRITE",
          note: body.note || "freeze before rollback",
        });
        rollbackResult = await rollbackMerchantToSharedDb({
          actualDb,
          tenantRouter,
          merchantId,
        });
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "MARK_ROLLBACK",
          note: "rollback completed",
        });
        finalState = applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "UNFREEZE_WRITE",
          note: "restore write traffic after rollback",
        });
      } catch (error) {
        applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: "UNFREEZE_WRITE",
          note: "restore write traffic after rollback failure",
        });
        throw error;
      }

      appendAuditLog({
        merchantId,
        action: "MIGRATION_ROLLBACK",
        status: "SUCCESS",
        auth,
        details: {
          phase: finalState.migration.phase,
        },
      });

      sendJson(res, 200, {
        merchantId,
        ...rollbackResult,
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
