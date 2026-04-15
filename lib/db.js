const { Pool } = require('pg');

let _pool = null;

function getDbPool() {
  if (_pool) return _pool;
  const url = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();
  if (!url) return null;

  // Supabase/Render typically requires SSL. Allow opt-out for local dev.
  const sslMode = (process.env.DB_SSL || 'require').trim().toLowerCase();
  const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: false };

  _pool = new Pool({
    connectionString: url,
    ssl,
    max: Number(process.env.DB_POOL_MAX || 5) || 5,
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 30000) || 30000
  });

  return _pool;
}

module.exports = { getDbPool };

