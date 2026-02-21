const { runTcaEngine } = require("../core/tcaEngine");

function createCampaignService(db) {
  function applyAction(user, campaignId, action) {
    if (!action || !action.type) {
      return null;
    }

    if (action.type === "GRANT_SILVER") {
      const amount = Number(action.amount ?? 0);
      user.wallet.silver += amount;
      return { campaignId, silverGranted: amount };
    }

    if (action.type === "GRANT_BONUS") {
      const amount = Number(action.amount ?? 0);
      user.wallet.bonus += amount;
      return { campaignId, bonusGranted: amount };
    }

    if (action.type === "GRANT_PRINCIPAL") {
      const amount = Number(action.amount ?? 0);
      user.wallet.principal += amount;
      return { campaignId, principalGranted: amount };
    }

    if (action.type === "GRANT_FRAGMENT") {
      const fragmentType = String(action.fragmentType || "common");
      const amount = Number(action.amount ?? 0);
      if (!user.fragments || typeof user.fragments !== "object") {
        user.fragments = {};
      }
      user.fragments[fragmentType] = Number(user.fragments[fragmentType] || 0) + amount;
      return { campaignId, fragmentType, fragmentGranted: amount };
    }

    if (action.type === "GRANT_VOUCHER") {
      const voucher = {
        ...action.voucher,
        status: "ACTIVE"
      };
      if (!voucher.id) {
        voucher.id = `voucher_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      user.vouchers.push(voucher);
      return { campaignId, voucherGranted: voucher.id };
    }

    if (action.type === "COMPOSITE" && Array.isArray(action.actions)) {
      const compositeLogs = [];
      for (const nested of action.actions) {
        const log = applyAction(user, campaignId, nested);
        if (log) {
          compositeLogs.push(log);
        }
      }
      return compositeLogs.length > 0
        ? { campaignId, composite: compositeLogs }
        : null;
    }

    return null;
  }

  function triggerEvent({ merchantId, userId, event, context }) {
    const merchant = db.merchants[merchantId];
    const user = db.getMerchantUser(merchantId, userId);
    if (!merchant) {
      throw new Error("merchant not found");
    }
    if (!user) {
      throw new Error("user not found");
    }

    const campaigns = db.campaigns.filter((campaign) => campaign.merchantId === merchantId);
    const engineResult = runTcaEngine({
      campaigns,
      event,
      context: {
        ...context,
        tags: user.tags
      },
      killSwitchEnabled: merchant.killSwitchEnabled
    });

    const grantLogs = [];
    for (const campaignId of engineResult.executed) {
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) {
        continue;
      }
      const actionResult = applyAction(user, campaignId, campaign.action);
      if (actionResult) {
        grantLogs.push(actionResult);
      }
    }
    if (engineResult.executed.length > 0 || grantLogs.length > 0) {
      db.save();
    }

    return {
      ...engineResult,
      grants: grantLogs
    };
  }

  return {
    triggerEvent
  };
}

module.exports = {
  createCampaignService
};
