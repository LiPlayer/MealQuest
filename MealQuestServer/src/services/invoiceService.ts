function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function buildInvoiceNo() {
  return `INV${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createInvoiceService(db, options = {}) {
  const fromFreshState = Boolean(options.__fromFreshState);

  async function issueInvoice({
    merchantId,
    paymentTxnId,
    title = "MealQuest Order",
    taxNo = "",
    email = ""
  }) {
    if (!fromFreshState && typeof db.runWithFreshState === "function") {
      return db.runWithFreshState(async (workingDb) => {
        const scopedService = createInvoiceService(workingDb, { __fromFreshState: true });
        return scopedService.issueInvoice({
          merchantId,
          paymentTxnId,
          title,
          taxNo,
          email,
        });
      });
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const payment = db.getPayment(merchantId, paymentTxnId);
    assertEntity(payment, "payment");
    if (payment.status !== "PAID") {
      throw new Error("payment is not settled");
    }

    const invoices = db.invoicesByMerchant[merchantId] || {};
    const existingInvoice = Object.values(invoices).find(
      (item) => item.paymentTxnId === paymentTxnId
    );
    if (existingInvoice) {
      return existingInvoice;
    }

    const invoice = {
      invoiceNo: buildInvoiceNo(),
      merchantId,
      userId: payment.userId,
      paymentTxnId,
      amount: roundMoney(payment.orderAmount),
      title: String(title || "MealQuest Order"),
      taxNo: String(taxNo || ""),
      email: String(email || ""),
      status: "ISSUED",
      issuedAt: new Date().toISOString()
    };
    db.setInvoice(merchantId, invoice.invoiceNo, invoice);
    db.save();
    return invoice;
  }

  async function listInvoices({ merchantId, userId = "", limit = 20 }) {
    if (!fromFreshState && typeof db.runWithFreshRead === "function") {
      return db.runWithFreshRead(async (workingDb) => {
        const scopedService = createInvoiceService(workingDb, { __fromFreshState: true });
        return scopedService.listInvoices({ merchantId, userId, limit });
      });
    }

    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");

    const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = Object.values(db.invoicesByMerchant[merchantId] || {})
      .filter((item) => (userId ? item.userId === userId : true))
      .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));

    return {
      merchantId,
      items: rows.slice(0, max)
    };
  }

  return {
    issueInvoice,
    listInvoices
  };
}

module.exports = {
  createInvoiceService
};
