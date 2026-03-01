function createMerchantService(db, options = {}) {
  const strategyAgentService = options.strategyAgentService;
  const policyOsService = options.policyOsService;
  const wsHub = options.wsHub;
  const fromFreshState = Boolean(options.__fromFreshState);
  const FRESH_NOT_USED = Symbol("FRESH_NOT_USED");
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
  const MAX_ACTIVE_POLICY_CONTEXT = 12;
  const MAX_EXECUTION_HISTORY_CONTEXT = 20;
  const MAX_EXECUTION_DETAIL_VALUE_LEN = 80;
  const MAX_TOTAL_PROPOSAL_CANDIDATES = 12;
  const SALES_WINDOWS_DAYS = [7, 30];
  const EVALUATION_CACHE_MAX_AGE_SEC = Math.max(
    30,
    Math.floor(Number(process.env.POLICY_EVALUATION_CACHE_MAX_AGE_SEC) || 900)
  );
  const EVALUATION_CACHE_MAX_AGE_MS = EVALUATION_CACHE_MAX_AGE_SEC * 1000;
  const STRATEGY_CHAT_PROTOCOL = {
    name: "MQ_STRATEGY_CHAT",
    version: "2.0",
    mode: "DUAL_CHANNEL_STRICT",
  };
  const MEMORY_FACT_KEYS = ["goals", "constraints", "audience", "timing", "decisions"];
  const MEMORY_FACT_LABELS = {
    goals: "Goals",
    constraints: "Constraints",
    audience: "Audience",
    timing: "Timing",
    decisions: "Decisions"
  };

  async function runWithFreshState(methodName, payload) {
    if (fromFreshState || typeof db.runWithFreshState !== "function") {
      return FRESH_NOT_USED;
    }
    return db.runWithFreshState(async (workingDb) => {
      const scopedService = createMerchantService(workingDb, {
        strategyAgentService,
        policyOsService,
        wsHub,
        __fromFreshState: true
      });
      return scopedService[methodName](payload);
    });
  }

  async function runWithFreshRead(methodName, payload) {
    if (fromFreshState || typeof db.runWithFreshRead !== "function") {
      return FRESH_NOT_USED;
    }
    return db.runWithFreshRead(async (workingDb) => {
      const scopedService = createMerchantService(workingDb, {
        strategyAgentService,
        policyOsService,
        wsHub,
        __fromFreshState: true
      });
      return scopedService[methodName](payload);
    });
  }

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function roundMoney(value) {
    return Math.round(toFiniteNumber(value) * 100) / 100;
  }

  function laneToPriority(lane) {
    const normalized = String(lane || "").trim().toUpperCase();
    if (normalized === "EMERGENCY") {
      return 100;
    }
    if (normalized === "GUARDED") {
      return 85;
    }
    if (normalized === "NORMAL") {
      return 60;
    }
    return 40;
  }

  function getPrimaryTriggerEvent(spec) {
    if (!spec || !Array.isArray(spec.triggers) || spec.triggers.length === 0) {
      return null;
    }
    const first = spec.triggers[0] || {};
    const event = String(first.event || (first.params && first.params.event) || "")
      .trim()
      .toUpperCase();
    return event || null;
  }

  function getBudgetConstraint(spec) {
    const constraints = Array.isArray(spec && spec.constraints) ? spec.constraints : [];
    return (
      constraints.find(
        (item) =>
          item &&
          item.plugin === "budget_guard_v1" &&
          item.params &&
          typeof item.params === "object"
      ) || null
    );
  }

  function summarizePolicyBudget(spec) {
    const budgetConstraint = getBudgetConstraint(spec);
    if (!budgetConstraint) {
      return null;
    }
    const params = budgetConstraint.params || {};
    return {
      cap: Number(params.cap) || 0,
      costPerHit: Number(params.cost_per_hit) || 0
    };
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
      lastPolicyId: null,
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

  function createSessionId(merchantId) {
    return `sc_${merchantId}`;
  }

  function createChatMessage(session, message) {
    const seq = Number(session.messageSeq || 0) + 1;
    session.messageSeq = seq;
    const messageId = message.messageId || `msg_${session.sessionId}_${seq}`;
    return {
      messageId,
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
    const policyWorkflow = proposal.policyWorkflow || {};
    const policySpec = proposal.suggestedPolicySpec || {};
    const budget = summarizePolicyBudget(policySpec);
    const triggerEvent = getPrimaryTriggerEvent(policySpec);
    const evaluation =
      policyWorkflow.autoEvaluation && typeof policyWorkflow.autoEvaluation === "object"
        ? policyWorkflow.autoEvaluation
        : null;
    return {
      proposalId: proposal.id,
      status: proposal.status,
      title: proposal.title,
      templateId: meta.templateId || null,
      branchId: meta.branchId || null,
      policyId: policyWorkflow.policyId || null,
      policyName: policySpec.name || proposal.title || null,
      triggerEvent,
      budget,
      policyDraftId: policyWorkflow.draftId || null,
      policyKey: policySpec.policy_key || null,
      createdAt: proposal.createdAt || null,
      evaluation
    };
  }

  function summarizeCandidateFromAiResult(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const spec = candidate.spec && typeof candidate.spec === "object" ? candidate.spec : {};
    const strategyMeta =
      candidate.strategyMeta && typeof candidate.strategyMeta === "object"
        ? candidate.strategyMeta
        : {};
    return {
      title: String(candidate.title || "").trim(),
      templateId: strategyMeta.templateId || null,
      branchId: strategyMeta.branchId || null,
      confidence:
        Number.isFinite(Number(strategyMeta.confidence))
          ? Number(strategyMeta.confidence)
          : null,
      policyName: String(spec.name || "").trim() || null,
      priority: laneToPriority(spec.lane),
      triggerEvent: getPrimaryTriggerEvent(spec),
    };
  }

  function resolveEvaluationUserId(merchantId, preferredUserId = "") {
    const normalizedPreferred = String(preferredUserId || "").trim();
    const userBucket =
      db.merchantUsers && typeof db.merchantUsers === "object" && db.merchantUsers[merchantId]
        ? db.merchantUsers[merchantId]
        : {};
    if (normalizedPreferred && userBucket[normalizedPreferred]) {
      return normalizedPreferred;
    }
    const firstUserId = Object.keys(userBucket).find((id) => String(id || "").trim());
    return firstUserId || "";
  }

  function midpoint(minValue, maxValue) {
    const min = Number(minValue);
    const max = Number(maxValue);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return 0;
    }
    return (min + max) / 2;
  }

  function buildAutoEvaluation({ proposal, evaluationResult, salesSnapshot }) {
    const safeEvaluation =
      evaluationResult && typeof evaluationResult === "object" ? evaluationResult : {};
    const projectedFirst =
      Array.isArray(safeEvaluation.projected) && safeEvaluation.projected[0]
        ? safeEvaluation.projected[0]
        : {};
    const explains = Array.isArray(safeEvaluation.explains) ? safeEvaluation.explains : [];
    const utilityMid = explains.reduce((sum, item) => {
      const expected = item && item.expected_range && typeof item.expected_range === "object"
        ? item.expected_range
        : null;
      if (!expected) {
        return sum;
      }
      return sum + midpoint(expected.min, expected.max);
    }, 0);
    const riskCount = explains.reduce((sum, item) => {
      const flags = Array.isArray(item && item.risk_flags) ? item.risk_flags : [];
      return sum + flags.length;
    }, 0);
    const rejectedCount = Array.isArray(safeEvaluation.rejected) ? safeEvaluation.rejected.length : 0;
    const selectedCount = Array.isArray(safeEvaluation.selected) ? safeEvaluation.selected.length : 0;
    const confidenceRaw = Number(
      proposal &&
      proposal.strategyMeta &&
      Number.isFinite(Number(proposal.strategyMeta.confidence))
        ? proposal.strategyMeta.confidence
        : 0.5
    );
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    const aov = Number(
      salesSnapshot &&
      salesSnapshot.totals &&
      Number.isFinite(Number(salesSnapshot.totals.aov))
        ? salesSnapshot.totals.aov
        : 20
    );
    const estimatedCost = Number(projectedFirst.estimated_cost) || 0;
    const expectedRevenue = roundMoney(Math.max(10, aov) * confidence);
    const score = roundMoney(
      utilityMid + expectedRevenue - estimatedCost - riskCount * 2 - rejectedCount + selectedCount
    );
    return {
      score,
      confidence,
      expectedRevenue,
      estimatedCost: roundMoney(estimatedCost),
      selectedCount,
      rejectedCount,
      riskCount,
      utilityMid: roundMoney(utilityMid),
      evaluatedAt: safeEvaluation.created_at || new Date().toISOString(),
      recommendable: selectedCount > 0 && rejectedCount === 0
    };
  }

  function buildAiCandidateEvaluationTool({
    merchantId,
    operatorId = "system",
    sessionId = "",
    userMessage = "",
    salesSnapshot = null
  }) {
    if (!policyOsService || typeof policyOsService.evaluateDecision !== "function") {
      return null;
    }
    const evaluationUserId = resolveEvaluationUserId(merchantId, "");
    if (!evaluationUserId) {
      return null;
    }

    return async function evaluatePolicyCandidates({ proposals = [] } = {}) {
      const safeProposals = Array.isArray(proposals) ? proposals : [];
      const results = [];
      for (let idx = 0; idx < safeProposals.length; idx += 1) {
        const proposal = safeProposals[idx];
        const spec = proposal && proposal.spec && typeof proposal.spec === "object" ? proposal.spec : null;
        if (!spec) {
          results.push({
            proposalIndex: idx,
            blocked: true,
            error: "missing policy spec",
            reason_codes: ["missing_policy_spec"],
            risk_flags: ["INVALID_SPEC"],
            expected_range: null,
            selected_count: 0,
            rejected_count: 1,
            estimated_cost: 0,
            score: -100
          });
          continue;
        }
        const event = getPrimaryTriggerEvent(spec) || "APP_OPEN";
        try {
          const evaluationDecision = await policyOsService.evaluateDecision({
            merchantId,
            userId: evaluationUserId,
            event,
            context: {
              source: "AI_CHAT_PRE_EVALUATION",
              operatorId,
              sessionId,
              userMessage: truncateText(userMessage, 160),
              salesSnapshot
            },
            policySpec: spec
          });
          const explain =
            Array.isArray(evaluationDecision && evaluationDecision.explains) && evaluationDecision.explains[0]
              ? evaluationDecision.explains[0]
              : {};
          const projected =
            Array.isArray(evaluationDecision && evaluationDecision.projected) && evaluationDecision.projected[0]
              ? evaluationDecision.projected[0]
              : {};
          const reasonCodes = Array.isArray(explain.reason_codes) ? explain.reason_codes : [];
          const riskFlags = Array.isArray(explain.risk_flags) ? explain.risk_flags : [];
          const expectedRange =
            explain && explain.expected_range && typeof explain.expected_range === "object"
              ? explain.expected_range
              : null;
          const utilityMid = expectedRange ? midpoint(expectedRange.min, expectedRange.max) : 0;
          const selectedCount = Array.isArray(evaluationDecision && evaluationDecision.selected)
            ? evaluationDecision.selected.length
            : 0;
          const rejectedCount = Array.isArray(evaluationDecision && evaluationDecision.rejected)
            ? evaluationDecision.rejected.length
            : 0;
          const estimatedCost = Number(projected.estimated_cost) || 0;
          const score = roundMoney(
            utilityMid - estimatedCost - riskFlags.length * 2 - rejectedCount + selectedCount
          );
          results.push({
            proposalIndex: idx,
            blocked: selectedCount === 0 || rejectedCount > 0,
            decision_id:
              evaluationDecision && evaluationDecision.decision_id
                ? evaluationDecision.decision_id
                : null,
            reason_codes: reasonCodes,
            risk_flags: riskFlags,
            expected_range: expectedRange,
            selected_count: selectedCount,
            rejected_count: rejectedCount,
            estimated_cost: roundMoney(estimatedCost),
            score
          });
        } catch (error) {
          results.push({
            proposalIndex: idx,
            blocked: true,
            error: error && error.message ? String(error.message) : "evaluate failed",
            reason_codes: ["evaluate_failed"],
            risk_flags: ["EVALUATION_ERROR"],
            expected_range: null,
            selected_count: 0,
            rejected_count: 1,
            estimated_cost: 0,
            score: -100
          });
        }
      }
      return {
        source: "POLICYOS_EVALUATE",
        userId: evaluationUserId,
        results
      };
    };
  }

  async function autoEvaluateProposalsForReview({
    merchantId,
    operatorId,
    pendingCreated
  }) {
    if (!Array.isArray(pendingCreated) || pendingCreated.length === 0) {
      return pendingCreated || [];
    }
    if (!policyOsService || typeof policyOsService.evaluateDecision !== "function") {
      return pendingCreated;
    }
    const salesSnapshot = getSalesSnapshotContext(merchantId);
    const evaluationUserId = resolveEvaluationUserId(merchantId);
    const evaluated = [];

    for (const item of pendingCreated) {
      const proposal = item && item.proposal ? item.proposal : null;
      if (!proposal) {
        continue;
      }
      const resolvedEvent =
        String(getPrimaryTriggerEvent(proposal.suggestedPolicySpec) || "APP_OPEN")
          .trim()
          .toUpperCase();
      let evaluationResult = null;
      let evaluation = null;
      let evaluateError = "";
      try {
        const evaluatedResult = await evaluateProposalPolicy({
          merchantId,
          proposalId: proposal.id,
          operatorId: operatorId || "system",
          userId: evaluationUserId,
          event: resolvedEvent,
          eventId: `evt_auto_eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          context: {
            source: "AUTO_RANK",
            proposalId: proposal.id
          }
        });
        evaluationResult =
          evaluatedResult && evaluatedResult.evaluation ? evaluatedResult.evaluation : null;
      } catch (error) {
        evaluateError = error && error.message ? String(error.message) : "evaluate failed";
      }
      evaluation = buildAutoEvaluation({
        proposal,
        evaluationResult: evaluationResult || {},
        salesSnapshot
      });
      if (evaluateError) {
        evaluation.score = -9999;
        evaluation.recommendable = false;
        evaluation.evaluateError = evaluateError;
      }
      proposal.policyWorkflow = {
        ...(proposal.policyWorkflow || {}),
        autoEvaluation: evaluation
      };
      evaluated.push({
        ...item,
        evaluationResult,
        evaluation
      });
    }

    const sorted = [...evaluated].sort((left, right) => {
      const leftScore = Number(left && left.evaluation ? left.evaluation.score : Number.NEGATIVE_INFINITY);
      const rightScore = Number(right && right.evaluation ? right.evaluation.score : Number.NEGATIVE_INFINITY);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      const leftConfidence = Number(
        left &&
        left.proposal &&
        left.proposal.strategyMeta &&
        Number(left.proposal.strategyMeta.confidence)
      ) || 0;
      const rightConfidence = Number(
        right &&
        right.proposal &&
        right.proposal.strategyMeta &&
        Number(right.proposal.strategyMeta.confidence)
      ) || 0;
      return rightConfidence - leftConfidence;
    });
    for (let idx = 0; idx < sorted.length; idx += 1) {
      const proposal = sorted[idx].proposal;
      proposal.policyWorkflow = {
        ...(proposal.policyWorkflow || {}),
        autoEvaluation: {
          ...(proposal.policyWorkflow && proposal.policyWorkflow.autoEvaluation
            ? proposal.policyWorkflow.autoEvaluation
            : {}),
          rank: idx + 1,
          recommended: idx === 0
        }
      };
    }
    db.save();
    return sorted;
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
      "STRATEGY_CHAT_REVIEW",
      "STRATEGY_CHAT_MESSAGE",
      "POLICY_DRAFT_CREATE",
      "POLICY_DRAFT_SUBMIT",
      "POLICY_DRAFT_APPROVE",
      "POLICY_PUBLISH",
      "POLICY_EVALUATE",
      "POLICY_EXECUTE"
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
          "policyId",
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
        policyId: (item.policyWorkflow && item.policyWorkflow.policyId) || null,
        title: item.title,
        templateId: item.strategyMeta && item.strategyMeta.templateId,
        branchId: item.strategyMeta && item.strategyMeta.branchId,
        approvedAt: item.approvedAt || null
      }));
  }

  function getActivePolicyContext(merchantId) {
    if (policyOsService && typeof policyOsService.listActivePolicies === "function") {
      const activePolicies = policyOsService.listActivePolicies({ merchantId });
      return (Array.isArray(activePolicies) ? activePolicies : [])
        .slice(-MAX_ACTIVE_POLICY_CONTEXT)
        .map((item) => ({
          id: item.policy_id,
          name: item.name,
          status: item.status,
          trigger:
            Array.isArray(item.triggers) && item.triggers[0] && item.triggers[0].event
              ? { event: item.triggers[0].event }
              : null,
          priority: laneToPriority(item.lane)
        }));
    }
    return [];
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
    const nextSessionId = createSessionId(merchantId);
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
      protocol: STRATEGY_CHAT_PROTOCOL,
      sessionId: session ? session.sessionId : null,
      pendingReview: pendingReviews[0] || null,
      pendingReviews,
      reviewProgress,
      latestMessageId:
        sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1].messageId : null,
      messageCount: sessionMessages.length,
      activePolicies: getActivePolicyContext(merchantId),
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
    if (!policyOsService || typeof policyOsService.createDraft !== "function") {
      return {
        status: "BLOCKED",
        reasons: ["policy os service is not configured"],
        blocked: [{ title: "candidate", reasons: ["policy os service is not configured"] }]
      };
    }

    const { spec, template, branch, strategyMeta } = aiResult || {};
    if (!spec || !template || !branch) {
      return {
        status: "BLOCKED",
        reasons: ["invalid candidate payload"],
        blocked: [{ title: "candidate", reasons: ["invalid candidate payload"] }]
      };
    }

    const risk = evaluatePolicySpecRisk({ spec, merchant });
    if (risk.blocked) {
      return {
        status: "BLOCKED",
        reasons: risk.reasons,
        blocked: [{ title: aiResult.title || `${template.name} - ${branch.name}`, reasons: risk.reasons }]
      };
    }
    const policySpec = JSON.parse(JSON.stringify(spec));

    const proposalId = `proposal_${template.templateId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    let draft = null;
    try {
      draft = policyOsService.createDraft({
        merchantId,
        operatorId: operatorId || "system",
        spec: policySpec,
        templateId: template.templateId
      });
    } catch (error) {
      return {
        status: "BLOCKED",
        reasons: [error && error.message ? error.message : "failed to create policy draft"],
        blocked: [
          {
            title: aiResult.title || `${template.name} - ${branch.name}`,
            reasons: [error && error.message ? error.message : "failed to create policy draft"]
          }
        ]
      };
    }
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
      suggestedPolicySpec: policySpec,
      policyWorkflow: {
        draftId: draft.draft_id,
        policyId: null,
        approvalId: null,
        status: "DRAFT",
        publishedAt: null
      }
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
        draftId: draft.draft_id,
        policyKey: policySpec.policy_key || null
      }
    };
  }

  async function getDashboard({ merchantId }) {
    const freshResult = await runWithFreshRead("getDashboard", { merchantId });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const pendingProposals = db.proposals.filter(
      (proposal) => proposal.merchantId === merchantId && proposal.status === "PENDING"
    );
    const approvedProposals = db.proposals.filter(
      (proposal) =>
        proposal.merchantId === merchantId &&
        proposal.status === "APPROVED" &&
        !(proposal.policyWorkflow && proposal.policyWorkflow.policyId)
    );
    const activeStrategyCount = getActivePolicyContext(merchantId).length;

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
      approvedPendingPublish: approvedProposals.map((item) => ({
        id: item.id,
        title: item.title,
        draftId:
          item.policyWorkflow && item.policyWorkflow.draftId
            ? item.policyWorkflow.draftId
            : null,
        approvalId:
          item.policyWorkflow && item.policyWorkflow.approvalId
            ? item.policyWorkflow.approvalId
            : null,
        approvedAt: item.approvedAt || null
      })),
      activePolicyCount: activeStrategyCount
    };
  }

  function getPolicyDraft({ merchantId, draftId }) {
    if (!policyOsService || !draftId) {
      return null;
    }
    if (typeof policyOsService.getDraft === "function") {
      return policyOsService.getDraft({ merchantId, draftId }) || null;
    }
    if (typeof policyOsService.listDrafts === "function") {
      const drafts = policyOsService.listDrafts({ merchantId });
      return drafts.find((item) => item && item.draft_id === draftId) || null;
    }
    return null;
  }

  function ensurePolicyDraftForProposal({ merchantId, proposal, operatorId }) {
    let draftId =
      proposal.policyWorkflow && proposal.policyWorkflow.draftId
        ? String(proposal.policyWorkflow.draftId)
        : "";
    if (!draftId && proposal.suggestedPolicySpec) {
      const templateId =
        proposal.strategyMeta && proposal.strategyMeta.templateId
          ? proposal.strategyMeta.templateId
          : "";
      const createdDraft = policyOsService.createDraft({
        merchantId,
        operatorId,
        spec: proposal.suggestedPolicySpec,
        templateId
      });
      proposal.policyWorkflow = {
        draftId: createdDraft.draft_id,
        policyId: null,
        approvalId: null,
        status: "DRAFT",
        publishedAt: null
      };
      draftId = createdDraft.draft_id;
    }
    if (!draftId) {
      throw new Error("policy draft is missing");
    }
    return draftId;
  }

  function buildEvaluationCacheKey({ draftId, event, userId }) {
    const safeDraftId = String(draftId || "").trim();
    const safeEvent = String(event || "").trim().toUpperCase();
    const safeUserId = String(userId || "").trim();
    return `${safeDraftId}|${safeEvent}|${safeUserId}`;
  }

  function applyEvaluationResultToProposal({
    proposal,
    draftId,
    event,
    userId,
    evaluationResult,
    source = "MERCHANT_PROPOSAL_EVALUATE"
  }) {
    proposal.policyWorkflow = {
      ...(proposal.policyWorkflow || {}),
      draftId,
      lastEvaluation: {
        decisionId: evaluationResult.decision_id,
        selected: Array.isArray(evaluationResult.selected) ? evaluationResult.selected.length : 0,
        rejected: Array.isArray(evaluationResult.rejected) ? evaluationResult.rejected.length : 0,
        evaluatedAt: evaluationResult.created_at,
        draftId,
        event,
        userId: String(userId || "").trim(),
        source: String(source || "MERCHANT_PROPOSAL_EVALUATE"),
        cacheKey: buildEvaluationCacheKey({
          draftId,
          event,
          userId
        })
      },
      lastEvaluationResult: cloneJson(evaluationResult)
    };
  }

  function readReusableEvaluationResult({
    proposal,
    draftId,
    event,
    userId
  }) {
    const workflow =
      proposal && proposal.policyWorkflow && typeof proposal.policyWorkflow === "object"
        ? proposal.policyWorkflow
        : {};
    const evaluationMeta =
      workflow.lastEvaluation && typeof workflow.lastEvaluation === "object"
        ? workflow.lastEvaluation
        : null;
    const evaluationResult =
      workflow.lastEvaluationResult && typeof workflow.lastEvaluationResult === "object"
        ? workflow.lastEvaluationResult
        : null;
    if (!evaluationMeta || !evaluationResult) {
      return null;
    }
    const expectedCacheKey = buildEvaluationCacheKey({
      draftId,
      event,
      userId
    });
    const cachedKey = String(evaluationMeta.cacheKey || "").trim();
    if (cachedKey && cachedKey !== expectedCacheKey) {
      return null;
    }
    if (!cachedKey && String(evaluationMeta.draftId || "").trim() !== String(draftId || "").trim()) {
      return null;
    }
    const decisionId = String(evaluationMeta.decisionId || "").trim();
    const evaluationDecisionId = String(evaluationResult.decision_id || "").trim();
    if (!decisionId || !evaluationDecisionId || decisionId !== evaluationDecisionId) {
      return null;
    }
    const evaluatedAtMs = Date.parse(
      String(evaluationMeta.evaluatedAt || evaluationResult.created_at || "")
    );
    if (!Number.isFinite(evaluatedAtMs)) {
      return null;
    }
    if (Date.now() - evaluatedAtMs > EVALUATION_CACHE_MAX_AGE_MS) {
      return null;
    }
    return cloneJson(evaluationResult);
  }

  async function evaluateProposalPolicy({
    merchantId,
    proposalId,
    operatorId,
    userId = "",
    event = "",
    eventId = "",
    context = {},
    forceRefresh = false
  }) {
    const freshResult = await runWithFreshState("evaluateProposalPolicy", {
      merchantId,
      proposalId,
      operatorId,
      userId,
      event,
      eventId,
      context,
      forceRefresh
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }
    const proposal = db.proposals.find(
      (item) => item.id === proposalId && item.merchantId === merchantId
    );
    if (!proposal) {
      throw new Error("proposal not found");
    }
    if (!["PENDING", "APPROVED"].includes(String(proposal.status || "").toUpperCase())) {
      throw new Error("proposal status does not allow evaluate");
    }
    if (!policyOsService || typeof policyOsService.evaluateDecision !== "function") {
      throw new Error("policy os service is not configured");
    }
    const draftId = ensurePolicyDraftForProposal({
      merchantId,
      proposal,
      operatorId
    });
    const resolvedEvent =
      String(event || "").trim().toUpperCase() ||
      String(getPrimaryTriggerEvent(proposal.suggestedPolicySpec) || "APP_OPEN")
        .trim()
        .toUpperCase();
    const resolvedUserId = String(userId || "").trim();
    if (!forceRefresh) {
      const cachedEvaluation = readReusableEvaluationResult({
        proposal,
        draftId,
        event: resolvedEvent,
        userId: resolvedUserId
      });
      if (cachedEvaluation) {
        return {
          proposalId: proposal.id,
          draftId,
          evaluation: cachedEvaluation,
          reused: true
        };
      }
    }
    const evaluationResult = await policyOsService.evaluateDecision({
      merchantId,
      userId: resolvedUserId,
      event: resolvedEvent,
      eventId: eventId || `evt_eval_${Date.now()}`,
      context: {
        ...(context || {}),
        source: "MERCHANT_PROPOSAL_EVALUATE",
        proposalId
      },
      draftId
    });
    applyEvaluationResultToProposal({
      proposal,
      draftId,
      event: resolvedEvent,
      userId: resolvedUserId,
      evaluationResult,
      source: context && context.source ? context.source : "MERCHANT_PROPOSAL_EVALUATE"
    });
    db.save();
    return {
      proposalId: proposal.id,
      draftId,
      evaluation: evaluationResult,
      reused: false
    };
  }

  function assertProposalEvaluatedForApprove(proposal) {
    const workflow =
      proposal && proposal.policyWorkflow && typeof proposal.policyWorkflow === "object"
        ? proposal.policyWorkflow
        : {};
    const evaluation =
      workflow && workflow.lastEvaluation && typeof workflow.lastEvaluation === "object"
        ? workflow.lastEvaluation
        : null;
    const evaluatedAt = evaluation ? Date.parse(String(evaluation.evaluatedAt || "")) : Number.NaN;
    if (!evaluation || !String(evaluation.decisionId || "").trim() || !Number.isFinite(evaluatedAt)) {
      const error = new Error("proposal must be evaluated before approve");
      error.statusCode = 400;
      throw error;
    }
  }

  async function approveProposalPolicy({ merchantId, proposalId, operatorId }) {
    const freshResult = await runWithFreshState("approveProposalPolicy", {
      merchantId,
      proposalId,
      operatorId
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }
    const proposal = db.proposals.find(
      (item) => item.id === proposalId && item.merchantId === merchantId
    );
    if (!proposal) {
      throw new Error("proposal not found");
    }
    if (proposal.status !== "PENDING") {
      throw new Error("proposal already handled");
    }
    assertProposalEvaluatedForApprove(proposal);
    if (!policyOsService) {
      throw new Error("policy os service is not configured");
    }
    const draftId = ensurePolicyDraftForProposal({
      merchantId,
      proposal,
      operatorId
    });
    let draft = getPolicyDraft({ merchantId, draftId });
    if (!draft) {
      throw new Error("policy draft not found");
    }
    if (draft.status === "DRAFT" || draft.status === "REJECTED") {
      draft = policyOsService.submitDraft({
        merchantId,
        draftId,
        operatorId
      });
    }
    let approvalId = "";
    if (draft.status === "SUBMITTED") {
      const approval = policyOsService.approveDraft({
        merchantId,
        draftId,
        operatorId,
        approvalLevel: "OWNER"
      });
      approvalId = approval.approvalId;
      draft = approval.draft;
    } else if (draft.status === "APPROVED") {
      approvalId = draft.approval_id || "";
    } else if (draft.status === "PUBLISHED") {
      throw new Error("policy already published");
    } else {
      throw new Error(`draft cannot be approved from status ${draft.status}`);
    }
    if (!approvalId) {
      throw new Error("approval id is missing");
    }

    proposal.status = "APPROVED";
    proposal.approvedBy = operatorId;
    proposal.approvedAt = new Date().toISOString();
    proposal.policyWorkflow = {
      ...(proposal.policyWorkflow || {}),
      draftId,
      policyId: null,
      approvalId,
      status: "APPROVED",
      publishedAt: null
    };
    if (proposal.strategyMeta && proposal.strategyMeta.templateId) {
      setStrategyConfig(merchantId, proposal.strategyMeta.templateId, {
        branchId: proposal.strategyMeta.branchId,
        status: "APPROVED",
        lastProposalId: proposal.id
      });
    }
    db.save();
    return {
      proposalId: proposal.id,
      status: proposal.status,
      draftId,
      approvalId
    };
  }

  async function publishApprovedProposalPolicy({ merchantId, proposalId, operatorId }) {
    const freshResult = await runWithFreshState("publishApprovedProposalPolicy", {
      merchantId,
      proposalId,
      operatorId
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }
    const proposal = db.proposals.find(
      (item) => item.id === proposalId && item.merchantId === merchantId
    );
    if (!proposal) {
      throw new Error("proposal not found");
    }
    if (proposal.status !== "APPROVED") {
      throw new Error("proposal is not approved");
    }
    if (!policyOsService || typeof policyOsService.publishDraft !== "function") {
      throw new Error("policy os service is not configured");
    }
    const draftId =
      proposal.policyWorkflow && proposal.policyWorkflow.draftId
        ? String(proposal.policyWorkflow.draftId)
        : "";
    const approvalId =
      proposal.policyWorkflow && proposal.policyWorkflow.approvalId
        ? String(proposal.policyWorkflow.approvalId)
        : "";
    if (!draftId) {
      throw new Error("policy draft is missing");
    }
    if (!approvalId) {
      throw new Error("approval id is missing");
    }
    const published = policyOsService.publishDraft({
      merchantId,
      draftId,
      operatorId,
      approvalId
    });
    proposal.policyWorkflow = {
      ...(proposal.policyWorkflow || {}),
      draftId,
      policyId: published.policy.policy_id,
      approvalId,
      status: "PUBLISHED",
      publishedAt: published.policy.published_at || new Date().toISOString()
    };

    if (proposal.strategyMeta && proposal.strategyMeta.templateId) {
      setStrategyConfig(merchantId, proposal.strategyMeta.templateId, {
        branchId: proposal.strategyMeta.branchId,
        status: "ACTIVE",
        lastProposalId: proposal.id,
        lastPolicyId: published.policy.policy_id
      });
    }
    db.save();
    return {
      proposalId: proposal.id,
      status: proposal.status,
      policyId: published.policy.policy_id,
      draftId,
      approvalId
    };
  }

  async function publishProposalPolicy(payload) {
    return publishApprovedProposalPolicy(payload);
  }

  async function setKillSwitch({ merchantId, enabled }) {
    const freshResult = await runWithFreshState("setKillSwitch", { merchantId, enabled });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

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

  function evaluatePolicySpecRisk({ spec, merchant }) {
    const reasons = [];
    const budget = summarizePolicyBudget(spec);
    const cap = Number(budget && budget.cap) || 0;
    const costPerHit = Number(budget && budget.costPerHit) || 0;
    const maxCap = Math.max((Number(merchant.budgetCap) || 0) * 1.5, 300);

    if (!spec || typeof spec !== "object") {
      reasons.push("invalid policy spec");
    }
    if (!getPrimaryTriggerEvent(spec)) {
      reasons.push("missing trigger event");
    }
    if (!Number.isFinite(cap) || cap <= 0) {
      reasons.push("invalid budget cap");
    } else if (cap > maxCap) {
      reasons.push(`budget cap exceeds guardrail (${cap} > ${Math.round(maxCap)})`);
    }
    if (!Number.isFinite(costPerHit) || costPerHit < 0) {
      reasons.push("invalid cost per hit");
    } else if (costPerHit > Math.max(60, cap * 0.6)) {
      reasons.push("cost per hit exceeds guardrail");
    }
    const ttlSec = Number(
      spec && spec.program && Number.isFinite(Number(spec.program.ttl_sec))
        ? spec.program.ttl_sec
        : 0
    );
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
      reasons.push("invalid ttl");
    } else if (ttlSec > 72 * 60 * 60) {
      reasons.push("ttl exceeds 72h guardrail");
    }
    const actions = Array.isArray(spec && spec.actions) ? spec.actions : [];
    for (const action of actions) {
      if (!action || action.plugin !== "voucher_grant_v1") {
        continue;
      }
      const voucherValue =
        action.params && action.params.voucher
          ? Number(action.params.voucher.value)
          : 0;
      if (Number.isFinite(voucherValue) && voucherValue > 100) {
        reasons.push("voucher value exceeds guardrail");
        break;
      }
    }
    if (
      spec &&
      spec.segment &&
      spec.segment.plugin === "condition_segment_v1" &&
      spec.segment.params &&
      Array.isArray(spec.segment.params.conditions) &&
      spec.segment.params.conditions.length > 10
    ) {
      reasons.push("too many conditions");
    }

    return {
      blocked: reasons.length > 0,
      reasons
    };
  }

  async function createStrategyChatSession({ merchantId, operatorId = "system" }) {
    const freshResult = await runWithFreshState("createStrategyChatSession", {
      merchantId,
      operatorId
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const bucket = ensureStrategyChatBucket(merchantId);
    const nowIso = new Date().toISOString();
    const session = {
      sessionId: createSessionId(merchantId),
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
    // db.save(); // Removed persistence
    return buildStrategyChatSessionResponse({ merchantId, session });
  }

  async function getStrategyChatSession({ merchantId }) {
    const freshResult = await runWithFreshState("getStrategyChatSession", { merchantId });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

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

  async function listStrategyChatMessages({
    merchantId,
    cursor = "",
    limit = DEFAULT_CHAT_PAGE_LIMIT
  }) {
    const freshResult = await runWithFreshState("listStrategyChatMessages", {
      merchantId,
      cursor,
      limit
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

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
    const freshResult = await runWithFreshState("sendStrategyChatMessage", {
      merchantId,
      operatorId,
      content
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

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
        assistantMessage:
          "Pending strategy proposals require review (approve/reject) before continuing.",
        ...buildStrategyChatDeltaResponse({
          merchantId,
          session,
          deltaFrom: Array.isArray(session.messages) ? session.messages.length : 0
        })
      };
    }

    const baselineMessageCount = Array.isArray(session.messages) ? session.messages.length : 0;
    const buildChatResponse = () =>
      buildStrategyChatDeltaResponse({
        merchantId,
        session,
        deltaFrom: baselineMessageCount
      });
    const buildBaseProtocolResponse = (extras = {}) => ({
      protocol: STRATEGY_CHAT_PROTOCOL,
      ...extras,
    });

    const userMessageWrapper = appendChatMessage(session, {
      role: "USER",
      type: "TEXT",
      text
    });

    if (!strategyAgentService || typeof strategyAgentService.streamStrategyChatTurn !== "function") {
      throw new Error("strategy agent service is not configured");
    }

    const aiInput = {
      merchantId,
      sessionId: session.sessionId,
      userMessage: text,
    };

    // Event streaming: broadcast START/CHUNK/END over WS, then publish final delta state.
    let aiTurn;
    const assistantMessageId = `msg_${Date.now()}_ai`;
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emitStreamEvent = (phase, extras = {}) => {
      if (!wsHub) {
        return;
      }
      wsHub.broadcast(merchantId, "STRATEGY_CHAT_STREAM_EVENT", {
        sessionId: session.sessionId,
        streamId,
        phase,
        userMessageId: userMessageWrapper.messageId,
        assistantMessageId,
        ...extras
      });
    };
    try {
      let fullText = "";
      let streamStarted = false;
      let streamEnded = false;
      const gen = strategyAgentService.streamStrategyChatTurn(aiInput);
      emitStreamEvent("START", {
        userText: userMessageWrapper.text,
        startedAt: new Date().toISOString()
      });
      streamStarted = true;
      // Drain generator: yield = stream event, done.value = parsed aiTurn
      let next = await gen.next();
      while (!next.done) {
        if (!next || !next.value || typeof next.value !== "object") {
          next = await gen.next();
          continue;
        }
        const event = next.value;
        const eventType = String(event.type || "")
          .trim()
          .toUpperCase();
        if (eventType === "START") {
          if (!streamStarted) {
            emitStreamEvent("START", {
              userText: userMessageWrapper.text,
              startedAt: new Date().toISOString()
            });
            streamStarted = true;
          }
        } else if (eventType === "END") {
          emitStreamEvent("END", {
            text: fullText,
            endedAt: new Date().toISOString()
          });
          streamEnded = true;
        } else if (eventType === "TOKEN") {
          const token = typeof event.text === "string" ? event.text : "";
          if (!token) {
            next = await gen.next();
            continue;
          }
          fullText += token;
          emitStreamEvent("CHUNK", {
            textDelta: token,
            text: fullText,
            seq: Number(event.seq) || undefined,
            at: new Date().toISOString()
          });
        }
        next = await gen.next();
      }
      if (!streamEnded) {
        emitStreamEvent("END", {
          text: fullText,
          endedAt: new Date().toISOString()
        });
      }
      aiTurn = next.value;
    } catch (err) {
      emitStreamEvent("ERROR", {
        reason: err && err.message ? String(err.message) : "stream_failed",
        failedAt: new Date().toISOString()
      });
      aiTurn = null;
    }

    if (!aiTurn || aiTurn.status === "AI_UNAVAILABLE") {
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "TEXT",
        text: "AI is temporarily unavailable. Please retry in a moment."
      });
      // db.save();
      return {
        status: "AI_UNAVAILABLE",
        reason: aiTurn && aiTurn.reason ? aiTurn.reason : "AI model unavailable",
        assistantMessage: "AI is temporarily unavailable. Please retry in a moment.",
        ...buildBaseProtocolResponse({
          aiProtocol: aiTurn && aiTurn.protocol ? aiTurn.protocol : null,
        }),
        ...buildChatResponse()
      };
    }

    if (aiTurn.status === "CHAT_REPLY") {
      const assistantMessage = String(
        aiTurn.assistantMessage || "Please provide more details."
      );
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "TEXT",
        text: assistantMessage,
        messageId: assistantMessageId
      });
      // db.save();
      return {
        status: "CHAT_REPLY",
        assistantMessage,
        ...buildBaseProtocolResponse({
          aiProtocol: aiTurn.protocol || null,
        }),
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
        const assistantMessage = blockedReasonText
          ? `I drafted strategies but they are blocked by guardrails: ${blockedReasonText}`
          : "I drafted strategies but they are blocked by risk guardrails.";
        appendChatMessage(session, {
          role: "ASSISTANT",
          type: "TEXT",
          text: assistantMessage
        });
        // db.save();
        return {
          status: "BLOCKED",
          reasons: blockedReasons,
          assistantMessage,
          proposalCandidates: proposalCandidates
            .map((candidate) => summarizeCandidateFromAiResult(candidate))
            .filter(Boolean),
          ...buildBaseProtocolResponse({
            aiProtocol: aiTurn.protocol || null,
          }),
          ...buildChatResponse()
        };
      }

      const rankedPendingCreated = await autoEvaluateProposalsForReview({
        merchantId,
        operatorId,
        pendingCreated
      });

      session.pendingProposalIds = rankedPendingCreated.map((item) => item.proposal.id);
      session.pendingProposalId = session.pendingProposalIds[0] || null;
      session.reviewTotalCandidates = rankedPendingCreated.length;
      session.reviewProcessedCandidates = 0;

      const proposalSummaries = rankedPendingCreated.map((item) =>
        summarizeProposalForReview(item.proposal)
      ).filter(Boolean);
      const defaultMessage =
        rankedPendingCreated.length > 1
          ? `I drafted ${rankedPendingCreated.length} strategy proposals. I have ranked them by expected impact and risk.`
          : "Strategy proposal drafted. Please review now.";
      const assistantMessage = String(aiTurn.assistantMessage || defaultMessage);
      const proposalCardMessageId = `msg_${Date.now()}_proposal_card`;
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "TEXT",
        text: assistantMessage,
        messageId: assistantMessageId
      });
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "PROPOSAL_CARD",
        text: "Strategy proposal card ready. Please review.",
        messageId: proposalCardMessageId,
        proposalId: session.pendingProposalId || null,
        metadata: {
          proposals: proposalSummaries
        }
      });
      // db.save();
      return {
        status: "PENDING_REVIEW",
        reasons: blockedReasons.length > 0 ? blockedReasons : undefined,
        assistantMessage,
        proposalCandidates: proposalSummaries,
        ...buildBaseProtocolResponse({
          aiProtocol: aiTurn.protocol || null,
        }),
        ...buildChatResponse()
      };
    }

    const fallbackAssistantMessage = "I can continue helping with strategy details.";
    appendChatMessage(session, {
      role: "ASSISTANT",
      type: "TEXT",
      text: fallbackAssistantMessage
    });
    // db.save();
    return {
      status: "CHAT_REPLY",
      assistantMessage: fallbackAssistantMessage,
      ...buildBaseProtocolResponse({
        aiProtocol: aiTurn.protocol || null,
      }),
      ...buildChatResponse()
    };
  }

  async function reviewStrategyChatProposal({
    merchantId,
    proposalId,
    decision,
    operatorId = "system"
  }) {
    const freshResult = await runWithFreshState("reviewStrategyChatProposal", {
      merchantId,
      proposalId,
      decision,
      operatorId
    });
    if (freshResult !== FRESH_NOT_USED) {
      return freshResult;
    }

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
      const confirm = await approveProposalPolicy({
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
        text: `Proposal approved. Ready for publish: ${proposal.title}`,
        proposalId: targetProposalId
      });
      db.save();
      return {
        status: "APPROVED",
        policyId: null,
        draftId: confirm.draftId,
        approvalId: confirm.approvalId,
        publishReady: true,
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
    proposal.policyWorkflow = {
      ...(proposal.policyWorkflow || {}),
      status: "REJECTED"
    };
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

  return {
    getDashboard,
    publishProposalPolicy,
    approveProposalPolicy,
    publishApprovedProposalPolicy,
    evaluateProposalPolicy,
    setKillSwitch,
    createStrategyChatSession,
    getStrategyChatSession,
    listStrategyChatMessages,
    sendStrategyChatMessage,
    reviewStrategyChatProposal
  };
}

module.exports = {
  createMerchantService
};
