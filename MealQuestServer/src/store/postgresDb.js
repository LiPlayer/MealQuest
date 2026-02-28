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
  strategyChats: "mq_strategy_chats",
  allianceConfigs: "mq_alliance_configs",
  phoneLoginCodes: "mq_phone_login_codes",
  customerIdentityBindings: "mq_customer_identity_bindings",
  contractApplications: "mq_contract_applications",
  tenantPolicies: "mq_tenant_policies",
  tenantMigrations: "mq_tenant_migrations",
  tenantRouteFiles: "mq_tenant_route_files",
  policyOs: "mq_policy_os",
  idempotencyRecords: "mq_idempotency_records",
  ledgerEntries: "mq_ledger_entries",
  auditLogs: "mq_audit_logs",
  campaigns: "mq_campaigns",
  proposals: "mq_proposals",
};

const RELATIONAL_TENANT_TABLES = Object.values(TABLES);

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
    await adminPool.end().catch(() => { });
  }
}

async function renameScopeKeyColumnIfNeeded(pool, schema, table) {
  const hasTenantIdColumn = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = 'tenant_id'
      LIMIT 1
    `,
    [schema, table],
  );
  if (hasTenantIdColumn.rowCount > 0) {
    return;
  }

  const hasScopeKeyColumn = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = 'scope_key'
      LIMIT 1
    `,
    [schema, table],
  );
  if (hasScopeKeyColumn.rowCount === 0) {
    return;
  }

  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  await pool.query(
    `ALTER TABLE ${schemaSql}.${tableSql} RENAME COLUMN scope_key TO tenant_id`,
  );
}

async function enforceRlsPolicy(pool, schema, table) {
  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  const policySql = qIdent(`${table}_tenant_isolation`);
  await pool.query(`ALTER TABLE ${schemaSql}.${tableSql} ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE ${schemaSql}.${tableSql} FORCE ROW LEVEL SECURITY`);
  await pool.query(`DROP POLICY IF EXISTS ${policySql} ON ${schemaSql}.${tableSql}`);
  await pool.query(`
    CREATE POLICY ${policySql}
    ON ${schemaSql}.${tableSql}
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
  `);
}

async function ensureRelationalTables(pool, schema, { enforceRls = true } = {}) {
  const schemaSql = qIdent(schema);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.counters)} (
      tenant_id TEXT PRIMARY KEY,
      ledger_counter BIGINT NOT NULL DEFAULT 0,
      audit_counter BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.merchants)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.merchantUsers)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.payments)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payment_txn_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id, payment_txn_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.invoices)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      invoice_no TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id, invoice_no)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.partnerOrders)} (
      tenant_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, partner_id, order_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.strategyConfigs)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id, template_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.strategyChats)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.allianceConfigs)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.phoneLoginCodes)} (
      tenant_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, phone)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.customerIdentityBindings)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      binding_type TEXT NOT NULL,
      binding_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id, binding_type, binding_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.contractApplications)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantPolicies)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantMigrations)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.tenantRouteFiles)} (
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, merchant_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.policyOs)} (
      tenant_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.idempotencyRecords)} (
      tenant_id TEXT NOT NULL,
      idem_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, idem_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.ledgerEntries)} (
      tenant_id TEXT NOT NULL,
      txn_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, txn_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.auditLogs)} (
      tenant_id TEXT NOT NULL,
      audit_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, audit_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.campaigns)} (
      tenant_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, campaign_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${qIdent(TABLES.proposals)} (
      tenant_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      seq_no BIGINT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, proposal_id)
    )
  `);

  for (const table of RELATIONAL_TENANT_TABLES) {
    await renameScopeKeyColumnIfNeeded(pool, schema, table);
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.ledgerEntries}_tenant_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.ledgerEntries)} (tenant_id, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.auditLogs}_tenant_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.auditLogs)} (tenant_id, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.campaigns}_tenant_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.campaigns)} (tenant_id, seq_no)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${qIdent(`${TABLES.proposals}_tenant_seq_idx`)}
    ON ${schemaSql}.${qIdent(TABLES.proposals)} (tenant_id, seq_no)
  `);
  if (!enforceRls) {
    return;
  }
  for (const table of RELATIONAL_TENANT_TABLES) {
    await enforceRlsPolicy(pool, schema, table);
  }
}

