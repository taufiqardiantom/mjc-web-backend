const { getPool } = require('../../config/database');

async function getAll(req, res, next) {
  try {
    const pool   = await getPool();
    const result = await pool.request().query(`
      SELECT kode_pwk, nama_pwk, subgroup
      FROM tbl_perwakilan
      ORDER BY urut
    `);
    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll };
