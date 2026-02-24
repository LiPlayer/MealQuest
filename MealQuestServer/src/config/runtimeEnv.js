const fs = require("node:fs");
const path = require("node:path");

function loadServerEnv() {
  const envFile = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) {
    return;
  }
  require("dotenv").config({ path: envFile });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePort(rawPort) {
  const parsed = Number(rawPort);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }
  return Math.floor(parsed);
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseBoolean(raw, fallback) {
  if (typeof raw === "boolean") {
    return raw;
  }
  const normalized = asString(raw).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveServerRuntimeEnv(env = process.env) {
  const nodeEnv = asString(env.NODE_ENV) || "development";
  const isProduction = nodeEnv === "production";

  const host = asString(env.HOST) || "0.0.0.0";
  const port = parsePort(env.PORT) || 3030;

  const jwtSecret = asString(env.MQ_JWT_SECRET);
  const paymentCallbackSecret = asString(env.MQ_PAYMENT_CALLBACK_SECRET);
  const onboardSecret = asString(env.MQ_ONBOARD_SECRET);
  const dbUrl = asString(env.MQ_DB_URL);
  const dbSchema = asString(env.MQ_DB_SCHEMA) || "public";
  const dbStateTable = asString(env.MQ_DB_STATE_TABLE) || "mealquest_state_snapshots";
  const dbSnapshotKey = asString(env.MQ_DB_SNAPSHOT_KEY) || "main";
  const dbPoolMax = parsePositiveInt(env.MQ_DB_POOL_MAX, 5);
  const dbAutoCreate = parseBoolean(env.MQ_DB_AUTO_CREATE, true);
  const dbAdminUrl = asString(env.MQ_DB_ADMIN_URL);
  const authHttpTimeoutMs = parsePositiveInt(env.MQ_AUTH_HTTP_TIMEOUT_MS, 10000);
  const authWeChatMiniAppId = asString(env.MQ_AUTH_WECHAT_MINI_APP_ID);
  const authWeChatMiniAppSecret = asString(env.MQ_AUTH_WECHAT_MINI_APP_SECRET);

  const errors = [];
  if (isProduction && !jwtSecret) {
    errors.push("MQ_JWT_SECRET is required when NODE_ENV=production");
  }
  if (isProduction && !paymentCallbackSecret) {
    errors.push("MQ_PAYMENT_CALLBACK_SECRET is required when NODE_ENV=production");
  }
  if (!dbUrl) {
    errors.push("MQ_DB_URL is required");
  }
  const hasCustomerAuth = Boolean(authWeChatMiniAppId && authWeChatMiniAppSecret);
  if (isProduction && !hasCustomerAuth) {
    errors.push(
      "MQ_AUTH_WECHAT_MINI_APP_ID and MQ_AUTH_WECHAT_MINI_APP_SECRET are required in production"
    );
  }
  if (errors.length > 0) {
    throw new Error(`Invalid server env: ${errors.join("; ")}`);
  }

  return {
    nodeEnv,
    host,
    port,
    jwtSecret: jwtSecret || "mealquest-dev-secret",
    paymentCallbackSecret:
      paymentCallbackSecret || "mealquest-payment-callback-secret",
    onboardSecret,
    dbUrl,
    dbSchema,
    dbStateTable,
    dbSnapshotKey,
    dbPoolMax,
    dbAutoCreate,
    dbAdminUrl,
    authHttpTimeoutMs,
    authProviders: {
      wechatMini: {
        appId: authWeChatMiniAppId,
        appSecret: authWeChatMiniAppSecret
      }
    }
  };
}

module.exports = {
  loadServerEnv,
  resolveServerRuntimeEnv
};
