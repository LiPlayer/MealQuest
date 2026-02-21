function createTenantRepository({ tenantRouter }) {
  if (!tenantRouter) {
    throw new Error("tenantRouter is required");
  }

  function getDb(merchantId) {
    return tenantRouter.getDbForMerchant(merchantId);
  }

  function appendAuditLog({
    merchantId,
    action,
    status,
    role,
    operatorId,
    details = {}
  }) {
    if (!merchantId || !action || !status) {
      return null;
    }
    const db = getDb(merchantId);
    if (!db || typeof db.appendAuditLog !== "function") {
      return null;
    }
    const log = db.appendAuditLog({
      merchantId,
      action,
      status,
      role,
      operatorId,
      details
    });
    db.save();
    return log;
  }

  function toPositiveInt(value, fallback, max = 100) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.floor(parsed), max);
  }

  function parseCursor(cursor) {
    if (!cursor || typeof cursor !== "string") {
      return null;
    }
    const [timestamp, auditId] = cursor.split("|");
    if (!timestamp) {
      return null;
    }
    const time = new Date(timestamp);
    if (Number.isNaN(time.getTime())) {
      return null;
    }
    return {
      timestamp: time.toISOString(),
      auditId: auditId || ""
    };
  }

  function compareLogDesc(a, b) {
    if (a.timestamp > b.timestamp) {
      return -1;
    }
    if (a.timestamp < b.timestamp) {
      return 1;
    }
    if (a.auditId > b.auditId) {
      return -1;
    }
    if (a.auditId < b.auditId) {
      return 1;
    }
    return 0;
  }

  function listAuditLogs({
    merchantId,
    limit = 20,
    cursor = "",
    startTime = "",
    endTime = "",
    action = "",
    status = ""
  }) {
    const db = getDb(merchantId);
    const maxItems = toPositiveInt(limit, 20, 100);
    const cursorInfo = parseCursor(cursor);
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    const startIso = start && !Number.isNaN(start.getTime()) ? start.toISOString() : null;
    const endIso = end && !Number.isNaN(end.getTime()) ? end.toISOString() : null;

    const actionFilter = typeof action === "string" ? action.trim().toUpperCase() : "";
    const statusFilter = typeof status === "string" ? status.trim().toUpperCase() : "";

    const base = (db.auditLogs || [])
      .filter((item) => item.merchantId === merchantId)
      .filter((item) => (!startIso ? true : item.timestamp >= startIso))
      .filter((item) => (!endIso ? true : item.timestamp <= endIso))
      .filter((item) => (!actionFilter ? true : String(item.action || "").toUpperCase() === actionFilter))
      .filter((item) => (!statusFilter ? true : String(item.status || "").toUpperCase() === statusFilter))
      .sort(compareLogDesc);

    const filtered = cursorInfo
      ? base.filter((item) => {
          if (item.timestamp < cursorInfo.timestamp) {
            return true;
          }
          if (item.timestamp > cursorInfo.timestamp) {
            return false;
          }
          if (!cursorInfo.auditId) {
            return false;
          }
          return item.auditId < cursorInfo.auditId;
        })
      : base;

    const items = filtered.slice(0, maxItems);
    const hasMore = filtered.length > maxItems;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem ? `${lastItem.timestamp}|${lastItem.auditId}` : null;

    return {
      merchantId,
      items,
      pageInfo: {
        limit: maxItems,
        hasMore,
        nextCursor
      }
    };
  }

  return {
    getDb,
    getMerchant: (merchantId) => tenantRouter.getMerchant(merchantId),
    getMerchantUser: (merchantId, userId) =>
      tenantRouter.getMerchantUser(merchantId, userId),
    listCampaigns: (merchantId) =>
      getDb(merchantId).campaigns.filter((item) => item.merchantId === merchantId),
    appendAuditLog,
    listAuditLogs
  };
}

module.exports = {
  createTenantRepository
};
