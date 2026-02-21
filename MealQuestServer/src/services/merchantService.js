function createMerchantService(db) {
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
      }))
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
    db.campaigns.push({ ...proposal.suggestedCampaign });

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
    return {
      merchantId,
      killSwitchEnabled: merchant.killSwitchEnabled
    };
  }

  return {
    getDashboard,
    confirmProposal,
    setKillSwitch
  };
}

module.exports = {
  createMerchantService
};
