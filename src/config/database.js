const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  requestTimeout: 15000,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    useUTC: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getPool() {
  if (pool) return pool;

  const MAX_RETRY = 10;
  const DELAY_MS  = 5000;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      pool = await sql.connect(config);
      console.log('Database connected:', process.env.DB_NAME);
      pool.on('error', (err) => {
        console.error('DB pool error, resetting connection:', err.message);
        pool = null;
      });
      return pool;
    } catch (err) {
      console.error(`DB connect attempt ${attempt}/${MAX_RETRY} failed: ${err.message}`);
      if (attempt === MAX_RETRY) throw err;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}

module.exports = { getPool, sql };
