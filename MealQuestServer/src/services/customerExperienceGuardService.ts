function toTimestampMs(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function toSafeWindowHours(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }
  return Math.min(Math.floor(parsed), 24 * 7);
}

function roundRate(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return 0;
  }
  return Math.round(safe * 10000) / 10000;
}

function clampScore(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(safe)));
}

function resolveLatestTimestamp(items = [], candidateKeys = []) {
  const rows = Array.isArray(items) ? items : [];
  const keys = Array.isArray(candidateKeys) ? candidateKeys : [];
  let latestMs = 0;
  for (const item of rows) {
    if (!item || typeof item !== "object") {
      continue;
    }
    for (const key of keys) {
      const ts = toTimestampMs(item[key]);
      if (ts > latestMs) {
        latestMs = ts;
      }
    }
  }
  return latestMs > 0 ? new Date(latestMs).toISOString() : null;
}

function scoreByStatus(status) {
  if (status === "HEALTHY") {
    return 95;
  }
  if (status === "WARNING") {
    return 65;
  }
  if (status === "RISK") {
    return 30;
  }
  return 0;
}

function summarizeEntrySessionPath({
  phoneBindings = {},
  cutoffMs,
}) {
  const rows = Object.values(phoneBindings || {}).filter((item) => item && typeof item === "object");
  const active24h = rows.filter((item) => toTimestampMs(item.lastLoginAt) >= cutoffMs).length;
  const newUsers24h = rows.filter((item) => toTimestampMs(item.linkedAt) >= cutoffMs).length;
  const totalUsers = rows.length;

  let status = "HEALTHY";
  const alerts = [];
  if (totalUsers === 0) {
    status = "NO_DATA";
    alerts.push("暂无顾客入店会话数据。");
  } else if (active24h === 0) {
    status = "WARNING";
    alerts.push("近 24 小时无顾客入店会话，请检查扫码入店链路。");
  }

  return {
    pathKey: "ENTRY_SESSION",
    title: "入店会话",
    status,
    score: scoreByStatus(status),
    metrics: {
      totalUsers,
      activeUsers24h: active24h,
      newUsers24h,
    },
    alerts,
  };
}

function summarizePaymentPath({ payments = [], cutoffMs }) {
  const rows = payments.filter((item) => toTimestampMs(item.createdAt) >= cutoffMs);
  const attempted = rows.length;
  const paid = rows.filter((item) => String(item.status || "").toUpperCase() === "PAID").length;
  const failed = rows.filter((item) => String(item.status || "").toUpperCase() === "EXTERNAL_FAILED").length;
  const pending = rows.filter((item) => String(item.status || "").toUpperCase() === "PENDING_EXTERNAL").length;
  const terminal = paid + failed;
  const successRate = terminal > 0 ? roundRate(paid / terminal) : 0;

  let status = "HEALTHY";
  const alerts = [];
  if (attempted === 0) {
    status = "NO_DATA";
    alerts.push("近 24 小时无支付尝试数据。");
  } else if ((terminal > 0 && successRate < 0.9) || failed >= 3) {
    status = "RISK";
    alerts.push("支付成功率偏低，需优先排查支付主链路。");
  } else if ((terminal > 0 && successRate < 0.97) || failed > 0 || pending >= Math.max(3, Math.ceil(attempted * 0.4))) {
    status = "WARNING";
    alerts.push("支付链路存在波动，建议检查外部回调与重试机制。");
  }

  const pendingRatio = attempted > 0 ? pending / attempted : 0;
  const scoreBase = 100 - (1 - successRate) * 70 - pendingRatio * 20;

  return {
    pathKey: "PAYMENT_SETTLEMENT",
    title: "支付结算",
    status,
    score: status === "NO_DATA" ? 0 : clampScore(scoreBase),
    metrics: {
      attempts24h: attempted,
      paid24h: paid,
      failed24h: failed,
      pending24h: pending,
      successRate24h: successRate,
    },
    alerts,
  };
}

