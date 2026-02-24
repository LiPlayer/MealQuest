const CUSTOMER_PROVIDER_WECHAT_MINIAPP = "WECHAT_MINIAPP";
const CUSTOMER_PROVIDER_ALIPAY = "ALIPAY";

function assertCode(rawCode, fieldName) {
  const code = String(rawCode || "").trim();
  if (!code) {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }
  return code;
}

async function parseJsonResponse(response, contextLabel) {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText);
  } catch {
    const error = new Error(`${contextLabel} returned invalid JSON`);
    error.statusCode = 502;
    throw error;
  }
}

function throwIfMissingConfig(condition, message) {
  if (condition) {
    return;
  }
  const error = new Error(message);
  error.statusCode = 503;
  throw error;
}

function createSocialAuthService({
  fetchImpl = global.fetch,
  timeoutMs = 10000,
  providers = {}
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("global fetch is required for social auth");
  }

  const wechatMini = providers.wechatMini || {};
  const alipay = providers.alipay || {};

  async function fetchWithTimeout(url, options = {}, label = "request") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } catch (error) {
      if (error && error.name === "AbortError") {
        const timeoutError = new Error(`${label} timeout`);
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      const networkError = new Error(`${label} failed`);
      networkError.statusCode = 502;
      throw networkError;
    } finally {
      clearTimeout(timer);
    }
  }

  async function verifyWeChatMiniAppCode(code) {
    throwIfMissingConfig(
      Boolean(wechatMini.appId && wechatMini.appSecret),
      "WeChat Mini App auth is not configured"
    );
    const query = new URLSearchParams({
      appid: wechatMini.appId,
      secret: wechatMini.appSecret,
      js_code: assertCode(code, "code"),
      grant_type: "authorization_code"
    });
    const response = await fetchWithTimeout(
      `https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`,
      { method: "GET" },
      "wechat miniapp code exchange"
    );
    const payload = await parseJsonResponse(response, "wechat miniapp code exchange");
    if (payload.errcode) {
      const error = new Error(
        `WeChat Mini App auth failed: ${payload.errmsg || String(payload.errcode)}`
      );
      error.statusCode = 401;
      throw error;
    }
    if (!payload.openid) {
      const error = new Error("WeChat Mini App auth failed: openid missing");
      error.statusCode = 401;
      throw error;
    }
    return {
      provider: CUSTOMER_PROVIDER_WECHAT_MINIAPP,
      subject: String(payload.openid),
      unionId: payload.unionid ? String(payload.unionid) : null,
      sessionKey: payload.session_key ? String(payload.session_key) : null,
      // Keep this optional field for providers/proxies that can return phone in a single step.
      phone: payload.phoneNumber ? String(payload.phoneNumber) : null
    };
  }

  async function verifyAlipayCode(code) {
    throwIfMissingConfig(
      Boolean(alipay.verifyUrl),
      "Alipay auth is not configured"
    );
    const response = await fetchWithTimeout(
      String(alipay.verifyUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: assertCode(code, "code"),
          appId: alipay.appId || "",
          appSecret: alipay.appSecret || ""
        })
      },
      "alipay code exchange"
    );
    const payload = await parseJsonResponse(response, "alipay code exchange");
    if (!response.ok) {
      const error = new Error(
        `Alipay auth failed: ${payload.error || response.statusText || "unknown error"}`
      );
      error.statusCode = 401;
      throw error;
    }
    const subject = payload.subject || payload.userId || payload.user_id || payload.openid;
    if (!subject) {
      const error = new Error("Alipay auth failed: subject missing");
      error.statusCode = 401;
      throw error;
    }
    const phone = typeof payload.phone === "string" ? payload.phone : payload.mobile;
    return {
      provider: CUSTOMER_PROVIDER_ALIPAY,
      subject: String(subject),
      unionId: null,
      phone: phone ? String(phone) : null
    };
  }

  return {
    CUSTOMER_PROVIDER_WECHAT_MINIAPP,
    CUSTOMER_PROVIDER_ALIPAY,
    verifyWeChatMiniAppCode,
    verifyAlipayCode
  };
}

module.exports = {
  CUSTOMER_PROVIDER_WECHAT_MINIAPP,
  CUSTOMER_PROVIDER_ALIPAY,
  createSocialAuthService
};
