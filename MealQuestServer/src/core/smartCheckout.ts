function sortByExpiryAndValue(vouchers) {
  return [...vouchers].sort((a, b) => {
    const aExpiry = new Date(a.expiresAt).getTime();
    const bExpiry = new Date(b.expiresAt).getTime();
    if (aExpiry !== bExpiry) {
      return aExpiry - bExpiry;
    }
    return b.value - a.value;
  });
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function buildCheckoutQuote({ orderAmount, wallet, vouchers, now = new Date() }) {
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
    throw new Error("orderAmount must be a positive number");
  }

  const normalizedWallet = {
    principal: Number(wallet?.principal ?? 0),
    bonus: Number(wallet?.bonus ?? 0),
    silver: Number(wallet?.silver ?? 0)
  };

  const activeVouchers = sortByExpiryAndValue(
    (vouchers ?? []).filter((voucher) => {
      const isActive = voucher.status === "ACTIVE";
      const notExpired = new Date(voucher.expiresAt).getTime() > now.getTime();
      const minSpend = Number(voucher.minSpend ?? 0);
      return isActive && notExpired && orderAmount >= minSpend;
    })
  );

  const selectedVoucher = activeVouchers[0] ?? null;
  const voucherDeduction = selectedVoucher
    ? Math.min(orderAmount, Number(selectedVoucher.value))
    : 0;

  let remain = roundMoney(orderAmount - voucherDeduction);
  const balanceDeduction = {
    bonusUsed: 0,
    principalUsed: 0
  };

  if (remain > 0) {
    balanceDeduction.bonusUsed = Math.min(remain, normalizedWallet.bonus);
    remain = roundMoney(remain - balanceDeduction.bonusUsed);
  }

  if (remain > 0) {
    balanceDeduction.principalUsed = Math.min(remain, normalizedWallet.principal);
    remain = roundMoney(remain - balanceDeduction.principalUsed);
  }

  const silverUsed = remain > 0 ? Math.min(remain, normalizedWallet.silver) : 0;
  remain = roundMoney(remain - silverUsed);

  return {
    orderAmount: roundMoney(orderAmount),
    selectedVoucher,
    deduction: {
      voucher: roundMoney(voucherDeduction),
      bonus: roundMoney(balanceDeduction.bonusUsed),
      principal: roundMoney(balanceDeduction.principalUsed),
      silver: roundMoney(silverUsed),
      external: roundMoney(Math.max(remain, 0))
    },
    payable: roundMoney(Math.max(remain, 0)),
    remainingWallet: {
      principal: roundMoney(normalizedWallet.principal - balanceDeduction.principalUsed),
      bonus: roundMoney(normalizedWallet.bonus - balanceDeduction.bonusUsed),
      silver: roundMoney(normalizedWallet.silver - silverUsed)
    }
  };
}

module.exports = {
  buildCheckoutQuote
};
