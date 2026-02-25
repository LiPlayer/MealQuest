const crypto = require("node:crypto");
const { parseBearerToken, verifyToken } = require("../core/auth");
const {
  CUSTOMER_PROVIDER_WECHAT_MINIAPP,
  CUSTOMER_PROVIDER_ALIPAY,
} = require("../services/socialAuthService");
const { createInMemoryDb } = require("../store/inMemoryDb");

const TENANT_LIMIT_OPERATIONS = [
  "PAYMENT_VERIFY",
  "PAYMENT_REFUND",
  "INVOICE_ISSUE",
  "PROPOSAL_CONFIRM",
  "KILL_SWITCH_SET",
  "TCA_TRIGGER",
  "PRIVACY_CANCEL",
  "STRATEGY_PROPOSAL_CREATE",
  "CAMPAIGN_STATUS_SET",
  "FIRE_SALE_CREATE",
  "SUPPLIER_VERIFY",
  "ALLIANCE_CONFIG_SET",
  "ALLIANCE_SYNC_USER",
  "CONTRACT_APPLY",
  "AUDIT_QUERY",
  "WS_CONNECT",
  "WS_STATUS_QUERY"
];

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function getAuthContext(req, secret) {
  const rawToken = parseBearerToken(req.headers.authorization);
  if (!rawToken) {
    throw new Error("Authorization Bearer token is required");
  }
  return verifyToken(rawToken, secret);
}

function getUpgradeAuthContext(req, secret, parsedUrl) {
  const queryToken = parsedUrl.searchParams.get("token");
  const bearerToken = parseBearerToken(req.headers.authorization);
  const token = queryToken || bearerToken;
  if (!token) {
    throw new Error("Authorization Bearer token is required");
  }
  return verifyToken(token, secret);
}

function ensureRole(auth, allowedRoles) {
  if (!allowedRoles.includes(auth.role)) {
    throw new Error("permission denied");
  }
}

function resolveAuditAction(method, pathname) {
  if (method === "POST" && pathname === "/api/payment/verify") {
    return "PAYMENT_VERIFY";
  }
  if (method === "POST" && pathname === "/api/payment/refund") {
    return "PAYMENT_REFUND";
  }
  if (method === "POST" && pathname === "/api/payment/callback") {
    return "PAYMENT_CALLBACK";
  }
  if (method === "POST" && pathname === "/api/invoice/issue") {
    return "INVOICE_ISSUE";
  }
  if (method === "POST" && pathname === "/api/privacy/export-user") {
    return "PRIVACY_EXPORT";
  }
  if (method === "POST" && pathname === "/api/privacy/delete-user") {
    return "PRIVACY_DELETE";
  }
  if (method === "POST" && pathname === "/api/privacy/cancel-account") {
    return "PRIVACY_CANCEL";
  }
  if (method === "POST" && pathname === "/api/merchant/kill-switch") {
    return "KILL_SWITCH_SET";
  }
  if (method === "POST" && pathname === "/api/tca/trigger") {
    return "TCA_TRIGGER";
  }
  if (method === "POST" && pathname === "/api/merchant/strategy-proposals") {
    return "STRATEGY_PROPOSAL_CREATE";
  }
  if (method === "POST" && /^\/api\/merchant\/campaigns\/[^/]+\/status$/.test(pathname)) {
    return "CAMPAIGN_STATUS_SET";
  }
  if (method === "POST" && pathname === "/api/merchant/fire-sale") {
    return "FIRE_SALE_CREATE";
  }
  if (method === "POST" && pathname === "/api/supplier/verify-order") {
    return "SUPPLIER_VERIFY";
  }
  if (method === "POST" && pathname === "/api/merchant/alliance-config") {
    return "ALLIANCE_CONFIG_SET";
  }
  if (method === "POST" && pathname === "/api/merchant/alliance/sync-user") {
    return "ALLIANCE_SYNC_USER";
  }
  if (method === "POST" && pathname === "/api/merchant/contract/apply") {
    return "CONTRACT_APPLY";
  }
  if (method === "POST" && pathname === "/api/merchant/tenant-policy") {
    return "TENANT_POLICY_SET";
  }
  if (method === "POST" && pathname === "/api/merchant/migration/step") {
    return "MIGRATION_STEP";
  }
  if (method === "POST" && pathname === "/api/merchant/migration/cutover") {
    return "MIGRATION_CUTOVER";
  }
  if (method === "POST" && pathname === "/api/merchant/migration/rollback") {
    return "MIGRATION_ROLLBACK";
  }
  if (method === "POST" && /^\/api\/merchant\/proposals\/[^/]+\/confirm$/.test(pathname)) {
    return "PROPOSAL_CONFIRM";
  }
  return null;
}

