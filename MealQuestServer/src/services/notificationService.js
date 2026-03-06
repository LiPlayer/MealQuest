const { ensurePolicyOsState } = require("../policyos/state");

const DEFAULT_RETENTION_DAYS = 30;

function toIso(value) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) {
    return "";
  }
  return new Date(ts).toISOString();
}

function parseCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }
  const [createdAt, notificationId] = cursor.split("|");
  const createdAtIso = toIso(createdAt);
  if (!createdAtIso) {
    return null;
  }
  return {
    createdAt: createdAtIso,
    notificationId: String(notificationId || "")
  };
}

function compareDesc(left, right) {
  const leftCreatedAt = String(left && left.createdAt ? left.createdAt : "");
  const rightCreatedAt = String(right && right.createdAt ? right.createdAt : "");
  if (leftCreatedAt > rightCreatedAt) {
    return -1;
  }
  if (leftCreatedAt < rightCreatedAt) {
    return 1;
  }
  const leftId = String(left && left.notificationId ? left.notificationId : "");
  const rightId = String(right && right.notificationId ? right.notificationId : "");
  if (leftId > rightId) {
    return -1;
  }
  if (leftId < rightId) {
    return 1;
  }
  return 0;
}

function createNotificationService(db, { wsHub = null, now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
  }

  function ensureNotificationState() {
    const policyOs = ensurePolicyOsState(db);
    policyOs.notifications = policyOs.notifications || {};
    policyOs.notifications.byId = policyOs.notifications.byId || {};
    policyOs.notifications.sequenceByMerchant = policyOs.notifications.sequenceByMerchant || {};
    return policyOs.notifications;
  }

  function assertMerchantExists(merchantId) {
    const safeMerchantId = String(merchantId || "").trim();
    if (!safeMerchantId) {
      const error = new Error("merchantId is required");
      error.statusCode = 400;
      throw error;
    }
    if (!db.merchants || !db.merchants[safeMerchantId]) {
      const error = new Error("merchant not found");
      error.statusCode = 404;
      throw error;
    }
    return safeMerchantId;
  }

  function sanitizeRecipientType(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized !== "MERCHANT_STAFF" && normalized !== "CUSTOMER_USER") {
      const error = new Error("invalid recipientType");
      error.statusCode = 400;
      throw error;
    }
    return normalized;
  }

  function sanitizeRecipientId(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      const error = new Error("recipientId is required");
      error.statusCode = 400;
      throw error;
    }
    return normalized;
  }

  function nextNotificationId(notificationState, merchantId) {
    const key = String(merchantId || "");
    const current = Number(notificationState.sequenceByMerchant[key] || 0) + 1;
    notificationState.sequenceByMerchant[key] = current;
    return `notification_${key}_${String(current).padStart(8, "0")}`;
  }

  function normalizeNotification(record) {
    return {
      notificationId: String(record.notificationId || ""),
      merchantId: String(record.merchantId || ""),
      recipientType: String(record.recipientType || ""),
      recipientId: String(record.recipientId || ""),
      category: String(record.category || ""),
      title: String(record.title || ""),
      body: String(record.body || ""),
      related:
        record.related && typeof record.related === "object"
          ? { ...record.related }
          : {},
      status: String(record.status || "UNREAD"),
      createdAt: toIso(record.createdAt) || new Date(now()).toISOString(),
      readAt: toIso(record.readAt) || null,
      expiresAt: toIso(record.expiresAt) || null
    };
  }

  function createNotification({
    merchantId,
    recipientType,
    recipientId,
    category,
    title,
    body,
    related = {},
    expiresAt = null
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const safeRecipientType = sanitizeRecipientType(recipientType);
    const safeRecipientId = sanitizeRecipientId(recipientId);
    const notificationState = ensureNotificationState();
    const createdAt = new Date(now()).toISOString();
    const defaultExpiresAt = new Date(
      now() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const record = normalizeNotification({
      notificationId: nextNotificationId(notificationState, safeMerchantId),
      merchantId: safeMerchantId,
      recipientType: safeRecipientType,
      recipientId: safeRecipientId,
      category: String(category || "").trim().toUpperCase() || "GENERAL",
      title: String(title || "").trim(),
      body: String(body || "").trim(),
      related: related && typeof related === "object" ? related : {},
      status: "UNREAD",
      createdAt,
      readAt: null,
      expiresAt: expiresAt || defaultExpiresAt
    });
    notificationState.byId[record.notificationId] = record;
    db.save();
    if (wsHub && typeof wsHub.broadcastToRecipients === "function") {
      wsHub.broadcastToRecipients(
        safeMerchantId,
        "NOTIFICATION_CREATED",
        { notification: record },
        [
          {
            recipientType: safeRecipientType,
            recipientId: safeRecipientId
          }
        ]
      );
    }
    return { ...record };
  }

  function listRowsForRecipient({ merchantId, recipientType, recipientId }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const safeRecipientType = sanitizeRecipientType(recipientType);
    const safeRecipientId = sanitizeRecipientId(recipientId);
    const notificationState = ensureNotificationState();
    const nowMs = now();
    return Object.values(notificationState.byId || {})
      .map((item) => normalizeNotification(item))
      .filter((item) => item.merchantId === safeMerchantId)
      .filter((item) => item.recipientType === safeRecipientType)
      .filter((item) => item.recipientId === safeRecipientId)
      .filter((item) => {
        const expiresAtMs = Date.parse(String(item.expiresAt || ""));
        if (!Number.isFinite(expiresAtMs)) {
          return true;
        }
        return expiresAtMs >= nowMs;
      })
      .sort(compareDesc);
  }

  function listInbox({
    merchantId,
    recipientType,
    recipientId,
    status = "ALL",
    category = "ALL",
    limit = 20,
    cursor = ""
  }) {
    const safeStatus = String(status || "ALL").trim().toUpperCase() || "ALL";
    const safeCategory = String(category || "ALL").trim().toUpperCase() || "ALL";
    if (!["ALL", "UNREAD", "READ"].includes(safeStatus)) {
      const error = new Error("invalid status");
      error.statusCode = 400;
      throw error;
    }
    const safeLimit = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 100);
    const cursorInfo = parseCursor(cursor);
    const rows = listRowsForRecipient({
      merchantId,
      recipientType,
      recipientId
    })
      .filter((item) => (safeStatus === "ALL" ? true : item.status === safeStatus))
      .filter((item) => (safeCategory === "ALL" ? true : item.category === safeCategory));

    const filtered = cursorInfo
      ? rows.filter((item) => {
          if (item.createdAt < cursorInfo.createdAt) {
            return true;
          }
          if (item.createdAt > cursorInfo.createdAt) {
            return false;
          }
          if (!cursorInfo.notificationId) {
            return false;
          }
          return String(item.notificationId) < cursorInfo.notificationId;
        })
      : rows;

    const items = filtered.slice(0, safeLimit);
    const hasMore = filtered.length > safeLimit;
    const lastItem = items[items.length - 1];
    return {
      merchantId: assertMerchantExists(merchantId),
      recipientType: sanitizeRecipientType(recipientType),
      recipientId: sanitizeRecipientId(recipientId),
      status: safeStatus,
      category: safeCategory,
      items,
      pageInfo: {
        limit: safeLimit,
        hasMore,
        nextCursor:
          hasMore && lastItem
            ? `${String(lastItem.createdAt || "")}|${String(lastItem.notificationId || "")}`
            : null
      }
    };
  }

  function getUnreadSummary({ merchantId, recipientType, recipientId }) {
    const rows = listRowsForRecipient({
      merchantId,
      recipientType,
      recipientId
    }).filter((item) => item.status === "UNREAD");
    const byCategoryMap = {};
    for (const row of rows) {
      byCategoryMap[row.category] = Number(byCategoryMap[row.category] || 0) + 1;
    }
    const byCategory = Object.entries(byCategoryMap)
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
      .map(([category, count]) => ({
        category,
        unreadCount: count
      }));
    return {
      merchantId: assertMerchantExists(merchantId),
      recipientType: sanitizeRecipientType(recipientType),
      recipientId: sanitizeRecipientId(recipientId),
      totalUnread: rows.length,
      byCategory
    };
  }

  function markRead({
    merchantId,
    recipientType,
    recipientId,
    notificationIds = [],
    markAll = false
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const safeRecipientType = sanitizeRecipientType(recipientType);
    const safeRecipientId = sanitizeRecipientId(recipientId);
    const notificationState = ensureNotificationState();
    const ownedRows = listRowsForRecipient({
      merchantId: safeMerchantId,
      recipientType: safeRecipientType,
      recipientId: safeRecipientId
    });
    const ownedMap = new Map(ownedRows.map((item) => [item.notificationId, item]));
    const safeIds = Array.isArray(notificationIds)
      ? notificationIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const targetIds = markAll
      ? ownedRows.filter((item) => item.status === "UNREAD").map((item) => item.notificationId)
      : safeIds.filter((id) => {
          const row = ownedMap.get(id);
          return row && row.status === "UNREAD";
        });

    const readAt = new Date(now()).toISOString();
    const updatedIds = [];
    for (const id of targetIds) {
      const row = notificationState.byId[id];
      if (!row) {
        continue;
      }
      row.status = "READ";
      row.readAt = readAt;
      updatedIds.push(id);
    }
    if (updatedIds.length > 0) {
      db.save();
      if (wsHub && typeof wsHub.broadcastToRecipients === "function") {
        wsHub.broadcastToRecipients(
          safeMerchantId,
          "NOTIFICATION_READ",
          {
            notificationIds: updatedIds,
            readAt
          },
          [
            {
              recipientType: safeRecipientType,
              recipientId: safeRecipientId
            }
          ]
        );
      }
    }
    return {
      merchantId: safeMerchantId,
      recipientType: safeRecipientType,
      recipientId: safeRecipientId,
      updatedCount: updatedIds.length,
      notificationIds: updatedIds
    };
  }

  function listMerchantStaffRecipientIds(merchantId, allowedRoles = []) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const merchant = db.merchants[safeMerchantId];
    const roleSet = new Set(
      (Array.isArray(allowedRoles) ? allowedRoles : [])
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean)
    );
    const rows = Array.isArray(merchant && merchant.staff) ? merchant.staff : [];
    const ids = rows
      .filter((item) => item && item.uid)
      .filter((item) => (roleSet.size === 0 ? true : roleSet.has(String(item.role || "").toUpperCase())))
      .map((item) => String(item.uid));
    return Array.from(new Set(ids));
  }

  function emitApprovalTodo({
    merchantId,
    draftId,
    policyKey = "",
    policyName = "",
    submittedBy = "",
    submittedAt = ""
  }) {
    const ownerRecipients = listMerchantStaffRecipientIds(merchantId, ["OWNER"]);
    const title = "策略待审批";
    const body = `${policyName || policyKey || draftId || "策略草稿"}已提交审批`;
    const created = [];
    for (const recipientId of ownerRecipients) {
      created.push(
        createNotification({
          merchantId,
          recipientType: "MERCHANT_STAFF",
          recipientId,
          category: "APPROVAL_TODO",
          title,
          body,
          related: {
            draftId: String(draftId || ""),
            policyKey: String(policyKey || ""),
            submittedBy: String(submittedBy || ""),
            submittedAt: String(submittedAt || "")
          }
        })
      );
    }
    return {
      merchantId: assertMerchantExists(merchantId),
      createdCount: created.length
    };
  }

  function emitExecutionResult({
    merchantId,
    userId = "",
    event = "",
    decisionId = "",
    outcome = "",
    reasonCodes = []
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const outcomeText = String(outcome || "").trim().toUpperCase() || "NO_POLICY";
    const title = "策略执行结果";
    const body =
      outcomeText === "HIT"
        ? `事件 ${String(event || "")} 已命中策略`
        : outcomeText === "BLOCKED"
          ? `事件 ${String(event || "")} 未执行，存在阻断条件`
          : `事件 ${String(event || "")} 未命中策略`;
    const created = [];
    const staffRecipientIds = listMerchantStaffRecipientIds(safeMerchantId, [
      "OWNER",
      "MANAGER",
      "CLERK"
    ]);
    for (const recipientId of staffRecipientIds) {
      created.push(
        createNotification({
          merchantId: safeMerchantId,
          recipientType: "MERCHANT_STAFF",
          recipientId,
          category: "EXECUTION_RESULT",
          title,
          body,
          related: {
            decisionId: String(decisionId || ""),
            event: String(event || ""),
            outcome: outcomeText,
            reasonCodes: Array.isArray(reasonCodes) ? reasonCodes : []
          }
        })
      );
    }

    const safeUserId = String(userId || "").trim();
    if (safeUserId) {
      created.push(
        createNotification({
          merchantId: safeMerchantId,
          recipientType: "CUSTOMER_USER",
          recipientId: safeUserId,
          category: "EXECUTION_RESULT",
          title: "权益触达结果",
          body,
          related: {
            decisionId: String(decisionId || ""),
            event: String(event || ""),
            outcome: outcomeText,
            reasonCodes: Array.isArray(reasonCodes) ? reasonCodes : []
          }
        })
      );
    }
    return {
      merchantId: safeMerchantId,
      createdCount: created.length
    };
  }

  return {
    createNotification,
    listInbox,
    getUnreadSummary,
    markRead,
    listMerchantStaffRecipientIds,
    emitApprovalTodo,
    emitExecutionResult
  };
}

module.exports = {
  createNotificationService
};
