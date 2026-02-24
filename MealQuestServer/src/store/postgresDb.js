const { Pool } = require("pg");
const { URL } = require("node:url");

const { createInMemoryDb } = require("./inMemoryDb");

const TABLES = {
  counters: "mq_state_counters",
  merchants: "mq_merchants",
  merchantUsers: "mq_merchant_users",
  payments: "mq_payments",
  invoices: "mq_invoices",
  partnerOrders: "mq_partner_orders",
  strategyConfigs: "mq_strategy_configs",
  allianceConfigs: "mq_alliance_configs",
  socialRedPackets: "mq_social_red_packets",
  groupTreatSessions: "mq_group_treat_sessions",
  merchantDailySubsidyUsage: "mq_merchant_daily_subsidy_usage",
  socialTransferLogs: "mq_social_transfer_logs",
  phoneLoginCodes: "mq_phone_login_codes",
  customerIdentityBindings: "mq_customer_identity_bindings",
  contractApplications: "mq_contract_applications",
  tenantPolicies: "mq_tenant_policies",
  tenantMigrations: "mq_tenant_migrations",
  tenantRouteFiles: "mq_tenant_route_files",
  ledgerEntries: "mq_ledger_entries",
  auditLogs: "mq_audit_logs",
  campaigns: "mq_campaigns",
  proposals: "mq_proposals",
};

const RELATIONAL_SCOPE_TABLES = Object.values(TABLES);

function normalizeIdentifier(raw, fallback) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return fallback;
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    return fallback;
  }
  return value;
}

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizePoolSize(raw, fallback = 5) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

