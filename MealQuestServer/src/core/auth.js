const crypto = require("node:crypto");

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function sign(payload, secret) {
  return toBase64Url(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );
}

function issueToken(claims, secret, expiresInSec = 60 * 60 * 12) {
  const nowSec = Math.floor(Date.now() / 1000);
  const body = {
    ...claims,
    iat: nowSec,
    exp: nowSec + expiresInSec
  };
  const encoded = toBase64Url(JSON.stringify(body));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new Error("invalid token");
  }

  const [encodedPayload, signature] = token.split(".");
  const expected = sign(encodedPayload, secret);
  if (signature !== expected) {
    throw new Error("invalid token signature");
  }

  const claims = JSON.parse(fromBase64Url(encodedPayload));
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(claims.exp || 0) < nowSec) {
    throw new Error("token expired");
  }

  return claims;
}

function parseBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }
  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

module.exports = {
  issueToken,
  verifyToken,
  parseBearerToken
};
