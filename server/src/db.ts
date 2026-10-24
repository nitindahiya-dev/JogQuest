import pg from 'pg';

const { Pool } = pg;

function positiveIntegerSetting(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      `Invalid ${name}: expected an integer between 1 and ${maximum}`,
    );
  }

  return value;
}

const poolMax = positiveIntegerSetting('PG_POOL_MAX', 10, 100);
const connectionTimeoutMillis = positiveIntegerSetting(
  'PG_CONNECTION_TIMEOUT_MS',
  10000,
  120000,
);
const idleTimeoutMillis = positiveIntegerSetting(
  'PG_IDLE_TIMEOUT_MS',
  30000,
  600000,
);
const statementTimeoutMillis = positiveIntegerSetting(
  'PG_STATEMENT_TIMEOUT_MS',
  30000,
  600000,
);
const queryTimeoutMillis = positiveIntegerSetting(
  'PG_QUERY_TIMEOUT_MS',
  35000,
  600000,
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  connectionTimeoutMillis,
  idleTimeoutMillis,
  statement_timeout: statementTimeoutMillis,
  query_timeout: queryTimeoutMillis,
  application_name: 'jogquest-api',
});

pool.on('error', (error) => {
  console.error('Unexpected error from an idle PostgreSQL client:', error);
});

export const query = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) => {
  return pool.query<T>(text, params);
};