function toJsonb(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function createPool(connectionString, maxPoolSize) {
  return new Pool({
    connectionString,
    max: normalizePoolSize(maxPoolSize, 5),
  });
}

function isMissingDatabaseError(error) {
  if (!error) {
    return false;
  }
  if (error.code === "3D000") {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return message.includes("database") && message.includes("does not exist");
}

function parseConnectionInfo(connectionString) {
  try {
    const parsed = new URL(String(connectionString || ""));
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return null;
    }
    const dbPath = String(parsed.pathname || "").replace(/^\/+/, "");
    const encodedDbName = dbPath.split("/")[0];
    const databaseName = encodedDbName ? decodeURIComponent(encodedDbName) : "";
    return {
      url: parsed,
      databaseName,
    };
  } catch {
    return null;
  }
}

function buildAdminConnectionString(connectionString) {
  const parsed = parseConnectionInfo(connectionString);
  if (!parsed) {
    return null;
  }
  const adminUrl = new URL(parsed.url.toString());
  adminUrl.pathname = "/postgres";
  return adminUrl.toString();
}

async function ensureDatabaseExists({
  connectionString,
  adminConnectionString,
}) {
  const target = parseConnectionInfo(connectionString);
  if (!target || !target.databaseName) {
    return false;
  }

  const adminConn =
    typeof adminConnectionString === "string" && adminConnectionString.trim()
      ? adminConnectionString.trim()
      : buildAdminConnectionString(connectionString);

  if (!adminConn) {
    return false;
  }

  const adminPool = createPool(adminConn, 1);
  try {
    await adminPool.query(`CREATE DATABASE ${qIdent(target.databaseName)}`);
    return true;
  } catch (error) {
    if (error && error.code === "42P04") {
      return false;
    }
    if (error && error.code === "42501") {
      const permissionError = new Error(
        `database "${target.databaseName}" does not exist and role has no CREATEDB privilege; create it manually or set MQ_DB_ADMIN_URL`,
      );
      permissionError.cause = error;
      throw permissionError;
    }
    throw error;
  } finally {
    await adminPool.end().catch(() => {});
  }
}

async function ensureRelationalTables(pool, schema) {
  const schemaSql = qIdent(schema);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.counters)} (
      scope_key TEXT PRIMARY KEY,
      ledger_counter BIGINT NOT NULL DEFAULT 0,
      audit_counter BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.merchants)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.merchantUsers)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.payments)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payment_txn_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, payment_txn_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.invoices)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      invoice_no TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, invoice_no)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.partnerOrders)} (
      scope_key TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, partner_id, order_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.strategyConfigs)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, template_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.allianceConfigs)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.socialRedPackets)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      packet_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, packet_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.groupTreatSessions)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, session_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.merchantDailySubsidyUsage)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.socialTransferLogs)} (
      scope_key TEXT NOT NULL,
      transfer_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, transfer_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.phoneLoginCodes)} (
      scope_key TEXT NOT NULL,
      phone TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, phone)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.customerIdentityBindings)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      binding_type TEXT NOT NULL,
      binding_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id, binding_type, binding_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.contractApplications)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantPolicies)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantMigrations)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantRouteFiles)} (
      scope_key TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.ledgerEntries)} (
      scope_key TEXT NOT NULL,
      txn_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, txn_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.auditLogs)} (
      scope_key TEXT NOT NULL,
      audit_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, audit_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.campaigns)} (
      scope_key TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, campaign_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.proposals)} (
      scope_key TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope_key, proposal_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.socialTransferLogs}_scope_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.socialTransferLogs)} (scope_key, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.ledgerEntries}_scope_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.ledgerEntries)} (scope_key, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.auditLogs}_scope_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.auditLogs)} (scope_key, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.campaigns}_scope_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.campaigns)} (scope_key, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.proposals}_scope_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.proposals)} (scope_key, seq_no)
  `);
}

async function ensureRelationalPool({
  connectionString,
  schema,
  maxPoolSize,
  autoCreateDatabase,
  adminConnectionString,
}) {
  let pool = createPool(connectionString, maxPoolSize);
  try {
    await ensureRelationalTables(pool, schema);
    return pool;
  } catch (error) {
    await pool.end().catch(() => {});
    if (!autoCreateDatabase || !isMissingDatabaseError(error)) {
      throw error;
    }

    await ensureDatabaseExists({
      connectionString,
      adminConnectionString,
    });

    pool = createPool(connectionString, maxPoolSize);
    try {
      await ensureRelationalTables(pool, schema);
      return pool;
    } catch (retryError) {
      await pool.end().catch(() => {});
      throw retryError;
    }
  }
}

function createEmptyState() {
  return {
    idCounters: {
      ledger: 0,
      audit: 0,
    },
    merchants: {},
    merchantUsers: {},
    paymentsByMerchant: {},
    invoicesByMerchant: {},
    partnerOrders: {},
    strategyConfigs: {},
    allianceConfigs: {},
    socialRedPacketsByMerchant: {},
    groupTreatSessionsByMerchant: {},
    merchantDailySubsidyUsage: {},
    socialTransferLogs: [],
    phoneLoginCodes: {},
    socialAuth: {
      customerBindingsByMerchant: {},
      customerPhoneBindingsByMerchant: {},
    },
    contractApplications: {},
    tenantPolicies: {},
    tenantMigrations: {},
    tenantRouteFiles: {},
    ledger: [],
    auditLogs: [],
    campaigns: [],
    proposals: [],
  };
}

function toNumberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

async function hasScopeData(pool, schema, scopeKey) {
  const schemaSql = qIdent(schema);
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM ${schemaSql}.${qIdent(TABLES.counters)}
      WHERE scope_key = $1
    ) AS has_data`,
    [scopeKey],
  );
  return Boolean(result.rows[0] && result.rows[0].has_data);
}
async function readRelationalState(pool, schema, scopeKey) {
  if (!(await hasScopeData(pool, schema, scopeKey))) {
    return null;
  }

  const schemaSql = qIdent(schema);
  const state = createEmptyState();

  const counters = await pool.query(
    `
      SELECT ledger_counter, audit_counter
      FROM ${schemaSql}.${qIdent(TABLES.counters)}
      WHERE scope_key = $1
      LIMIT 1
    `,
    [scopeKey],
  );
  if (counters.rows[0]) {
    state.idCounters.ledger = toNumberOrZero(counters.rows[0].ledger_counter);
    state.idCounters.audit = toNumberOrZero(counters.rows[0].audit_counter);
  }

  const merchants = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.merchants)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of merchants.rows) {
    state.merchants[row.merchant_id] = row.payload;
  }

  const users = await pool.query(
    `SELECT merchant_id, user_id, payload FROM ${schemaSql}.${qIdent(TABLES.merchantUsers)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of users.rows) {
    if (!state.merchantUsers[row.merchant_id]) {
      state.merchantUsers[row.merchant_id] = {};
    }
    state.merchantUsers[row.merchant_id][row.user_id] = row.payload;
  }

  const payments = await pool.query(
    `SELECT merchant_id, payment_txn_id, payload FROM ${schemaSql}.${qIdent(TABLES.payments)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of payments.rows) {
    if (!state.paymentsByMerchant[row.merchant_id]) {
      state.paymentsByMerchant[row.merchant_id] = {};
    }
    state.paymentsByMerchant[row.merchant_id][row.payment_txn_id] = row.payload;
  }

  const invoices = await pool.query(
    `SELECT merchant_id, invoice_no, payload FROM ${schemaSql}.${qIdent(TABLES.invoices)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of invoices.rows) {
    if (!state.invoicesByMerchant[row.merchant_id]) {
      state.invoicesByMerchant[row.merchant_id] = {};
    }
    state.invoicesByMerchant[row.merchant_id][row.invoice_no] = row.payload;
  }

  const partnerOrders = await pool.query(
    `SELECT partner_id, order_id, payload FROM ${schemaSql}.${qIdent(TABLES.partnerOrders)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of partnerOrders.rows) {
    if (!state.partnerOrders[row.partner_id]) {
      state.partnerOrders[row.partner_id] = {};
    }
    state.partnerOrders[row.partner_id][row.order_id] = row.payload;
  }

  const strategyConfigs = await pool.query(
    `SELECT merchant_id, template_id, payload FROM ${schemaSql}.${qIdent(TABLES.strategyConfigs)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of strategyConfigs.rows) {
    if (!state.strategyConfigs[row.merchant_id]) {
      state.strategyConfigs[row.merchant_id] = {};
    }
    state.strategyConfigs[row.merchant_id][row.template_id] = row.payload;
  }

  const allianceConfigs = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.allianceConfigs)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of allianceConfigs.rows) {
    state.allianceConfigs[row.merchant_id] = row.payload;
  }

  const packets = await pool.query(
    `SELECT merchant_id, packet_id, payload FROM ${schemaSql}.${qIdent(TABLES.socialRedPackets)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of packets.rows) {
    if (!state.socialRedPacketsByMerchant[row.merchant_id]) {
      state.socialRedPacketsByMerchant[row.merchant_id] = {};
    }
    state.socialRedPacketsByMerchant[row.merchant_id][row.packet_id] = row.payload;
  }

  const sessions = await pool.query(
    `SELECT merchant_id, session_id, payload FROM ${schemaSql}.${qIdent(TABLES.groupTreatSessions)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of sessions.rows) {
    if (!state.groupTreatSessionsByMerchant[row.merchant_id]) {
      state.groupTreatSessionsByMerchant[row.merchant_id] = {};
    }
    state.groupTreatSessionsByMerchant[row.merchant_id][row.session_id] = row.payload;
  }

  const subsidyUsage = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.merchantDailySubsidyUsage)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of subsidyUsage.rows) {
    state.merchantDailySubsidyUsage[row.merchant_id] = row.payload || {};
  }

  const phoneLoginCodes = await pool.query(
    `SELECT phone, payload FROM ${schemaSql}.${qIdent(TABLES.phoneLoginCodes)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of phoneLoginCodes.rows) {
    state.phoneLoginCodes[row.phone] = row.payload;
  }

  const identityBindings = await pool.query(
    `
      SELECT merchant_id, binding_type, binding_key, payload
      FROM ${schemaSql}.${qIdent(TABLES.customerIdentityBindings)}
      WHERE scope_key = $1
    `,
    [scopeKey],
  );
  for (const row of identityBindings.rows) {
    if (String(row.binding_type).toUpperCase() === "PHONE") {
      if (!state.socialAuth.customerPhoneBindingsByMerchant[row.merchant_id]) {
        state.socialAuth.customerPhoneBindingsByMerchant[row.merchant_id] = {};
      }
      state.socialAuth.customerPhoneBindingsByMerchant[row.merchant_id][row.binding_key] =
        row.payload;
      continue;
    }
    if (!state.socialAuth.customerBindingsByMerchant[row.merchant_id]) {
      state.socialAuth.customerBindingsByMerchant[row.merchant_id] = {};
    }
    state.socialAuth.customerBindingsByMerchant[row.merchant_id][row.binding_key] = row.payload;
  }

  const contractApplications = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.contractApplications)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of contractApplications.rows) {
    state.contractApplications[row.merchant_id] = row.payload;
  }

  const tenantPolicies = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantPolicies)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of tenantPolicies.rows) {
    state.tenantPolicies[row.merchant_id] = row.payload;
  }

  const tenantMigrations = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantMigrations)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of tenantMigrations.rows) {
    state.tenantMigrations[row.merchant_id] = row.payload;
  }

  const tenantRoutes = await pool.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantRouteFiles)} WHERE scope_key = $1`,
    [scopeKey],
  );
  for (const row of tenantRoutes.rows) {
    state.tenantRouteFiles[row.merchant_id] = row.payload;
  }

  const socialLogs = await pool.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.socialTransferLogs)}
      WHERE scope_key = $1
      ORDER BY seq_no ASC
    `,
    [scopeKey],
  );
  state.socialTransferLogs = socialLogs.rows.map((row) => row.payload);

  const ledgerRows = await pool.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.ledgerEntries)}
      WHERE scope_key = $1
      ORDER BY seq_no ASC
    `,
    [scopeKey],
  );
  state.ledger = ledgerRows.rows.map((row) => row.payload);

  const auditRows = await pool.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.auditLogs)}
      WHERE scope_key = $1
      ORDER BY seq_no ASC
    `,
    [scopeKey],
  );
  state.auditLogs = auditRows.rows.map((row) => row.payload);

  const campaignRows = await pool.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.campaigns)}
      WHERE scope_key = $1
      ORDER BY seq_no ASC
    `,
    [scopeKey],
  );
  state.campaigns = campaignRows.rows.map((row) => row.payload);

  const proposalRows = await pool.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.proposals)}
      WHERE scope_key = $1
      ORDER BY seq_no ASC
    `,
    [scopeKey],
  );
  state.proposals = proposalRows.rows.map((row) => row.payload);

  return state;
}
async function insertRow(client, schema, table, columns, values) {
  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  const columnsSql = columns.map((column) => qIdent(column)).join(", ");
  const valuesSql = values.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(
    `INSERT INTO ${schemaSql}.${tableSql} (${columnsSql}) VALUES (${valuesSql})`,
    values,
  );
}