function toPolicyPositiveInt(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Math.floor(num);
}

function toListLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function sanitizeLimitInput(limitInput) {
  if (!limitInput || typeof limitInput !== "object") {
    throw new Error("limits must be an object");
  }

  const limits = {};
  for (const [rawOperation, rawValue] of Object.entries(limitInput)) {
    const operation = String(rawOperation || "").trim().toUpperCase();
    if (!operation || !TENANT_LIMIT_OPERATIONS.includes(operation)) {
      throw new Error(`unsupported limit operation: ${rawOperation}`);
    }

    if (typeof rawValue === "number" || typeof rawValue === "string") {
      limits[operation] = {
        limit: toPolicyPositiveInt(rawValue, `${operation}.limit`),
        windowMs: 60 * 1000
      };
      continue;
    }

    if (!rawValue || typeof rawValue !== "object") {
      throw new Error(`${operation} limit must be number or object`);
    }

    limits[operation] = {
      limit: toPolicyPositiveInt(rawValue.limit, `${operation}.limit`),
      windowMs:
        rawValue.windowMs === undefined
          ? 60 * 1000
          : toPolicyPositiveInt(rawValue.windowMs, `${operation}.windowMs`)
    };
  }

  return limits;
}

function buildTenantPolicyPatch(body = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "writeEnabled")) {
    patch.writeEnabled = Boolean(body.writeEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(body, "wsEnabled")) {
    patch.wsEnabled = Boolean(body.wsEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(body, "limits")) {
    patch.limits = sanitizeLimitInput(body.limits);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("tenant policy patch is empty");
  }
  return patch;
}

function verifyHmacSignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  const actualBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

const MIGRATION_STEPS = new Set([
  "FREEZE_WRITE",
  "UNFREEZE_WRITE",
  "DISABLE_WS",
  "ENABLE_WS",
  "MARK_VERIFYING",
  "MARK_CUTOVER",
  "MARK_ROLLBACK"
]);

function resolveMigrationPhase(previousPhase, step) {
  if (step === "FREEZE_WRITE") {
    return "FROZEN";
  }
  if (step === "UNFREEZE_WRITE") {
    if (previousPhase === "CUTOVER" || previousPhase === "ROLLBACK") {
      return previousPhase;
    }
    return "RUNNING";
  }
  if (step === "MARK_VERIFYING") {
    return "VERIFYING";
  }
  if (step === "MARK_CUTOVER") {
    return "CUTOVER";
  }
  if (step === "MARK_ROLLBACK") {
    return "ROLLBACK";
  }
  return previousPhase || "IDLE";
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function upsertMerchantRows(rows, merchantId, nextRows) {
  const currentRows = Array.isArray(rows) ? rows : [];
  const incomingRows = Array.isArray(nextRows) ? nextRows : [];
  return [
    ...currentRows.filter((item) => item && item.merchantId !== merchantId),
    ...incomingRows
  ];
}

function uniqueDbs(items) {
  const out = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    if (!out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

function buildMerchantSnapshotSummary(db, merchantId) {
  const users = (db.merchantUsers && db.merchantUsers[merchantId]) || {};
  const payments = (db.paymentsByMerchant && db.paymentsByMerchant[merchantId]) || {};
  const invoices = (db.invoicesByMerchant && db.invoicesByMerchant[merchantId]) || {};
  const campaigns = (db.campaigns || []).filter((item) => item.merchantId === merchantId);
  const proposals = (db.proposals || []).filter((item) => item.merchantId === merchantId);
  const strategyConfigs =
    (db.strategyConfigs &&
      db.strategyConfigs[merchantId] &&
      Object.values(db.strategyConfigs[merchantId])) ||
    [];
  const allianceConfig =
    (db.allianceConfigs && db.allianceConfigs[merchantId]) || null;
  const ledger = (db.ledger || []).filter((item) => item.merchantId === merchantId);
  const auditLogs = (db.auditLogs || []).filter((item) => item.merchantId === merchantId);
  const merchant = db.merchants && db.merchants[merchantId];
  const customerAuthBindings =
    (db.socialAuth &&
      db.socialAuth.customerBindingsByMerchant &&
      db.socialAuth.customerBindingsByMerchant[merchantId]) ||
    {};
  const customerPhoneBindings =
    (db.socialAuth &&
      db.socialAuth.customerPhoneBindingsByMerchant &&
      db.socialAuth.customerPhoneBindingsByMerchant[merchantId]) ||
    {};

  const walletChecksum = JSON.stringify(
    Object.entries(users)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uid, user]) => [uid, user.wallet, user.vouchers, user.tags, user.fragments])
  );

  return {
    merchantExists: Boolean(merchant),
    usersCount: Object.keys(users).length,
    paymentsCount: Object.keys(payments).length,
    invoicesCount: Object.keys(invoices).length,
    campaignsCount: campaigns.length,
    proposalsCount: proposals.length,
    strategyConfigCount: strategyConfigs.length,
    allianceWalletShared: Boolean(allianceConfig && allianceConfig.walletShared),
    ledgerCount: ledger.length,
    auditCount: auditLogs.length,
    budgetUsed: merchant ? Number(merchant.budgetUsed || 0) : 0,
    customerAuthBindingCount: Object.keys(customerAuthBindings).length,
    customerPhoneBindingCount: Object.keys(customerPhoneBindings).length,
    walletChecksum
  };
}

function isSnapshotSummaryEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toActivityTag(category = "") {
  const normalized = String(category || "").toUpperCase();
  if (normalized === "ACQUISITION") {
    return "NEW";
  }
  if (normalized === "ACTIVATION") {
    return "HOT";
  }
  if (normalized === "REVENUE") {
    return "PAY";
  }
  if (normalized === "RETENTION") {
    return "CARE";
  }
  if (normalized === "SOCIAL_VIRAL") {
    return "SOCIAL";
  }
  return "AI";
}

function toActivityTheme(category = "") {
  const normalized = String(category || "").toUpperCase();
  if (normalized === "ACQUISITION") {
    return { color: "bg-rose-50", textColor: "text-rose-600" };
  }
  if (normalized === "ACTIVATION") {
    return { color: "bg-blue-50", textColor: "text-blue-600" };
  }
  if (normalized === "REVENUE") {
    return { color: "bg-amber-50", textColor: "text-amber-600" };
  }
  if (normalized === "RETENTION") {
    return { color: "bg-emerald-50", textColor: "text-emerald-600" };
  }
  return { color: "bg-slate-50", textColor: "text-slate-600" };
}

function buildCustomerActivities(campaigns = []) {
  return (campaigns || [])
    .filter((campaign) => campaign && campaign.status === "ACTIVE")
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .slice(0, 6)
    .map((campaign) => {
      const meta = campaign.strategyMeta || {};
      const theme = toActivityTheme(meta.category);
      const narrative =
        campaign.action &&
          campaign.action.type === "STORY_CARD" &&
          campaign.action.story &&
          campaign.action.story.narrative
          ? campaign.action.story.narrative
          : `活动触发事件：${campaign.trigger && campaign.trigger.event ? campaign.trigger.event : "CUSTOM"}`;
      return {
        id: campaign.id,
        title: campaign.name,
        desc: narrative,
        icon: "✨",
        color: theme.color,
        textColor: theme.textColor,
        tag: toActivityTag(meta.category)
      };
    });
}

function sanitizeMerchantId(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(value)) {
    throw new Error("merchantId format invalid");
  }
  return value;
}

