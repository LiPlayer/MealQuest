const { runTcaEngine } = require("../core/tcaEngine");

function createCampaignService(db) {
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
      if (!campaign || !campaign.action) {
        continue;
      }
      if (campaign.action.type === "GRANT_SILVER") {
        const amount = Number(campaign.action.amount ?? 0);
        user.wallet.silver += amount;
        grantLogs.push({ campaignId, silverGranted: amount });
      }
      if (campaign.action.type === "GRANT_VOUCHER") {
        const voucher = {
          ...campaign.action.voucher,
          status: "ACTIVE"
        };
        user.vouchers.push(voucher);
        grantLogs.push({ campaignId, voucherGranted: voucher.id });
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