async function ensureRelationalPool({
  connectionString,
  schema,
  maxPoolSize,
  autoCreateDatabase,
  adminConnectionString,
  enforceRls,
}) {
  let pool = createPool(connectionString, maxPoolSize);
  try {
    await ensureRelationalTables(pool, schema, { enforceRls });
    return pool;
  } catch (error) {
    await pool.end().catch(() => { });
    if (!autoCreateDatabase || !isMissingDatabaseError(error)) {
      throw error;
    }

    await ensureDatabaseExists({
      connectionString,
      adminConnectionString,
    });

    pool = createPool(connectionString, maxPoolSize);
    try {
      await ensureRelationalTables(pool, schema, { enforceRls });
      return pool;
    } catch (retryError) {
      await pool.end().catch(() => { });
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
    strategyChats: {},
    allianceConfigs: {},
    phoneLoginCodes: {},
    socialAuth: {
      customerBindingsByMerchant: {},
      customerPhoneBindingsByMerchant: {},
    },
    contractApplications: {},
    tenantPolicies: {},
    tenantMigrations: {},
    tenantRouteFiles: {},
    policyOs: {
      templates: {},
      drafts: {},
      policies: {},
      executionPlans: {},
      decisions: {},
      approvals: {},
      publishedByMerchant: {},
      resourceStates: {
        budget: {},
        inventory: {},
        frequency: {},
      },
      dispatcher: {
        sequenceByMerchant: {},
        dedupe: {},
      },
      compliance: {
        behaviorLogs: [],
        deletionQueue: [],
      },
    },
    idempotencyRecords: {},
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

async function setTenantContext(client, tenantId) {
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function lockTenantTransaction(client, tenantId) {
  await client.query(`SELECT pg_advisory_xact_lock(7823, hashtext($1))`, [tenantId]);
}

async function runInTenantTransaction(pool, tenantId, runner) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockTenantTransaction(client, tenantId);
    await setTenantContext(client, tenantId);
    const result = await runner(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ABORT");
    throw error;
  } finally {
    client.release();
  }
}

async function hasTenantData(client, schema, tenantId) {
  const schemaSql = qIdent(schema);
  const result = await client.query(
    `SELECT EXISTS (
      SELECT 1
      FROM ${schemaSql}.${qIdent(TABLES.counters)}
      WHERE tenant_id = $1
    ) AS has_data`,
    [tenantId],
  );
  return Boolean(result.rows[0] && result.rows[0].has_data);
}
async function readRelationalStateWithClient(client, schema, tenantId) {
  if (!(await hasTenantData(client, schema, tenantId))) {
    return null;
  }

  const schemaSql = qIdent(schema);
  const state = createEmptyState();

  const counters = await client.query(
    `
      SELECT ledger_counter, audit_counter
      FROM ${schemaSql}.${qIdent(TABLES.counters)}
      WHERE tenant_id = $1
      LIMIT 1
    `,
    [tenantId],
  );
  if (counters.rows[0]) {
    state.idCounters.ledger = toNumberOrZero(counters.rows[0].ledger_counter);
    state.idCounters.audit = toNumberOrZero(counters.rows[0].audit_counter);
  }

  const merchants = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.merchants)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of merchants.rows) {
    state.merchants[row.merchant_id] = row.payload;
  }

  const users = await client.query(
    `SELECT merchant_id, user_id, payload FROM ${schemaSql}.${qIdent(TABLES.merchantUsers)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of users.rows) {
    if (!state.merchantUsers[row.merchant_id]) {
      state.merchantUsers[row.merchant_id] = {};
    }
    state.merchantUsers[row.merchant_id][row.user_id] = row.payload;
  }

  const payments = await client.query(
    `SELECT merchant_id, payment_txn_id, payload FROM ${schemaSql}.${qIdent(TABLES.payments)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of payments.rows) {
    if (!state.paymentsByMerchant[row.merchant_id]) {
      state.paymentsByMerchant[row.merchant_id] = {};
    }
    state.paymentsByMerchant[row.merchant_id][row.payment_txn_id] = row.payload;
  }

  const invoices = await client.query(
    `SELECT merchant_id, invoice_no, payload FROM ${schemaSql}.${qIdent(TABLES.invoices)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of invoices.rows) {
    if (!state.invoicesByMerchant[row.merchant_id]) {
      state.invoicesByMerchant[row.merchant_id] = {};
    }
    state.invoicesByMerchant[row.merchant_id][row.invoice_no] = row.payload;
  }

  const partnerOrders = await client.query(
    `SELECT partner_id, order_id, payload FROM ${schemaSql}.${qIdent(TABLES.partnerOrders)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of partnerOrders.rows) {
    if (!state.partnerOrders[row.partner_id]) {
      state.partnerOrders[row.partner_id] = {};
    }
    state.partnerOrders[row.partner_id][row.order_id] = row.payload;
  }

  const strategyConfigs = await client.query(
    `SELECT merchant_id, template_id, payload FROM ${schemaSql}.${qIdent(TABLES.strategyConfigs)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of strategyConfigs.rows) {
    if (!state.strategyConfigs[row.merchant_id]) {
      state.strategyConfigs[row.merchant_id] = {};
    }
    state.strategyConfigs[row.merchant_id][row.template_id] = row.payload;
  }

  const strategyChats = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.strategyChats)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of strategyChats.rows) {
    state.strategyChats[row.merchant_id] = row.payload;
  }

  const allianceConfigs = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.allianceConfigs)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of allianceConfigs.rows) {
    state.allianceConfigs[row.merchant_id] = row.payload;
  }

  const phoneLoginCodes = await client.query(
    `SELECT phone, payload FROM ${schemaSql}.${qIdent(TABLES.phoneLoginCodes)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of phoneLoginCodes.rows) {
    state.phoneLoginCodes[row.phone] = row.payload;
  }

  const identityBindings = await client.query(
    `
      SELECT merchant_id, binding_type, binding_key, payload
      FROM ${schemaSql}.${qIdent(TABLES.customerIdentityBindings)}
      WHERE tenant_id = $1
    `,
    [tenantId],
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

  const contractApplications = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.contractApplications)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of contractApplications.rows) {
    state.contractApplications[row.merchant_id] = row.payload;
  }

  const tenantPolicies = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantPolicies)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of tenantPolicies.rows) {
    state.tenantPolicies[row.merchant_id] = row.payload;
  }

  const tenantMigrations = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantMigrations)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of tenantMigrations.rows) {
    state.tenantMigrations[row.merchant_id] = row.payload;
  }

  const tenantRoutes = await client.query(
    `SELECT merchant_id, payload FROM ${schemaSql}.${qIdent(TABLES.tenantRouteFiles)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of tenantRoutes.rows) {
    state.tenantRouteFiles[row.merchant_id] = row.payload;
  }

  const policyOsRows = await client.query(
    `SELECT payload FROM ${schemaSql}.${qIdent(TABLES.policyOs)} WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  if (policyOsRows.rows[0] && policyOsRows.rows[0].payload) {
    state.policyOs = policyOsRows.rows[0].payload;
  }

  const idempotencyRows = await client.query(
    `SELECT idem_key, payload FROM ${schemaSql}.${qIdent(TABLES.idempotencyRecords)} WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of idempotencyRows.rows) {
    state.idempotencyRecords[row.idem_key] = row.payload;
  }

  const ledgerRows = await client.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.ledgerEntries)}
      WHERE tenant_id = $1
      ORDER BY seq_no ASC
    `,
    [tenantId],
  );
  state.ledger = ledgerRows.rows.map((row) => row.payload);

  const auditRows = await client.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.auditLogs)}
      WHERE tenant_id = $1
      ORDER BY seq_no ASC
    `,
    [tenantId],
  );
  state.auditLogs = auditRows.rows.map((row) => row.payload);

  const campaignRows = await client.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.campaigns)}
      WHERE tenant_id = $1
      ORDER BY seq_no ASC
    `,
    [tenantId],
  );
  state.campaigns = campaignRows.rows.map((row) => row.payload);

  const proposalRows = await client.query(
    `
      SELECT payload
      FROM ${schemaSql}.${qIdent(TABLES.proposals)}
      WHERE tenant_id = $1
      ORDER BY seq_no ASC
    `,
    [tenantId],
  );
  state.proposals = proposalRows.rows.map((row) => row.payload);

  return state;
}

