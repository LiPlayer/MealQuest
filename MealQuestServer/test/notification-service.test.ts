const test = require("node:test");
const assert = require("node:assert/strict");

const { createInMemoryDb } = require("../src/store/inMemoryDb");
const { createNotificationService } = require("../src/services/notificationService");

function seedMerchant(db, merchantId = "m_store_001") {
  db.merchants[merchantId] = {
    merchantId,
    name: "Notify Service Merchant",
    killSwitchEnabled: false,
    budgetCap: 300,
    budgetUsed: 0,
    staff: [
      { uid: "staff_owner", role: "OWNER" },
      { uid: "staff_manager", role: "MANAGER" }
    ]
  };
}

test("notification service emits and marks read with recipient isolation", () => {
  const db = createInMemoryDb();
  seedMerchant(db);
  const wsEvents = [];
  const service = createNotificationService(db, {
    wsHub: {
      broadcastToRecipients: (merchantId, event, payload, recipients) => {
        wsEvents.push({ merchantId, event, payload, recipients });
      }
    }
  });

  const emitted = service.emitApprovalTodo({
    merchantId: "m_store_001",
    draftId: "draft_1",
    policyKey: "ACQ_NOTIFY",
    policyName: "Acq Notify",
    submittedBy: "staff_manager",
    submittedAt: new Date().toISOString()
  });
  assert.equal(emitted.createdCount, 1);
  assert.equal(wsEvents.length, 1);
  assert.equal(wsEvents[0].event, "NOTIFICATION_CREATED");

  const ownerInbox = service.listInbox({
    merchantId: "m_store_001",
    recipientType: "MERCHANT_STAFF",
    recipientId: "staff_owner",
    status: "UNREAD",
    category: "APPROVAL_TODO"
  });
  assert.equal(ownerInbox.items.length, 1);

  const managerInbox = service.listInbox({
    merchantId: "m_store_001",
    recipientType: "MERCHANT_STAFF",
    recipientId: "staff_manager",
    status: "UNREAD",
    category: "APPROVAL_TODO"
  });
  assert.equal(managerInbox.items.length, 0);

  const markReadByManager = service.markRead({
    merchantId: "m_store_001",
    recipientType: "MERCHANT_STAFF",
    recipientId: "staff_manager",
    notificationIds: ownerInbox.items.map((item) => item.notificationId),
    markAll: false
  });
  assert.equal(markReadByManager.updatedCount, 0);

  const markReadByOwner = service.markRead({
    merchantId: "m_store_001",
    recipientType: "MERCHANT_STAFF",
    recipientId: "staff_owner",
    markAll: true
  });
  assert.equal(markReadByOwner.updatedCount, 1);

  const ownerUnread = service.getUnreadSummary({
    merchantId: "m_store_001",
    recipientType: "MERCHANT_STAFF",
    recipientId: "staff_owner"
  });
  assert.equal(ownerUnread.totalUnread, 0);
});

test("notification service applies preference mute and frequency cap", () => {
  const db = createInMemoryDb();
  seedMerchant(db);
  const service = createNotificationService(db);

  const muted = service.setRecipientPreference({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    categories: {
      EXECUTION_RESULT: false
    },
    operatorId: "u_test_001"
  });
  assert.equal(muted.categories.EXECUTION_RESULT, false);

  const suppressed = service.createNotification({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    category: "EXECUTION_RESULT",
    title: "权益触达结果",
    body: "事件 USER_ENTER_SHOP 未命中策略"
  });
  assert.equal(suppressed.delivered, false);
  assert.equal(suppressed.reasonCode, "PREFERENCE_DISABLED");

  const reopened = service.setRecipientPreference({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    categories: {
      EXECUTION_RESULT: true
    },
    frequencyCaps: {
      EXECUTION_RESULT: {
        windowSec: 86400,
        maxDeliveries: 1
      }
    },
    operatorId: "u_test_001"
  });
  assert.equal(reopened.categories.EXECUTION_RESULT, true);
  assert.equal(reopened.frequencyCaps.EXECUTION_RESULT.maxDeliveries, 1);

  const first = service.createNotification({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    category: "EXECUTION_RESULT",
    title: "权益触达结果",
    body: "事件 USER_ENTER_SHOP 已命中策略"
  });
  assert.equal(first.delivered, true);

  const second = service.createNotification({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    category: "EXECUTION_RESULT",
    title: "权益触达结果",
    body: "事件 PAYMENT_VERIFY 未命中策略"
  });
  assert.equal(second.delivered, false);
  assert.equal(second.reasonCode, "FREQUENCY_CAP_REACHED");

  const inbox = service.listInbox({
    merchantId: "m_store_001",
    recipientType: "CUSTOMER_USER",
    recipientId: "u_test_001",
    status: "UNREAD",
    category: "EXECUTION_RESULT"
  });
  assert.equal(inbox.items.length, 1);
});
