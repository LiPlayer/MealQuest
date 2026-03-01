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
    OPENAI_API_KEY: "openai_key_test",
  });

  assert.equal(env.strategyAgent.provider, "openai");
  assert.equal(env.strategyAgent.baseUrl, "https://api.openai.com/v1");
  assert.equal(env.strategyAgent.model, "gpt-4o-mini");
  assert.equal(env.strategyAgent.maxRetries, 2);
  assert.equal(env.strategyAgent.apiKey, "openai_key_test");
});

test("runtime env: ai max retries is fixed to default", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "openai",
  });

  assert.equal(env.strategyAgent.maxRetries, 2);
});

test("runtime env: deepseek provider resolves default endpoint/model/timeout", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "deepseek_key_test",
  });

  assert.equal(env.strategyAgent.provider, "deepseek");
  assert.equal(env.strategyAgent.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(env.strategyAgent.model, "deepseek-chat");
  assert.equal(env.strategyAgent.timeoutMs, 30000);
  assert.equal(env.strategyAgent.apiKey, "deepseek_key_test");
});

test("runtime env: zhipuai provider resolves default endpoint/model/timeout", () => {
  const env = resolveServerRuntimeEnv({
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    MQ_AI_PROVIDER: "zhipuai",
    ZHIPUAI_API_KEY: "zhipu_key_test",
  });

  assert.equal(env.strategyAgent.provider, "zhipuai");
  assert.equal(env.strategyAgent.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(env.strategyAgent.model, "glm-3-turbo");
  assert.equal(env.strategyAgent.timeoutMs, 30000);
  assert.equal(env.strategyAgent.apiKey, "zhipu_key_test");
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
    /OPENAI_API_KEY is required/,
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
    /DEEPSEEK_API_KEY is required/,
  );
});

test("runtime env: production zhipuai requires api key", () => {
  assert.throws(
    () =>
      resolveServerRuntimeEnv({
        NODE_ENV: "production",
        MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
        MQ_JWT_SECRET: "jwt",
        MQ_PAYMENT_CALLBACK_SECRET: "cb",
        MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
        MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
        MQ_AI_PROVIDER: "zhipuai",
      }),
    /ZHIPUAI_API_KEY is required/,
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
