const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const { URL } = require("node:url");
const {
  loadServerEnv,
  resolveServerRuntimeEnv
} = require("../config/runtimeEnv");

loadServerEnv();

const { issueToken, parseBearerToken, verifyToken } = require("../core/auth");
const { createTenantPolicyManager } = require("../core/tenantPolicy");
const { createTenantRouter } = require("../core/tenantRouter");
const { createWebSocketHub } = require("../core/websocketHub");
const { createCampaignService } = require("../services/campaignService");
const { createInvoiceService } = require("../services/invoiceService");
const { createMerchantService } = require("../services/merchantService");
const { createAllianceService } = require("../services/allianceService");
const { createPaymentService } = require("../services/paymentService");
const { createPrivacyService } = require("../services/privacyService");
const { createSocialService } = require("../services/socialService");
const { createSupplierService } = require("../services/supplierService");
const { createTreatPayService } = require("../services/treatPayService");
const { createInMemoryDb } = require("../store/inMemoryDb");
const { createPersistentDb } = require("../store/persistentDb");
const { createTenantRepository } = require("../store/tenantRepository");

const MERCHANT_ROLES = ["CLERK", "MANAGER", "OWNER"];
const CASHIER_ROLES = ["CUSTOMER", "CLERK", "MANAGER", "OWNER"];
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
  "SOCIAL_TRANSFER",
  "SOCIAL_RED_PACKET_CREATE",
  "SOCIAL_RED_PACKET_CLAIM",
  "TREAT_SESSION_CREATE",
  "TREAT_SESSION_JOIN",
  "TREAT_SESSION_CLOSE",
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

function normalizeRole(inputRole) {
  const allowed = ["CUSTOMER", "CLERK", "MANAGER", "OWNER"];
  if (allowed.includes(inputRole)) {
    return inputRole;
  }
  return "CUSTOMER";
}

