const { Pool } = require("pg");
const { URL } = require("node:url");

const { createInMemoryDb } = require("./inMemoryDb");

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
  return `"${String(name).replace(/"/g, "\"\"")}"`;
}

function normalizePoolSize(raw, fallback = 5) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
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

async function ensureSnapshotPool({
  connectionString,
  schema,
  table,
  maxPoolSize,
  autoCreateDatabase,
  adminConnectionString,
}) {
  let pool = createPool(connectionString, maxPoolSize);
  try {
    await ensureSnapshotTable(pool, schema, table);
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
      await ensureSnapshotTable(pool, schema, table);
      return pool;
    } catch (retryError) {
      await pool.end().catch(() => {});
      throw retryError;
    }
  }
}

async function ensureSnapshotTable(pool, schema, table) {
  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schemaSql}.${tableSql} (
      snapshot_key TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readSnapshot(pool, schema, table, snapshotKey) {
  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  const result = await pool.query(
    `SELECT state FROM ${schemaSql}.${tableSql} WHERE snapshot_key = $1 LIMIT 1`,
    [snapshotKey],
  );
  if (!result.rows[0]) {
    return null;
  }
  return result.rows[0].state || null;
}

async function writeSnapshot(pool, schema, table, snapshotKey, state) {
  const schemaSql = qIdent(schema);
  const tableSql = qIdent(table);
  await pool.query(
    `
      INSERT INTO ${schemaSql}.${tableSql} (snapshot_key, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (snapshot_key)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `,
    [snapshotKey, JSON.stringify(state)],
  );
}

function createSaveQueue({
  db,
  pool,
  schema,
  table,
  snapshotKey,
  onPersistError,
}) {
  let chain = Promise.resolve();
  let lastError = null;

  const enqueueSnapshot = (snapshot) => {
    chain = chain
      .then(() => writeSnapshot(pool, schema, table, snapshotKey, snapshot))
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

  db.save = () => enqueueSnapshot(db.serialize());
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
  const normalizedTable = normalizeIdentifier(table, "mealquest_state_snapshots");
  const normalizedSnapshotKey =
    typeof snapshotKey === "string" && snapshotKey.trim()
      ? snapshotKey.trim()
      : "main";

  if (!connectionString || !String(connectionString).trim()) {
    throw new Error("connectionString is required for postgres db driver");
  }

  const pool = await ensureSnapshotPool({
    connectionString,
    schema: normalizedSchema,
    table: normalizedTable,
    maxPoolSize,
    autoCreateDatabase: Boolean(autoCreateDatabase),
    adminConnectionString,
  });

  let initialState = null;
  try {
    initialState = await readSnapshot(
      pool,
      normalizedSchema,
      normalizedTable,
      normalizedSnapshotKey,
    );
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
  const db = createInMemoryDb(initialState);

  createSaveQueue({
    db,
    pool,
    schema: normalizedSchema,
    table: normalizedTable,
    snapshotKey: normalizedSnapshotKey,
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
