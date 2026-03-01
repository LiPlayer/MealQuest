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

test("runtime env: policy template boot validation defaults on and can be disabled", () => {
  const defaults = resolveServerRuntimeEnv(createBaseEnv());
  assert.equal(defaults.policyTemplateValidateOnBoot, true);

  const disabled = resolveServerRuntimeEnv(
    createBaseEnv({
      MQ_POLICY_TEMPLATE_VALIDATE_ON_BOOT: "false"
    })
  );
  assert.equal(disabled.policyTemplateValidateOnBoot, false);
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
