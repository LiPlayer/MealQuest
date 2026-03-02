const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveServerRuntimeEnv } = require("../src/config/runtimeEnv");

function createBaseEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
    MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
    MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret",
    ...overrides
  };
}

test("runtime env resolves base config", () => {
  const env = resolveServerRuntimeEnv(createBaseEnv());
  assert.equal(env.host, "0.0.0.0");
  assert.equal(env.port, 3030);
  assert.equal(env.dbSchema, "public");
  assert.equal(env.dbPoolMax, 5);
  assert.equal(env.dbEnforceRls, true);
  assert.equal(env.ai.hasDeepseekApiKey, false);
  assert.equal(env.observability.langsmithTracing, false);
  assert.equal(env.observability.langsmithProject, "");
  assert.equal(env.observability.langsmithEndpoint, "");
});

test("runtime env: db rls enforcement defaults on and can be disabled", () => {
  const defaults = resolveServerRuntimeEnv(createBaseEnv());
  assert.equal(defaults.dbEnforceRls, true);

  const disabled = resolveServerRuntimeEnv(
    createBaseEnv({
      MQ_DB_ENFORCE_RLS: "false"
    })
  );
  assert.equal(disabled.dbEnforceRls, false);
});

test("runtime env: production requires core secrets", () => {
  assert.throws(
    () =>
      resolveServerRuntimeEnv({
        NODE_ENV: "production",
        MQ_DB_URL: "postgres://postgres:postgres@127.0.0.1:5432/mealquest",
        MQ_AUTH_WECHAT_MINI_APP_ID: "wx_fixture",
        MQ_AUTH_WECHAT_MINI_APP_SECRET: "wx_secret"
      }),
    /MQ_JWT_SECRET is required/
  );
});

test("runtime env: langsmith observability flags can be enabled", () => {
  const env = resolveServerRuntimeEnv(
    createBaseEnv({
      LANGSMITH_TRACING: "true",
      LANGSMITH_PROJECT: "mealquest-local",
      LANGSMITH_ENDPOINT: "https://api.smith.langchain.com",
    })
  );
  assert.equal(env.observability.langsmithTracing, true);
  assert.equal(env.observability.langsmithProject, "mealquest-local");
  assert.equal(env.observability.langsmithEndpoint, "https://api.smith.langchain.com");
});

test("runtime env: deepseek api key presence is detected", () => {
  const env = resolveServerRuntimeEnv(
    createBaseEnv({
      DEEPSEEK_API_KEY: "sk-test-key",
    })
  );
  assert.equal(env.ai.hasDeepseekApiKey, true);
});