async function readRelationalState(pool, schema, tenantId) {
  return runInTenantTransaction(pool, tenantId, async (client) =>
    readRelationalStateWithClient(client, schema, tenantId),
  );
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

async function clearTenantData(client, schema, tenantId) {
  const schemaSql = qIdent(schema);
  for (const table of RELATIONAL_TENANT_TABLES) {
    await client.query(
      `DELETE FROM ${schemaSql}.${qIdent(table)} WHERE tenant_id = $1`,
      [tenantId],
    );
  }
}

async function replaceTenantState(client, schema, tenantId, rawState) {
  const normalizedState = createInMemoryDb(rawState).serialize();
  await clearTenantData(client, schema, tenantId);

  await insertRow(
    client,
    schema,
    TABLES.counters,
    ["tenant_id", "ledger_counter", "audit_counter"],
    [
      tenantId,
      toNumberOrZero(normalizedState.idCounters && normalizedState.idCounters.ledger),
      toNumberOrZero(normalizedState.idCounters && normalizedState.idCounters.audit),
    ],
  );

  for (const [merchantId, payload] of Object.entries(normalizedState.merchants || {})) {
    await insertRow(
      client,
      schema,
      TABLES.merchants,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, users] of Object.entries(normalizedState.merchantUsers || {})) {
    for (const [userId, payload] of Object.entries(users || {})) {
      await insertRow(
        client,
        schema,
        TABLES.merchantUsers,
        ["tenant_id", "merchant_id", "user_id", "payload"],
        [tenantId, merchantId, userId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payments] of Object.entries(normalizedState.paymentsByMerchant || {})) {
    for (const [paymentTxnId, payload] of Object.entries(payments || {})) {
      await insertRow(
        client,
        schema,
        TABLES.payments,
        ["tenant_id", "merchant_id", "payment_txn_id", "payload"],
        [tenantId, merchantId, paymentTxnId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, invoices] of Object.entries(normalizedState.invoicesByMerchant || {})) {
    for (const [invoiceNo, payload] of Object.entries(invoices || {})) {
      await insertRow(
        client,
        schema,
        TABLES.invoices,
        ["tenant_id", "merchant_id", "invoice_no", "payload"],
        [tenantId, merchantId, invoiceNo, toJsonb(payload)],
      );
    }
  }

  for (const [partnerId, orders] of Object.entries(normalizedState.partnerOrders || {})) {
    for (const [orderId, payload] of Object.entries(orders || {})) {
      await insertRow(
        client,
        schema,
        TABLES.partnerOrders,
        ["tenant_id", "partner_id", "order_id", "payload"],
        [tenantId, partnerId, orderId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, templates] of Object.entries(normalizedState.strategyConfigs || {})) {
    for (const [templateId, payload] of Object.entries(templates || {})) {
      await insertRow(
        client,
        schema,
        TABLES.strategyConfigs,
        ["tenant_id", "merchant_id", "template_id", "payload"],
        [tenantId, merchantId, templateId, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.strategyChats || {})) {
    await insertRow(
      client,
      schema,
      TABLES.strategyChats,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.allianceConfigs || {})) {
    await insertRow(
      client,
      schema,
      TABLES.allianceConfigs,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [phone, payload] of Object.entries(normalizedState.phoneLoginCodes || {})) {
    await insertRow(
      client,
      schema,
      TABLES.phoneLoginCodes,
      ["tenant_id", "phone", "payload"],
      [tenantId, phone, toJsonb(payload)],
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
        ["tenant_id", "merchant_id", "binding_type", "binding_key", "payload"],
        [tenantId, merchantId, "PROVIDER", bindingKey, toJsonb(payload)],
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
        ["tenant_id", "merchant_id", "binding_type", "binding_key", "payload"],
        [tenantId, merchantId, "PHONE", bindingKey, toJsonb(payload)],
      );
    }
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.contractApplications || {})) {
    await insertRow(
      client,
      schema,
      TABLES.contractApplications,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantPolicies || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantPolicies,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantMigrations || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantMigrations,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  for (const [merchantId, payload] of Object.entries(normalizedState.tenantRouteFiles || {})) {
    await insertRow(
      client,
      schema,
      TABLES.tenantRouteFiles,
      ["tenant_id", "merchant_id", "payload"],
      [tenantId, merchantId, toJsonb(payload)],
    );
  }

  await insertRow(
    client,
    schema,
    TABLES.policyOs,
    ["tenant_id", "payload"],
    [tenantId, toJsonb(normalizedState.policyOs || {})],
  );

  for (const [idemKey, payload] of Object.entries(normalizedState.idempotencyRecords || {})) {
    await insertRow(
      client,
      schema,
      TABLES.idempotencyRecords,
      ["tenant_id", "idem_key", "payload"],
      [tenantId, idemKey, toJsonb(payload)],
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
      ["tenant_id", "txn_id", "seq_no", "payload"],
      [tenantId, txnId, index + 1, toJsonb(payload)],
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
      ["tenant_id", "audit_id", "seq_no", "payload"],
      [tenantId, auditId, index + 1, toJsonb(payload)],
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
      ["tenant_id", "campaign_id", "seq_no", "payload"],
      [tenantId, campaignId, index + 1, toJsonb(payload)],
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
      ["tenant_id", "proposal_id", "seq_no", "payload"],
      [tenantId, proposalId, index + 1, toJsonb(payload)],
    );
  }
}

async function writeRelationalState(pool, schema, tenantId, state) {
  await runInTenantTransaction(pool, tenantId, async (client) => {
    await replaceTenantState(client, schema, tenantId, state);
  });
}

async function withFreshTenantState(pool, schema, tenantId, runner, syncBack) {
  return runInTenantTransaction(pool, tenantId, async (client) => {
    const currentState = await readRelationalStateWithClient(client, schema, tenantId);
    const workingDb = createInMemoryDb(currentState);
    const result = await runner(workingDb);
    const finalState = workingDb.serialize();
    await replaceTenantState(client, schema, tenantId, finalState);
    if (typeof syncBack === "function") {
      syncBack(finalState);
    }
    return result;
  });
}

async function withFreshTenantRead(pool, schema, tenantId, runner) {
  return runInTenantTransaction(pool, tenantId, async (client) => {
    const currentState = await readRelationalStateWithClient(client, schema, tenantId);
    const workingDb = createInMemoryDb(currentState);
    return runner(workingDb);
  });
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
  tenantId,
}) {
  if (!legacySnapshotTable) {
    return false;
  }
  const exists = await runInTenantTransaction(pool, tenantId, async (client) =>
    hasTenantData(client, schema, tenantId),
  );
  if (exists) {
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
    [tenantId],
  );
  if (!snapshot.rows[0]) {
    return false;
  }

  await writeRelationalState(pool, schema, tenantId, snapshot.rows[0].state || null);
  return true;
}

function createSaveQueue({
  db,
  pool,
  schema,
  tenantId,
  onPersistError,
}) {
  let chain = Promise.resolve();
  let lastError = null;

  const enqueueState = (state) => {
    chain = chain
      .then(() => writeRelationalState(pool, schema, tenantId, state))
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
  enforceRls = true,
  onPersistError = null,
} = {}) {
  const normalizedSchema = normalizeIdentifier(schema, "public");
  const normalizedLegacySnapshotTable = normalizeIdentifier(
    table,
    "mealquest_state_snapshots",
  );
  const normalizedTenantId =
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
    enforceRls: Boolean(enforceRls),
  });

  try {
    await importLegacySnapshotIfNeeded({
      pool,
      schema: normalizedSchema,
      legacySnapshotTable: normalizedLegacySnapshotTable,
      tenantId: normalizedTenantId,
    });
  } catch (error) {
    await pool.end().catch(() => { });
    throw error;
  }

  let initialState = null;
  try {
    initialState = await readRelationalState(pool, normalizedSchema, normalizedTenantId);
  } catch (error) {
    await pool.end().catch(() => { });
    throw error;
  }
  const db = createInMemoryDb(initialState);

  createSaveQueue({
    db,
    pool,
    schema: normalizedSchema,
    tenantId: normalizedTenantId,
    onPersistError,
  });

  db.runWithFreshState = (runner) =>
    withFreshTenantState(pool, normalizedSchema, normalizedTenantId, runner, (committedState) => {
      const fresh = createInMemoryDb(committedState);
      const freshSerialized = fresh.serialize();
      for (const key of Object.keys(freshSerialized)) {
        db[key] = freshSerialized[key];
      }
    });
  db.runWithFreshRead = (runner) =>
    withFreshTenantRead(pool, normalizedSchema, normalizedTenantId, runner);

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
