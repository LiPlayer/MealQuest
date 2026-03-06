const { ensurePolicyOsState } = require("../policyos/state");

const FEEDBACK_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const FEEDBACK_CATEGORIES = ["PAYMENT", "BENEFIT", "PRIVACY", "ACCOUNT", "OTHER"];
const TRANSITION_RULES = {
  OPEN: new Set(["IN_PROGRESS"]),
  IN_PROGRESS: new Set(["RESOLVED"]),
  RESOLVED: new Set(["IN_PROGRESS", "CLOSED"]),
  CLOSED: new Set(["IN_PROGRESS"]),
};

function toIso(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "";
}

function toTimestamp(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function toSafeWindowHours(input, fallback = 168, max = 24 * 30) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function sanitizeText(value, field, maxLength, required = false) {
  const safe = String(value || "").trim();
  if (required && !safe) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  if (safe.length > maxLength) {
    const error = new Error(`${field} exceeds max length ${maxLength}`);
    error.statusCode = 400;
    throw error;
  }
  return safe;
}

function sanitizeCategory(value) {
  const safe = String(value || "").trim().toUpperCase();
  if (!safe) {
    return "OTHER";
  }
  if (!FEEDBACK_CATEGORIES.includes(safe)) {
    const error = new Error("invalid feedback category");
    error.statusCode = 400;
    throw error;
  }
  return safe;
}

function sanitizeStatusFilter(value) {
  const safe = String(value || "ALL").trim().toUpperCase() || "ALL";
  if (safe !== "ALL" && !FEEDBACK_STATUSES.includes(safe)) {
    const error = new Error("invalid status");
    error.statusCode = 400;
    throw error;
  }
  return safe;
}

function sanitizeCategoryFilter(value) {
  const safe = String(value || "ALL").trim().toUpperCase() || "ALL";
  if (safe !== "ALL" && !FEEDBACK_CATEGORIES.includes(safe)) {
    const error = new Error("invalid category");
    error.statusCode = 400;
    throw error;
  }
  return safe;
}

function toListLimit(limit, fallback = 20, max = 100) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseCursor(cursor) {
  const safe = String(cursor || "").trim();
  if (!safe) {
    return null;
  }
  const [updatedAt, ticketId] = safe.split("|");
  const normalizedUpdatedAt = toIso(updatedAt);
  if (!normalizedUpdatedAt) {
    return null;
  }
  return {
    updatedAt: normalizedUpdatedAt,
    ticketId: String(ticketId || ""),
  };
}

function compareByUpdatedAtDesc(left, right) {
  const leftUpdatedAt = String(left && left.updatedAt ? left.updatedAt : "");
  const rightUpdatedAt = String(right && right.updatedAt ? right.updatedAt : "");
  if (leftUpdatedAt > rightUpdatedAt) {
    return -1;
  }
  if (leftUpdatedAt < rightUpdatedAt) {
    return 1;
  }
  const leftId = String(left && left.ticketId ? left.ticketId : "");
  const rightId = String(right && right.ticketId ? right.ticketId : "");
  if (leftId > rightId) {
    return -1;
  }
  if (leftId < rightId) {
    return 1;
  }
  return 0;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureFeedbackState(db) {
  const policyOs = ensurePolicyOsState(db);
  if (!policyOs.feedback || typeof policyOs.feedback !== "object") {
    policyOs.feedback = {};
  }
  if (!policyOs.feedback.ticketsById || typeof policyOs.feedback.ticketsById !== "object") {
    policyOs.feedback.ticketsById = {};
  }
  if (
    !policyOs.feedback.sequenceByMerchant ||
    typeof policyOs.feedback.sequenceByMerchant !== "object"
  ) {
    policyOs.feedback.sequenceByMerchant = {};
  }
  return policyOs.feedback;
}

function toTicketSummary(ticket) {
  if (!ticket || typeof ticket !== "object") {
    return null;
  }
  const timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
  const latestEvent = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  return {
    ticketId: String(ticket.ticketId || ""),
    merchantId: String(ticket.merchantId || ""),
    userId: String(ticket.userId || ""),
    category: String(ticket.category || "OTHER"),
    title: String(ticket.title || ""),
    description: String(ticket.description || ""),
    contact: String(ticket.contact || ""),
    status: String(ticket.status || "OPEN"),
    createdAt: toIso(ticket.createdAt) || new Date(0).toISOString(),
    updatedAt: toIso(ticket.updatedAt) || new Date(0).toISOString(),
    latestEvent: latestEvent
      ? {
          eventId: String(latestEvent.eventId || ""),
          fromStatus: latestEvent.fromStatus ? String(latestEvent.fromStatus) : null,
          toStatus: String(latestEvent.toStatus || ""),
          note: String(latestEvent.note || ""),
          actorRole: String(latestEvent.actorRole || ""),
          actorId: String(latestEvent.actorId || ""),
          createdAt: toIso(latestEvent.createdAt) || new Date(0).toISOString(),
        }
      : null,
  };
}

function toTicketDetail(ticket) {
  const base = toTicketSummary(ticket);
  if (!base) {
    return null;
  }
  const timeline = Array.isArray(ticket && ticket.timeline) ? ticket.timeline : [];
  return {
    ...base,
    timeline: timeline.map((event) => ({
      eventId: String(event && event.eventId ? event.eventId : ""),
      fromStatus: event && event.fromStatus ? String(event.fromStatus) : null,
      toStatus: String(event && event.toStatus ? event.toStatus : ""),
      note: String(event && event.note ? event.note : ""),
      actorRole: String(event && event.actorRole ? event.actorRole : ""),
      actorId: String(event && event.actorId ? event.actorId : ""),
      createdAt: toIso(event && event.createdAt) || new Date(0).toISOString(),
    })),
  };
}

function createFeedbackService(db, { now = () => Date.now() } = {}) {
  if (!db) {
    throw new Error("db is required");
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

  function assertTicketExists(feedbackState, ticketId) {
    const safeTicketId = String(ticketId || "").trim();
    if (!safeTicketId) {
      const error = new Error("ticketId is required");
      error.statusCode = 400;
      throw error;
    }
    const ticket = feedbackState.ticketsById[safeTicketId];
    if (!ticket) {
      const error = new Error("ticket not found");
      error.statusCode = 404;
      throw error;
    }
    return ticket;
  }

  function ensureTicketAccess(ticket, requesterRole, requesterUserId) {
    const safeRole = String(requesterRole || "").trim().toUpperCase();
    if (safeRole === "CUSTOMER") {
      const safeUserId = String(requesterUserId || "").trim();
      if (!safeUserId || safeUserId !== String(ticket.userId || "")) {
        const error = new Error("user scope denied");
        error.statusCode = 403;
        throw error;
      }
    }
  }

  function nextTicketId(feedbackState, merchantId) {
    const current = Number(feedbackState.sequenceByMerchant[merchantId] || 0) + 1;
    feedbackState.sequenceByMerchant[merchantId] = current;
    return `ticket_${merchantId}_${String(current).padStart(8, "0")}`;
  }

  function nextEventId(ticket) {
    const timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    const next = timeline.length + 1;
    return `${String(ticket.ticketId || "ticket")}_event_${String(next).padStart(4, "0")}`;
  }

  function createTicket({
    merchantId,
    userId,
    category,
    title,
    description,
    contact = "",
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const safeUserId = sanitizeText(userId, "userId", 128, true);
    const feedbackState = ensureFeedbackState(db);
    const safeCategory = sanitizeCategory(category);
    const safeTitle = sanitizeText(title, "title", 120, true);
    const safeDescription = sanitizeText(description, "description", 1000, true);
    const safeContact = sanitizeText(contact, "contact", 120, false);
    const nowIso = new Date(now()).toISOString();
    const ticketId = nextTicketId(feedbackState, safeMerchantId);

    const ticket = {
      ticketId,
      merchantId: safeMerchantId,
      userId: safeUserId,
      category: safeCategory,
      title: safeTitle,
      description: safeDescription,
      contact: safeContact,
      status: "OPEN",
      createdAt: nowIso,
      updatedAt: nowIso,
      timeline: [
        {
          eventId: `${ticketId}_event_0001`,
          fromStatus: null,
          toStatus: "OPEN",
          note: "顾客提交问题反馈",
          actorRole: "CUSTOMER",
          actorId: safeUserId,
          createdAt: nowIso,
        },
      ],
    };
    feedbackState.ticketsById[ticketId] = ticket;
    db.save();
    return {
      merchantId: safeMerchantId,
      ticket: toTicketDetail(ticket),
    };
  }

  function listTickets({
    merchantId,
    requesterRole,
    requesterUserId = "",
    status = "ALL",
    category = "ALL",
    limit = 20,
    cursor = "",
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const safeRole = String(requesterRole || "").trim().toUpperCase();
    const safeStatus = sanitizeStatusFilter(status);
    const safeCategory = sanitizeCategoryFilter(category);
    const safeLimit = toListLimit(limit, 20, 100);
    const cursorInfo = parseCursor(cursor);
    const feedbackState = ensureFeedbackState(db);

    const baseRows = Object.values(feedbackState.ticketsById || {})
      .filter((item) => item && item.merchantId === safeMerchantId)
      .filter((item) => {
        if (safeRole !== "CUSTOMER") {
          return true;
        }
        return String(item.userId || "") === String(requesterUserId || "");
      })
      .filter((item) => (safeStatus === "ALL" ? true : String(item.status || "") === safeStatus))
      .filter((item) => (safeCategory === "ALL" ? true : String(item.category || "") === safeCategory))
      .sort(compareByUpdatedAtDesc);

    const filtered = cursorInfo
      ? baseRows.filter((item) => {
          if (String(item.updatedAt || "") < cursorInfo.updatedAt) {
            return true;
          }
          if (String(item.updatedAt || "") > cursorInfo.updatedAt) {
            return false;
          }
          if (!cursorInfo.ticketId) {
            return false;
          }
          return String(item.ticketId || "") < cursorInfo.ticketId;
        })
      : baseRows;

    const items = filtered.slice(0, safeLimit).map((item) => toTicketSummary(item));
    const hasMore = filtered.length > safeLimit;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? `${String(last.updatedAt || "")}|${String(last.ticketId || "")}` : null;

    return {
      merchantId: safeMerchantId,
      roleScope: safeRole === "CUSTOMER" ? "SELF" : "MERCHANT",
      status: safeStatus,
      category: safeCategory,
      items,
      pageInfo: {
        limit: safeLimit,
        hasMore,
        nextCursor,
      },
    };
  }

  function getTicket({
    merchantId,
    ticketId,
    requesterRole,
    requesterUserId = "",
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const feedbackState = ensureFeedbackState(db);
    const ticket = assertTicketExists(feedbackState, ticketId);
    if (String(ticket.merchantId || "") !== safeMerchantId) {
      const error = new Error("ticket not found");
      error.statusCode = 404;
      throw error;
    }
    ensureTicketAccess(ticket, requesterRole, requesterUserId);
    return {
      merchantId: safeMerchantId,
      ticket: toTicketDetail(ticket),
    };
  }

  function transitionTicket({
    merchantId,
    ticketId,
    toStatus,
    note = "",
    operatorRole = "",
    operatorId = "",
  }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const feedbackState = ensureFeedbackState(db);
    const ticket = assertTicketExists(feedbackState, ticketId);
    if (String(ticket.merchantId || "") !== safeMerchantId) {
      const error = new Error("ticket not found");
      error.statusCode = 404;
      throw error;
    }
    const currentStatus = String(ticket.status || "").trim().toUpperCase();
    const targetStatus = String(toStatus || "").trim().toUpperCase();
    if (!FEEDBACK_STATUSES.includes(targetStatus)) {
      const error = new Error("invalid toStatus");
      error.statusCode = 400;
      throw error;
    }
    if (currentStatus === targetStatus) {
      const error = new Error("status unchanged");
      error.statusCode = 409;
      throw error;
    }
    const allowed = TRANSITION_RULES[currentStatus];
    if (!allowed || !allowed.has(targetStatus)) {
      const error = new Error(`invalid status transition: ${currentStatus} -> ${targetStatus}`);
      error.statusCode = 409;
      throw error;
    }

    const nowIso = new Date(now()).toISOString();
    const safeNote = sanitizeText(note, "note", 500, false);
    const event = {
      eventId: nextEventId(ticket),
      fromStatus: currentStatus,
      toStatus: targetStatus,
      note: safeNote,
      actorRole: String(operatorRole || "").trim().toUpperCase() || "UNKNOWN",
      actorId: String(operatorId || "").trim() || "unknown",
      createdAt: nowIso,
    };

    ticket.status = targetStatus;
    ticket.updatedAt = nowIso;
    ticket.timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    ticket.timeline.push(event);
    db.save();

    return {
      merchantId: safeMerchantId,
      ticket: toTicketDetail(ticket),
      transition: jsonClone(event),
    };
  }

  function getSummary({ merchantId, windowHours = 168 }) {
    const safeMerchantId = assertMerchantExists(merchantId);
    const merchant = db.merchants && db.merchants[safeMerchantId] ? db.merchants[safeMerchantId] : null;
    const safeWindowHours = toSafeWindowHours(windowHours, 168, 24 * 30);
    const feedbackState = ensureFeedbackState(db);
    const nowTs = now();
    const cutoffTs = nowTs - safeWindowHours * 60 * 60 * 1000;

    const allRows = Object.values(feedbackState.ticketsById || {}).filter(
      (item) => item && item.merchantId === safeMerchantId
    );
    const scopedRows = allRows.filter((item) => toTimestamp(item.updatedAt) >= cutoffTs);
    const statusCounter = {};
    const categoryCounter = {};
    for (const status of FEEDBACK_STATUSES) {
      statusCounter[status] = 0;
    }
    for (const category of FEEDBACK_CATEGORIES) {
      categoryCounter[category] = 0;
    }
    for (const row of scopedRows) {
      const rowStatus = String(row.status || "").toUpperCase();
      const rowCategory = String(row.category || "").toUpperCase();
      statusCounter[rowStatus] = Number(statusCounter[rowStatus] || 0) + 1;
      categoryCounter[rowCategory] = Number(categoryCounter[rowCategory] || 0) + 1;
    }
    const byStatus = FEEDBACK_STATUSES.map((status) => ({
      status,
      count: Number(statusCounter[status] || 0),
    }));
    const byCategory = FEEDBACK_CATEGORIES
      .map((category) => ({
        category,
        count: Number(categoryCounter[category] || 0),
      }))
      .filter((item) => item.count > 0)
      .sort((left, right) => Number(right.count) - Number(left.count))
      .slice(0, 8);
    const unresolvedCount = Number(statusCounter.OPEN || 0) + Number(statusCounter.IN_PROGRESS || 0);
    const resolvedCount = Number(statusCounter.RESOLVED || 0) + Number(statusCounter.CLOSED || 0);
    const latestTickets = scopedRows
      .sort(compareByUpdatedAtDesc)
      .slice(0, 10)
      .map((item) => toTicketSummary(item));
    const latestUpdatedAt =
      latestTickets.length > 0
        ? String(latestTickets[0] && latestTickets[0].updatedAt ? latestTickets[0].updatedAt : "")
        : toIso(merchant && merchant.onboardedAt) || "1970-01-01T00:00:00.000Z";

    return {
      merchantId: safeMerchantId,
      windowHours: safeWindowHours,
      generatedAt: latestUpdatedAt,
      totals: {
        tickets: scopedRows.length,
        unresolvedCount,
        resolvedCount,
      },
      byStatus,
      byCategory,
      latestTickets,
    };
  }

  return {
    createTicket,
    listTickets,
    getTicket,
    transitionTicket,
    getSummary,
  };
}

module.exports = {
  createFeedbackService,
  FEEDBACK_STATUSES,
  FEEDBACK_CATEGORIES,
};
