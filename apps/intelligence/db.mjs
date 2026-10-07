import pg from 'pg';

const { Pool } = pg;

export function createDatabase({ connectionString = process.env.DATABASE_URL, poolOptions = {} } = {}) {
  if (!connectionString) throw new Error('Set DATABASE_URL before starting the intelligence service.');
  return new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...poolOptions
  });
}
