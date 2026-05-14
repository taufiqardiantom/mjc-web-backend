const { getPool, sql } = require('../../config/database');

// POST /api/marketing/sph
// body: { no_frpp, keterangan? }
// Update level_status FRPP → 60 dan catat history.
async function create(req, res, next) {
  try {
    const { no_frpp, keterangan } = req.body;
    const created_by = req.user?.username || req.user?.id || 'system';

    if (!no_frpp) return res.status(400).json({ message: 'no_frpp wajib diisi' });

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 60 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 60)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_60 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp',              sql.VarChar(50),   no_frpp)
      .input('level_status_updated', sql.Int,           60)
      .input('kode_status_updated',  sql.VarChar(50),   kode_status_60)
      .input('user_updated',         sql.VarChar(100),  created_by)
      .input('keterangan',           sql.NVarChar(500), keterangan || 'Simpan SPH')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.status(201).json({ message: 'SPH berhasil disimpan' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/sph/:no_frpp/request-approval
// body: { keterangan? }
// Update level_status FRPP → 70 dan catat history.
async function requestApproval(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    // Ambil kode_status saat ini sebelum diupdate
    const current = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`
        SELECT ISNULL(FRP.level_status, 10) AS level_status_akhir, FRPSTA.kode_status
        FROM TBL_FRPPDOC FRP
        LEFT JOIN tbl_FRPP_status FRPSTA
          ON ISNULL(FRP.level_status, 10) = FRPSTA.level_status
        WHERE FRP.no_frpp = @no_frpp
      `);

    if (!current.recordset.length)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 70 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 70)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_70 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp',              sql.VarChar(50),   no_frpp)
      .input('level_status_updated', sql.Int,           70)
      .input('kode_status_updated',  sql.VarChar(50),   kode_status_70)
      .input('user_updated',         sql.VarChar(100),  user_updated)
      .input('keterangan',           sql.NVarChar(500), keterangan || 'Request Approval SPH')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Request approval SPH berhasil dikirim' });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, requestApproval };
