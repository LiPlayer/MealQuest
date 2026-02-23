const { Pool } = require("pg");

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

  const pool = new Pool({
    connectionString,
    max: Number.isFinite(Number(maxPoolSize)) ? Math.max(1, Number(maxPoolSize)) : 5,
  });

  await ensureSnapshotTable(pool, normalizedSchema, normalizedTable);
  const initialState = await readSnapshot(
    pool,
    normalizedSchema,
    normalizedTable,
    normalizedSnapshotKey,
  );
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

