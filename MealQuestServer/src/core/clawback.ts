function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function applyRefundClawback({ wallet, refundAmount, bonusConsumed }) {
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new Error("refundAmount must be a positive number");
  }

  const safeWallet = {
    principal: Number(wallet?.principal ?? 0),
    bonus: Number(wallet?.bonus ?? 0),
    silver: Number(wallet?.silver ?? 0)
  };

  const safeBonusConsumed = Math.max(0, Number(bonusConsumed ?? 0));
  const reclaimTarget = Math.min(refundAmount, safeBonusConsumed);
  const clawbackFromBonus = Math.min(safeWallet.bonus, reclaimTarget);
  const clawbackFromPrincipal = roundMoney(reclaimTarget - clawbackFromBonus);

  const nextWallet = {
    principal: roundMoney(safeWallet.principal + refundAmount - clawbackFromPrincipal),
    bonus: roundMoney(safeWallet.bonus - clawbackFromBonus),
    silver: safeWallet.silver
  };

  return {
    nextWallet,
    clawback: {
      reclaimTarget: roundMoney(reclaimTarget),
      fromBonus: roundMoney(clawbackFromBonus),
      fromPrincipal: clawbackFromPrincipal
    }
  };
}

module.exports = {
  applyRefundClawback
};
