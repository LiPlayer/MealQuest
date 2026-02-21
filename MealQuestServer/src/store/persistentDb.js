const fs = require("node:fs");
const path = require("node:path");

const { createInMemoryDb } = require("./inMemoryDb");

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function readState(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createPersistentDb(filePath) {
  ensureDirectory(filePath);
  const state = readState(filePath);
  const db = createInMemoryDb(state);

  db.save = () => {
    const snapshot = db.serialize();
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  };

  db.save();
  return db;
}

module.exports = {
  createPersistentDb
};
