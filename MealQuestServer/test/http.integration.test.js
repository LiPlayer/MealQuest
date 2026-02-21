const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppServer } = require("../src/http/server");

async function postJson(baseUrl, path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    data: await res.json()
  };
}

test("http flow: quote -> verify -> refund -> confirm proposal -> trigger", async () => {
  const app = createAppServer();
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);

    const quote = await postJson(baseUrl, "/api/payment/quote", {
      merchantId: "m_demo",
      userId: "u_demo",
      orderAmount: 52
    });
    assert.equal(quote.status, 200);
    assert.ok(quote.data.selectedVoucher);

    const verify = await postJson(
      baseUrl,
      "/api/payment/verify",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        orderAmount: 52
      },
      { "Idempotency-Key": "pay_case_1" }
    );
    assert.equal(verify.status, 200);
    assert.ok(verify.data.paymentTxnId);

    const refund = await postJson(
      baseUrl,
      "/api/payment/refund",
      {
        merchantId: "m_demo",
        userId: "u_demo",
        paymentTxnId: verify.data.paymentTxnId,
        refundAmount: 20
      },
      { "Idempotency-Key": "refund_case_1" }
    );
    assert.equal(refund.status, 200);
    assert.ok(refund.data.clawback);

    const confirm = await postJson(baseUrl, "/api/merchant/proposals/proposal_rainy/confirm", {
      merchantId: "m_demo",
      operatorId: "staff_owner"
    });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.data.status, "APPROVED");

    const trigger = await postJson(baseUrl, "/api/tca/trigger", {
      merchantId: "m_demo",
      userId: "u_demo",
      event: "WEATHER_CHANGE",
      context: { weather: "RAIN" }
    });
    assert.equal(trigger.status, 200);
    assert.ok(trigger.data.executed.includes("campaign_rainy_hot_soup"));
  } finally {
    await app.stop();
  }
});
