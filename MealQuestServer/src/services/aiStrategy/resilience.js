const DEFAULT_RETRY_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 180;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 4;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30000;

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeErrorMessage(error) {
  const raw =
    (error && typeof error.message === "string" && error.message) ||
    String(error || "unknown error");
  return raw.replace(/\s+/g, " ").slice(0, 180);
}

function isRetriableError(error) {
  const normalized = summarizeErrorMessage(error).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("aborted") ||
    normalized.includes("connection error") ||
    normalized.includes("network error") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused") ||
    normalized.includes("eai_again")
  ) {
    return true;
  }
  return normalized.includes("http 429") || normalized.includes("http 5");
}

async function runWithRetry(task, options = {}) {
  const maxAttempts = asPositiveInt(options.maxAttempts, DEFAULT_RETRY_MAX_ATTEMPTS);
  const backoffMs = asPositiveInt(options.backoffMs, DEFAULT_RETRY_BACKOFF_MS);
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : isRetriableError;

  let attempt = 1;
  while (attempt <= maxAttempts) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const waitMs = backoffMs * Math.pow(2, attempt - 1);
      await sleep(waitMs);
      attempt += 1;
    }
  }
  throw new Error("retry loop exited unexpectedly");
}

function createCircuitBreaker(options = {}) {
  const failureThreshold = asPositiveInt(
    options.failureThreshold,
    DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
  );
  const cooldownMs = asPositiveInt(options.cooldownMs, DEFAULT_CIRCUIT_COOLDOWN_MS);

  let consecutiveFailures = 0;
  let totalFailures = 0;
  let totalSuccess = 0;
  let openedAt = null;
  let openedUntil = null;
  let lastError = "";

  function isOpen(nowTs = Date.now()) {
    return Number.isFinite(openedUntil) && nowTs < openedUntil;
  }

  function remainingMs(nowTs = Date.now()) {
    if (!isOpen(nowTs)) {
      return 0;
    }
    return Math.max(0, Math.floor(openedUntil - nowTs));
  }

  function recordSuccess() {
    totalSuccess += 1;
    consecutiveFailures = 0;
    if (openedUntil && Date.now() >= openedUntil) {
      openedAt = null;
      openedUntil = null;
    }
  }

  function recordFailure(error) {
    totalFailures += 1;
    consecutiveFailures += 1;
    lastError = summarizeErrorMessage(error);
    if (consecutiveFailures >= failureThreshold) {
      const nowTs = Date.now();
      openedAt = nowTs;
      openedUntil = nowTs + cooldownMs;
    }
  }

  function throwIfOpen() {
    if (!isOpen()) {
      return;
    }
    const error = new Error(
      `ai circuit breaker is open for ${remainingMs()}ms: ${lastError || "recent upstream failures"}`,
    );
    error.code = "AI_CIRCUIT_OPEN";
    throw error;
  }

  function snapshot() {
    return {
      failureThreshold,
      cooldownMs,
      isOpen: isOpen(),
      remainingMs: remainingMs(),
      consecutiveFailures,
      totalFailures,
      totalSuccess,
      lastError,
      openedAt: openedAt ? new Date(openedAt).toISOString() : null,
      openedUntil: openedUntil ? new Date(openedUntil).toISOString() : null,
    };
  }

  return {
    throwIfOpen,
    recordSuccess,
    recordFailure,
    snapshot,
  };
}

module.exports = {
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
  DEFAULT_CIRCUIT_COOLDOWN_MS,
  summarizeErrorMessage,
  isRetriableError,
  runWithRetry,
  createCircuitBreaker,
};
