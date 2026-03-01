const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createMerchantService } = require("../src/services/merchantService");

test("merchant strategy chat forwards payment-based sales snapshot", async () => {
  const db = createInMemoryDb();
  const now = Date.now();
  db.merchants.m_store_001 = {
    merchantId: "m_store_001",
    name: "Snapshot Test Merchant",
    killSwitchEnabled: false,
    budgetCap: 300,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" },
      { uid: "staff_clerk", role: "CLERK" },
    ],
  };
  db.merchantUsers.m_store_001 = {};
  db.paymentsByMerchant.m_store_001 = {};
  db.invoicesByMerchant.m_store_001 = {};
  db.strategyConfigs.m_store_001 = {};
  db.strategyChats.m_store_001 = {
    activeSessionId: null,
    sessions: {},
  };
  db.allianceConfigs.m_store_001 = {
    merchantId: "m_store_001",
    clusterId: "cluster_snapshot_test",
    stores: ["m_store_001"],
    walletShared: false,
    tierShared: false,
    updatedAt: new Date(now).toISOString(),
  };

  db.setPayment("m_store_001", "txn_recent_paid_wallet", {
    paymentTxnId: "txn_recent_paid_wallet",
    merchantId: "m_store_001",
    userId: "u_fixture_001",
    status: "PAID",
    orderAmount: 100,
    refundedAmount: 20,
    externalPayment: null,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });
  db.setPayment("m_store_001", "txn_old_paid_external", {
    paymentTxnId: "txn_old_paid_external",
    merchantId: "m_store_001",
    userId: "u_fixture_001",
    status: "PAID",
    orderAmount: 50,
    refundedAmount: 0,
    externalPayment: {
      provider: "MOCK_GATEWAY",
      paymentIntentId: "pi_test",
      payableAmount: 10,
      status: "CONFIRMED",
    },
    createdAt: new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString(),
  });
  db.setPayment("m_store_001", "txn_pending_external", {
    paymentTxnId: "txn_pending_external",
    merchantId: "m_store_001",
    userId: "u_fixture_001",
    status: "PENDING_EXTERNAL",
    orderAmount: 60,
    refundedAmount: 0,
    externalPayment: {
      provider: "MOCK_GATEWAY",
      paymentIntentId: "pi_pending",
      payableAmount: 60,
      status: "PENDING",
    },
    createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
  });

  let capturedInput = null;
  const merchantService = createMerchantService(db, {
    aiStrategyService: {
      async *streamStrategyChatTurn(input) {
        capturedInput = input;
        return {
          status: "CHAT_REPLY",
          assistantMessage: "ok",
        };
      },
    },
  });

  const turn = await merchantService.sendStrategyChatMessage({
    merchantId: "m_store_001",
    operatorId: "staff_owner",
    content: "Summarize sales and suggest next strategy.",
  });

  assert.equal(turn.status, "CHAT_REPLY");
  assert.ok(capturedInput && capturedInput.salesSnapshot);

  const snapshot = capturedInput.salesSnapshot;
  assert.equal(snapshot.totals.ordersPaidCount, 2);
  assert.equal(snapshot.totals.externalPaidCount, 1);
  assert.equal(snapshot.totals.walletOnlyPaidCount, 1);
  assert.equal(snapshot.totals.gmvPaid, 150);
  assert.equal(snapshot.totals.refundAmount, 20);
  assert.equal(snapshot.totals.netRevenue, 130);
  assert.equal(snapshot.totals.aov, 75);
  assert.equal(snapshot.totals.refundRate, 0.1333);

  const window7 = Array.isArray(snapshot.windows)
    ? snapshot.windows.find((item) => item.days === 7)
    : null;
  assert.ok(window7);
  assert.equal(window7.ordersPaidCount, 1);
  assert.equal(window7.gmvPaid, 100);
  assert.equal(window7.refundAmount, 20);

  assert.equal(snapshot.paymentStatusSummary.totalPayments, 3);
  assert.equal(snapshot.paymentStatusSummary.paidCount, 2);
  assert.equal(snapshot.paymentStatusSummary.pendingExternalCount, 1);
  assert.equal(snapshot.paymentStatusSummary.failedExternalCount, 0);
});