function sanitizeMerchantName(input) {
  const value = String(input || "").trim();
  if (!value) {
    throw new Error("merchant name is required");
  }
  if (value.length > 64) {
    throw new Error("merchant name too long");
  }
  return value;
}

function sanitizeBudgetCap(value, fallback = 300) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("budgetCap must be a positive number");
  }
  return Math.floor(parsed);
}

function constantTimeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateOnboardSecret(req, onboardSecret) {
  if (!onboardSecret) {
    return true;
  }
  const provided = req.headers["x-onboard-secret"];
  return constantTimeEquals(provided, onboardSecret);
}

function createSeedCustomer(now, {
  uid,
  displayName,
  principal = 120,
  bonus = 30,
  silver = 88
}) {
  return {
    uid,
    displayName,
    wallet: {
      principal,
      bonus,
      silver
    },
    tags: ["REGULAR"],
    fragments: {
      spicy: 1,
      noodle: 2
    },
    vouchers: [
      {
        id: `voucher_welcome_${uid}`,
        type: "ITEM_WARRANT",
        name: "Welcome Voucher",
        value: 12,
        minSpend: 0,
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      }
    ]
  };
}

function ensureMerchantContainers(db, merchantId) {
  if (!db.merchantUsers || typeof db.merchantUsers !== "object") {
    db.merchantUsers = {};
  }
  if (!db.paymentsByMerchant || typeof db.paymentsByMerchant !== "object") {
    db.paymentsByMerchant = {};
  }
  if (!db.invoicesByMerchant || typeof db.invoicesByMerchant !== "object") {
    db.invoicesByMerchant = {};
  }
  if (!db.strategyConfigs || typeof db.strategyConfigs !== "object") {
    db.strategyConfigs = {};
  }
  if (!db.allianceConfigs || typeof db.allianceConfigs !== "object") {
    db.allianceConfigs = {};
  }
  if (!db.tenantPolicies || typeof db.tenantPolicies !== "object") {
    db.tenantPolicies = {};
  }
  if (!db.tenantMigrations || typeof db.tenantMigrations !== "object") {
    db.tenantMigrations = {};
  }
  if (!db.tenantRouteFiles || typeof db.tenantRouteFiles !== "object") {
    db.tenantRouteFiles = {};
  }

  if (!db.merchantUsers[merchantId]) {
    db.merchantUsers[merchantId] = {};
  }
  if (!db.paymentsByMerchant[merchantId]) {
    db.paymentsByMerchant[merchantId] = {};
  }
  if (!db.invoicesByMerchant[merchantId]) {
    db.invoicesByMerchant[merchantId] = {};
  }
  if (!db.strategyConfigs[merchantId]) {
    db.strategyConfigs[merchantId] = {};
  }
}