function summarizeOrderTracePath({
  payments = [],
  invoices = [],
  ledgerRows = [],
  auditRows = [],
  cutoffMs,
}) {
  const paidRows = payments
    .filter((item) => toTimestampMs(item.createdAt) >= cutoffMs)
    .filter((item) => String(item.status || "").toUpperCase() === "PAID");
  const invoiceByPaymentTxnId = new Set(
    invoices
      .filter((item) => toTimestampMs(item.issuedAt) >= cutoffMs)
      .map((item) => String(item.paymentTxnId || ""))
      .filter(Boolean)
  );
  const scopedLedgerRows = ledgerRows.filter((item) => toTimestampMs(item.timestamp || item.createdAt) >= cutoffMs);
  const scopedAuditRows = auditRows.filter((item) => toTimestampMs(item.timestamp) >= cutoffMs);

  let chainCompleteCount = 0;
  for (const payment of paidRows) {
    const paymentTxnId = String(payment.paymentTxnId || "");
    if (!paymentTxnId) {
      continue;
    }
    const hasInvoice = invoiceByPaymentTxnId.has(paymentTxnId);
    const hasLedger = scopedLedgerRows.some((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }
      const details = row.details && typeof row.details === "object" ? row.details : {};
      return String(row.txnId || "") === paymentTxnId || String(details.paymentTxnId || "") === paymentTxnId;
    });
    const hasAudit = scopedAuditRows.some((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }
      const details = row.details && typeof row.details === "object" ? row.details : {};
      return String(details.paymentTxnId || "") === paymentTxnId;
    });
    if (hasInvoice && hasLedger && hasAudit) {
      chainCompleteCount += 1;
    }
  }

  const paidCount = paidRows.length;
  const missingCount = Math.max(0, paidCount - chainCompleteCount);
  const chainCompleteRate = paidCount > 0 ? roundRate(chainCompleteCount / paidCount) : 0;

  let status = "HEALTHY";
  const alerts = [];
  if (paidCount === 0) {
    status = "NO_DATA";
    alerts.push("近 24 小时无已支付订单，暂不评估账务链路完整性。");
  } else if ((chainCompleteRate < 0.8 && missingCount >= 2) || chainCompleteRate < 0.6) {
    status = "RISK";
    alerts.push("支付-账本-发票链路缺口较大，存在账务追溯风险。");
  } else if (chainCompleteRate < 0.95 || missingCount > 0) {
    status = "WARNING";
    alerts.push("账务链路存在未闭环订单，建议尽快补齐发票或审计记录。");
  }

  return {
    pathKey: "ORDER_TRACE",
    title: "账务链路",
    status,
    score: status === "NO_DATA" ? 0 : clampScore(chainCompleteRate * 100),
    metrics: {
      paidOrders24h: paidCount,
      chainComplete24h: chainCompleteCount,
      chainMissing24h: missingCount,
      chainCompleteRate24h: chainCompleteRate,
    },
    alerts,
  };
}

function summarizePrivacyPath({ auditRows = [], cutoffMs }) {
  const privacyActions = new Set(["PRIVACY_EXPORT", "PRIVACY_DELETE", "PRIVACY_CANCEL"]);
  const rows = auditRows
    .filter((item) => toTimestampMs(item.timestamp) >= cutoffMs)
    .filter((item) => privacyActions.has(String(item.action || "").toUpperCase()));
  const total = rows.length;
  const success = rows.filter((item) => String(item.status || "").toUpperCase() === "SUCCESS").length;
  const failed = total - success;
  const failRate = total > 0 ? roundRate(failed / total) : 0;

  let status = "HEALTHY";
  const alerts = [];
  if (total === 0) {
    status = "NO_DATA";
    alerts.push("近 24 小时无隐私流程请求。");
  } else if ((failed >= 2 && success === 0) || failRate >= 0.5) {
    status = "RISK";
    alerts.push("隐私流程失败率过高，可能影响注销与数据处理合规。");
  } else if (failed > 0) {
    status = "WARNING";
    alerts.push("隐私流程存在失败记录，请核查失败原因。");
  }

  return {
    pathKey: "PRIVACY_ACCOUNT",
    title: "隐私流程",
    status,
    score: status === "NO_DATA" ? 0 : clampScore((1 - failRate) * 100),
    metrics: {
      requests24h: total,
      success24h: success,
      failed24h: failed,
      failRate24h: failRate,
    },
    alerts,
  };
}

