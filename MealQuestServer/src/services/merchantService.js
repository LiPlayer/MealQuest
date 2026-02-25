const {
  findTemplate,
  listStrategyTemplates
} = require("./strategyLibrary");

function createMerchantService(db, options = {}) {
  const aiStrategyService = options.aiStrategyService;
  const MAX_STRATEGY_CANDIDATES = 3;
  const MAX_CHAT_MESSAGES = 120;
  const MAX_CHAT_HISTORY_FOR_MODEL = 24;
  const MAX_APPROVED_STRATEGY_CONTEXT = 12;
  const MAX_ACTIVE_CAMPAIGN_CONTEXT = 12;

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
      return bucket.sessions[targetSessionId];
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
      pendingProposalId: null,
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
    return session;
  }

  function buildStrategyChatSessionResponse({ merchantId, session }) {
    const pendingProposal =
      session && session.pendingProposalId
        ? db.proposals.find(
            (item) =>
              item.merchantId === merchantId &&
              item.id === session.pendingProposalId &&
              item.status === "PENDING"
          ) || null
        : null;
    return {
      merchantId,
      sessionId: session ? session.sessionId : null,
      pendingReview: summarizeProposalForReview(pendingProposal),
      messages: session && Array.isArray(session.messages) ? cloneJson(session.messages) : [],
      activeCampaigns: getActiveCampaignContext(merchantId),
      approvedStrategies: getApprovedStrategyContext(merchantId)
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
        blocked: [{ title: aiResult.title || `${template.name} Â· ${branch.name}`, reasons: risk.reasons }]
      };
    }

    const proposalId = `proposal_${template.templateId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const proposal = {
      id: proposalId,
      merchantId,
      status: "PENDING",
      title: aiResult.title || `${template.name} Â· ${branch.name}`,
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

  function listStrategyLibrary({ merchantId }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const configs = ensureStrategyBucket(merchantId);
    return {
      merchantId,
      aiRuntime:
        aiStrategyService && typeof aiStrategyService.getRuntimeInfo === "function"
          ? aiStrategyService.getRuntimeInfo()
          : null,
      templates: listStrategyTemplates().map((template) => ({
        ...template,
        currentConfig: configs[template.templateId] || null
      }))
    };
  }

  function listStrategyConfigs({ merchantId }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const configs = ensureStrategyBucket(merchantId);
    return {
      merchantId,
      items: Object.values(configs)
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

  async function createStrategyProposal({
    merchantId,
    templateId,
    branchId,
    operatorId,
    intent = "",
    overrides = {}
  }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    if (
      !aiStrategyService ||
      (typeof aiStrategyService.generateStrategyPlan !== "function" &&
        typeof aiStrategyService.generateStrategyProposal !== "function")
    ) {
      throw new Error("ai strategy service is not configured");
    }

    const plan =
      typeof aiStrategyService.generateStrategyPlan === "function"
        ? await aiStrategyService.generateStrategyPlan({
            merchantId,
            templateId,
            branchId,
            intent,
            overrides
          })
        : {
            status: "PROPOSALS",
            proposals: [
              await aiStrategyService.generateStrategyProposal({
                merchantId,
                templateId,
                branchId,
                intent,
                overrides
              })
            ]
          };

    if (plan && plan.status === "NEED_CLARIFICATION") {
      return {
        status: "NEED_CLARIFICATION",
        questions: Array.isArray(plan.questions) ? plan.questions : [],
        missingSlots: Array.isArray(plan.missingSlots) ? plan.missingSlots : [],
        rationale: plan.rationale || "",
        confidence: Number.isFinite(Number(plan.confidence)) ? Number(plan.confidence) : null
      };
    }
    if (plan && plan.status === "AI_UNAVAILABLE") {
      return {
        status: "AI_UNAVAILABLE",
        reason: plan.reason || "AI model unavailable"
      };
    }

    const candidates = Array.isArray(plan && plan.proposals) ? plan.proposals : [];
    if (candidates.length === 0) {
      throw new Error("strategy planner did not return candidates");
    }

    const created = [];
    const blocked = [];

    for (let index = 0; index < Math.min(candidates.length, MAX_STRATEGY_CANDIDATES); index += 1) {
      const aiResult = candidates[index];
      const createdProposal = createProposalFromAiCandidate({
        merchantId,
        aiResult,
        operatorId,
        intent,
        source: "API"
      });
      if (createdProposal.status !== "PENDING") {
        blocked.push(...(createdProposal.blocked || []));
        continue;
      }
      created.push(createdProposal.created);
    }
if (created.length === 0) {
      return {
        status: "BLOCKED",
        reasons: blocked.flatMap((item) => item.reasons || []),
        blocked
      };
    }

    db.save();
    const primary = created[0];
    return {
      proposalId: primary.proposalId,
      status: "PENDING",
      title: primary.title,
      templateId: primary.templateId,
      branchId: primary.branchId,
      campaignId: primary.campaignId,
      created,
      blocked
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
      pendingProposalId: null,
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
    db.save();
    return buildStrategyChatSessionResponse({ merchantId, session });
  }

  function getStrategyChatSession({ merchantId, sessionId = "" }) {
    const merchant = db.merchants[merchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }
    const session = resolveStrategyChatSession({
      merchantId,
      sessionId,
      autoCreate: true,
      operatorId: "system"
    });
    if (!session) {
      throw new Error("strategy chat session not found");
    }
    return buildStrategyChatSessionResponse({ merchantId, session });
  }

  async function sendStrategyChatMessage({
    merchantId,
    sessionId = "",
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
      sessionId,
      autoCreate: true,
      operatorId
    });

    if (session.pendingProposalId) {
      const pendingProposal = db.proposals.find(
        (item) =>
          item.id === session.pendingProposalId &&
          item.merchantId === merchantId &&
          item.status === "PENDING"
      );
      if (pendingProposal) {
        return {
          status: "REVIEW_REQUIRED",
          message: "A pending proposal requires immediate review (approve/reject) before continuing.",
          ...buildStrategyChatSessionResponse({ merchantId, session })
        };
      }
      session.pendingProposalId = null;
    }

    appendChatMessage(session, {
      role: "USER",
      type: "TEXT",
      text
    });

    if (!aiStrategyService || typeof aiStrategyService.generateStrategyChatTurn !== "function") {
      throw new Error("ai strategy chat service is not configured");
    }

    const historyForModel = (session.messages || []).slice(-MAX_CHAT_HISTORY_FOR_MODEL).map((item) => ({
      role: item.role,
      type: item.type,
      text: item.text,
      proposalId: item.proposalId || null,
      createdAt: item.createdAt
    }));

    const aiTurn = await aiStrategyService.generateStrategyChatTurn({
      merchantId,
      sessionId: session.sessionId,
      userMessage: text,
      history: historyForModel,
      activeCampaigns: getActiveCampaignContext(merchantId),
      approvedStrategies: getApprovedStrategyContext(merchantId)
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
        ...buildStrategyChatSessionResponse({ merchantId, session })
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
        ...buildStrategyChatSessionResponse({ merchantId, session })
      };
    }

    if (aiTurn.status === "PROPOSAL_READY" && aiTurn.proposal) {
      const createdProposal = createProposalFromAiCandidate({
        merchantId,
        aiResult: aiTurn.proposal,
        operatorId,
        intent: text,
        source: "CHAT_SESSION",
        sourceSessionId: session.sessionId
      });

      if (createdProposal.status !== "PENDING") {
        const blockedReasons = (createdProposal.reasons || []).join("; ");
        appendChatMessage(session, {
          role: "ASSISTANT",
          type: "TEXT",
          text: blockedReasons
            ? `I drafted a strategy but it is blocked by guardrails: ${blockedReasons}`
            : "I drafted a strategy but it is blocked by risk guardrails."
        });
        db.save();
        return {
          status: "BLOCKED",
          reasons: createdProposal.reasons || [],
          ...buildStrategyChatSessionResponse({ merchantId, session })
        };
      }

      session.pendingProposalId = createdProposal.proposal.id;
      appendChatMessage(session, {
        role: "ASSISTANT",
        type: "PROPOSAL_CARD",
        text: String(aiTurn.assistantMessage || "Strategy proposal drafted. Please review now."),
        proposalId: createdProposal.proposal.id,
        metadata: summarizeProposalForReview(createdProposal.proposal)
      });
      db.save();
      return {
        status: "PENDING_REVIEW",
        ...buildStrategyChatSessionResponse({ merchantId, session })
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
      ...buildStrategyChatSessionResponse({ merchantId, session })
    };
  }

  function reviewStrategyChatProposal({
    merchantId,
    sessionId = "",
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
      sessionId,
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
    if (session.pendingProposalId && session.pendingProposalId !== targetProposalId) {
      throw new Error("proposal review mismatch with current pending proposal");
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

    if (normalizedDecision === "APPROVE") {
      const confirm = confirmProposal({
        merchantId,
        proposalId: targetProposalId,
        operatorId
      });
      session.pendingProposalId = null;
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
        ...buildStrategyChatSessionResponse({ merchantId, session })
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
    session.pendingProposalId = null;
    appendChatMessage(session, {
      role: "SYSTEM",
      type: "PROPOSAL_REVIEW",
      text: `Proposal rejected: ${proposal.title}`,
      proposalId: targetProposalId
    });
    db.save();
    return {
      status: "REJECTED",
      ...buildStrategyChatSessionResponse({ merchantId, session })
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
      name: `å®šå‘æ€¥å”®-${targetSku}`,
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
          name: `${targetSku} æ€¥å”®åˆ¸`,
          value: 0,
          discountRate: 0.5,
          minSpend: 0
        }
      },
      ttlUntil: new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString(),
      strategyMeta: {
        templateId: "manual_fire_sale",
        templateName: "å®šå‘æ€¥å”®",
        branchId: "MANUAL",
        branchName: "äººå·¥æŽ¥ç®¡",
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
    listStrategyLibrary,
    listStrategyConfigs,
    createStrategyProposal,
    createStrategyChatSession,
    getStrategyChatSession,
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