function onboardMerchant(db, payload = {}) {
  const merchantId = sanitizeMerchantId(payload.merchantId || payload.storeId);
  const merchantName = sanitizeMerchantName(payload.name || payload.merchantName);
  const budgetCap = sanitizeBudgetCap(payload.budgetCap, 300);
  const clusterId = String(payload.clusterId || `cluster_${merchantId}`).trim();
  const seedDemoUsers = payload.seedDemoUsers !== false;
  const now = new Date();

  if (!db.merchants || typeof db.merchants !== "object") {
    db.merchants = {};
  }
  if (db.merchants[merchantId]) {
    const error = new Error("merchant already exists");
    error.code = "MERCHANT_EXISTS";
    throw error;
  }

  db.merchants[merchantId] = {
    merchantId,
    name: merchantName,
    killSwitchEnabled: false,
    budgetCap,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" }
    ],
    onboardedAt: now.toISOString()
  };

  ensureMerchantContainers(db, merchantId);
  if (seedDemoUsers) {
    db.merchantUsers[merchantId].u_demo = createSeedCustomer(now, {
      uid: "u_demo",
      displayName: "Demo User",
      principal: 120,
      bonus: 30,
      silver: 88
    });
    db.merchantUsers[merchantId].u_friend = createSeedCustomer(now, {
      uid: "u_friend",
      displayName: "Demo Friend",
      principal: 60,
      bonus: 12,
      silver: 40
    });
  }

  db.allianceConfigs[merchantId] = {
    merchantId,
    clusterId: clusterId || `cluster_${merchantId}`,
    stores: [merchantId],
    walletShared: false,
    tierShared: false,
    updatedAt: now.toISOString()
  };
  db.tenantMigrations[merchantId] = {
    phase: "IDLE",
    step: "INIT",
    note: "merchant onboarded",
    updatedAt: now.toISOString()
  };

  db.save();
  return {
    merchant: db.merchants[merchantId],
    seededUsers: Object.keys(db.merchantUsers[merchantId] || {}),
    allianceConfig: db.allianceConfigs[merchantId]
  };
}

function sanitizePhone(input) {
  const value = String(input || "").trim();
  if (!/^\+?\d{10,20}$/.test(value)) {
    throw new Error("phone format invalid");
  }
  return value;
}

function issuePhoneCode(db, phone) {
  const now = Date.now();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (!db.phoneLoginCodes || typeof db.phoneLoginCodes !== "object") {
    db.phoneLoginCodes = {};
  }
  db.phoneLoginCodes[phone] = {
    phone,
    code,
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    createdAt: new Date(now).toISOString()
  };
  db.save();
  return {
    phone,
    expiresInSec: 300,
    debugCode: code
  };
}

function verifyPhoneCode(db, { phone, code }) {
  const normalizedPhone = sanitizePhone(phone);
  const normalizedCode = String(code || "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("code format invalid");
  }
  const record = db.phoneLoginCodes && db.phoneLoginCodes[normalizedPhone];
  if (!record) {
    throw new Error("code not requested");
  }
  const expiresAt = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    throw new Error("code expired");
  }
  if (record.code !== normalizedCode) {
    throw new Error("code mismatch");
  }
  delete db.phoneLoginCodes[normalizedPhone];
  db.save();
  return {
    phone: normalizedPhone
  };
}

