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

function parseAiProvider(raw) {
  const normalized = asString(raw).toLowerCase();
  if (!normalized) {
    return "openai_compatible";
  }
  if (normalized === "mock") {
    return "openai_compatible";
  }
  if (["bigmodel", "zhipu", "zhipuai"].includes(normalized)) {
    return "bigmodel";
  }
  if (["deepseek", "openai_compatible"].includes(normalized)) {
    return normalized;
  }
  return "openai_compatible";
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
  const dbStateTable =
    asString(env.MQ_DB_LEGACY_SNAPSHOT_TABLE) ||
    asString(env.MQ_DB_STATE_TABLE) ||
    "mealquest_state_snapshots";
  const dbSnapshotKey = asString(env.MQ_DB_SNAPSHOT_KEY) || "main";
  const dbPoolMax = parsePositiveInt(env.MQ_DB_POOL_MAX, 5);
  const dbAutoCreate = parseBoolean(env.MQ_DB_AUTO_CREATE, true);
  const dbAdminUrl = asString(env.MQ_DB_ADMIN_URL);
  const authHttpTimeoutMs = parsePositiveInt(env.MQ_AUTH_HTTP_TIMEOUT_MS, 10000);
  const authWeChatMiniAppId = asString(env.MQ_AUTH_WECHAT_MINI_APP_ID);
  const authWeChatMiniAppSecret = asString(env.MQ_AUTH_WECHAT_MINI_APP_SECRET);
  const authAlipayVerifyUrl = asString(env.MQ_AUTH_ALIPAY_VERIFY_URL);
  const authAlipayAppId = asString(env.MQ_AUTH_ALIPAY_APP_ID);
  const authAlipayAppSecret = asString(env.MQ_AUTH_ALIPAY_APP_SECRET);
  const aiProvider = parseAiProvider(env.MQ_AI_PROVIDER);
  const aiBaseUrl =
    asString(env.MQ_AI_BASE_URL) ||
    (aiProvider === "bigmodel"
      ? "https://open.bigmodel.cn/api/paas/v4"
      : "http://127.0.0.1:11434/v1");
  const aiModel =
    asString(env.MQ_AI_MODEL) ||
    (aiProvider === "bigmodel" ? "glm-4.7-flash" : "qwen2.5:7b-instruct");
  const aiApiKey = asString(env.MQ_AI_API_KEY);
  const aiTimeoutDefault = aiProvider === "bigmodel" ? 45000 : 15000;
  const aiTimeoutMs = parsePositiveInt(env.MQ_AI_TIMEOUT_MS, aiTimeoutDefault);
  const aiMaxRetries = parsePositiveInt(env.MQ_AI_MAX_RETRIES, 2);

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
  const hasCustomerAuth = Boolean(
    (authWeChatMiniAppId && authWeChatMiniAppSecret) ||
      authAlipayVerifyUrl
  );
  if (isProduction && !hasCustomerAuth) {
    errors.push(
      "At least one customer auth provider is required in production (WeChat or Alipay)"
    );
  }
  if (isProduction && aiProvider === "bigmodel" && !aiApiKey) {
    errors.push("MQ_AI_API_KEY is required when MQ_AI_PROVIDER=bigmodel in production");
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
      },
      alipay: {
        verifyUrl: authAlipayVerifyUrl,
        appId: authAlipayAppId,
        appSecret: authAlipayAppSecret
      }
    },
    aiStrategy: {
      provider: aiProvider,
      baseUrl: aiBaseUrl,
      model: aiModel,
      apiKey: aiApiKey,
      timeoutMs: aiTimeoutMs,
      maxRetries: aiMaxRetries,
    }
  };
}

module.exports = {
  loadServerEnv,
  resolveServerRuntimeEnv
};
