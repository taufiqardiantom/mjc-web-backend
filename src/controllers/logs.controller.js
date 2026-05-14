const { getPool, sql } = require('../config/database');

async function getAll(req, res, next) {
  try {
    const { level, search, date_from, date_to, page = 1, limit = 50 } = req.query;
    const pool = await getPool();

    const where = ['1=1'];
    const inputs = [];

    if (level && level !== 'all') {
      where.push('level = @level');
      inputs.push({ name: 'level', type: sql.VarChar(10), val: level });
    }
    if (search) {
      where.push('(url LIKE @search OR message LIKE @search OR username LIKE @search OR CAST(status_code AS VARCHAR) LIKE @search)');
      inputs.push({ name: 'search', type: sql.NVarChar(500), val: `%${search}%` });
    }
    if (date_from) {
      where.push('created_at >= @date_from');
      inputs.push({ name: 'date_from', type: sql.DateTime, val: new Date(date_from) });
    }
    if (date_to) {
      where.push('created_at < @date_to');
      inputs.push({ name: 'date_to', type: sql.DateTime, val: new Date(new Date(date_to).getTime() + 86400000) });
    }

    const whereStr = where.join(' AND ');
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(200, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    function buildReq(extra = {}) {
      const r = pool.request();
      inputs.forEach(({ name, type, val }) => r.input(name, type, val));
      Object.entries(extra).forEach(([k, v]) => r.input(k, sql.Int, v));
      return r;
    }

    const [dataResult, countResult, summaryResult] = await Promise.all([
      buildReq({ offset, pageSize })
        .query(`
          SELECT id, level, method, url, status_code, message, stack,
                 user_id, username, ip_address, duration_ms, created_at
          FROM app_logs
          WHERE ${whereStr}
          ORDER BY created_at DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `),
      buildReq()
        .query(`SELECT COUNT(*) AS total FROM app_logs WHERE ${whereStr}`),
      pool.request()
        .query(`
          SELECT level, COUNT(*) AS cnt
          FROM app_logs
          WHERE created_at >= CAST(GETDATE() AS DATE)
          GROUP BY level
        `),
    ]);

    const summary = { error: 0, warn: 0, info: 0 };
    summaryResult.recordset.forEach(r => { summary[r.level] = r.cnt; });

    res.json({
      data:    dataResult.recordset,
      total:   countResult.recordset[0].total,
      page:    pageNum,
      limit:   pageSize,
      summary,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteOld(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const pool = await getPool();
    const result = await pool.request()
      .input('days', sql.Int, days)
      .query('DELETE FROM app_logs WHERE created_at < DATEADD(day, -@days, GETDATE())');
    res.json({ message: `${result.rowsAffected[0]} log dihapus (lebih dari ${days} hari)` });
  } catch (err) {
    next(err);
  }
}

async function deleteOne(req, res, next) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM app_logs WHERE id = @id');
    res.json({ message: 'Log dihapus' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, deleteOld, deleteOne };