function ensureSocialAuthContainers(db) {
  if (!db.socialAuth || typeof db.socialAuth !== "object") {
    db.socialAuth = {};
  }
  if (
    !db.socialAuth.customerBindingsByMerchant ||
    typeof db.socialAuth.customerBindingsByMerchant !== "object"
  ) {
    db.socialAuth.customerBindingsByMerchant = {};
  }
  if (
    !db.socialAuth.customerPhoneBindingsByMerchant ||
    typeof db.socialAuth.customerPhoneBindingsByMerchant !== "object"
  ) {
    db.socialAuth.customerPhoneBindingsByMerchant = {};
  }
}

function buildIdentityKey(provider, subject) {
  return `${String(provider || "").trim().toUpperCase()}:${String(subject || "").trim()}`;
}

function buildPhoneIdentityKey(phone) {
  return buildIdentityKey("PHONE", sanitizePhone(phone));
}

function buildPhoneCustomerId(phone) {
  const digest = crypto
    .createHash("sha1")
    .update(`PHONE:${phone}`)
    .digest("hex")
    .slice(0, 12);
  return `u_${digest}`;
}

function createCustomerProfile({ uid, displayName }) {
  return {
    uid,
    displayName: displayName || "MealQuest User",
    wallet: {
      principal: 0,
      bonus: 0,
      silver: 0
    },
    tags: ["NEW_USER"],
    fragments: {
      spicy: 0,
      noodle: 0
    },
    vouchers: []
  };
}

function bindCustomerPhoneIdentity(db, {
  merchantId,
  provider,
  subject,
  unionId = null,
  displayName = "",
  phone = ""
}) {
  ensureMerchantContainers(db, merchantId);
  ensureSocialAuthContainers(db);
  if (!db.socialAuth.customerBindingsByMerchant[merchantId]) {
    db.socialAuth.customerBindingsByMerchant[merchantId] = {};
  }
  if (!db.socialAuth.customerPhoneBindingsByMerchant[merchantId]) {
    db.socialAuth.customerPhoneBindingsByMerchant[merchantId] = {};
  }

  const nowIso = new Date().toISOString();
  const identityKey = buildIdentityKey(provider, subject);
  const merchantBindings = db.socialAuth.customerBindingsByMerchant[merchantId];
  const phoneBindings = db.socialAuth.customerPhoneBindingsByMerchant[merchantId];
  const existingBinding = merchantBindings[identityKey] || null;
  const resolvedPhone = String(phone || "").trim();
  if (!resolvedPhone) {
    const phoneRequiredError = new Error("phone is required for customer login");
    phoneRequiredError.statusCode = 400;
    throw phoneRequiredError;
  }
  const normalizedPhone = sanitizePhone(resolvedPhone);
  const phoneKey = buildPhoneIdentityKey(normalizedPhone);
  const existingPhoneBinding = phoneBindings[phoneKey] || null;
  const existingUserId =
    existingBinding && existingBinding.userId && db.merchantUsers[merchantId][existingBinding.userId]
      ? existingBinding.userId
      : null;
  const existingPhoneUserId =
    existingPhoneBinding &&
    existingPhoneBinding.userId &&
    db.merchantUsers[merchantId][existingPhoneBinding.userId]
      ? existingPhoneBinding.userId
      : null;

  if (existingUserId && existingPhoneUserId && existingUserId !== existingPhoneUserId) {
    const conflictError = new Error("phone already bound to another user");
    conflictError.statusCode = 409;
    throw conflictError;
  }

  const userId = existingUserId || existingPhoneUserId || buildPhoneCustomerId(normalizedPhone);
  const wasCreated = !db.merchantUsers[merchantId][userId];
  if (!db.merchantUsers[merchantId][userId]) {
    db.merchantUsers[merchantId][userId] = createCustomerProfile({
      uid: userId,
      displayName: String(displayName || "").trim() || "MealQuest User"
    });
  }
  if (displayName) {
    db.merchantUsers[merchantId][userId].displayName = String(displayName).trim();
  }

  merchantBindings[identityKey] = {
    userId,
    provider,
    subject,
    unionId: unionId || null,
    phone: normalizedPhone,
    linkedAt: existingBinding && existingBinding.linkedAt ? existingBinding.linkedAt : nowIso,
    lastLoginAt: nowIso
  };
  phoneBindings[phoneKey] = {
    userId,
    phone: normalizedPhone,
    linkedAt:
      existingPhoneBinding && existingPhoneBinding.linkedAt
        ? existingPhoneBinding.linkedAt
        : nowIso,
    lastLoginAt: nowIso
  };
  db.save();

  return {
    userId,
    created: wasCreated,
    phone: normalizedPhone
  };
}

