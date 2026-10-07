import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabase } from './db.mjs';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db', 'migrations');
const pool = createDatabase();

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  console.log('Database migrations are current.');
} finally {
  await pool.end();
}
