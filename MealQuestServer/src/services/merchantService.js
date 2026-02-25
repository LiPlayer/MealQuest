const {
  findTemplate,
  listStrategyTemplates
} = require("./strategyLibrary");

function createMerchantService(db, options = {}) {
  const aiStrategyService = options.aiStrategyService;

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
    if (!aiStrategyService || typeof aiStrategyService.generateStrategyProposal !== "function") {
      throw new Error("ai strategy service is not configured");
    }

    const aiResult = await aiStrategyService.generateStrategyProposal({
      merchantId,
      templateId,
      branchId,
      intent,
      overrides
    });
    const { campaign, template, branch, strategyMeta } = aiResult;
    const proposalId = `proposal_${template.templateId}_${Date.now()}`;
    const proposal = {
      id: proposalId,
      merchantId,
      status: "PENDING",
      title: aiResult.title || `${template.name} · ${branch.name}`,
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
        provider: strategyMeta && strategyMeta.provider ? strategyMeta.provider : "MOCK",
        model: strategyMeta && strategyMeta.model ? strategyMeta.model : "unknown",
        rationale: strategyMeta && strategyMeta.rationale ? strategyMeta.rationale : "",
        confidence:
          strategyMeta && Number.isFinite(strategyMeta.confidence)
            ? strategyMeta.confidence
            : null
      },
      suggestedCampaign: campaign
    };
    db.proposals.push(proposal);
    setStrategyConfig(merchantId, template.templateId, {
      branchId: branch.branchId,
      status: "PENDING_APPROVAL",
      lastProposalId: proposalId
    });
    db.save();

    return {
      proposalId: proposal.id,
      status: proposal.status,
      title: proposal.title,
      templateId: template.templateId,
      branchId: branch.branchId,
      campaignId: campaign.id
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
      name: `定向急售-${targetSku}`,
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
          name: `${targetSku} 急售券`,
          value: 0,
          discountRate: 0.5,
          minSpend: 0
        }
      },
      ttlUntil: new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString(),
      strategyMeta: {
        templateId: "manual_fire_sale",
        templateName: "定向急售",
        branchId: "MANUAL",
        branchName: "人工接管",
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
    setCampaignStatus,
    createFireSaleCampaign,
    findTemplate
  };
}

module.exports = {
  createMerchantService
};
