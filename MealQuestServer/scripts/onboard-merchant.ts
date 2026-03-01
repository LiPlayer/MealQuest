const assert = require("node:assert/strict");

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.MQ_SERVER_BASE_URL || "http://127.0.0.1:3030",
    merchantId: "",
    name: "",
    budgetCap: "",
    onboardSecret: process.env.MQ_ONBOARD_SECRET || ""
  };

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
      continue;
    }
    if (current === "--merchant-id" && next) {
      args.merchantId = next;
      index += 1;
      continue;
    }
    if (current === "--name" && next) {
      args.name = next;
      index += 1;
      continue;
    }
    if (current === "--budget-cap" && next) {
      args.budgetCap = next;
      index += 1;
      continue;
    }
    if (current === "--onboard-secret" && next) {
      args.onboardSecret = next;
      index += 1;
      continue;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  assert.ok(args.merchantId, "missing --merchant-id");
  assert.ok(args.name, "missing --name");

  const body = {
    merchantId: args.merchantId,
    name: args.name
  };
  if (args.budgetCap !== "") {
    body.budgetCap = Number(args.budgetCap);
  }
  const headers = {
    "Content-Type": "application/json"
  };
  if (args.onboardSecret) {
    headers["x-onboard-secret"] = args.onboardSecret;
  }

  const response = await fetch(`${args.baseUrl}/api/merchant/onboard`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `onboard failed: status=${response.status} payload=${JSON.stringify(payload)}`
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        merchantId: payload.merchant.merchantId,
        merchantName: payload.merchant.name
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[onboard] ${error.message}`);
  process.exit(1);
});
