const crypto = require("node:crypto");

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signSegment(segment, secret) {
  return crypto.createHmac("sha256", secret).update(segment).digest("base64url");
}

function createApprovalTokenService({
  secret = process.env.MQ_APPROVAL_TOKEN_SECRET || process.env.MQ_JWT_SECRET || "mealquest-dev-secret",
  now = () => Date.now()
} = {}) {
  function issueToken({
    merchantId,
    draftId,
    approverId,
    approvalLevel = "OWNER",
    scopes = ["publish", "execute"],
    ttlSec = 3600
  }) {
    if (!merchantId || !draftId || !approverId) {
      throw new Error("merchantId, draftId and approverId are required");
    }
    const issuedAtMs = now();
    const payload = {
      merchantId: String(merchantId),
      draftId: String(draftId),
      approverId: String(approverId),
      approvalLevel: String(approvalLevel || "OWNER").toUpperCase(),
      scopes: Array.isArray(scopes) ? scopes.map((item) => String(item || "").toLowerCase()) : [],
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + Math.max(30, Number(ttlSec) || 3600) * 1000).toISOString()
    };
    const encoded = encode(payload);
    const signature = signSegment(encoded, secret);
    return `${encoded}.${signature}`;
  }

  function verifyToken(token, { expectedMerchantId = "", expectedScope = "" } = {}) {
    const raw = String(token || "").trim();
    if (!raw || !raw.includes(".")) {
      const error = new Error("approval token is required");
      error.code = "APPROVAL_TOKEN_REQUIRED";
      throw error;
    }
    const [encoded, signature] = raw.split(".");
    if (!encoded || !signature) {
      const error = new Error("approval token malformed");
      error.code = "APPROVAL_TOKEN_INVALID";
      throw error;
    }
    const expectedSignature = signSegment(encoded, secret);
    if (
      expectedSignature.length !== signature.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    ) {
      const error = new Error("approval token signature invalid");
      error.code = "APPROVAL_TOKEN_INVALID";
      throw error;
    }
    const payload = decode(encoded);
    if (!payload) {
      const error = new Error("approval token payload invalid");
      error.code = "APPROVAL_TOKEN_INVALID";
      throw error;
    }
    const expiresAtMs = Date.parse(String(payload.expiresAt || ""));
    if (!Number.isFinite(expiresAtMs) || expiresAtMs < now()) {
      const error = new Error("approval token expired");
      error.code = "APPROVAL_TOKEN_EXPIRED";
      throw error;
    }
    if (expectedMerchantId && payload.merchantId !== expectedMerchantId) {
      const error = new Error("approval token merchant mismatch");
      error.code = "APPROVAL_TOKEN_MISMATCH";
      throw error;
    }
    if (expectedScope) {
      const lowerScope = String(expectedScope).toLowerCase();
      const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
      if (!scopes.includes(lowerScope)) {
        const error = new Error(`approval token missing scope: ${expectedScope}`);
        error.code = "APPROVAL_TOKEN_SCOPE_DENIED";
        throw error;
      }
    }
    return payload;
  }

  return {
    issueToken,
    verifyToken
  };
}

module.exports = {
  createApprovalTokenService
};
