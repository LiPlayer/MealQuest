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
    return "deepseek";
  }
  if (["deepseek", "openai", "zhipuai"].includes(normalized)) {
    return normalized;
  }
  return "deepseek";
}

function resolveAiApiKey(aiProvider, env) {
  if (aiProvider === "openai") {
    return asString(env.OPENAI_API_KEY);
  }
  if (aiProvider === "deepseek") {
    return asString(env.DEEPSEEK_API_KEY);
  }
  if (aiProvider === "zhipuai") {
    return asString(env.ZHIPUAI_API_KEY);
  }
  return "";
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
  const dbSnapshotKey = asString(env.MQ_DB_SNAPSHOT_KEY) || "main";
  const dbPoolMax = parsePositiveInt(env.MQ_DB_POOL_MAX, 5);
  const dbAutoCreate = parseBoolean(env.MQ_DB_AUTO_CREATE, true);
  const dbEnforceRls = parseBoolean(env.MQ_DB_ENFORCE_RLS, true);
  const dbAdminUrl = asString(env.MQ_DB_ADMIN_URL);
  const authHttpTimeoutMs = parsePositiveInt(env.MQ_AUTH_HTTP_TIMEOUT_MS, 10000);
  const authWeChatMiniAppId = asString(env.MQ_AUTH_WECHAT_MINI_APP_ID);
  const authWeChatMiniAppSecret = asString(env.MQ_AUTH_WECHAT_MINI_APP_SECRET);
  const authAlipayVerifyUrl = asString(env.MQ_AUTH_ALIPAY_VERIFY_URL);
  const authAlipayAppId = asString(env.MQ_AUTH_ALIPAY_APP_ID);
  const authAlipayAppSecret = asString(env.MQ_AUTH_ALIPAY_APP_SECRET);
  const aiProvider = parseAiProvider(env.MQ_AI_PROVIDER);
  const aiBaseUrlDefaultByProvider = {
    deepseek: "https://api.deepseek.com/v1",
    openai: "https://api.openai.com/v1",
    zhipuai: "https://open.bigmodel.cn/api/paas/v4",
  };
  const aiModelDefaultByProvider = {
    deepseek: "deepseek-chat",
    openai: "gpt-4o-mini",
    zhipuai: "glm-3-turbo",
  };
  const aiTimeoutDefaultByProvider = {
    deepseek: 30000,
    openai: 30000,
    zhipuai: 30000,
  };
  const aiBaseUrl =
    aiBaseUrlDefaultByProvider[aiProvider] ||
    aiBaseUrlDefaultByProvider.deepseek;
  const aiModel =
    aiModelDefaultByProvider[aiProvider] ||
    aiModelDefaultByProvider.deepseek;
  const aiApiKey = resolveAiApiKey(aiProvider, env);
  const aiTimeoutDefault =
    aiTimeoutDefaultByProvider[aiProvider] ||
    aiTimeoutDefaultByProvider.deepseek;
  const aiTimeoutMs = aiTimeoutDefault;
  const aiMaxRetries = 2;
  const policyTemplateValidateOnBoot = parseBoolean(
    env.MQ_POLICY_TEMPLATE_VALIDATE_ON_BOOT,
    true
  );

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
  if (
    isProduction &&
    ["openai", "deepseek", "zhipuai"].includes(aiProvider) &&
    !aiApiKey
  ) {
    if (aiProvider === "openai") {
      errors.push(
        "OPENAI_API_KEY is required when MQ_AI_PROVIDER=openai in production"
      );
    } else if (aiProvider === "deepseek") {
      errors.push(
        "DEEPSEEK_API_KEY is required when MQ_AI_PROVIDER=deepseek in production"
      );
    } else {
      errors.push(
        "ZHIPUAI_API_KEY is required when MQ_AI_PROVIDER=zhipuai in production"
      );
    }
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
    dbSnapshotKey,
    dbPoolMax,
    dbAutoCreate,
    dbEnforceRls,
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
    strategyAgent: {
      provider: aiProvider,
      baseUrl: aiBaseUrl,
      model: aiModel,
      apiKey: aiApiKey,
      timeoutMs: aiTimeoutMs,
      maxRetries: aiMaxRetries,
    },
    policyTemplateValidateOnBoot
  };
}

module.exports = {
  loadServerEnv,
  resolveServerRuntimeEnv
};