function buildContractApplication(payload = {}, now = new Date()) {
  const companyName = sanitizeMerchantName(payload.companyName || payload.company);
  const licenseNo = String(payload.licenseNo || payload.businessLicenseNo || "").trim();
  const settlementAccount = String(payload.settlementAccount || "").trim();
  const contactPhone = sanitizePhone(payload.contactPhone || payload.phone);
  if (!licenseNo) {
    throw new Error("licenseNo is required");
  }
  if (!settlementAccount) {
    throw new Error("settlementAccount is required");
  }
  return {
    companyName,
    licenseNo,
    settlementAccount,
    contactPhone,
    notes: String(payload.notes || "").trim(),
    submittedAt: now.toISOString(),
    status: "PENDING_REVIEW"
  };
}

function copyMerchantSlice({ sourceDb, targetDb, merchantId }) {
  const merchant = sourceDb.merchants && sourceDb.merchants[merchantId];
  if (!merchant) {
    throw new Error("merchant not found");
  }

  targetDb.merchants[merchantId] = jsonClone(merchant);
  targetDb.merchantUsers[merchantId] = jsonClone(
    (sourceDb.merchantUsers && sourceDb.merchantUsers[merchantId]) || {}
  );
  targetDb.paymentsByMerchant[merchantId] = jsonClone(
    (sourceDb.paymentsByMerchant && sourceDb.paymentsByMerchant[merchantId]) || {}
  );
  if (!targetDb.invoicesByMerchant || typeof targetDb.invoicesByMerchant !== "object") {
    targetDb.invoicesByMerchant = {};
  }
  targetDb.invoicesByMerchant[merchantId] = jsonClone(
    (sourceDb.invoicesByMerchant && sourceDb.invoicesByMerchant[merchantId]) || {}
  );

  targetDb.campaigns = upsertMerchantRows(
    targetDb.campaigns,
    merchantId,
    jsonClone((sourceDb.campaigns || []).filter((item) => item.merchantId === merchantId))
  );
  targetDb.proposals = upsertMerchantRows(
    targetDb.proposals,
    merchantId,
    jsonClone((sourceDb.proposals || []).filter((item) => item.merchantId === merchantId))
  );
  if (!targetDb.strategyConfigs || typeof targetDb.strategyConfigs !== "object") {
    targetDb.strategyConfigs = {};
  }
  targetDb.strategyConfigs[merchantId] = jsonClone(
    (sourceDb.strategyConfigs && sourceDb.strategyConfigs[merchantId]) || {}
  );

  if (!targetDb.partnerOrders || typeof targetDb.partnerOrders !== "object") {
    targetDb.partnerOrders = {};
  }
  if (sourceDb.partnerOrders && typeof sourceDb.partnerOrders === "object") {
    targetDb.partnerOrders = jsonClone(sourceDb.partnerOrders);
  }

  if (!targetDb.allianceConfigs || typeof targetDb.allianceConfigs !== "object") {
    targetDb.allianceConfigs = {};
  }
  if (sourceDb.allianceConfigs && sourceDb.allianceConfigs[merchantId]) {
    targetDb.allianceConfigs[merchantId] = jsonClone(sourceDb.allianceConfigs[merchantId]);
  }

  ensureSocialAuthContainers(targetDb);
  ensureSocialAuthContainers(sourceDb);
  targetDb.socialAuth.customerBindingsByMerchant[merchantId] = jsonClone(
    (sourceDb.socialAuth.customerBindingsByMerchant &&
      sourceDb.socialAuth.customerBindingsByMerchant[merchantId]) ||
      {}
  );
  targetDb.socialAuth.customerPhoneBindingsByMerchant[merchantId] = jsonClone(
    (sourceDb.socialAuth.customerPhoneBindingsByMerchant &&
      sourceDb.socialAuth.customerPhoneBindingsByMerchant[merchantId]) ||
      {}
  );

  targetDb.ledger = upsertMerchantRows(
    targetDb.ledger,
    merchantId,
    jsonClone((sourceDb.ledger || []).filter((item) => item.merchantId === merchantId))
  );
  targetDb.auditLogs = upsertMerchantRows(
    targetDb.auditLogs,
    merchantId,
    jsonClone((sourceDb.auditLogs || []).filter((item) => item.merchantId === merchantId))
  );

  if (!targetDb.tenantPolicies || typeof targetDb.tenantPolicies !== "object") {
    targetDb.tenantPolicies = {};
  }
  if (sourceDb.tenantPolicies && sourceDb.tenantPolicies[merchantId]) {
    targetDb.tenantPolicies[merchantId] = jsonClone(sourceDb.tenantPolicies[merchantId]);
  }

  if (!targetDb.tenantMigrations || typeof targetDb.tenantMigrations !== "object") {
    targetDb.tenantMigrations = {};
  }
  if (sourceDb.tenantMigrations && sourceDb.tenantMigrations[merchantId]) {
    targetDb.tenantMigrations[merchantId] = jsonClone(sourceDb.tenantMigrations[merchantId]);
  }

  if (targetDb.idCounters && sourceDb.idCounters) {
    targetDb.idCounters.ledger = Math.max(
      Number(targetDb.idCounters.ledger || 0),
      Number(sourceDb.idCounters.ledger || 0)
    );
    targetDb.idCounters.audit = Math.max(
      Number(targetDb.idCounters.audit || 0),
      Number(sourceDb.idCounters.audit || 0)
    );
  }
  targetDb.save();
}

