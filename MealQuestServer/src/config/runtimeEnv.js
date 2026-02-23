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

function resolveServerRuntimeEnv(env = process.env) {
  const nodeEnv = asString(env.NODE_ENV) || "development";
  const isProduction = nodeEnv === "production";

  const host = asString(env.HOST) || "0.0.0.0";
  const port = parsePort(env.PORT) || 3030;

  const jwtSecret = asString(env.MQ_JWT_SECRET);
  const paymentCallbackSecret = asString(env.MQ_PAYMENT_CALLBACK_SECRET);
  const onboardSecret = asString(env.MQ_ONBOARD_SECRET);

  const errors = [];
  if (isProduction && !jwtSecret) {
    errors.push("MQ_JWT_SECRET is required when NODE_ENV=production");
  }
  if (isProduction && !paymentCallbackSecret) {
    errors.push("MQ_PAYMENT_CALLBACK_SECRET is required when NODE_ENV=production");
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
    onboardSecret
  };
}

module.exports = {
  loadServerEnv,
  resolveServerRuntimeEnv
};

