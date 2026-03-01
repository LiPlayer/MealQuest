const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveServerRuntimeEnv } = require("../src/config/runtimeEnv");

test("runtime env: openai provider resolves default endpoint and model", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "openai",
  });

  assert.equal(env.aiStrategy.provider, "openai");
  assert.equal(env.aiStrategy.baseUrl, "https://api.openai.com/v1");
  assert.equal(env.aiStrategy.model, "gpt-4o-mini");
  assert.equal(env.aiStrategy.maxRetries, 2);
});

test("runtime env: ai max retries can be configured", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "openai",
    MQ_AI_MAX_RETRIES: "5",
  });

  assert.equal(env.aiStrategy.maxRetries, 5);
});

test("runtime env: deepseek provider resolves default endpoint/model/timeout", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "deepseek",
  });

  assert.equal(env.aiStrategy.provider, "deepseek");
  assert.equal(env.aiStrategy.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(env.aiStrategy.model, "deepseek-chat");
  assert.equal(env.aiStrategy.timeoutMs, 30000);
});

test("runtime env: production openai requires api key", () => {
  assert.throws(
    () =>
      resolveServerRuntimeEnv({
        NODE_ENV: "production",
        MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
        MQ_JWT_SECRET: "jwt",
        MQ_PAYMENT_CALLBACK_SECRET: "cb",
        MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
        MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
        MQ_AI_PROVIDER: "openai",
      }),
    /MQ_AI_API_KEY is required/,
  );
});

test("runtime env: production deepseek requires api key", () => {
  assert.throws(
    () =>
      resolveServerRuntimeEnv({
        NODE_ENV: "production",
        MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
        MQ_JWT_SECRET: "jwt",
        MQ_PAYMENT_CALLBACK_SECRET: "cb",
        MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
        MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
        MQ_AI_PROVIDER: "deepseek",
      }),
    /MQ_AI_API_KEY is required/,
  );
});

test("runtime env: db rls enforcement defaults on and can be disabled", () => {
  const defaults = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
  });
  assert.equal(defaults.dbEnforceRls, true);

  const disabled = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_DB_ENFORCE_RLS: "false",
  });
  assert.equal(disabled.dbEnforceRls, false);
});

test("runtime env: policy template boot validation defaults on and can be disabled", () => {
  const defaults = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
  });
  assert.equal(defaults.policyTemplateValidateOnBoot, true);

  const disabled = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_POLICY_TEMPLATE_VALIDATE_ON_BOOT: "false",
  });
  assert.equal(disabled.policyTemplateValidateOnBoot, false);
});