function operatorForRole(role) {
  if (role === "OWNER") {
    return "staff_owner";
  }
  if (role === "MANAGER") {
    return "staff_manager";
  }
  if (role === "CLERK") {
    return "staff_clerk";
  }
  return undefined;
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
  if (method === "POST" && pathname === "/api/social/transfer") {
    return "SOCIAL_TRANSFER";
  }
  if (method === "POST" && pathname === "/api/social/red-packets") {
    return "SOCIAL_RED_PACKET_CREATE";
  }
  if (method === "POST" && /^\/api\/social\/red-packets\/[^/]+\/claim$/.test(pathname)) {
    return "SOCIAL_RED_PACKET_CLAIM";
  }
  if (method === "POST" && pathname === "/api/social/treat/sessions") {
    return "TREAT_SESSION_CREATE";
  }
  if (method === "POST" && /^\/api\/social\/treat\/sessions\/[^/]+\/join$/.test(pathname)) {
    return "TREAT_SESSION_JOIN";
  }
  if (method === "POST" && /^\/api\/social\/treat\/sessions\/[^/]+\/close$/.test(pathname)) {
    return "TREAT_SESSION_CLOSE";
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

function buildDedicatedDbFilePath(baseFilePath, merchantId) {
  const parsed = path.parse(baseFilePath);
  return path.join(parsed.dir, `${parsed.name}.tenant.${merchantId}.json`);
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
  const socialPackets =
    (db.socialRedPacketsByMerchant &&
      db.socialRedPacketsByMerchant[merchantId] &&
      Object.values(db.socialRedPacketsByMerchant[merchantId])) ||
    [];
  const treatSessions =
    (db.groupTreatSessionsByMerchant &&
      db.groupTreatSessionsByMerchant[merchantId] &&
      Object.values(db.groupTreatSessionsByMerchant[merchantId])) ||
    [];
  const allianceConfig =
    (db.allianceConfigs && db.allianceConfigs[merchantId]) || null;
  const ledger = (db.ledger || []).filter((item) => item.merchantId === merchantId);
  const socialTransfers = (db.socialTransferLogs || []).filter(
    (item) => item.merchantId === merchantId
  );
  const auditLogs = (db.auditLogs || []).filter((item) => item.merchantId === merchantId);
  const merchant = db.merchants && db.merchants[merchantId];

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
    socialPacketCount: socialPackets.length,
    treatSessionCount: treatSessions.length,
    socialTransferCount: socialTransfers.length,
    allianceWalletShared: Boolean(allianceConfig && allianceConfig.walletShared),
    ledgerCount: ledger.length,
    auditCount: auditLogs.length,
    budgetUsed: merchant ? Number(merchant.budgetUsed || 0) : 0,
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
  if (!db.socialRedPacketsByMerchant || typeof db.socialRedPacketsByMerchant !== "object") {
    db.socialRedPacketsByMerchant = {};
  }
  if (!db.groupTreatSessionsByMerchant || typeof db.groupTreatSessionsByMerchant !== "object") {
    db.groupTreatSessionsByMerchant = {};
  }
  if (!db.merchantDailySubsidyUsage || typeof db.merchantDailySubsidyUsage !== "object") {
    db.merchantDailySubsidyUsage = {};
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
  if (!db.socialRedPacketsByMerchant[merchantId]) {
    db.socialRedPacketsByMerchant[merchantId] = {};
  }
  if (!db.groupTreatSessionsByMerchant[merchantId]) {
    db.groupTreatSessionsByMerchant[merchantId] = {};
  }
  if (!db.merchantDailySubsidyUsage[merchantId]) {
    db.merchantDailySubsidyUsage[merchantId] = {};
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

  if (!targetDb.socialRedPacketsByMerchant || typeof targetDb.socialRedPacketsByMerchant !== "object") {
    targetDb.socialRedPacketsByMerchant = {};
  }
  targetDb.socialRedPacketsByMerchant[merchantId] = jsonClone(
    (sourceDb.socialRedPacketsByMerchant && sourceDb.socialRedPacketsByMerchant[merchantId]) || {}
  );

  if (!targetDb.allianceConfigs || typeof targetDb.allianceConfigs !== "object") {
    targetDb.allianceConfigs = {};
  }
  if (sourceDb.allianceConfigs && sourceDb.allianceConfigs[merchantId]) {
    targetDb.allianceConfigs[merchantId] = jsonClone(sourceDb.allianceConfigs[merchantId]);
  }

  if (
    !targetDb.groupTreatSessionsByMerchant ||
    typeof targetDb.groupTreatSessionsByMerchant !== "object"
  ) {
    targetDb.groupTreatSessionsByMerchant = {};
  }
  targetDb.groupTreatSessionsByMerchant[merchantId] = jsonClone(
    (sourceDb.groupTreatSessionsByMerchant &&
      sourceDb.groupTreatSessionsByMerchant[merchantId]) ||
    {}
  );

  if (!targetDb.merchantDailySubsidyUsage || typeof targetDb.merchantDailySubsidyUsage !== "object") {
    targetDb.merchantDailySubsidyUsage = {};
  }
  targetDb.merchantDailySubsidyUsage[merchantId] = jsonClone(
    (sourceDb.merchantDailySubsidyUsage && sourceDb.merchantDailySubsidyUsage[merchantId]) || {}
  );

  targetDb.ledger = upsertMerchantRows(
    targetDb.ledger,
    merchantId,
    jsonClone((sourceDb.ledger || []).filter((item) => item.merchantId === merchantId))
  );
  targetDb.socialTransferLogs = upsertMerchantRows(
    targetDb.socialTransferLogs,
    merchantId,
    jsonClone((sourceDb.socialTransferLogs || []).filter((item) => item.merchantId === merchantId))
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

function cutoverMerchantToDedicatedDb({
  actualDb,
  tenantRouter,
  merchantId,
  persist,
  dbFilePath
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
  if (persist) {
    dedicatedDbFilePath =
      (actualDb.tenantRouteFiles && actualDb.tenantRouteFiles[merchantId]) ||
      buildDedicatedDbFilePath(dbFilePath, merchantId);
    dedicatedDb = createPersistentDb(dedicatedDbFilePath);
  } else {
    dedicatedDb = createInMemoryDb();
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
  if (dedicatedDbFilePath) {
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

function rollbackMerchantToSharedDb({
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

function createAppServer({
  db = null,
  persist = false,
  tenantDbMap = {},
  tenantPolicyMap = {},
  defaultTenantPolicy = {},
  dbFilePath = path.resolve(process.cwd(), "data/db.json"),
  jwtSecret = resolveServerRuntimeEnv(process.env).jwtSecret,
  paymentCallbackSecret = resolveServerRuntimeEnv(process.env).paymentCallbackSecret,
  onboardSecret = resolveServerRuntimeEnv(process.env).onboardSecret,
  paymentProvider = null
} = {}) {
  const actualDb = db || (persist ? createPersistentDb(dbFilePath) : createInMemoryDb());
  if (typeof actualDb.save !== "function") {
    actualDb.save = () => { };
  }
  if (!actualDb.tenantRouteFiles || typeof actualDb.tenantRouteFiles !== "object") {
    actualDb.tenantRouteFiles = {};
  }
  const persistedTenantDbMap = {};
  if (persist) {
    for (const [merchantId, filePath] of Object.entries(actualDb.tenantRouteFiles)) {
      if (!merchantId || !filePath || typeof filePath !== "string") {
        continue;
      }
      persistedTenantDbMap[merchantId] = createPersistentDb(filePath);
    }
  }
  const mergedTenantDbMap = {
    ...persistedTenantDbMap,
    ...(tenantDbMap || {})
  };

  const tenantRouter = createTenantRouter({
    defaultDb: actualDb,
    tenantDbMap: mergedTenantDbMap
  });
  const tenantRepository = createTenantRepository({
    tenantRouter
  });
  const persistedTenantPolicyMap =
    actualDb.tenantPolicies && typeof actualDb.tenantPolicies === "object"
      ? actualDb.tenantPolicies
      : {};
  const mergedTenantPolicyMap = {
    ...persistedTenantPolicyMap,
    ...(tenantPolicyMap || {})
  };
  actualDb.tenantPolicies = { ...mergedTenantPolicyMap };
  const tenantPolicyManager = createTenantPolicyManager({
    tenantPolicyMap: mergedTenantPolicyMap,
    defaultTenantPolicy
  });
  actualDb.save();
  const serviceCache = new WeakMap();
  const getServicesForDb = (scopedDb) => {
    let services = serviceCache.get(scopedDb);
    if (!services) {
      services = {
        paymentService: createPaymentService(scopedDb, { paymentProvider }),
        campaignService: createCampaignService(scopedDb),
        merchantService: createMerchantService(scopedDb),
        allianceService: createAllianceService(scopedDb),
        invoiceService: createInvoiceService(scopedDb),
        privacyService: createPrivacyService(scopedDb),
        socialService: createSocialService(scopedDb),
        supplierService: createSupplierService(scopedDb),
        treatPayService: createTreatPayService(scopedDb)
      };
      serviceCache.set(scopedDb, services);
    }
    return services;
  };
  const getServicesForMerchant = (merchantId) => {
    const scopedDb = tenantRouter.getDbForMerchant(merchantId);
    return getServicesForDb(scopedDb);
  };
  const services = getServicesForDb(actualDb);
  const wsHub = createWebSocketHub();
  const allSockets = new Set();
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    requestsByPath: {},
    errorsTotal: 0
  };
  const appendAuditLog = ({ merchantId, action, status, auth, details }) => {
    tenantRepository.appendAuditLog({
      merchantId,
      action,
      status,
      role: auth && auth.role,
      operatorId: auth && (auth.operatorId || auth.userId),
      details
    });
  };

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://localhost");
    const auditAction = resolveAuditAction(method, url.pathname);
    metrics.requestsTotal += 1;
    metrics.requestsByPath[url.pathname] = (metrics.requestsByPath[url.pathname] || 0) + 1;
    let auth = null;
    try {
      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, now: new Date().toISOString() });
        return;
      }

      if (method === "GET" && url.pathname === "/metrics") {
        const lines = [
          "# TYPE mealquest_requests_total counter",
          `mealquest_requests_total ${metrics.requestsTotal}`,
          "# TYPE mealquest_errors_total counter",
          `mealquest_errors_total ${metrics.errorsTotal}`
        ];
        for (const [pathName, count] of Object.entries(metrics.requestsByPath)) {
          lines.push(
            `mealquest_requests_by_path_total{path="${String(pathName).replace(/"/g, '\\"')}"} ${count}`
          );
        }
        res.writeHead(200, {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8"
        });
        res.end(`${lines.join("\n")}\n`);
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/merchant/request-code") {
        const body = await readJsonBody(req);
        const phone = sanitizePhone(body.phone);
        const result = issuePhoneCode(actualDb, phone);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/merchant/phone-login") {
        const body = await readJsonBody(req);
        const { phone } = verifyPhoneCode(actualDb, {
          phone: body.phone,
          code: body.code
        });
        const merchantIdRaw = body.merchantId;
        const merchantId =
          merchantIdRaw === undefined || merchantIdRaw === null || merchantIdRaw === ""
            ? undefined
            : sanitizeMerchantId(merchantIdRaw);
        if (merchantId && !tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }

        const token = issueToken(
          {
            role: "OWNER",
            merchantId,
            operatorId: "staff_owner",
            phone
          },
          jwtSecret
        );
        sendJson(res, 200, {
          token,
          profile: {
            role: "OWNER",
            merchantId: merchantId || null,
            phone
          }
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/catalog") {
        const merchants = Object.values(actualDb.merchants || {})
          .map((merchant) => ({
            merchantId: merchant.merchantId,
            name: merchant.name,
            budgetCap: merchant.budgetCap,
            budgetUsed: merchant.budgetUsed,
            killSwitchEnabled: Boolean(merchant.killSwitchEnabled),
            onboardedAt: merchant.onboardedAt || null
          }))
          .sort((a, b) => String(a.merchantId).localeCompare(String(b.merchantId)));
        sendJson(res, 200, {
          items: merchants,
          total: merchants.length
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/onboard") {
        if (!validateOnboardSecret(req, onboardSecret)) {
          sendJson(res, 403, { error: "onboard secret invalid" });
          return;
        }
        const body = await readJsonBody(req);
        try {
          const result = onboardMerchant(actualDb, body);
          tenantRepository.appendAuditLog({
            merchantId: result.merchant.merchantId,
            action: "MERCHANT_ONBOARD",
            status: "SUCCESS",
            role: "SYSTEM",
            operatorId: "bootstrap",
            details: {
              seededUsers: result.seededUsers.length
            }
          });
          sendJson(res, 201, result);
          return;
        } catch (error) {
          if (error && error.code === "MERCHANT_EXISTS") {
            sendJson(res, 409, { error: error.message });
            return;
          }
          throw error;
        }
      }

      if (method === "POST" && url.pathname === "/api/auth/mock-login") {
        const body = await readJsonBody(req);
        const role = normalizeRole(body.role);
        const merchantId = body.merchantId || "m_store_001";
        const userId = body.userId || "u_demo";

        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }
        if (role === "CUSTOMER" && !tenantRepository.getMerchantUser(merchantId, userId)) {
          sendJson(res, 404, { error: "user not found" });
          return;
        }

        const token = issueToken(
          {
            role,
            merchantId,
            userId: role === "CUSTOMER" ? userId : undefined,
            operatorId: operatorForRole(role)
          },
          jwtSecret
        );

        sendJson(res, 200, {
          token,
          profile: {
            role,
            merchantId,
            userId: role === "CUSTOMER" ? userId : undefined,
            operatorId: operatorForRole(role)
          }
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/callback") {
        const body = await readJsonBody(req);
        const merchantId = body.merchantId;
        const signature = req.headers["x-payment-signature"];
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (!verifyHmacSignature(body, signature, paymentCallbackSecret)) {
          sendJson(res, 401, { error: "invalid callback signature" });
          return;
        }

        const { paymentService } = getServicesForMerchant(merchantId);
        const result = paymentService.confirmExternalPayment({
          merchantId,
          paymentTxnId: body.paymentTxnId,
          externalTxnId: body.externalTxnId,
          callbackStatus: body.status,
          paidAmount: body.paidAmount,
          idempotencyKey: body.callbackId || body.externalTxnId || body.paymentTxnId
        });
        appendAuditLog({
          merchantId,
          action: "PAYMENT_CALLBACK",
          status: result.status === "PAID" ? "SUCCESS" : "FAILED",
          auth: {
            role: "SYSTEM",
            operatorId: "payment_gateway"
          },
          details: {
            paymentTxnId: body.paymentTxnId,
            externalTxnId: body.externalTxnId,
            callbackStatus: body.status
          }
        });
        wsHub.broadcast(merchantId, "PAYMENT_VERIFIED", result);
        sendJson(res, 200, result);
        return;
      }

      auth = getAuthContext(req, jwtSecret);

      if (method === "GET" && url.pathname === "/api/state") {
        const merchantId = url.searchParams.get("merchantId");
        const userId = url.searchParams.get("userId");
        if (!merchantId || !userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== userId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }

        const scopedDb = tenantRouter.getDbForMerchant(merchantId);
        const { merchantService, allianceService } = getServicesForDb(scopedDb);
        const merchant = tenantRepository.getMerchant(merchantId);
        const user = tenantRepository.getMerchantUser(merchantId, userId);
        if (!merchant || !user) {
          sendJson(res, 404, { error: "merchant or user not found" });
          return;
        }

        const campaigns = tenantRepository.listCampaigns(merchantId);
        sendJson(res, 200, {
          merchant,
          user,
          dashboard: merchantService.getDashboard({ merchantId }),
          campaigns,
          proposals: tenantRepository.listProposals(merchantId),
          strategyConfigs: tenantRepository.listStrategyConfigs(merchantId),
          activities: buildCustomerActivities(campaigns),
          allianceConfig: allianceService.getAllianceConfig({ merchantId })
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/ws/status") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (auth.merchantId && merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "WS_STATUS_QUERY",
            res,
            auth
          })
        ) {
          return;
        }
        sendJson(res, 200, {
          merchantId,
          onlineCount: wsHub.getOnlineCount(merchantId)
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/audit/logs") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "AUDIT_QUERY",
            res,
            auth
          })
        ) {
          return;
        }

        const result = tenantRepository.listAuditLogs({
          merchantId,
          limit: url.searchParams.get("limit"),
          cursor: url.searchParams.get("cursor") || "",
          startTime: url.searchParams.get("startTime") || "",
          endTime: url.searchParams.get("endTime") || "",
          action: url.searchParams.get("action") || "",
          status: url.searchParams.get("status") || ""
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/quote") {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        body.merchantId = auth.merchantId || body.merchantId;
        if (auth.role === "CUSTOMER") {
          body.userId = auth.userId;
        }
        const { paymentService } = getServicesForMerchant(body.merchantId);
        const result = paymentService.getQuote(body);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/verify") {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        body.merchantId = auth.merchantId || body.merchantId;
        if (auth.role === "CUSTOMER") {
          body.userId = auth.userId;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId: body.merchantId,
            operation: "PAYMENT_VERIFY",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }

        const { paymentService } = getServicesForMerchant(body.merchantId);
        const result = paymentService.verifyPayment({
          ...body,
          idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey
        });
        appendAuditLog({
          merchantId: body.merchantId,
          action: "PAYMENT_VERIFY",
          status: "SUCCESS",
          auth,
          details: {
            paymentTxnId: result.paymentTxnId,
            userId: body.userId,
            orderAmount: Number(body.orderAmount || 0)
          }
        });
        wsHub.broadcast(body.merchantId, "PAYMENT_VERIFIED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/payment/refund") {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        body.merchantId = auth.merchantId || body.merchantId;
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId: body.merchantId,
            operation: "PAYMENT_REFUND",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { paymentService } = getServicesForMerchant(body.merchantId);
        const result = paymentService.refundPayment({
          ...body,
          idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey
        });
        appendAuditLog({
          merchantId: body.merchantId,
          action: "PAYMENT_REFUND",
          status: "SUCCESS",
          auth,
          details: {
            paymentTxnId: body.paymentTxnId,
            refundTxnId: result.refundTxnId,
            refundAmount: Number(body.refundAmount || 0)
          }
        });
        wsHub.broadcast(body.merchantId, "PAYMENT_REFUNDED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/payment/ledger") {
        ensureRole(auth, [...MERCHANT_ROLES, "CUSTOMER"]);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }

        const scopedDb = tenantRouter.getDbForMerchant(merchantId);
        const limit = toListLimit(url.searchParams.get("limit"), 20, 100);
        const requestedUserId = url.searchParams.get("userId") || "";
        const userId = auth.role === "CUSTOMER" ? auth.userId : requestedUserId;
        if (auth.role === "CUSTOMER" && requestedUserId && requestedUserId !== auth.userId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }

        const items = (scopedDb.ledger || [])
          .filter((row) => row.merchantId === merchantId)
          .filter((row) => (userId ? row.userId === userId : true))
          .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
          .slice(0, limit);

        sendJson(res, 200, {
          merchantId,
          userId: userId || null,
          items
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/invoice/issue") {
        ensureRole(auth, MERCHANT_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "INVOICE_ISSUE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { invoiceService } = getServicesForMerchant(merchantId);
        const result = invoiceService.issueInvoice({
          merchantId,
          paymentTxnId: body.paymentTxnId,
          title: body.title,
          taxNo: body.taxNo,
          email: body.email
        });
        appendAuditLog({
          merchantId,
          action: "INVOICE_ISSUE",
          status: "SUCCESS",
          auth,
          details: {
            paymentTxnId: body.paymentTxnId,
            invoiceNo: result.invoiceNo
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/invoice/list") {
        ensureRole(auth, [...MERCHANT_ROLES, "CUSTOMER"]);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const requestedUserId = url.searchParams.get("userId") || "";
        const userId = auth.role === "CUSTOMER" ? auth.userId : requestedUserId;
        if (auth.role === "CUSTOMER" && requestedUserId && requestedUserId !== auth.userId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        const { invoiceService } = getServicesForMerchant(merchantId);
        const result = invoiceService.listInvoices({
          merchantId,
          userId,
          limit: url.searchParams.get("limit")
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/privacy/export-user") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId || !body.userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { privacyService } = getServicesForMerchant(merchantId);
        const result = privacyService.exportUserData({
          merchantId,
          userId: body.userId
        });
        appendAuditLog({
          merchantId,
          action: "PRIVACY_EXPORT",
          status: "SUCCESS",
          auth,
          details: {
            userId: body.userId
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/privacy/delete-user") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId || !body.userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { privacyService } = getServicesForMerchant(merchantId);
        const result = privacyService.deleteUserData({
          merchantId,
          userId: body.userId
        });
        appendAuditLog({
          merchantId,
          action: "PRIVACY_DELETE",
          status: "SUCCESS",
          auth,
          details: {
            userId: body.userId
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/privacy/cancel-account") {
        ensureRole(auth, ["CUSTOMER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const userId = auth.userId;
        if (!merchantId || !userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { privacyService } = getServicesForMerchant(merchantId);
        const result = privacyService.cancelUserAccount({
          merchantId,
          userId
        });
        appendAuditLog({
          merchantId,
          action: "PRIVACY_CANCEL",
          status: "SUCCESS",
          auth,
          details: {
            userId
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/dashboard") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId");
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        sendJson(res, 200, merchantService.getDashboard({ merchantId }));
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/strategy-library") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        sendJson(res, 200, merchantService.listStrategyLibrary({ merchantId }));
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/strategy-configs") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        sendJson(res, 200, merchantService.listStrategyConfigs({ merchantId }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/strategy-proposals") {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId || !body.templateId) {
          sendJson(res, 400, { error: "merchantId and templateId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "STRATEGY_PROPOSAL_CREATE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        const result = merchantService.createStrategyProposal({
          merchantId,
          templateId: body.templateId,
          branchId: body.branchId,
          operatorId: auth.operatorId,
          intent: body.intent,
          overrides: body.overrides
        });
        appendAuditLog({
          merchantId,
          action: "STRATEGY_PROPOSAL_CREATE",
          status: "SUCCESS",
          auth,
          details: {
            templateId: body.templateId,
            branchId: body.branchId || null,
            proposalId: result.proposalId
          }
        });
        wsHub.broadcast(merchantId, "STRATEGY_PROPOSAL_CREATED", result);
        sendJson(res, 200, result);
        return;
      }

      const campaignStatusMatch = url.pathname.match(
        /^\/api\/merchant\/campaigns\/([^/]+)\/status$/
      );
      if (method === "POST" && campaignStatusMatch) {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const campaignId = campaignStatusMatch[1];
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "CAMPAIGN_STATUS_SET",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        const result = merchantService.setCampaignStatus({
          merchantId,
          campaignId,
          status: body.status
        });
        appendAuditLog({
          merchantId,
          action: "CAMPAIGN_STATUS_SET",
          status: "SUCCESS",
          auth,
          details: {
            campaignId,
            status: result.status
          }
        });
        wsHub.broadcast(merchantId, "CAMPAIGN_STATUS_CHANGED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/fire-sale") {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "FIRE_SALE_CREATE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        const result = merchantService.createFireSaleCampaign({
          merchantId,
          targetSku: body.targetSku,
          ttlMinutes: body.ttlMinutes,
          voucherValue: body.voucherValue,
          maxQty: body.maxQty
        });
        appendAuditLog({
          merchantId,
          action: "FIRE_SALE_CREATE",
          status: "SUCCESS",
          auth,
          details: {
            targetSku: body.targetSku || null,
            campaignId: result.campaignId
          }
        });
        wsHub.broadcast(merchantId, "FIRE_SALE_CREATED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/contract/status") {
        ensureRole(auth, ["OWNER", "MANAGER"]);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }
        const item =
          (actualDb.contractApplications && actualDb.contractApplications[merchantId]) || null;
        sendJson(res, 200, {
          merchantId,
          status: item ? item.status : "NOT_SUBMITTED",
          application: item
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/contract/apply") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "CONTRACT_APPLY",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }

        const application = buildContractApplication(body);
        if (!actualDb.contractApplications || typeof actualDb.contractApplications !== "object") {
          actualDb.contractApplications = {};
        }
        actualDb.contractApplications[merchantId] = {
          merchantId,
          ...application
        };
        actualDb.save();

        appendAuditLog({
          merchantId,
          action: "CONTRACT_APPLY",
          status: "SUCCESS",
          auth,
          details: {
            companyName: application.companyName,
            licenseNo: application.licenseNo,
            contactPhone: application.contactPhone
          }
        });

        sendJson(res, 200, {
          merchantId,
          status: application.status,
          application: actualDb.contractApplications[merchantId]
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/supplier/verify-order") {
        ensureRole(auth, ["CLERK", "MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId || !body.partnerId || !body.orderId) {
          sendJson(res, 400, { error: "merchantId, partnerId and orderId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "SUPPLIER_VERIFY",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { supplierService } = getServicesForMerchant(merchantId);
        const result = supplierService.verifyPartnerOrder({
          partnerId: body.partnerId,
          orderId: body.orderId,
          minSpend: body.minSpend
        });
        appendAuditLog({
          merchantId,
          action: "SUPPLIER_VERIFY",
          status: result.verified ? "SUCCESS" : "BLOCKED",
          auth,
          details: {
            partnerId: body.partnerId,
            orderId: body.orderId,
            minSpend: body.minSpend || 0,
            verified: result.verified
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/alliance-config") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { allianceService } = getServicesForMerchant(merchantId);
        sendJson(res, 200, allianceService.getAllianceConfig({ merchantId }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/alliance-config") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "ALLIANCE_CONFIG_SET",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { allianceService } = getServicesForMerchant(merchantId);
        const result = allianceService.setAllianceConfig({
          merchantId,
          clusterId: body.clusterId,
          stores: body.stores,
          walletShared: body.walletShared,
          tierShared: body.tierShared
        });
        appendAuditLog({
          merchantId,
          action: "ALLIANCE_CONFIG_SET",
          status: "SUCCESS",
          auth,
          details: {
            clusterId: result.clusterId,
            stores: result.stores,
            walletShared: result.walletShared,
            tierShared: result.tierShared
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/stores") {
        ensureRole(auth, MERCHANT_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { allianceService } = getServicesForMerchant(merchantId);
        sendJson(res, 200, allianceService.listStores({ merchantId }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/alliance/sync-user") {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId || !body.userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "ALLIANCE_SYNC_USER",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { allianceService } = getServicesForMerchant(merchantId);
        const result = allianceService.syncUserAcrossStores({
          merchantId,
          userId: body.userId
        });
        appendAuditLog({
          merchantId,
          action: "ALLIANCE_SYNC_USER",
          status: "SUCCESS",
          auth,
          details: {
            userId: body.userId,
            syncedStores: result.syncedStores
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/social/transfer") {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const fromUserId =
          auth.role === "CUSTOMER" ? auth.userId : body.fromUserId || body.userId;
        const toUserId = body.toUserId;
        if (!merchantId || !fromUserId || !toUserId) {
          sendJson(res, 400, { error: "merchantId/fromUserId/toUserId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== fromUserId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "SOCIAL_TRANSFER",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const idem =
          req.headers["idempotency-key"] ||
          body.idempotencyKey ||
          `social_transfer_${Date.now()}`;
        const { socialService } = getServicesForMerchant(merchantId);
        const result = socialService.transferSilver({
          merchantId,
          fromUserId,
          toUserId,
          amount: body.amount,
          idempotencyKey: String(idem)
        });
        appendAuditLog({
          merchantId,
          action: "SOCIAL_TRANSFER",
          status: "SUCCESS",
          auth,
          details: {
            fromUserId,
            toUserId,
            amount: body.amount
          }
        });
        wsHub.broadcast(merchantId, "SOCIAL_TRANSFERRED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/social/red-packets") {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const senderUserId =
          auth.role === "CUSTOMER" ? auth.userId : body.senderUserId || body.userId;
        if (!merchantId || !senderUserId) {
          sendJson(res, 400, { error: "merchantId and senderUserId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== senderUserId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "SOCIAL_RED_PACKET_CREATE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const idem =
          req.headers["idempotency-key"] ||
          body.idempotencyKey ||
          `social_packet_create_${Date.now()}`;
        const { socialService } = getServicesForMerchant(merchantId);
        const result = socialService.createRedPacket({
          merchantId,
          senderUserId,
          totalAmount: body.totalAmount,
          totalSlots: body.totalSlots,
          expiresInMinutes: body.expiresInMinutes,
          idempotencyKey: String(idem)
        });
        appendAuditLog({
          merchantId,
          action: "SOCIAL_RED_PACKET_CREATE",
          status: "SUCCESS",
          auth,
          details: {
            senderUserId,
            totalAmount: body.totalAmount,
            totalSlots: body.totalSlots,
            packetId: result.packetId
          }
        });
        wsHub.broadcast(merchantId, "SOCIAL_RED_PACKET_CREATED", result);
        sendJson(res, 200, result);
        return;
      }

      const socialClaimMatch = url.pathname.match(
        /^\/api\/social\/red-packets\/([^/]+)\/claim$/
      );
      if (method === "POST" && socialClaimMatch) {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const userId = auth.role === "CUSTOMER" ? auth.userId : body.userId;
        if (!merchantId || !userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== userId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "SOCIAL_RED_PACKET_CLAIM",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const idem =
          req.headers["idempotency-key"] ||
          body.idempotencyKey ||
          `social_packet_claim_${socialClaimMatch[1]}_${userId}`;
        const { socialService } = getServicesForMerchant(merchantId);
        const result = socialService.claimRedPacket({
          merchantId,
          packetId: socialClaimMatch[1],
          userId,
          idempotencyKey: String(idem)
        });
        appendAuditLog({
          merchantId,
          action: "SOCIAL_RED_PACKET_CLAIM",
          status: "SUCCESS",
          auth,
          details: {
            packetId: socialClaimMatch[1],
            userId,
            claimAmount: result.claimAmount
          }
        });
        wsHub.broadcast(merchantId, "SOCIAL_RED_PACKET_CLAIMED", result);
        sendJson(res, 200, result);
        return;
      }

      const socialPacketQueryMatch = url.pathname.match(/^\/api\/social\/red-packets\/([^/]+)$/);
      if (method === "GET" && socialPacketQueryMatch) {
        ensureRole(auth, CASHIER_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { socialService } = getServicesForMerchant(merchantId);
        const result = socialService.getRedPacket({
          merchantId,
          packetId: socialPacketQueryMatch[1]
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/social/treat/sessions") {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const initiatorUserId =
          auth.role === "CUSTOMER" ? auth.userId : body.initiatorUserId || body.userId;
        if (!merchantId || !initiatorUserId) {
          sendJson(res, 400, { error: "merchantId and initiatorUserId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== initiatorUserId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "TREAT_SESSION_CREATE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { treatPayService } = getServicesForMerchant(merchantId);
        const result = treatPayService.createSession({
          merchantId,
          initiatorUserId,
          mode: body.mode,
          orderAmount: body.orderAmount,
          subsidyRate: body.subsidyRate,
          subsidyCap: body.subsidyCap,
          dailySubsidyCap: body.dailySubsidyCap,
          ttlMinutes: body.ttlMinutes
        });
        appendAuditLog({
          merchantId,
          action: "TREAT_SESSION_CREATE",
          status: "SUCCESS",
          auth,
          details: {
            sessionId: result.sessionId,
            mode: result.mode,
            orderAmount: result.orderAmount
          }
        });
        wsHub.broadcast(merchantId, "TREAT_SESSION_CREATED", result);
        sendJson(res, 200, result);
        return;
      }

      const treatJoinMatch = url.pathname.match(/^\/api\/social\/treat\/sessions\/([^/]+)\/join$/);
      if (method === "POST" && treatJoinMatch) {
        ensureRole(auth, CASHIER_ROLES);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        const userId = auth.role === "CUSTOMER" ? auth.userId : body.userId;
        if (!merchantId || !userId) {
          sendJson(res, 400, { error: "merchantId and userId are required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (auth.role === "CUSTOMER" && auth.userId !== userId) {
          sendJson(res, 403, { error: "user scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "TREAT_SESSION_JOIN",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const idem =
          req.headers["idempotency-key"] ||
          body.idempotencyKey ||
          `treat_join_${treatJoinMatch[1]}_${userId}`;
        const { treatPayService } = getServicesForMerchant(merchantId);
        const result = treatPayService.joinSession({
          merchantId,
          sessionId: treatJoinMatch[1],
          userId,
          amount: body.amount,
          idempotencyKey: String(idem)
        });
        appendAuditLog({
          merchantId,
          action: "TREAT_SESSION_JOIN",
          status: "SUCCESS",
          auth,
          details: {
            sessionId: treatJoinMatch[1],
            userId,
            amount: body.amount
          }
        });
        wsHub.broadcast(merchantId, "TREAT_SESSION_JOINED", result);
        sendJson(res, 200, result);
        return;
      }

      const treatCloseMatch = url.pathname.match(/^\/api\/social\/treat\/sessions\/([^/]+)\/close$/);
      if (method === "POST" && treatCloseMatch) {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "TREAT_SESSION_CLOSE",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { treatPayService } = getServicesForMerchant(merchantId);
        const result = treatPayService.closeSession({
          merchantId,
          sessionId: treatCloseMatch[1],
          operatorId: auth.operatorId
        });
        appendAuditLog({
          merchantId,
          action: "TREAT_SESSION_CLOSE",
          status: result.status === "SETTLED" ? "SUCCESS" : "BLOCKED",
          auth,
          details: {
            sessionId: treatCloseMatch[1],
            status: result.status
          }
        });
        wsHub.broadcast(merchantId, "TREAT_SESSION_CLOSED", result);
        sendJson(res, 200, result);
        return;
      }

      const treatQueryMatch = url.pathname.match(/^\/api\/social\/treat\/sessions\/([^/]+)$/);
      if (method === "GET" && treatQueryMatch) {
        ensureRole(auth, CASHIER_ROLES);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        const { treatPayService } = getServicesForMerchant(merchantId);
        const result = treatPayService.getSession({
          merchantId,
          sessionId: treatQueryMatch[1]
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/tenant-policy") {
        ensureRole(auth, ["OWNER"]);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }

        sendJson(res, 200, {
          merchantId,
          policy: tenantPolicyManager.getPolicy(merchantId)
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/tenant-policy") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }

        const patch = buildTenantPolicyPatch(body);
        const policy = tenantPolicyManager.setMerchantPolicy(merchantId, patch);
        actualDb.tenantPolicies[merchantId] = {
          ...policy
        };
        actualDb.save();
        appendAuditLog({
          merchantId,
          action: "TENANT_POLICY_SET",
          status: "SUCCESS",
          auth,
          details: {
            patch
          }
        });

        sendJson(res, 200, {
          merchantId,
          policy
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/merchant/migration/status") {
        ensureRole(auth, ["OWNER"]);
        const merchantId = url.searchParams.get("merchantId") || auth.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }

        const migration = actualDb.tenantMigrations[merchantId] || {
          phase: "IDLE",
          step: "INIT",
          note: "",
          updatedAt: null
        };
        sendJson(res, 200, {
          merchantId,
          dedicatedDbAttached: tenantRouter.hasDbOverride(merchantId),
          dedicatedDbFilePath:
            (actualDb.tenantRouteFiles && actualDb.tenantRouteFiles[merchantId]) || null,
          migration,
          policy: tenantPolicyManager.getPolicy(merchantId)
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/migration/step") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }

        const result = applyMigrationStep({
          actualDb,
          tenantPolicyManager,
          merchantId,
          step: body.step,
          note: body.note
        });
        appendAuditLog({
          merchantId,
          action: "MIGRATION_STEP",
          status: "SUCCESS",
          auth,
          details: {
            step: result.migration.step,
            phase: result.migration.phase,
            note: result.migration.note
          }
        });

        sendJson(res, 200, {
          merchantId,
          dedicatedDbAttached: tenantRouter.hasDbOverride(merchantId),
          ...result
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/migration/cutover") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }

        let cutoverResult = null;
        let finalState = null;
        try {
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "FREEZE_WRITE",
            note: body.note || "auto freeze for cutover"
          });
          cutoverResult = cutoverMerchantToDedicatedDb({
            actualDb,
            tenantRouter,
            merchantId,
            persist,
            dbFilePath
          });
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_VERIFYING",
            note: "cutover verification"
          });
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_CUTOVER",
            note: "cutover completed"
          });
          finalState = applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after cutover"
          });
        } catch (error) {
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_ROLLBACK",
            note: `cutover failed: ${error.message}`
          });
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after cutover failure"
          });
          throw error;
        }

        appendAuditLog({
          merchantId,
          action: "MIGRATION_CUTOVER",
          status: "SUCCESS",
          auth,
          details: {
            dedicatedDbFilePath: cutoverResult.dedicatedDbFilePath,
            phase: finalState.migration.phase
          }
        });

        sendJson(res, 200, {
          merchantId,
          ...cutoverResult,
          ...finalState
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/migration/rollback") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (!merchantId) {
          sendJson(res, 400, { error: "merchantId is required" });
          return;
        }
        if (auth.merchantId && auth.merchantId !== merchantId) {
          sendJson(res, 403, { error: "merchant scope denied" });
          return;
        }
        if (!tenantRepository.getMerchant(merchantId)) {
          sendJson(res, 404, { error: "merchant not found" });
          return;
        }

        let rollbackResult = null;
        let finalState = null;
        try {
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "FREEZE_WRITE",
            note: body.note || "freeze before rollback"
          });
          rollbackResult = rollbackMerchantToSharedDb({
            actualDb,
            tenantRouter,
            merchantId
          });
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "MARK_ROLLBACK",
            note: "rollback completed"
          });
          finalState = applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after rollback"
          });
        } catch (error) {
          applyMigrationStep({
            actualDb,
            tenantPolicyManager,
            merchantId,
            step: "UNFREEZE_WRITE",
            note: "restore write traffic after rollback failure"
          });
          throw error;
        }

        appendAuditLog({
          merchantId,
          action: "MIGRATION_ROLLBACK",
          status: "SUCCESS",
          auth,
          details: {
            phase: finalState.migration.phase
          }
        });

        sendJson(res, 200, {
          merchantId,
          ...rollbackResult,
          ...finalState
        });
        return;
      }

      const proposalMatch = url.pathname.match(
        /^\/api\/merchant\/proposals\/([^/]+)\/confirm$/
      );
      if (method === "POST" && proposalMatch) {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const proposalId = proposalMatch[1];
        const merchantId = auth.merchantId || body.merchantId;
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "PROPOSAL_CONFIRM",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        const result = merchantService.confirmProposal({
          merchantId,
          proposalId,
          operatorId: auth.operatorId || body.operatorId || "system"
        });
        appendAuditLog({
          merchantId,
          action: "PROPOSAL_CONFIRM",
          status: "SUCCESS",
          auth,
          details: {
            proposalId,
            campaignId: result.campaignId
          }
        });
        wsHub.broadcast(merchantId, "PROPOSAL_CONFIRMED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/merchant/kill-switch") {
        ensureRole(auth, ["OWNER"]);
        const body = await readJsonBody(req);
        const merchantId = auth.merchantId || body.merchantId;
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId,
            operation: "KILL_SWITCH_SET",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { merchantService } = getServicesForMerchant(merchantId);
        const result = merchantService.setKillSwitch({
          merchantId,
          enabled: body.enabled
        });
        appendAuditLog({
          merchantId,
          action: "KILL_SWITCH_SET",
          status: "SUCCESS",
          auth,
          details: {
            enabled: Boolean(body.enabled)
          }
        });
        wsHub.broadcast(result.merchantId, "KILL_SWITCH_CHANGED", result);
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/tca/trigger") {
        ensureRole(auth, ["MANAGER", "OWNER"]);
        const body = await readJsonBody(req);
        body.merchantId = auth.merchantId || body.merchantId;
        if (
          !enforceTenantPolicyForHttp({
            tenantPolicyManager,
            merchantId: body.merchantId,
            operation: "TCA_TRIGGER",
            res,
            auth,
            appendAuditLog
          })
        ) {
          return;
        }
        const { campaignService } = getServicesForMerchant(body.merchantId);
        const result = campaignService.triggerEvent(body);
        appendAuditLog({
          merchantId: body.merchantId,
          action: "TCA_TRIGGER",
          status: result.blockedByKillSwitch ? "BLOCKED" : "SUCCESS",
          auth,
          details: {
            event: body.event,
            executedCount: (result.executed || []).length,
            blockedByKillSwitch: Boolean(result.blockedByKillSwitch)
          }
        });
        wsHub.broadcast(body.merchantId, "TCA_TRIGGERED", result);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (error) {
      metrics.errorsTotal += 1;
      const message = error.message || "Request failed";
      const statusCode =
        message === "permission denied" || message.includes("scope denied")
          ? 403
          : message.includes("Authorization")
            ? 401
            : 400;
      if (auditAction && auth && auth.merchantId) {
        appendAuditLog({
          merchantId: auth.merchantId,
          action: auditAction,
          status: statusCode === 403 || statusCode === 401 ? "DENIED" : "FAILED",
          auth,
          details: {
            error: message
          }
        });
      }
      sendJson(res, statusCode, { error: message });
    }
  });

  server.on("upgrade", (req, socket) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      if (parsedUrl.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      const auth = getUpgradeAuthContext(req, jwtSecret, parsedUrl);
      const merchantId = parsedUrl.searchParams.get("merchantId");
      if (merchantId && auth.merchantId && merchantId !== auth.merchantId) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      const scopedMerchantId = auth.merchantId || merchantId;
      const wsPolicy = tenantPolicyManager.evaluate({
        merchantId: scopedMerchantId,
        operation: "WS_CONNECT"
      });
      if (!wsPolicy.allowed) {
        const statusLine =
          wsPolicy.statusCode === 429
            ? "HTTP/1.1 429 Too Many Requests\r\n\r\n"
            : "HTTP/1.1 403 Forbidden\r\n\r\n";
        socket.write(statusLine);
        socket.destroy();
        return;
      }
      wsHub.handleUpgrade(req, socket, {
        ...auth,
        merchantId: scopedMerchantId
      });
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("connection", (socket) => {
    allSockets.add(socket);
    socket.on("close", () => allSockets.delete(socket));
  });

  function start(port = 0, host) {
    return new Promise((resolve, reject) => {
      const onListening = () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to read server address"));
          return;
        }
        resolve(address.port);
      };
      if (host) {
        server.listen(port, host, onListening);
      } else {
        server.listen(port, onListening);
      }
    });
  }

  function stop() {
    return new Promise((resolve, reject) => {
      wsHub.closeAll();
      for (const socket of [...allSockets]) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  return {
    db: actualDb,
    server,
    start,
    stop,
    wsHub,
    tenantRouter,
    tenantRepository,
    tenantPolicyManager,
    services: {
      ...services,
      getServicesForMerchant
    }
  };
}

if (require.main === module) {
  const runtimeEnv = resolveServerRuntimeEnv(process.env);
  const app = createAppServer({ persist: true });
  app
    .start(runtimeEnv.port, runtimeEnv.host)
    .then((startedPort) => {
      // eslint-disable-next-line no-console
      console.log(`MealQuestServer listening on ${runtimeEnv.host}:${startedPort}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to start server:", error);
      process.exit(1);
    });
}

module.exports = {
  createAppServer
};