function summarizeOverall(paths = []) {
  const list = Array.isArray(paths) ? paths : [];
  let overallStatus = "HEALTHY";
  if (list.some((item) => item && item.status === "RISK")) {
    overallStatus = "RISK";
  } else if (list.some((item) => item && item.status === "WARNING")) {
    overallStatus = "WARNING";
  } else if (list.every((item) => item && item.status === "NO_DATA")) {
    overallStatus = "NO_DATA";
  }

  const scoredPaths = list.filter((item) => item && item.status !== "NO_DATA");
  const score =
    scoredPaths.length > 0
      ? clampScore(
          scoredPaths.reduce((sum, item) => sum + Number(item.score || 0), 0) / scoredPaths.length
        )
      : 0;

  const summary = {
    pathCount: list.length,
    healthyCount: list.filter((item) => item && item.status === "HEALTHY").length,
    warningCount: list.filter((item) => item && item.status === "WARNING").length,
    riskCount: list.filter((item) => item && item.status === "RISK").length,
    noDataCount: list.filter((item) => item && item.status === "NO_DATA").length,
  };

  const alerts = [];
  for (const item of list) {
    const rowAlerts = Array.isArray(item && item.alerts) ? item.alerts : [];
    for (const message of rowAlerts) {
      alerts.push({
        pathKey: item.pathKey,
        status: item.status,
        message: String(message || ""),
      });
    }
  }

  return {
    status: overallStatus,
    score,
    summary,
    alerts,
  };
}

function createCustomerExperienceGuardService(db, { now = () => Date.now() } = {}) {
  function getGuardSnapshot({ merchantId, windowHours = 24 }) {
    const safeMerchantId = String(merchantId || "").trim();
    if (!safeMerchantId) {
      throw new Error("merchantId is required");
    }
    const merchant = db.merchants && db.merchants[safeMerchantId];
    if (!merchant) {
      throw new Error("merchant not found");
    }

    const safeWindowHours = toSafeWindowHours(windowHours);
    const nowMs = now();
    const cutoffMs = nowMs - safeWindowHours * 60 * 60 * 1000;
    const payments = Object.values((db.paymentsByMerchant && db.paymentsByMerchant[safeMerchantId]) || {});
    const invoices = Object.values((db.invoicesByMerchant && db.invoicesByMerchant[safeMerchantId]) || {});
    const ledgerRows = (Array.isArray(db.ledger) ? db.ledger : []).filter(
      (item) => item && item.merchantId === safeMerchantId
    );
    const auditRows = (Array.isArray(db.auditLogs) ? db.auditLogs : []).filter(
      (item) => item && item.merchantId === safeMerchantId
    );
    const phoneBindings =
      db &&
      db.socialAuth &&
      db.socialAuth.customerPhoneBindingsByMerchant &&
      db.socialAuth.customerPhoneBindingsByMerchant[safeMerchantId] &&
      typeof db.socialAuth.customerPhoneBindingsByMerchant[safeMerchantId] === "object"
        ? db.socialAuth.customerPhoneBindingsByMerchant[safeMerchantId]
        : {};

    const paths = [
      summarizeEntrySessionPath({ phoneBindings, cutoffMs }),
      summarizePaymentPath({ payments, cutoffMs }),
      summarizeOrderTracePath({
        payments,
        invoices,
        ledgerRows,
        auditRows,
        cutoffMs,
      }),
      summarizePrivacyPath({ auditRows, cutoffMs }),
    ];
    const overall = summarizeOverall(paths);
    const latestDataTimestamp = resolveLatestTimestamp(
      [
        ...Object.values(phoneBindings || {}),
        ...payments,
        ...invoices,
        ...ledgerRows,
        ...auditRows,
        merchant,
      ],
      ["lastLoginAt", "linkedAt", "createdAt", "issuedAt", "timestamp", "updatedAt", "onboardedAt"]
    );

    return {
      version: "S080-SRV-01.v1",
      merchantId: safeMerchantId,
      evaluatedAt: latestDataTimestamp || "1970-01-01T00:00:00.000Z",
      windowHours: safeWindowHours,
      status: overall.status,
      score: overall.score,
      summary: overall.summary,
      paths,
      alerts: overall.alerts,
    };
  }

  return {
    getGuardSnapshot,
  };
}

module.exports = {
  createCustomerExperienceGuardService,
};
