const { getPool, sql } = require('../config/database');

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('app_logs', 'U') IS NULL
    CREATE TABLE app_logs (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      level       VARCHAR(10)       NOT NULL DEFAULT 'error',
      method      VARCHAR(10)       NULL,
      url         NVARCHAR(500)     NULL,
      status_code INT               NULL,
      message     NVARCHAR(MAX)     NULL,
      stack       NVARCHAR(MAX)     NULL,
      user_id     INT               NULL,
      username    NVARCHAR(100)     NULL,
      ip_address  VARCHAR(50)       NULL,
      duration_ms INT               NULL,
      created_at  DATETIME          NOT NULL DEFAULT GETDATE()
    )
  `);
  tableReady = true;
}

async function writeLog({ level = 'error', method, url, status_code, message, stack, user_id, username, ip_address, duration_ms }) {
  try {
    await ensureTable();
    const pool = await getPool();
    await pool.request()
      .input('level',       sql.VarChar(10),       level)
      .input('method',      sql.VarChar(10),        method || null)
      .input('url',         sql.NVarChar(500),      url || null)
      .input('status_code', sql.Int,                status_code || null)
      .input('message',     sql.NVarChar(sql.MAX),  message ? message.substring(0, 4000) : null)
      .input('stack',       sql.NVarChar(sql.MAX),  stack ? stack.substring(0, 8000) : null)
      .input('user_id',     sql.Int,                user_id || null)
      .input('username',    sql.NVarChar(100),      username || null)
      .input('ip_address',  sql.VarChar(50),        ip_address || null)
      .input('duration_ms', sql.Int,                duration_ms || null)
      .query(`
        INSERT INTO app_logs
          (level, method, url, status_code, message, stack, user_id, username, ip_address, duration_ms)
        VALUES
          (@level, @method, @url, @status_code, @message, @stack, @user_id, @username, @ip_address, @duration_ms)
      `);
  } catch (e) {
    console.error('[Logger] Gagal menulis log:', e.message);
  }
}

function fromRequest(req, err, statusCode) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  const duration = req._startTime ? Date.now() - req._startTime : null;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  return writeLog({
    level,
    method:      req.method,
    url:         req.originalUrl,
    status_code: statusCode,
    message:     err?.message || String(err),
    stack:       err?.stack || null,
    user_id:     req.user?.id || null,
    username:    req.user?.username || null,
    ip_address:  ip,
    duration_ms: duration,
  });
}

module.exports = { writeLog, fromRequest };
