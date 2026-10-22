import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logging';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/mcp.sqlite');

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Could not connect to SQLite database', { error: err.message });
  } else {
    logger.info('Connected to SQLite database', { path: dbPath });
  }
});

export const run = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

export const get = <T>(sql: string, params: any[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
};

export const all = <T>(sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
};

export const initDb = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS google_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS oauth_credentials (
      account_id TEXT PRIMARY KEY,
      tokens TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES google_accounts(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      action_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      digest TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES google_accounts(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS operations (
      idempotency_key TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  logger.info('Database initialized');
};
