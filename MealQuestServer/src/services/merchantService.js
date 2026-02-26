const {
  findTemplate
} = require("./strategyLibrary");

function createMerchantService(db, options = {}) {
  const aiStrategyService = options.aiStrategyService;
  const MAX_CHAT_MESSAGES = 180;
  const DEFAULT_CHAT_PAGE_LIMIT = 20;
  const MAX_CHAT_PAGE_LIMIT = 60;
  const MODEL_HISTORY_TOKEN_BUDGET = 2600;
  const MODEL_HISTORY_MAX_MESSAGES = 40;
  const CHAT_COMPACTION_TRIGGER_TOKENS = 3200;
  const CHAT_COMPACTION_KEEP_RECENT_TOKENS = 1400;
  const CHAT_COMPACTION_MIN_RECENT_MESSAGES = 10;
  const MAX_MEMORY_SUMMARY_CHARS = 4000;
  const MAX_MEMORY_PREFIX_CHARS = 1600;
  const MAX_MEMORY_FACTS_PER_CATEGORY = 8;
  const MAX_MEMORY_FACT_CHARS = 160;
  const MAX_APPROVED_STRATEGY_CONTEXT = 12;
  const MAX_ACTIVE_CAMPAIGN_CONTEXT = 12;
  const MAX_EXECUTION_HISTORY_CONTEXT = 20;
  const MAX_EXECUTION_DETAIL_VALUE_LEN = 80;
  const MAX_TOTAL_PROPOSAL_CANDIDATES = 12;
  const SALES_WINDOWS_DAYS = [7, 30];
  const MEMORY_FACT_KEYS = ["goals", "constraints", "audience", "timing", "decisions"];
  const MEMORY_FACT_LABELS = {
    goals: "Goals",
    constraints: "Constraints",
    audience: "Audience",
    timing: "Timing",
    decisions: "Decisions"
  };

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function roundMoney(value) {
    return Math.round(toFiniteNumber(value) * 100) / 100;
  }

  function createSalesAggregate() {
    return {
      ordersPaidCount: 0,
      externalPaidCount: 0,
      walletOnlyPaidCount: 0,
      gmvPaid: 0,
      refundAmount: 0,
      netRevenue: 0,
      aov: 0,
      refundRate: 0
    };
  }

  function accumulateSalesAggregate(aggregate, payment) {
    if (!aggregate || !payment) {
      return;
    }
    const orderAmount = Math.max(0, roundMoney(payment.orderAmount));
    const refundAmount = Math.min(orderAmount, Math.max(0, roundMoney(payment.refundedAmount)));
    aggregate.ordersPaidCount += 1;
    aggregate.gmvPaid = roundMoney(aggregate.gmvPaid + orderAmount);
    aggregate.refundAmount = roundMoney(aggregate.refundAmount + refundAmount);
    if (payment.externalPayment) {
      aggregate.externalPaidCount += 1;
    } else {
      aggregate.walletOnlyPaidCount += 1;
    }
  }

  function finalizeSalesAggregate(aggregate) {
    const safe = aggregate || createSalesAggregate();
    const gmvPaid = roundMoney(safe.gmvPaid);
    const refundAmount = roundMoney(safe.refundAmount);
    const ordersPaidCount = Math.max(0, Math.floor(toFiniteNumber(safe.ordersPaidCount)));
    const externalPaidCount = Math.max(0, Math.floor(toFiniteNumber(safe.externalPaidCount)));
    const walletOnlyPaidCount = Math.max(0, Math.floor(toFiniteNumber(safe.walletOnlyPaidCount)));
    const netRevenue = roundMoney(gmvPaid - refundAmount);
    const aov = ordersPaidCount > 0 ? roundMoney(gmvPaid / ordersPaidCount) : 0;
    const refundRate = gmvPaid > 0 ? Number((refundAmount / gmvPaid).toFixed(4)) : 0;
    return {
      ordersPaidCount,
      externalPaidCount,
      walletOnlyPaidCount,
      gmvPaid,
      refundAmount,
      netRevenue,
      aov,
      refundRate
    };
  }

  function getSalesSnapshotContext(merchantId) {
    const paymentsBucket =
      db.paymentsByMerchant &&
      typeof db.paymentsByMerchant === "object" &&
      db.paymentsByMerchant[merchantId] &&
      typeof db.paymentsByMerchant[merchantId] === "object"
        ? db.paymentsByMerchant[merchantId]
        : {};
    const payments = Object.values(paymentsBucket);
    const nowMs = Date.now();
    const windowBuckets = SALES_WINDOWS_DAYS.map((days) => ({
      days,
      cutoffMs: nowMs - days * 24 * 60 * 60 * 1000,
      aggregate: createSalesAggregate()
    }));
    const totals = createSalesAggregate();
    let pendingExternalCount = 0;
    let failedExternalCount = 0;

    for (const payment of payments) {
      const status = String(payment && payment.status ? payment.status : "").toUpperCase();
      if (status === "PENDING_EXTERNAL") {
        pendingExternalCount += 1;
      } else if (status === "EXTERNAL_FAILED") {
        failedExternalCount += 1;
      }
      if (status !== "PAID") {
        continue;
      }
      accumulateSalesAggregate(totals, payment);

      const createdAtMs = Date.parse(String(payment && payment.createdAt ? payment.createdAt : ""));
      if (!Number.isFinite(createdAtMs)) {
        continue;
      }
      for (const windowBucket of windowBuckets) {
        if (createdAtMs >= windowBucket.cutoffMs) {
          accumulateSalesAggregate(windowBucket.aggregate, payment);
        }
      }
    }

    const finalizedTotals = finalizeSalesAggregate(totals);
    return {
      generatedAt: new Date(nowMs).toISOString(),
      currency: "CNY",
      totals: finalizedTotals,
      windows: windowBuckets.map((windowBucket) => ({
        days: windowBucket.days,
        ...finalizeSalesAggregate(windowBucket.aggregate)
      })),
      paymentStatusSummary: {
        totalPayments: payments.length,
        paidCount: finalizedTotals.ordersPaidCount,
        pendingExternalCount,
        failedExternalCount
      }
    };
  }

  function ensureStrategyBucket(merchantId) {
    if (!db.strategyConfigs || typeof db.strategyConfigs !== "object") {
      db.strategyConfigs = {};
    }
    if (!db.strategyConfigs[merchantId] || typeof db.strategyConfigs[merchantId] !== "object") {
      db.strategyConfigs[merchantId] = {};
    }
    return db.strategyConfigs[merchantId];
  }

  function setStrategyConfig(merchantId, templateId, patch = {}) {
    const bucket = ensureStrategyBucket(merchantId);
    const previous = bucket[templateId] || {
      templateId,
      branchId: "",
      status: "DRAFT",
      lastProposalId: null,
      lastCampaignId: null,
      updatedAt: null
    };
    bucket[templateId] = {
      ...previous,
      ...patch,
      templateId,
      updatedAt: new Date().toISOString()
    };
    return bucket[templateId];
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureStrategyChatBucket(merchantId) {
    if (!db.strategyChats || typeof db.strategyChats !== "object") {
      db.strategyChats = {};
    }
    if (!db.strategyChats[merchantId] || typeof db.strategyChats[merchantId] !== "object") {
      db.strategyChats[merchantId] = {
        activeSessionId: null,
        sessions: {}
      };
    }
    if (!db.strategyChats[merchantId].sessions || typeof db.strategyChats[merchantId].sessions !== "object") {
      db.strategyChats[merchantId].sessions = {};
    }
    return db.strategyChats[merchantId];
  }

  function createSessionId() {
    return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createChatMessage(session, message) {
    session.messageSeq = Number(session.messageSeq || 0) + 1;
    return {
      messageId: `msg_${session.sessionId}_${session.messageSeq}`,
      role: String(message.role || "ASSISTANT").toUpperCase(),
      type: String(message.type || "TEXT").toUpperCase(),
      text: String(message.text || ""),
      proposalId: message.proposalId || null,
      metadata: message.metadata || null,
      createdAt: new Date().toISOString()
    };
  }

  function appendChatMessage(session, message) {
    const item = createChatMessage(session, message);
    if (!Array.isArray(session.messages)) {
      session.messages = [];
    }
    session.messages.push(item);
    if (session.messages.length > MAX_CHAT_MESSAGES) {
      session.messages = session.messages.slice(-MAX_CHAT_MESSAGES);
    }
    session.updatedAt = new Date().toISOString();
    return item;
  }

  function truncateText(value, maxLen = 160) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, maxLen)}...`;
  }

  function estimateTokenCount(value) {
    const text = String(value || "").trim();
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4) + 4;
  }

  function estimateMessageTokens(message) {
    if (!message || typeof message !== "object") {
      return 0;
    }
    return (
      estimateTokenCount(message.role) +
      estimateTokenCount(message.type) +
      estimateTokenCount(message.text) +
      8
    );
  }

  function estimateMessagesTokens(messages) {
    const items = Array.isArray(messages) ? messages : [];
    return items.reduce((sum, item) => sum + estimateMessageTokens(item), 0);
  }

  function createEmptyMemoryFacts() {
    return {
      goals: [],
      constraints: [],
      audience: [],
      timing: [],
      decisions: []
    };
  }

  function normalizeMemoryFacts(input) {
    const normalized = createEmptyMemoryFacts();
    if (!input || typeof input !== "object") {
      return normalized;
    }
    for (const key of MEMORY_FACT_KEYS) {
      const bucket = Array.isArray(input[key]) ? input[key] : [];
      const unique = new Set();
      for (const item of bucket) {
        const text = truncateText(String(item || "").replace(/\s+/g, " "), MAX_MEMORY_FACT_CHARS);
        const fingerprint = text.toLowerCase();
        if (!text || unique.has(fingerprint)) {
          continue;
        }
        unique.add(fingerprint);
        normalized[key].push(text);
        if (normalized[key].length >= MAX_MEMORY_FACTS_PER_CATEGORY) {
          break;
        }
      }
    }
    return normalized;
  }

  function ensureSessionMemoryState(session) {
    if (!session || typeof session !== "object") {
      return;
    }
    session.memorySummary = String(session.memorySummary || "").trim();
    session.memoryFacts = normalizeMemoryFacts(session.memoryFacts);
  }

  function appendMemoryFact(memoryFacts, key, rawText) {
    if (!memoryFacts || !MEMORY_FACT_KEYS.includes(key)) {
      return;
    }
    const normalized = truncateText(String(rawText || "").replace(/\s+/g, " "), MAX_MEMORY_FACT_CHARS);
    if (!normalized) {
      return;
    }
    const bucket = Array.isArray(memoryFacts[key]) ? memoryFacts[key] : [];
    const fingerprint = normalized.toLowerCase();
    if (bucket.some((item) => String(item).toLowerCase() === fingerprint)) {
      return;
    }
    bucket.push(normalized);
    memoryFacts[key] = bucket.slice(-MAX_MEMORY_FACTS_PER_CATEGORY);
  }

  function splitTextToFacts(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .split(/[\n。！？!?；;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function extractMemoryFactsFromMessages(messages) {
    const facts = createEmptyMemoryFacts();
    const items = Array.isArray(messages) ? messages : [];
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const role = String(item.role || "").toUpperCase();
      const type = String(item.type || "").toUpperCase();
      const text = String(item.text || "").trim();
      if (!text) {
        continue;
      }
      if (type === "PROPOSAL_REVIEW") {
        appendMemoryFact(facts, "decisions", text);
        continue;
      }
      if (!(role === "USER" && type === "TEXT")) {
        continue;
      }
      const fragments = splitTextToFacts(text);
      for (const fragment of fragments) {
        const lower = fragment.toLowerCase();
        if (
          /(目标|希望|想要|提升|增长|拉新|复购|gmv|转化|roi|goal|grow|increase|improve|boost)/i.test(
            fragment
          )
        ) {
          appendMemoryFact(facts, "goals", fragment);
        }
        if (
          /(预算|上限|不能|不要|避免|限制|成本|毛利|折扣|风险|budget|cap|limit|avoid|must not|constraint)/i.test(
            fragment
          )
        ) {
          appendMemoryFact(facts, "constraints", fragment);
        }
        if (/(新客|老客|会员|客群|学生|白领|用户|用户群|audience|segment|user)/i.test(fragment)) {
          appendMemoryFact(facts, "audience", fragment);
        }
        if (/(今天|本周|本月|节假日|周末|晚高峰|午餐|晚餐|天|周|月|hour|day|week|month|timeline)/i.test(fragment)) {
          appendMemoryFact(facts, "timing", fragment);
        }
        if (!/[0-9]/.test(lower)) {
          continue;
        }
        if (/(预算|cap|预算上限|成本|折扣|coupon|voucher|ttl|小时|天|周|月|%)/i.test(lower)) {
          appendMemoryFact(facts, "constraints", fragment);
        }
      }
    }
    return facts;
  }

  function mergeSessionMemoryFacts(session, incomingFacts) {
    ensureSessionMemoryState(session);
    const safeIncoming = normalizeMemoryFacts(incomingFacts);
    for (const key of MEMORY_FACT_KEYS) {
      for (const fact of safeIncoming[key]) {
        appendMemoryFact(session.memoryFacts, key, fact);
      }
    }
  }

  function buildMemoryFactsPrefix(memoryFacts) {
    const safeFacts = normalizeMemoryFacts(memoryFacts);
    const lines = [];
    for (const key of MEMORY_FACT_KEYS) {
      const bucket = safeFacts[key];
      if (!Array.isArray(bucket) || bucket.length === 0) {
        continue;
      }
      lines.push(`${MEMORY_FACT_LABELS[key]}: ${bucket.join(" | ")}`);
    }
    if (lines.length === 0) {
      return "";
    }
    return truncateText(lines.join("\n"), MAX_MEMORY_PREFIX_CHARS);
  }

  function buildSessionCompactionSummary(messages, extractedFacts = null) {
    const items = Array.isArray(messages) ? messages : [];
    if (items.length === 0) {
      return "";
    }
    const safeFacts = normalizeMemoryFacts(extractedFacts || createEmptyMemoryFacts());
    const recentUserIntents = items
      .filter((item) => item && item.role === "USER" && item.type === "TEXT")
      .map((item) => truncateText(item.text, 120))
      .filter(Boolean)
      .slice(-3);
    const proposalActions = items
      .filter((item) => item && (item.type === "PROPOSAL_CARD" || item.type === "PROPOSAL_REVIEW"))
      .map((item) => truncateText(item.text, 120))
      .filter(Boolean)
      .slice(-3);
    const segments = [];
    segments.push(`Turns compacted: ${items.length}`);
    if (recentUserIntents.length > 0) {
      segments.push(`Recent intents: ${recentUserIntents.join(" | ")}`);
    }
    if (proposalActions.length > 0) {
      segments.push(`Proposal actions: ${proposalActions.join(" | ")}`);
    }
    for (const key of MEMORY_FACT_KEYS) {
      if (safeFacts[key].length > 0) {
        segments.push(`${MEMORY_FACT_LABELS[key]}: ${safeFacts[key].join(" | ")}`);
      }
    }
    return `[${new Date().toISOString()}] ${segments.join("; ")}`;
  }

  function computeCompactionSplitIndex(messages) {
    const items = Array.isArray(messages) ? messages : [];
    let keepTokens = 0;
    let keepCount = 0;
    let keepStart = items.length;
    for (let idx = items.length - 1; idx >= 0; idx -= 1) {
      const tokenCost = Math.max(1, estimateMessageTokens(items[idx]));
      if (
        keepCount >= CHAT_COMPACTION_MIN_RECENT_MESSAGES &&
        keepTokens + tokenCost > CHAT_COMPACTION_KEEP_RECENT_TOKENS
      ) {
        break;
      }
      keepTokens += tokenCost;
      keepCount += 1;
      keepStart = idx;
    }
    return keepStart;
  }

  function compactSessionHistoryForModel(session) {
    if (!session || !Array.isArray(session.messages)) {
      return;
    }
    ensureSessionMemoryState(session);
    const totalTokens = estimateMessagesTokens(session.messages);
    if (
      totalTokens <= CHAT_COMPACTION_TRIGGER_TOKENS &&
      session.messages.length <= MAX_CHAT_MESSAGES
    ) {
      return;
    }
    const keepStart = computeCompactionSplitIndex(session.messages);
    if (keepStart <= 0) {
      return;
    }
    const archivedMessages = session.messages.slice(0, keepStart);
    if (archivedMessages.length === 0) {
      return;
    }
    const extractedFacts = extractMemoryFactsFromMessages(archivedMessages);
    mergeSessionMemoryFacts(session, extractedFacts);
    const archivedSummary = buildSessionCompactionSummary(archivedMessages, extractedFacts);
    if (archivedSummary) {
      const previousSummary = session.memorySummary;
      const mergedSummary = [previousSummary, archivedSummary].filter(Boolean).join("\n");
      session.memorySummary = mergedSummary.slice(-MAX_MEMORY_SUMMARY_CHARS);
    }
    session.messages = session.messages.slice(keepStart);
  }

  function buildHistoryForModel(session) {
    ensureSessionMemoryState(session);
    const memoryPrefix = [];
    const memoryFactsText = buildMemoryFactsPrefix(session.memoryFacts);
    if (memoryFactsText) {
      memoryPrefix.push({
        role: "SYSTEM",
        type: "MEMORY_FACTS",
        text: memoryFactsText,
        proposalId: null,
        createdAt: session.updatedAt || new Date().toISOString()
      });
    }
    const condensedMemory = truncateText(session.memorySummary, MAX_MEMORY_PREFIX_CHARS);
    if (condensedMemory) {
      memoryPrefix.push({
        role: "SYSTEM",
        type: "MEMORY_SUMMARY",
        text: condensedMemory,
        proposalId: null,
        createdAt: session.updatedAt || new Date().toISOString()
      });
    }

    const prefixTokens = estimateMessagesTokens(memoryPrefix);
    const availableTokens = Math.max(600, MODEL_HISTORY_TOKEN_BUDGET - prefixTokens);
    const recentHistory = [];
    let recentTokens = 0;
    const source = Array.isArray(session.messages) ? session.messages : [];
    for (let idx = source.length - 1; idx >= 0; idx -= 1) {
      const item = source[idx];
      const tokenCost = Math.max(1, estimateMessageTokens(item));
      if (
        recentHistory.length > 0 &&
        (recentTokens + tokenCost > availableTokens ||
          recentHistory.length >= MODEL_HISTORY_MAX_MESSAGES)
      ) {
        break;
      }
      recentHistory.push({
        role: item.role,
        type: item.type,
        text: item.text,
        proposalId: item.proposalId || null,
        createdAt: item.createdAt
      });
      recentTokens += tokenCost;
    }
    recentHistory.reverse();
    return [...memoryPrefix, ...recentHistory];
  }

  function summarizeProposalForReview(proposal) {
    if (!proposal) {
      return null;
    }
    const meta = proposal.strategyMeta || {};
    const campaign = proposal.suggestedCampaign || {};
    return {
      proposalId: proposal.id,
      status: proposal.status,
      title: proposal.title,
      templateId: meta.templateId || null,
      branchId: meta.branchId || null,
      campaignId: campaign.id || null,
      campaignName: campaign.name || null,
      triggerEvent: campaign.trigger && campaign.trigger.event ? campaign.trigger.event : null,
      budget: campaign.budget || null,
      createdAt: proposal.createdAt || null
    };
  }

  function normalizePendingProposalIds(session) {
    if (!session) {
      return [];
    }
    const rawIds = Array.isArray(session.pendingProposalIds)
      ? session.pendingProposalIds
      : session.pendingProposalId
        ? [session.pendingProposalId]
        : [];
    const unique = new Set();
    for (const item of rawIds) {
      const normalized = String(item || "").trim();
      if (!normalized || unique.has(normalized)) {
        continue;
      }
      unique.add(normalized);
    }
    return Array.from(unique);
  }

  function resolvePendingProposals({ merchantId, session }) {
    const normalizedIds = normalizePendingProposalIds(session);
    const pending = normalizedIds
      .map(
        (proposalId) =>
          db.proposals.find(
            (item) =>
              item.merchantId === merchantId &&
              item.id === proposalId &&
              item.status === "PENDING"
          ) || null
      )
      .filter(Boolean);
    if (session) {
      session.pendingProposalIds = pending.map((item) => item.id);
      session.pendingProposalId = session.pendingProposalIds[0] || null;
    }
    return pending;
  }

  function buildReviewProgress(session) {
    if (!session) {
      return null;
    }
    const pendingCount = Array.isArray(session.pendingProposalIds)
      ? session.pendingProposalIds.length
      : session.pendingProposalId
        ? 1
        : 0;
    const reviewedRaw = Math.max(0, Math.floor(Number(session.reviewProcessedCandidates) || 0));
    const baselineTotal = Math.max(0, Math.floor(Number(session.reviewTotalCandidates) || 0));
    const computedTotal = Math.max(baselineTotal, reviewedRaw + pendingCount);
    if (computedTotal <= 0 || pendingCount <= 0) {
      session.reviewTotalCandidates = 0;
      session.reviewProcessedCandidates = 0;
      return null;
    }
    const reviewed = Math.min(computedTotal, reviewedRaw);
    session.reviewTotalCandidates = computedTotal;
    session.reviewProcessedCandidates = reviewed;
    return {
      totalCandidates: computedTotal,
      reviewedCandidates: reviewed,
      pendingCandidates: pendingCount
    };
  }

  function getMarketingExecutionContext(merchantId) {
    if (!Array.isArray(db.auditLogs)) {
      return [];
    }
    const allowedActions = new Set([
      "PROPOSAL_CONFIRM",
      "STRATEGY_CHAT_REVIEW",
      "STRATEGY_CHAT_MESSAGE",
      "CAMPAIGN_STATUS_SET",
      "FIRE_SALE_CREATE"
    ]);
    return db.auditLogs
      .filter(
        (item) =>
          item &&
          item.merchantId === merchantId &&
          allowedActions.has(String(item.action || "").toUpperCase())
      )
      .slice(-MAX_EXECUTION_HISTORY_CONTEXT)
      .map((item) => {
        const details = item && typeof item.details === "object" && item.details ? item.details : {};
        const compactDetails = {};
        for (const key of [
          "proposalId",
          "campaignId",
          "templateId",
          "branchId",
          "reviewStatus",
          "turnStatus",
          "sessionId",
          "targetSku",
          "status"
        ]) {
          const value = details[key];
          if (value === undefined || value === null) {
            continue;
          }
          if (typeof value === "number" || typeof value === "boolean") {
            compactDetails[key] = value;
            continue;
          }
          compactDetails[key] = truncateText(value, MAX_EXECUTION_DETAIL_VALUE_LEN);
        }
        return {
          timestamp: item.timestamp || null,
          action: item.action || null,
          status: item.status || null,
          details: compactDetails
        };
      });
  }

  function getApprovedStrategyContext(merchantId) {
    return db.proposals
      .filter((item) => item.merchantId === merchantId && item.status === "APPROVED")
      .slice(-MAX_APPROVED_STRATEGY_CONTEXT)
      .map((item) => ({
        proposalId: item.id,
        campaignId: item.suggestedCampaign && item.suggestedCampaign.id,
        title: item.title,
        templateId: item.strategyMeta && item.strategyMeta.templateId,
        branchId: item.strategyMeta && item.strategyMeta.branchId,
        approvedAt: item.approvedAt || null
      }));
  }

  function getActiveCampaignContext(merchantId) {
    return db.campaigns
      .filter((item) => item.merchantId === merchantId && item.status === "ACTIVE")
      .slice(-MAX_ACTIVE_CAMPAIGN_CONTEXT)
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        trigger: item.trigger || null,
        priority: item.priority || 0
      }));
  }

  function resolveStrategyChatSession({ merchantId, sessionId, autoCreate = true, operatorId = "system" }) {
    const bucket = ensureStrategyChatBucket(merchantId);
    const targetSessionId = String(sessionId || bucket.activeSessionId || "").trim();
    if (targetSessionId && bucket.sessions[targetSessionId]) {
      bucket.activeSessionId = targetSessionId;
      const existing = bucket.sessions[targetSessionId];
      ensureSessionMemoryState(existing);
      return existing;
    }
    if (!autoCreate) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const nextSessionId = createSessionId();
    const session = {
      sessionId: nextSessionId,
      merchantId,
      status: "ACTIVE",
      messageSeq: 0,
      pendingProposalIds: [],
      reviewTotalCandidates: 0,
      reviewProcessedCandidates: 0,
      memorySummary: "",
      memoryFacts: createEmptyMemoryFacts(),
      createdBy: operatorId || "system",
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: []
    };
    bucket.sessions = {
      [nextSessionId]: session
    };
    bucket.activeSessionId = nextSessionId;
    appendChatMessage(session, {
      role: "SYSTEM",
      type: "TEXT",
      text: "New strategy session created. You can discuss goals and request a strategy proposal."
    });
    ensureSessionMemoryState(session);
    return session;
  }

  function buildStrategyChatSessionResponse({ merchantId, session }) {
    const sessionMessages = session && Array.isArray(session.messages) ? session.messages : [];
    const pendingProposals = resolvePendingProposals({ merchantId, session });
    const pendingReviews = pendingProposals.map((proposal) =>
      summarizeProposalForReview(proposal)
    ).filter(Boolean);
    const reviewProgress = buildReviewProgress(session);
    return {
      merchantId,
      sessionId: session ? session.sessionId : null,
      pendingReview: pendingReviews[0] || null,
      pendingReviews,
      reviewProgress,
      latestMessageId:
        sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1].messageId : null,
      messageCount: sessionMessages.length,
      activeCampaigns: getActiveCampaignContext(merchantId),
      approvedStrategies: getApprovedStrategyContext(merchantId)
    };
  }

  function buildStrategyChatDeltaResponse({ merchantId, session, deltaFrom = 0 }) {
    const allMessages =
      session && Array.isArray(session.messages) ? cloneJson(session.messages) : [];
    const safeDeltaFrom = Math.min(
      allMessages.length,
      Math.max(0, Math.floor(Number(deltaFrom) || 0))
    );
    const deltaMessages = allMessages.slice(safeDeltaFrom);
    return {
      ...buildStrategyChatSessionResponse({ merchantId, session }),
      deltaMessages,
      latestMessageId:
        allMessages.length > 0 ? allMessages[allMessages.length - 1].messageId : null
    };
  }

  function createProposalFromAiCandidate({
    merchantId,
    aiResult,
    operatorId,
    intent = "",
    source = "API",
    sourceSessionId = null
  }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const { campaign, template, branch, strategyMeta } = aiResult || {};
    if (!campaign || !template || !branch) {
      return {
        status: "BLOCKED",
        reasons: ["invalid candidate payload"],
        blocked: [{ title: "candidate", reasons: ["invalid candidate payload"] }]
      };
    }

    const risk = evaluateCampaignRisk({ campaign, merchant });
    if (risk.blocked) {
      return {
        status: "BLOCKED",
        reasons: risk.reasons,
        blocked: [{ title: aiResult.title || `${template.name} - ${branch.name}`, reasons: risk.reasons }]
      };
    }

    const proposalId = `proposal_${template.templateId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const proposal = {
      id: proposalId,
      merchantId,
      status: "PENDING",
      title: aiResult.title || `${template.name} - ${branch.name}`,
      createdAt: new Date().toISOString(),
      intent: String(intent || ""),
      strategyMeta: {
        templateId: template.templateId,
        templateName: template.name,
        category: template.category,
        phase: template.phase,
        branchId: branch.branchId,
        branchName: branch.name,
        operatorId: operatorId || "system",
        source: strategyMeta && strategyMeta.source ? strategyMeta.source : "AI_MODEL",
        provider: strategyMeta && strategyMeta.provider ? strategyMeta.provider : "OPENAI_COMPATIBLE",
        model: strategyMeta && strategyMeta.model ? strategyMeta.model : "unknown",
        rationale: strategyMeta && strategyMeta.rationale ? strategyMeta.rationale : "",
        confidence:
          strategyMeta && Number.isFinite(strategyMeta.confidence) ? strategyMeta.confidence : null,
        sourceChannel: source,
        sourceSessionId: sourceSessionId || null
      },
      suggestedCampaign: campaign
    };

    db.proposals.push(proposal);
    setStrategyConfig(merchantId, template.templateId, {
      branchId: branch.branchId,
      status: "PENDING_APPROVAL",
      lastProposalId: proposal.id
    });

    return {
      status: "PENDING",
      proposal,
      created: {
        proposalId: proposal.id,
        title: proposal.title,
        templateId: template.templateId,
        branchId: branch.branchId,
        campaignId: campaign.id
      }
    };
  }

  function getDashboard({ merchantId }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const pendingProposals = db.proposals.filter(
      (proposal) => proposal.merchantId === merchantId && proposal.status === "PENDING"
    );

    return {
      merchantId,
      merchantName: merchant.name,
      killSwitchEnabled: merchant.killSwitchEnabled,
      budgetCap: merchant.budgetCap,
      budgetUsed: merchant.budgetUsed,
      pendingProposals: pendingProposals.map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt
      })),
      activeCampaignCount: db.campaigns.filter(
        (campaign) => campaign.merchantId === merchantId && campaign.status === "ACTIVE"
      ).length
    };
  }

  function confirmProposal({ merchantId, proposalId, operatorId }) {
    const proposal = db.proposals.find(
      (item) => item.id === proposalId && item.merchantId === merchantId
    );

    if (!proposal) {
      throw new Error("proposal not found");
    }
    if (proposal.status !== "PENDING") {
      throw new Error("proposal already handled");
    }

    proposal.status = "APPROVED";
    proposal.approvedBy = operatorId;
    proposal.approvedAt = new Date().toISOString();
    db.campaigns.push({
      ...proposal.suggestedCampaign,
      status: proposal.suggestedCampaign.status || "ACTIVE"
    });

    if (proposal.strategyMeta && proposal.strategyMeta.templateId) {
      setStrategyConfig(merchantId, proposal.strategyMeta.templateId, {
        branchId: proposal.strategyMeta.branchId,
        status: "ACTIVE",
        lastProposalId: proposal.id,
        lastCampaignId: proposal.suggestedCampaign.id
      });
    }
    db.save();

    return {
      proposalId: proposal.id,
      status: proposal.status,
      campaignId: proposal.suggestedCampaign.id
    };
  }

  function setKillSwitch({ merchantId, enabled }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    merchant.killSwitchEnabled = Boolean(enabled);
    db.save();
    return {
      merchantId,
      killSwitchEnabled: merchant.killSwitchEnabled
    };
  }

  function evaluateCampaignRisk({ campaign, merchant }) {
    const reasons = [];
    const budget = (campaign && campaign.budget) || {};
    const action = (campaign && campaign.action) || {};
    const cap = Number(budget.cap) || 0;
    const costPerHit = Number(budget.costPerHit) || 0;
    const priority = Number(campaign && campaign.priority);
    const maxCap = Math.max((Number(merchant.budgetCap) || 0) * 1.5, 300);

    if (!campaign || !campaign.trigger || !campaign.trigger.event) {
      reasons.push("missing trigger event");
    }
    if (!Number.isFinite(cap) || cap <= 0) {
      reasons.push("invalid budget cap");
    } else if (cap > maxCap) {
      reasons.push(`budget cap exceeds guardrail (${cap} > ${Math.round(maxCap)})`);
    }
    if (!Number.isFinite(costPerHit) || costPerHit <= 0) {
      reasons.push("invalid cost per hit");
    } else if (costPerHit > Math.max(60, cap * 0.6)) {
      reasons.push("cost per hit exceeds guardrail");
    }
    if (!Number.isFinite(priority) || priority < 40 || priority > 999) {
      reasons.push("priority out of safe range");
    }
    if (campaign && campaign.ttlUntil) {
      const ttlTs = Date.parse(campaign.ttlUntil);
      const nowTs = Date.now();
      if (!Number.isFinite(ttlTs)) {
        reasons.push("invalid ttl");
      } else if (ttlTs > nowTs + 72 * 60 * 60 * 1000) {
        reasons.push("ttl exceeds 72h guardrail");
      }
    }
    if (
      action.type === "GRANT_VOUCHER" &&
      action.voucher &&
      Number.isFinite(Number(action.voucher.value)) &&
      Number(action.voucher.value) > 100
    ) {
      reasons.push("voucher value exceeds guardrail");
    }
    if (Array.isArray(campaign.conditions) && campaign.conditions.length > 10) {
      reasons.push("too many conditions");
    }

    return {
      blocked: reasons.length > 0,
      reasons
    };
  }

  function createStrategyChatSession({ merchantId, operatorId = "system" }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const bucket = ensureStrategyChatBucket(merchantId);
    const nowIso = new Date().toISOString();
    const session = {
      sessionId: createSessionId(),
      merchantId,
      status: "ACTIVE",
      messageSeq: 0,
      pendingProposalIds: [],
      reviewTotalCandidates: 0,
      reviewProcessedCandidates: 0,
      memorySummary: "",
      memoryFacts: createEmptyMemoryFacts(),
      createdBy: operatorId || "system",
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: []
    };
    bucket.sessions = {
      [session.sessionId]: session
    };
    bucket.activeSessionId = session.sessionId;
    appendChatMessage(session, {
      role: "SYSTEM",
      type: "TEXT",
      text: "New strategy session created. You can discuss goals and request a strategy proposal."
    });
    ensureSessionMemoryState(session);
    db.save();
    return buildStrategyChatSessionResponse({ merchantId, session });
  }

  function getStrategyChatSession({ merchantId }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const session = resolveStrategyChatSession({
      merchantId,
      autoCreate: true,
      operatorId: "system"
    });
    if (!session) {
      throw new Error("strategy chat session not found");
    }
    return buildStrategyChatSessionResponse({ merchantId, session });
  }

  function listStrategyChatMessages({ merchantId, cursor = "", limit = DEFAULT_CHAT_PAGE_LIMIT }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const session = resolveStrategyChatSession({
      merchantId,
      autoCreate: true,
      operatorId: "system"
    });
    if (!session) {
      throw new Error("strategy chat session not found");
    }

    const messages = Array.isArray(session.messages) ? session.messages : [];
    const safeLimit = Math.max(
      1,
      Math.min(MAX_CHAT_PAGE_LIMIT, Math.floor(Number(limit) || DEFAULT_CHAT_PAGE_LIMIT))
    );
    const normalizedCursor = String(cursor || "").trim();

    let endExclusive = messages.length;
    if (normalizedCursor) {
      const anchorIndex = messages.findIndex((item) => item.messageId === normalizedCursor);
      if (anchorIndex >= 0) {
        endExclusive = anchorIndex;
      }
    }

    const start = Math.max(0, endExclusive - safeLimit);
    const items = cloneJson(messages.slice(start, endExclusive));
    const hasMore = start > 0;

    return {
      merchantId,
      sessionId: session.sessionId,
      items,
      pageInfo: {
        limit: safeLimit,
        hasMore,
        nextCursor: hasMore && items.length > 0 ? items[0].messageId : null
      },
      latestMessageId:
        messages.length > 0 ? messages[messages.length - 1].messageId : null
    };
  }

  async function sendStrategyChatMessage({
    merchantId,
    operatorId = "system",
    content = ""
  }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const text = String(content || "").trim();
    if (!text) {
      throw new Error("content is required");
    }

    const session = resolveStrategyChatSession({
      merchantId,
      autoCreate: true,
      operatorId
    });
    const unresolved = resolvePendingProposals({ merchantId, session });
    if (unresolved.length > 0) {
      return {
        status: "REVIEW_REQUIRED",
        message: "Pending strategy proposals require review (approve/reject) before continuing.",
        ...buildStrategyChatDeltaResponse({
          merchantId,
          session,
          deltaFrom: Array.isArray(session.messages) ? session.messages.length : 0
        })
      };
    }

    compactSessionHistoryForModel(session);
    const baselineMessageCount = Array.isArray(session.messages) ? session.messages.length : 0;
    const buildChatResponse = () =>
      buildStrategyChatDeltaResponse({
        merchantId,
        session,
        deltaFrom: baselineMessageCount
      });

    appendChatMessage(session, {
      role: "USER",
      type: "TEXT",
      text
    });

    if (!aiStrategyService || typeof aiStrategyService.generateStrategyChatTurn !== "function") {
      throw new Error("ai strategy chat service is not configured");
    }

    const historyForModel = buildHistoryForModel(session);

    const aiTurn = await aiStrategyService.generateStrategyChatTurn({
      merchantId,
      sessionId: session.sessionId,
      userMessage: text,
      history: historyForModel,
      activeCampaigns: getActiveCampaignContext(merchantId),
      approvedStrategies: getApprovedStrategyContext(merchantId),
      executionHistory: getMarketingExecutionContext(merchantId),
      salesSnapshot: getSalesSnapshotContext(merchantId)
    });

    if (!aiTurn || aiTurn.status === "AI_UNAVAILABLE") {
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "TEXT",
        text: "AI is temporarily unavailable. Please retry in a moment."
      });
      db.save();
      return {
        status: "AI_UNAVAILABLE",
        reason: aiTurn && aiTurn.reason ? aiTurn.reason : "AI model unavailable",
        ...buildChatResponse()
      };
    }

    if (aiTurn.status === "CHAT_REPLY") {
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "TEXT",
        text: String(aiTurn.assistantMessage || "Please provide more details.")
      });
      db.save();
      return {
        status: "CHAT_REPLY",
        ...buildChatResponse()
      };
    }

    const proposalCandidates = Array.isArray(aiTurn && aiTurn.proposals)
      ? aiTurn.proposals
      : aiTurn && aiTurn.proposal
        ? [aiTurn.proposal]
        : [];
    if (aiTurn.status === "PROPOSAL_READY" && proposalCandidates.length > 0) {
      const pendingCreated = [];
      const blockedReasons = [];
      for (const candidate of proposalCandidates.slice(0, MAX_TOTAL_PROPOSAL_CANDIDATES)) {
        const createdProposal = createProposalFromAiCandidate({
          merchantId,
          aiResult: candidate,
          operatorId,
          intent: text,
          source: "CHAT_SESSION",
          sourceSessionId: session.sessionId
        });
        if (createdProposal.status === "PENDING") {
          pendingCreated.push(createdProposal);
        } else if (Array.isArray(createdProposal.reasons) && createdProposal.reasons.length > 0) {
          blockedReasons.push(...createdProposal.reasons);
        }
      }

      if (pendingCreated.length === 0) {
        const blockedReasonText = blockedReasons.join("; ");
        appendChatMessage(session, {
          role: "ASSISTANT",
          type: "TEXT",
          text: blockedReasonText
            ? `I drafted strategies but they are blocked by guardrails: ${blockedReasonText}`
            : "I drafted strategies but they are blocked by risk guardrails."
        });
        db.save();
        return {
          status: "BLOCKED",
          reasons: blockedReasons,
          ...buildChatResponse()
        };
      }

      session.pendingProposalIds = pendingCreated.map((item) => item.proposal.id);
      session.pendingProposalId = session.pendingProposalIds[0] || null;
      session.reviewTotalCandidates = pendingCreated.length;
      session.reviewProcessedCandidates = 0;

      const proposalSummaries = pendingCreated.map((item) =>
        summarizeProposalForReview(item.proposal)
      ).filter(Boolean);
      const defaultMessage =
        pendingCreated.length > 1
          ? `I drafted ${pendingCreated.length} strategy proposals. Please review each before continuing.`
          : "Strategy proposal drafted. Please review now.";
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "PROPOSAL_CARD",
        text: String(aiTurn.assistantMessage || defaultMessage),
        proposalId: session.pendingProposalId || null,
        metadata: {
          proposals: proposalSummaries
        }
      });
      db.save();
      return {
        status: "PENDING_REVIEW",
        reasons: blockedReasons.length > 0 ? blockedReasons : undefined,
        ...buildChatResponse()
      };
    }

    appendChatMessage(session, {
      role: "ASSISTANT",
      type: "TEXT",
      text: "I can continue helping with strategy details."
    });
    db.save();
    return {
      status: "CHAT_REPLY",
      ...buildChatResponse()
    };
  }

  function reviewStrategyChatProposal({
    merchantId,
    proposalId,
    decision,
    operatorId = "system"
  }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const normalizedDecision = String(decision || "").trim().toUpperCase();
    if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
      throw new Error("decision must be APPROVE or REJECT");
    }

    const session = resolveStrategyChatSession({
      merchantId,
      autoCreate: false,
      operatorId
    });
    if (!session) {
      throw new Error("strategy chat session not found");
    }

    const targetProposalId = String(proposalId || "").trim();
    if (!targetProposalId) {
      throw new Error("proposalId is required");
    }
    const pendingQueue = resolvePendingProposals({ merchantId, session });
    const pendingProposalIds = pendingQueue.map((item) => item.id);
    if (!pendingProposalIds.includes(targetProposalId)) {
      throw new Error("proposal is not pending in current strategy session");
    }

    const proposal = db.proposals.find(
      (item) => item.id === targetProposalId && item.merchantId === merchantId
    );
    if (!proposal) {
      throw new Error("proposal not found");
    }
    if (proposal.status !== "PENDING") {
      throw new Error("proposal already handled");
    }
    const baselineMessageCount = Array.isArray(session.messages) ? session.messages.length : 0;
    const buildReviewResponse = () =>
      buildStrategyChatDeltaResponse({
        merchantId,
        session,
        deltaFrom: baselineMessageCount
      });

    if (normalizedDecision === "APPROVE") {
      const confirm = confirmProposal({
        merchantId,
        proposalId: targetProposalId,
        operatorId
      });
      session.pendingProposalIds = pendingProposalIds.filter((id) => id !== targetProposalId);
      session.pendingProposalId = session.pendingProposalIds[0] || null;
      session.reviewProcessedCandidates = Math.max(
        0,
        Math.floor(Number(session.reviewProcessedCandidates) || 0) + 1
      );
      appendChatMessage(session, {
        role: "SYSTEM",
        type: "PROPOSAL_REVIEW",
        text: `Proposal approved and activated: ${proposal.title}`,
        proposalId: targetProposalId
      });
      db.save();
      return {
        status: "APPROVED",
        campaignId: confirm.campaignId,
        ...buildReviewResponse()
      };
    }

    proposal.status = "REJECTED";
    proposal.rejectedBy = operatorId;
    proposal.rejectedAt = new Date().toISOString();
    if (proposal.strategyMeta && proposal.strategyMeta.templateId) {
      setStrategyConfig(merchantId, proposal.strategyMeta.templateId, {
        branchId: proposal.strategyMeta.branchId,
        status: "REJECTED",
        lastProposalId: proposal.id
      });
    }
    session.pendingProposalIds = pendingProposalIds.filter((id) => id !== targetProposalId);
    session.pendingProposalId = session.pendingProposalIds[0] || null;
    session.reviewProcessedCandidates = Math.max(
      0,
      Math.floor(Number(session.reviewProcessedCandidates) || 0) + 1
    );
    appendChatMessage(session, {
      role: "SYSTEM",
      type: "PROPOSAL_REVIEW",
      text: `Proposal rejected: ${proposal.title}`,
      proposalId: targetProposalId
    });
    db.save();
    return {
      status: "REJECTED",
      ...buildReviewResponse()
    };
  }

  function setCampaignStatus({ merchantId, campaignId, status }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const normalizedStatus = String(status || "ACTIVE").trim().toUpperCase();
    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(normalizedStatus)) {
      throw new Error("unsupported campaign status");
    }

    const campaign = db.campaigns.find(
      (item) => item.merchantId === merchantId && item.id === campaignId
    );
    if (!campaign) {
      throw new Error("campaign not found");
    }
    campaign.status = normalizedStatus;
    campaign.updatedAt = new Date().toISOString();
    db.save();
    return {
      merchantId,
      campaignId: campaign.id,
      status: campaign.status
    };
  }

  function createFireSaleCampaign({
    merchantId,
    targetSku = "sku_hot_soup",
    ttlMinutes = 30,
    voucherValue = 15,
    maxQty = 30
  }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const durationMinutes = Math.max(5, Math.floor(Number(ttlMinutes) || 30));
    const safeVoucherValue = Math.max(1, Math.floor(Number(voucherValue) || 15));
    const safeMaxQty = Math.max(1, Math.floor(Number(maxQty) || 30));
    const now = new Date();
    const campaign = {
      id: `campaign_fire_sale_${Date.now()}`,
      merchantId,
      name: `targeted-fire-sale-${targetSku}`,
      status: "ACTIVE",
      priority: 999,
      trigger: { event: "INVENTORY_ALERT" },
      conditions: [
        { field: "targetSku", op: "eq", value: targetSku },
        { field: "inventoryBacklog", op: "gte", value: 1 }
      ],
      budget: {
        used: 0,
        cap: safeVoucherValue * safeMaxQty,
        costPerHit: safeVoucherValue
      },
      action: {
        type: "GRANT_VOUCHER",
        voucher: {
          id: `voucher_fire_sale_${Date.now()}`,
          type: "DISCOUNT_CARD",
          name: `${targetSku} fire-sale-voucher`,
          value: 0,
          discountRate: 0.5,
          minSpend: 0
        }
      },
      ttlUntil: new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString(),
      strategyMeta: {
        templateId: "manual_fire_sale",
        templateName: "targeted_fire_sale",
        branchId: "MANUAL",
        branchName: "manual_takeover",
        category: "REVENUE"
      }
    };
    db.campaigns.push(campaign);
    db.save();

    return {
      merchantId,
      campaignId: campaign.id,
      priority: campaign.priority,
      ttlUntil: campaign.ttlUntil
    };
  }

  return {
    getDashboard,
    confirmProposal,
    setKillSwitch,
    createStrategyChatSession,
    getStrategyChatSession,
    listStrategyChatMessages,
    sendStrategyChatMessage,
    reviewStrategyChatProposal,
    setCampaignStatus,
    createFireSaleCampaign,
    findTemplate
  };
}

module.exports = {
  createMerchantService
};
