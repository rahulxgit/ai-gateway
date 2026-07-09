import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const dbPath =
  env.databaseUrl === ':memory:'
    ? ':memory:'
    : env.databaseUrl.startsWith('.') || env.databaseUrl.startsWith('/')
      ? env.databaseUrl
      : path.join(process.cwd(), env.databaseUrl);

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations(): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  logger.info('Database migrations applied', { dbPath });
}