async function clearScopeData(client, schema, scopeKey) {
  const schemaSql = qIdent(schema);
  for (const table of RELATIONAL_SCOPE_TABLES) {
    await client.query(
      `DELETE FROM ${schemaSql}.${qIdent(table)} WHERE scope_key = $1`,
      [scopeKey],
    );
  }
}

async function replaceScopeState(client, schema, scopeKey, rawState) {
  const normalizedState = createInMemoryDb(rawState).serialize();
  await clearScopeData(client, schema, scopeKey);

  await insertRow(
    client,
    schema,
    TABLES.counters,
    ["scope_key", "ledger_counter", "audit_counter"],
    [
      scopeKey,
      toNumberOrZero(normalizedState.idCounters && normalizedState.idCounters.ledger),
      toNumberOrZero(normalizedState.idCounters && normalizedState.idCounters.audit),
    ],
  );

  for (const [merchantId, payload] of Object.entries(normalizedState.merchants || {})) {
    await insertRow(
      client,
      schema,
      TABLES.merchants,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, users] of Object.entries(normalizedState.merchantUsers || {})) {
    for (const [userId, payload] of Object.entries(users || {})) {
      await insertRow(
        client,
        schema,
        TABLES.merchantUsers,
        ["scope_key", "merchant_id", "user_id", "payload"],
        [scopeKey, merchantId, userId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payments] of Object.entries(normalizedState.paymentsByMerchant || {})) {
    for (const [paymentTxnId, payload] of Object.entries(payments || {})) {
      await insertRow(
        client,
        schema,
        TABLES.payments,
        ["scope_key", "merchant_id", "payment_txn_id", "payload"],
        [scopeKey, merchantId, paymentTxnId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, invoices] of Object.entries(normalizedState.invoicesByMerchant || {})) {
    for (const [invoiceNo, payload] of Object.entries(invoices || {})) {
      await insertRow(
        client,
        schema,
        TABLES.invoices,
        ["scope_key", "merchant_id", "invoice_no", "payload"],
        [scopeKey, merchantId, invoiceNo, toJsonb(payload)],
      );
    }
  }

  for (const [partnerId, orders] of Object.entries(normalizedState.partnerOrders || {})) {
    for (const [orderId, payload] of Object.entries(orders || {})) {
      await insertRow(
        client,
        schema,
        TABLES.partnerOrders,
        ["scope_key", "partner_id", "order_id", "payload"],
        [scopeKey, partnerId, orderId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, templates] of Object.entries(normalizedState.strategyConfigs || {})) {
    for (const [templateId, payload] of Object.entries(templates || {})) {
      await insertRow(
        client,
        schema,
        TABLES.strategyConfigs,
        ["scope_key", "merchant_id", "template_id", "payload"],
        [scopeKey, merchantId, templateId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.allianceConfigs || {})) {
    await insertRow(
      client,
      schema,
      TABLES.allianceConfigs,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, packets] of Object.entries(normalizedState.socialRedPacketsByMerchant || {})) {
    for (const [packetId, payload] of Object.entries(packets || {})) {
      await insertRow(
        client,
        schema,
        TABLES.socialRedPackets,
        ["scope_key", "merchant_id", "packet_id", "payload"],
        [scopeKey, merchantId, packetId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, sessions] of Object.entries(normalizedState.groupTreatSessionsByMerchant || {})) {
    for (const [sessionId, payload] of Object.entries(sessions || {})) {
      await insertRow(
        client,
        schema,
        TABLES.groupTreatSessions,
        ["scope_key", "merchant_id", "session_id", "payload"],
        [scopeKey, merchantId, sessionId, toJsonb(payload)],
      );
    }
  }
  for (const [merchantId, payload] of Object.entries(normalizedState.merchantDailySubsidyUsage || {})) {
    await insertRow(
      client,
      schema,
      TABLES.merchantDailySubsidyUsage,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload || {})],
    );
  }

  for (const [phone, payload] of Object.entries(normalizedState.phoneLoginCodes || {})) {
    await insertRow(
      client,
      schema,
      TABLES.phoneLoginCodes,
      ["scope_key", "phone", "payload"],
      [scopeKey, phone, toJsonb(payload)],
    );
  }

  const providerBindingsByMerchant =
    normalizedState.socialAuth && normalizedState.socialAuth.customerBindingsByMerchant
      ? normalizedState.socialAuth.customerBindingsByMerchant
      : {};
  for (const [merchantId, bindings] of Object.entries(providerBindingsByMerchant || {})) {
    for (const [bindingKey, payload] of Object.entries(bindings || {})) {
      await insertRow(
        client,
        schema,
        TABLES.customerIdentityBindings,
        ["scope_key", "merchant_id", "binding_type", "binding_key", "payload"],
        [scopeKey, merchantId, "PROVIDER", bindingKey, toJsonb(payload)],
      );
    }
  }

  const phoneBindingsByMerchant =
    normalizedState.socialAuth && normalizedState.socialAuth.customerPhoneBindingsByMerchant
      ? normalizedState.socialAuth.customerPhoneBindingsByMerchant
      : {};
  for (const [merchantId, bindings] of Object.entries(phoneBindingsByMerchant || {})) {
    for (const [bindingKey, payload] of Object.entries(bindings || {})) {
      await insertRow(
        client,
        schema,
        TABLES.customerIdentityBindings,
        ["scope_key", "merchant_id", "binding_type", "binding_key", "payload"],
        [scopeKey, merchantId, "PHONE", bindingKey, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.contractApplications || {})) {
    await insertRow(
      client,
      schema,
      TABLES.contractApplications,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantPolicies || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantPolicies,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantMigrations || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantMigrations,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantRouteFiles || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantRouteFiles,
      ["scope_key", "merchant_id", "payload"],
      [scopeKey, merchantId, toJsonb(payload)],
    );
  }

  const socialLogs = Array.isArray(normalizedState.socialTransferLogs)
    ? normalizedState.socialTransferLogs
    : [];
  for (let index = 0; index < socialLogs.length; index += 1) {
    const payload = socialLogs[index];
    const transferId =
      payload && payload.transferId
        ? String(payload.transferId)
        : `transfer_${index + 1}`;
    await insertRow(
      client,
      schema,
      TABLES.socialTransferLogs,
      ["scope_key", "transfer_id", "seq_no", "payload"],
      [scopeKey, transferId, index + 1, toJsonb(payload)],
    );
  }

  const ledgerRows = Array.isArray(normalizedState.ledger) ? normalizedState.ledger : [];
  for (let index = 0; index < ledgerRows.length; index += 1) {
    const payload = ledgerRows[index];
    const txnId =
      payload && payload.txnId
        ? String(payload.txnId)
        : `txn_${index + 1}`;
    await insertRow(
      client,
      schema,
      TABLES.ledgerEntries,
      ["scope_key", "txn_id", "seq_no", "payload"],
      [scopeKey, txnId, index + 1, toJsonb(payload)],
    );
  }

  const auditRows = Array.isArray(normalizedState.auditLogs) ? normalizedState.auditLogs : [];
  for (let index = 0; index < auditRows.length; index += 1) {
    const payload = auditRows[index];
    const auditId =
      payload && payload.auditId
        ? String(payload.auditId)
        : `audit_${index + 1}`;
    await insertRow(
      client,
      schema,
      TABLES.auditLogs,
      ["scope_key", "audit_id", "seq_no", "payload"],
      [scopeKey, auditId, index + 1, toJsonb(payload)],
    );
  }

  const campaigns = Array.isArray(normalizedState.campaigns) ? normalizedState.campaigns : [];
  for (let index = 0; index < campaigns.length; index += 1) {
    const payload = campaigns[index];
    const campaignId =
      payload && payload.id
        ? String(payload.id)
        : `campaign_${index + 1}`;
    await insertRow(
      client,
      schema,
      TABLES.campaigns,
      ["scope_key", "campaign_id", "seq_no", "payload"],
      [scopeKey, campaignId, index + 1, toJsonb(payload)],
    );
  }

  const proposals = Array.isArray(normalizedState.proposals) ? normalizedState.proposals : [];
  for (let index = 0; index < proposals.length; index += 1) {
    const payload = proposals[index];
    const proposalId =
      payload && payload.id
        ? String(payload.id)
        : `proposal_${index + 1}`;
    await insertRow(
      client,
      schema,
      TABLES.proposals,
      ["scope_key", "proposal_id", "seq_no", "payload"],
      [scopeKey, proposalId, index + 1, toJsonb(payload)],
    );
  }
}

async function writeRelationalState(pool, schema, scopeKey, state) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await replaceScopeState(client, schema, scopeKey, state);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function hasLegacySnapshotTable(pool, schema, legacyTable) {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
      LIMIT 1
    `,
    [schema, legacyTable],
  );
  return result.rowCount > 0;
}

async function importLegacySnapshotIfNeeded({
  pool,
  schema,
  legacySnapshotTable,
  scopeKey,
}) {
  if (!legacySnapshotTable) {
    return false;
  }
  if (await hasScopeData(pool, schema, scopeKey)) {
    return false;
  }
  if (!(await hasLegacySnapshotTable(pool, schema, legacySnapshotTable))) {
    return false;
  }

  const schemaSql = qIdent(schema);
  const tableSql = qIdent(legacySnapshotTable);
  const snapshot = await pool.query(
    `
      SELECT state
      FROM ${schemaSql}.${tableSql}
      WHERE snapshot_key = $1
      LIMIT 1
    `,
    [scopeKey],
  );
  if (!snapshot.rows[0]) {
    return false;
  }

  await writeRelationalState(pool, schema, scopeKey, snapshot.rows[0].state || null);
  return true;
}

function createSaveQueue({
  db,
  pool,
  schema,
  scopeKey,
  onPersistError,
}) {
  let chain = Promise.resolve();
  let lastError = null;

  const enqueueState = (state) => {
    chain = chain
      .then(() => writeRelationalState(pool, schema, scopeKey, state))
      .then(() => {
        lastError = null;
      })
      .catch((error) => {
        lastError = error;
        if (typeof onPersistError === "function") {
          onPersistError(error);
        }
      });
    return chain;
  };

  db.save = () => enqueueState(db.serialize());
  db.flush = () => chain;
  db.getLastPersistError = () => lastError;
}

async function createPostgresDb({
  connectionString,
  schema = "public",
  table = "mealquest_state_snapshots",
  snapshotKey = "main",
  maxPoolSize = 5,
  autoCreateDatabase = true,
  adminConnectionString = null,
  onPersistError = null,
} = {}) {
  const normalizedSchema = normalizeIdentifier(schema, "public");
  const normalizedLegacySnapshotTable = normalizeIdentifier(
    table,
    "mealquest_state_snapshots",
  );
  const normalizedScopeKey =
    typeof snapshotKey === "string" && snapshotKey.trim()
      ? snapshotKey.trim()
      : "main";

  if (!connectionString || !String(connectionString).trim()) {
    throw new Error("connectionString is required for postgres db driver");
  }

  const pool = await ensureRelationalPool({
    connectionString,
    schema: normalizedSchema,
    maxPoolSize,
    autoCreateDatabase: Boolean(autoCreateDatabase),
    adminConnectionString,
  });

  try {
    await importLegacySnapshotIfNeeded({
      pool,
      schema: normalizedSchema,
      legacySnapshotTable: normalizedLegacySnapshotTable,
      scopeKey: normalizedScopeKey,
    });
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }

  let initialState = null;
  try {
    initialState = await readRelationalState(pool, normalizedSchema, normalizedScopeKey);
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
  const db = createInMemoryDb(initialState);

  createSaveQueue({
    db,
    pool,
    schema: normalizedSchema,
    scopeKey: normalizedScopeKey,
    onPersistError,
  });

  db.close = async () => {
    await db.flush();
    await pool.end();
  };
  db.save();

  return db;
}

module.exports = {
  createPostgresDb,
};
