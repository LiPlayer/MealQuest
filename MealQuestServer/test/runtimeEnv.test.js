const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveServerRuntimeEnv } = require("../src/config/runtimeEnv");

test("runtime env: bigmodel provider resolves default endpoint and model", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "bigmodel",
  });

  assert.equal(env.aiStrategy.provider, "bigmodel");
  assert.equal(env.aiStrategy.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(env.aiStrategy.model, "glm-4.7-flash");
  assert.equal(env.aiStrategy.maxRetries, 2);
});

test("runtime env: ai max retries can be configured", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "bigmodel",
    MQ_AI_MAX_RETRIES: "5",
  });

  assert.equal(env.aiStrategy.maxRetries, 5);
});

test("runtime env: production bigmodel requires api key", () => {
  assert.throws(
    () =>
      resolveServerRuntimeEnv({
        NODE_ENV: "production",
        MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
        MQ_JWT_SECRET: "jwt",
        MQ_PAYMENT_CALLBACK_SECRET: "cb",
        MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
        MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
        MQ_AI_PROVIDER: "bigmodel",
      }),
    /MQ_AI_API_KEY is required/,
  );
});
