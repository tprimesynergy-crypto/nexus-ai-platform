/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Configuration Base de Données
 * PostgreSQL (production) | SQLite fallback (dev)
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const { Pool } = require('pg');

let pool = null;

const connectDB = async () => {
  const config = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'tanger_nexus',
    user: process.env.PG_USER || 'nexus_user',
    password: process.env.PG_PASSWORD || 'nexus_secure_2026',
    max: 20,              // pool max connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
  };

  try {
    pool = new Pool(config);

    // Test de connexion
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    client.release();

    console.log(`✅ PostgreSQL connecté: ${config.host}:${config.port}/${config.database}`);
    console.log(`   Version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);

    // Gestion des erreurs pool
    pool.on('error', (err) => {
      console.error('❌ PostgreSQL pool error:', err.message);
    });

    return pool;
  } catch (err) {
    console.warn(`⚠️  PostgreSQL non disponible: ${err.message}`);
    console.warn('   Mode mémoire activé — données non persistées');
    return null;
  }
};

const getPool = () => pool;

const query = async (text, params) => {
  if (!pool) throw new Error('Database not connected');
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
  }
  return result;
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { connectDB, getPool, query, transaction };