async function cutoverMerchantToDedicatedDb({
  actualDb,
  tenantRouter,
  merchantId,
  postgresOptions = {},
}) {
  if (!merchantId) {
    throw new Error("merchantId is required");
  }
  const sourceDb = tenantRouter.getDbForMerchant(merchantId);
  const merchant = sourceDb.merchants && sourceDb.merchants[merchantId];
  if (!merchant) {
    throw new Error("merchant not found");
  }

  let dedicatedDb = null;
  let dedicatedDbFilePath = "";
  if (postgresOptions.connectionString) {
    dedicatedDbFilePath =
      (actualDb.tenantRouteFiles && actualDb.tenantRouteFiles[merchantId]) ||
      `${postgresOptions.snapshotKey || "main"}.tenant.${merchantId}`;
    dedicatedDb = await createPostgresDb({
      connectionString: postgresOptions.connectionString,
      schema: postgresOptions.schema,
      table: postgresOptions.table,
      snapshotKey: dedicatedDbFilePath,
      maxPoolSize: postgresOptions.maxPoolSize,
    });
  } else {
    dedicatedDb = createInMemoryDb();
    dedicatedDbFilePath = `inline:${merchantId}`;
    const inlineSnapshotRef = {
      type: "INLINE_SNAPSHOT",
      state: dedicatedDb.serialize()
    };
    dedicatedDb.save = () => {
      inlineSnapshotRef.state = dedicatedDb.serialize();
      if (!actualDb.tenantRouteFiles || typeof actualDb.tenantRouteFiles !== "object") {
        actualDb.tenantRouteFiles = {};
      }
      actualDb.tenantRouteFiles[merchantId] = inlineSnapshotRef;
      actualDb.save();
    };
  }

  copyMerchantSlice({
    sourceDb,
    targetDb: dedicatedDb,
    merchantId
  });
  const sourceSummary = buildMerchantSnapshotSummary(sourceDb, merchantId);
  const dedicatedSummary = buildMerchantSnapshotSummary(dedicatedDb, merchantId);
  if (!isSnapshotSummaryEqual(sourceSummary, dedicatedSummary)) {
    throw new Error("cutover snapshot verify failed");
  }

  tenantRouter.setDbForMerchant(merchantId, dedicatedDb);
  if (!actualDb.tenantRouteFiles || typeof actualDb.tenantRouteFiles !== "object") {
    actualDb.tenantRouteFiles = {};
  }
  if (postgresOptions.connectionString && dedicatedDbFilePath) {
    actualDb.tenantRouteFiles[merchantId] = dedicatedDbFilePath;
  }
  actualDb.save();
  dedicatedDb.save();

  return {
    dedicatedDbAttached: true,
    dedicatedDbFilePath: dedicatedDbFilePath || null,
    sourceSummary,
    dedicatedSummary
  };
}

async function rollbackMerchantToSharedDb({
  actualDb,
  tenantRouter,
  merchantId
}) {
  if (!merchantId) {
    throw new Error("merchantId is required");
  }
  if (!tenantRouter.hasDbOverride(merchantId)) {
    throw new Error("merchant has no dedicated route");
  }

  const dedicatedDb = tenantRouter.getDbForMerchant(merchantId);
  const dedicatedSummary = buildMerchantSnapshotSummary(dedicatedDb, merchantId);

  copyMerchantSlice({
    sourceDb: dedicatedDb,
    targetDb: actualDb,
    merchantId
  });
  const sharedSummary = buildMerchantSnapshotSummary(actualDb, merchantId);
  if (!isSnapshotSummaryEqual(dedicatedSummary, sharedSummary)) {
    throw new Error("rollback snapshot verify failed");
  }

  let dedicatedDbFilePath = null;
  if (actualDb.tenantRouteFiles && actualDb.tenantRouteFiles[merchantId]) {
    dedicatedDbFilePath = actualDb.tenantRouteFiles[merchantId];
    delete actualDb.tenantRouteFiles[merchantId];
  }
  tenantRouter.clearDbForMerchant(merchantId);
  actualDb.save();
  dedicatedDb.save();
  if (typeof dedicatedDb.close === "function") {
    await dedicatedDb.close();
  }

  return {
    dedicatedDbAttached: false,
    dedicatedDbFilePath,
    dedicatedSummary,
    sharedSummary
  };
}

function enforceTenantPolicyForHttp({
  tenantPolicyManager,
  merchantId,
  operation,
  res,
  auth,
  appendAuditLog
}) {
  const decision = tenantPolicyManager.evaluate({
    merchantId,
    operation
  });
  if (decision.allowed) {
    return true;
  }

  if (appendAuditLog && auth && merchantId) {
    appendAuditLog({
      merchantId,
      action: operation,
      status: "BLOCKED",
      auth,
      details: {
        reason: decision.reason,
        policyCode: decision.code
      }
    });
  }

  sendJson(res, decision.statusCode, {
    error: decision.reason,
    code: decision.code
  });
  return false;
}

function applyMigrationStep({
  actualDb,
  tenantPolicyManager,
  merchantId,
  step,
  note = ""
}) {
  const normalizedStep = String(step || "").trim().toUpperCase();
  if (!MIGRATION_STEPS.has(normalizedStep)) {
    throw new Error(`unsupported migration step: ${step}`);
  }

  let patch = null;
  if (normalizedStep === "FREEZE_WRITE") {
    patch = { writeEnabled: false };
  } else if (normalizedStep === "UNFREEZE_WRITE") {
    patch = { writeEnabled: true };
  } else if (normalizedStep === "DISABLE_WS") {
    patch = { wsEnabled: false };
  } else if (normalizedStep === "ENABLE_WS") {
    patch = { wsEnabled: true };
  }

  if (patch) {
    const policy = tenantPolicyManager.setMerchantPolicy(merchantId, patch);
    actualDb.tenantPolicies[merchantId] = {
      ...policy
    };
  }

  const previous = actualDb.tenantMigrations[merchantId] || {};
  const migration = {
    phase: resolveMigrationPhase(previous.phase, normalizedStep),
    step: normalizedStep,
    note: typeof note === "string" ? note : "",
    updatedAt: new Date().toISOString()
  };
  actualDb.tenantMigrations[merchantId] = migration;
  actualDb.save();

  return {
    migration,
    policy: tenantPolicyManager.getPolicy(merchantId)
  };
}

module.exports = {
  readJsonBody,
  sendJson,
  getAuthContext,
  getUpgradeAuthContext,
  ensureRole,
  resolveAuditAction,
  toPolicyPositiveInt,
  toListLimit,
  sanitizeLimitInput,
  buildTenantPolicyPatch,
  verifyHmacSignature,
  resolveMigrationPhase,
  jsonClone,
  upsertMerchantRows,
  uniqueDbs,
  buildMerchantSnapshotSummary,
  isSnapshotSummaryEqual,
  toActivityTag,
  toActivityTheme,
  buildCustomerActivities,
  sanitizeMerchantId,
  sanitizeMerchantName,
  sanitizeBudgetCap,
  constantTimeEquals,
  validateOnboardSecret,
  createSeedCustomer,
  ensureMerchantContainers,
  onboardMerchant,
  sanitizePhone,
  issuePhoneCode,
  verifyPhoneCode,
  ensureSocialAuthContainers,
  buildIdentityKey,
  buildPhoneIdentityKey,
  buildPhoneCustomerId,
  createCustomerProfile,
  bindCustomerPhoneIdentity,
  buildContractApplication,
  copyMerchantSlice,
  cutoverMerchantToDedicatedDb,
  rollbackMerchantToSharedDb,
  enforceTenantPolicyForHttp,
  applyMigrationStep,
};
