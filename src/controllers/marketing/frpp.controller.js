const { getPool, sql } = require('../../config/database');

// GET /api/marketing/frpp?tgl_from=&tgl_to=&level_status=
async function getAll(req, res, next) {
  try {
    let { tgl_from, tgl_to, level_status } = req.query;

    // Default: awal = tgl 1 bulan (n-2), akhir = hari terakhir bulan berjalan
    if (!tgl_from && !tgl_to) {
      const fmtLocal = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const now = new Date();
      tgl_from = fmtLocal(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      tgl_to = fmtLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (!tgl_from) {
      tgl_from = tgl_to;
    } else if (!tgl_to) {
      tgl_to = tgl_from;
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('tgl_from', sql.Date, tgl_from);
    request.input('tgl_to', sql.Date, tgl_to);

    let levelStatusClause = '';
    if (level_status != null && level_status !== '') {
      request.input('level_status', sql.Int, Number(level_status));
      levelStatusClause = 'AND ISNULL(FRP.level_status, 10) = @level_status';
    }

    const result = await request.query(`
      SELECT
        FRP.no_frpp,
        FRP.tgl_frpp,
        FRP.nik,
        FRP.group_order,
        CUS.nama        AS nama_pemesan,
        FRP.nama_order,
        FRP.jenis_order,
        FRP.jum_pesanan,
        '-'             AS no_bukti_lain,
        ISNULL(FRP.level_status, 10) AS level_status_akhir,
        FRPSTA.kode_status,
        FRPSTA.status
      FROM TBL_FRPPDOC FRP
      LEFT JOIN tbl_Customer CUS ON FRP.kode_customer = CUS.kode
      LEFT JOIN tbl_FRPP_status FRPSTA ON ISNULL(FRP.level_status, 10) = FRPSTA.level_status
      WHERE CAST(FRP.tgl_frpp AS DATE) BETWEEN @tgl_from AND @tgl_to
        ${levelStatusClause}
      ORDER BY FRP.tgl_frpp DESC
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketing/frpp/:no_frpp
async function getOne(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const pool = await getPool();

    const docRes = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`
        SELECT
          FRP.no_frpp,   FRP.tgl_frpp,  FRP.nik,
          FRP.kode_customer,             CUS.nama AS nama_pemesan,
          FRP.group_order,               FRP.id_proyek,
          FRP.no_po_pemesan,             FRP.kode_eksternal,
          FRP.nama_order,                FRP.jenis_order,
          FRP.jum_pesanan,               FRP.satuan,
          FRP.sta_proof,                 FRP.status_order,
          FRP.ukuran,                    FRP.dikirim_ke,
          FRP.acc_cetak,                 FRP.keterangan,
          FRP.ket_rev_rep,               FRP.master_produk_id,
          FRP.packing,                   FRP.packing_custom,
          FRP.lain_lain,                 FRP.lain_custom,
          FRP.oplah_variants,            FRP.materi,
          FRP.proses,
          ISNULL(FRP.level_status, 10)  AS level_status_akhir,
          FRPSTA.kode_status,            FRPSTA.status
        FROM TBL_FRPPDOC FRP
        LEFT JOIN tbl_Customer CUS
          ON FRP.kode_customer = CUS.kode
        LEFT JOIN tbl_FRPP_status FRPSTA
          ON ISNULL(FRP.level_status, 10) = FRPSTA.level_status
        WHERE FRP.no_frpp = @no_frpp
      `);

    if (!docRes.recordset.length)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const spekRes = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`
        SELECT urutan, jenis_pekerjaan,
          kertas_nama, kertas_gramatur, kertas_grader, kertas_merk, kertas_supplier,
          jenis_cetakan, jml_halaman, uv_varnish, emboss, deboss,
          foil_jenis, foil_jenis_custom, foil_ket, flap,
          laminasi_jenis, laminasi_jenis_custom, uv_spot,
          punch_jenis, lipat, o_wire, spiral, klem_seng
        FROM TBL_FRPPSPEK
        WHERE no_frpp = @no_frpp
        ORDER BY urutan
      `);

    const doc = docRes.recordset[0];
    // Parse JSON columns
    const tryParse = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
    doc.oplah_variants = tryParse(doc.oplah_variants, []);
    doc.materi         = tryParse(doc.materi,         []);
    doc.proses         = tryParse(doc.proses,         []);
    doc.packing        = tryParse(doc.packing,        {});
    doc.packing_custom = tryParse(doc.packing_custom, []);
    doc.lain_lain      = tryParse(doc.lain_lain,      {});
    doc.lain_custom    = tryParse(doc.lain_custom,    []);
    doc.spesifikasi_items = spekRes.recordset.map(s => ({
      ...s,
      jenis_kertas: s.kertas_nama ? {
        nama: s.kertas_nama, gramatur: s.kertas_gramatur,
        grader: s.kertas_grader, merk: s.kertas_merk, supplier: s.kertas_supplier,
      } : null,
    }));

    res.json(doc);
  } catch (err) {
    next(err);
  }
}

// PUT /api/marketing/frpp/:no_frpp/revisi
async function revisiFrpp(req, res, next) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const { no_frpp } = req.params;
    const nik = req.user?.username || req.user?.id || req.user?.nik || 'system';
    const {
      kode_customer, group_order, id_proyek,
      no_po_pemesan, kode_eksternal, nama_order,
      oplah_variants, satuan_oplah, is_proof,
      packing, packing_custom, lain, lain_custom,
      status_order, master_produk,
      ukuran_p, ukuran_l, jenis_order_s3, spesifikasi_items,
      tujuan_pengiriman, bentuk_materi, bentuk_materi_custom, approval_cetak, proses,
      catatan, ket_reprint_revisi,
    } = req.body;

    const jum_pesanan = Number((oplah_variants ?? []).find(v => v.jum)?.jum || 0);
    const ukuran_val  = (ukuran_p || ukuran_l) ? `${ukuran_p || ''}x${ukuran_l || ''}` : null;
    const materi_val  = JSON.stringify([
      ...(bentuk_materi        || []),
      ...(bentuk_materi_custom || []).map(b => b.label).filter(Boolean),
    ]);

    await transaction.begin();

    // Pastikan no_frpp ada
    const chk = await transaction.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`SELECT no_frpp FROM TBL_FRPPDOC WHERE no_frpp = @no_frpp`);
    if (!chk.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });
    }

    // UPDATE TBL_FRPPDOC
    await transaction.request()
      .input('no_frpp',          sql.VarChar(50),       no_frpp)
      .input('kode_customer',    sql.NVarChar(sql.MAX), kode_customer     || null)
      .input('group_order',      sql.NVarChar(sql.MAX), group_order       || null)
      .input('id_proyek',        sql.Int,               id_proyek         ? Number(id_proyek) : null)
      .input('no_po_pemesan',    sql.NVarChar(sql.MAX), no_po_pemesan     || null)
      .input('kode_eksternal',   sql.NVarChar(sql.MAX), kode_eksternal    || null)
      .input('nama_order',       sql.NVarChar(sql.MAX), nama_order        || null)
      .input('jenis_order',      sql.NVarChar(sql.MAX), jenis_order_s3    || null)
      .input('jum_pesanan',      sql.Int,               jum_pesanan)
      .input('satuan',           sql.NVarChar(sql.MAX), satuan_oplah      || null)
      .input('sta_proof',        sql.Int,               (is_proof === 'YA' || is_proof === true || Number(is_proof) === 1) ? 1 : 0)
      .input('status_order',     sql.NVarChar(sql.MAX), status_order      || 'BARU')
      .input('ukuran',           sql.NVarChar(sql.MAX), ukuran_val)
      .input('dikirim_ke',       sql.NVarChar(sql.MAX), tujuan_pengiriman || null)
      .input('acc_cetak',        sql.NVarChar(sql.MAX), approval_cetak    || null)
      .input('keterangan',       sql.NVarChar(sql.MAX), catatan           || null)
      .input('ket_rev_rep',      sql.NVarChar(sql.MAX), ket_reprint_revisi || null)
      .input('master_produk_id', sql.Int,               master_produk?.id ? Number(master_produk.id) : null)
      .input('packing',          sql.NVarChar(sql.MAX), JSON.stringify(packing        || {}))
      .input('packing_custom',   sql.NVarChar(sql.MAX), JSON.stringify(packing_custom || []))
      .input('lain_lain',        sql.NVarChar(sql.MAX), JSON.stringify(lain           || {}))
      .input('lain_custom',      sql.NVarChar(sql.MAX), JSON.stringify(lain_custom    || []))
      .input('oplah_variants',   sql.NVarChar(sql.MAX), JSON.stringify(oplah_variants || []))
      .input('materi',           sql.NVarChar(sql.MAX), materi_val)
      .input('proses',           sql.NVarChar(sql.MAX), JSON.stringify(proses         || []))
      .input('nik_revisi',       sql.NVarChar(sql.MAX), nik)
      .query(`
        UPDATE TBL_FRPPDOC SET
          kode_customer  = @kode_customer,  group_order    = @group_order,
          id_proyek      = @id_proyek,       no_po_pemesan  = @no_po_pemesan,
          kode_eksternal = @kode_eksternal,  nama_order     = @nama_order,
          jenis_order    = @jenis_order,     jum_pesanan    = @jum_pesanan,
          satuan         = @satuan,          sta_proof      = @sta_proof,
          status_order   = @status_order,    ukuran         = @ukuran,
          dikirim_ke     = @dikirim_ke,      acc_cetak      = @acc_cetak,
          keterangan     = @keterangan,      ket_rev_rep    = @ket_rev_rep,
          master_produk_id = @master_produk_id,
          packing        = @packing,         packing_custom = @packing_custom,
          lain_lain      = @lain_lain,       lain_custom    = @lain_custom,
          oplah_variants = @oplah_variants,  materi         = @materi,
          proses         = @proses,          level_status   = 11,
          updated_at     = GETDATE(),        user_input     = @nik_revisi
        WHERE no_frpp = @no_frpp
      `);

    // Hapus spek lama lalu insert ulang
    await transaction.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`DELETE FROM TBL_FRPPSPEK WHERE no_frpp = @no_frpp`);

    for (let i = 0; i < (spesifikasi_items || []).length; i++) {
      const s = spesifikasi_items[i];
      const k = s.jenis_kertas || {};
      await transaction.request()
        .input('no_frpp',              sql.VarChar(50),   no_frpp)
        .input('urutan',               sql.Int,           i + 1)
        .input('jenis_pekerjaan',      sql.NVarChar(100), s.jenis_pekerjaan        || null)
        .input('kertas_nama',          sql.NVarChar(100), k.nama                   || null)
        .input('kertas_gramatur',      sql.NVarChar(20),  k.gramatur != null ? String(k.gramatur) : null)
        .input('kertas_grader',        sql.NVarChar(10),  k.grader                 || null)
        .input('kertas_merk',          sql.NVarChar(100), k.merk                   || null)
        .input('kertas_supplier',      sql.NVarChar(100), k.supplier               || null)
        .input('jenis_cetakan',        sql.NVarChar(20),  s.jenis_cetakan          || null)
        .input('jml_halaman',          sql.Int,           s.jml_halaman            ? Number(s.jml_halaman) : null)
        .input('uv_varnish',           sql.NVarChar(20),  s.uv_varnish             || 'TIDAK')
        .input('emboss',               sql.NVarChar(100), s.emboss                 || null)
        .input('deboss',               sql.NVarChar(100), s.deboss                 || null)
        .input('foil_jenis',           sql.NVarChar(50),  s.foil_jenis             || null)
        .input('foil_jenis_custom',    sql.NVarChar(100), s.foil_jenis_custom      || null)
        .input('foil_ket',             sql.NVarChar(200), s.foil_ket               || null)
        .input('flap',                 sql.NVarChar(100), s.flap                   || null)
        .input('laminasi_jenis',       sql.NVarChar(50),  s.laminasi_jenis         || null)
        .input('laminasi_jenis_custom',sql.NVarChar(100), s.laminasi_jenis_custom  || null)
        .input('uv_spot',              sql.NVarChar(100), s.uv_spot                || null)
        .input('punch_jenis',          sql.NVarChar(50),  s.punch_jenis            || 'Tidak')
        .input('lipat',                sql.NVarChar(100), s.lipat                  || null)
        .input('o_wire',               sql.NVarChar(20),  s.o_wire                 || 'TIDAK')
        .input('spiral',               sql.NVarChar(20),  s.spiral                 || 'TIDAK')
        .input('klem_seng',            sql.NVarChar(20),  s.klem_seng              || 'TIDAK')
        .query(`
          INSERT INTO TBL_FRPPSPEK (
            no_frpp, urutan, jenis_pekerjaan,
            kertas_nama, kertas_gramatur, kertas_grader, kertas_merk, kertas_supplier,
            jenis_cetakan, jml_halaman, uv_varnish, emboss, deboss,
            foil_jenis, foil_jenis_custom, foil_ket, flap,
            laminasi_jenis, laminasi_jenis_custom, uv_spot,
            punch_jenis, lipat, o_wire, spiral, klem_seng
          ) VALUES (
            @no_frpp, @urutan, @jenis_pekerjaan,
            @kertas_nama, @kertas_gramatur, @kertas_grader, @kertas_merk, @kertas_supplier,
            @jenis_cetakan, @jml_halaman, @uv_varnish, @emboss, @deboss,
            @foil_jenis, @foil_jenis_custom, @foil_ket, @flap,
            @laminasi_jenis, @laminasi_jenis_custom, @uv_spot,
            @punch_jenis, @lipat, @o_wire, @spiral, @klem_seng
          )
        `);
    }

    // History status level 11
    const statusRes = await transaction.request()
      .input('lvl', sql.Int, 11)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_11 = statusRes.recordset[0]?.kode_status || null;

    await transaction.request()
      .input('no_frpp',              sql.VarChar(50),  no_frpp)
      .input('level_status_updated', sql.Int,          11)
      .input('kode_status_updated',  sql.VarChar(50),  kode_status_11)
      .input('user_updated',         sql.VarChar(100), nik)
      .input('keterangan',           sql.NVarChar(500), ket_reprint_revisi || 'Dokumen FRPP direvisi')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    await transaction.commit();
    res.json({ message: 'FRPP berhasil direvisi', no_frpp });
  } catch (err) {
    try { await transaction.rollback(); } catch {}
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/approve
async function approve(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 30 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 30)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_30 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 30)
      .input('kode_status_updated', sql.VarChar(50), kode_status_30)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Approved')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'FRPP berhasil di-approve' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/request-approval
async function requestApproval(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { kode_status, keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 20 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 20)
      .input('kode_status_updated', sql.VarChar(50), kode_status || null)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Request Approval')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Request approval berhasil dikirim' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/import-kalkulasi
async function importKalkulasi(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 40 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 40)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_40 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 40)
      .input('kode_status_updated', sql.VarChar(50), kode_status_40)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Import Kalkulasi')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Import kalkulasi berhasil' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/check-kalkulasi
async function checkKalkulasi(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 50 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 50)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_50 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 50)
      .input('kode_status_updated', sql.VarChar(50), kode_status_50)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Sudah Check Kalkulasi')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Check kalkulasi berhasil' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/validate-kalkulasi
async function validateKalkulasi(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 50 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 50)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_50 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 50)
      .input('kode_status_updated', sql.VarChar(50), kode_status_50)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Validasi Kalkulasi')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Validasi kalkulasi berhasil' });
  } catch (err) {
    next(err);
  }
}

// POST /api/marketing/frpp/:no_frpp/request-approval-sph
async function requestApprovalSph(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

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
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 70)
      .input('kode_status_updated', sql.VarChar(50), kode_status_70)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Request Approval SPH')
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

// POST /api/marketing/frpp/:no_frpp/approve-sph
async function approveSph(req, res, next) {
  try {
    const { no_frpp } = req.params;
    const { keterangan } = req.body;
    const user_updated = req.user?.username || req.user?.id || 'system';

    const pool = await getPool();

    const upd = await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .query(`UPDATE TBL_FRPPDOC SET level_status = 80 WHERE no_frpp = @no_frpp`);

    if (upd.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'FRPP tidak ditemukan' });

    const statusRes = await pool.request()
      .input('lvl', sql.Int, 80)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_80 = statusRes.recordset[0]?.kode_status || null;

    await pool.request()
      .input('no_frpp', sql.VarChar(50), no_frpp)
      .input('level_status_updated', sql.Int, 80)
      .input('kode_status_updated', sql.VarChar(50), kode_status_80)
      .input('user_updated', sql.VarChar(100), user_updated)
      .input('keterangan', sql.NVarChar(500), keterangan || 'Approval SPH')
      .query(`
        INSERT INTO tbl_frpp_history_status
          (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
        VALUES
          (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
      `);

    res.json({ message: 'Approval SPH berhasil' });
  } catch (err) {
    next(err);
  }
}

async function getProyekList(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      	  SELECT PRO.id, PRO.tanggal, PRO.kode_customer, CUS.nama nama_customer, PRO.nama, PRO.created_by
      FROM tbl_frpp_proyek PRO LEFT JOIN tbl_Customer CUS ON PRO.kode_customer=CUS.kode
      ORDER BY PRO.tanggal DESC
    `);
    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

async function createProyek(req, res, next) {
  try {
    const { kode_customer, nama, created_by } = req.body;
    const pool   = await getPool();
    const result = await pool.request()
      .input('kode_customer', sql.VarChar(50),  kode_customer || '')
      .input('nama',          sql.NVarChar(200), nama          || '')
      .input('created_by',    sql.NVarChar(100), created_by    || '')
      .query(`
        INSERT INTO tbl_frpp_proyek (tanggal, kode_customer, nama, created_by)
        OUTPUT INSERTED.id
        VALUES (GETDATE(), @kode_customer, @nama, @created_by)
      `);
    res.json({ message: 'Proyek berhasil ditambahkan', id: result.recordset[0].id });
  } catch (err) {
    next(err);
  }
}

async function getJenisOrder(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM v_jenis_order ORDER BY jenis_order`);
    res.json({ data: result.recordset });
  } catch (err) { next(err); }
}

// POST /api/marketing/frpp  — buat dokumen FRPP baru
// Jika ada N oplah variant → buat N dokumen FRPP dengan no_frpp: {NNNN}-{V}/FRPP/{MM}/{YY}
async function createFrpp(req, res, next) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const nik = req.user?.username || req.user?.id || req.user?.nik || 'system';
    const {
      kode_customer, group_order, id_proyek,
      no_po_pemesan, kode_eksternal, nama_order,
      oplah_variants, satuan_oplah, is_proof,
      packing, packing_custom, lain, lain_custom,
      status_order, master_produk,
      ukuran_p, ukuran_l, jenis_order_s3, spesifikasi_items,
      tujuan_pengiriman, bentuk_materi, bentuk_materi_custom, approval_cetak, proses,
      catatan, ket_reprint_revisi,
    } = req.body;

    const variants = (oplah_variants ?? []).filter(v => v.jum);
    if (!variants.length) return res.status(400).json({ message: 'Minimal 1 oplah harus diisi' });

    // no_frpp format: {NNNN}/FRPP/{MM}/{YYYY}-{V}
    const now  = new Date();
    const MM   = String(now.getMonth() + 1).padStart(2, '0');
    const YYYY = String(now.getFullYear());
    const base = `/FRPP/${MM}/${YYYY}`;  // bagian tengah tanpa seq dan variant

    await transaction.begin();

    // Cari base sequence terakhir bulan ini
    // Pola: NNNN/FRPP/MM/YYYY-V  → ambil LEFT sebelum '/'
    const seqRes = await transaction.request()
      .input('pattern', sql.VarChar(30), `%${base}-%`)
      .query(`
        SELECT TOP 1
          CAST(LEFT(no_frpp, CHARINDEX('/', no_frpp) - 1) AS INT) AS base_seq
        FROM TBL_FRPPDOC
        WHERE no_frpp LIKE @pattern
          AND CHARINDEX('/', no_frpp) > 0
          AND ISNUMERIC(LEFT(no_frpp, CHARINDEX('/', no_frpp) - 1)) = 1
        ORDER BY CAST(LEFT(no_frpp, CHARINDEX('/', no_frpp) - 1) AS INT) DESC
      `);

    const baseSeq    = (seqRes.recordset[0]?.base_seq ?? 0) + 1;
    const baseSeqStr = String(baseSeq).padStart(4, '0');

    // Ambil kode_status level 10 sekali saja
    const statusRes = await transaction.request()
      .input('lvl', sql.Int, 10)
      .query(`SELECT kode_status FROM tbl_FRPP_status WHERE level_status = @lvl`);
    const kode_status_10 = statusRes.recordset[0]?.kode_status || null;

    const materi_val      = JSON.stringify([
      ...(bentuk_materi        || []),
      ...(bentuk_materi_custom || []).map(b => b.label).filter(Boolean),
    ]);

    // ukuran: gabung ukuran_p x ukuran_l sebagai string → kolom lama "ukuran"
    const ukuran_val = (ukuran_p || ukuran_l)
      ? `${ukuran_p || ''}x${ukuran_l || ''}`
      : null;

    const no_frpp_list = [];

    for (let v = 0; v < variants.length; v++) {
      const no_frpp     = `${baseSeqStr}${base}-${v + 1}`;
      const jum_pesanan = Number(variants[v].jum || 0);
      no_frpp_list.push(no_frpp);

      // Insert TBL_FRPPDOC — gunakan nama kolom lama
      await transaction.request()
        .input('no_frpp',          sql.VarChar(50),       no_frpp)
        .input('kategori_order',   sql.NVarChar(sql.MAX), 'REGULER')
        .input('nik',              sql.NVarChar(sql.MAX), nik)
        .input('user_input',     sql.NVarChar(sql.MAX), nik)
        .input('kode_customer',  sql.NVarChar(sql.MAX), kode_customer  || null)
        .input('group_order',    sql.NVarChar(sql.MAX), group_order    || null)
        .input('id_proyek',      sql.Int,               id_proyek      ? Number(id_proyek) : null)
        .input('no_po_pemesan',  sql.NVarChar(sql.MAX), no_po_pemesan  || null)
        .input('kode_eksternal', sql.NVarChar(sql.MAX), kode_eksternal || null)
        .input('nama_order',     sql.NVarChar(sql.MAX), nama_order     || null)
        .input('jenis_order',    sql.NVarChar(sql.MAX), jenis_order_s3 || null)
        .input('jum_pesanan',    sql.Int,               jum_pesanan)
        .input('satuan',         sql.NVarChar(sql.MAX), satuan_oplah   || null)
        .input('sta_proof',      sql.Int,               (is_proof === 'YA' || is_proof === true || Number(is_proof) === 1) ? 1 : 0)
        .input('status_order',   sql.NVarChar(sql.MAX), status_order   || 'BARU')
        .input('ukuran',         sql.NVarChar(sql.MAX), ukuran_val)
        .input('dikirim_ke',     sql.NVarChar(sql.MAX), tujuan_pengiriman || null)
        .input('acc_cetak',      sql.NVarChar(sql.MAX), approval_cetak    || null)
        .input('keterangan',     sql.NVarChar(sql.MAX), catatan           || null)
        .input('ket_rev_rep',    sql.NVarChar(sql.MAX), ket_reprint_revisi || null)
        .input('master_produk_id', sql.Int,               master_produk?.id ? Number(master_produk.id) : null)
        .input('packing',        sql.NVarChar(sql.MAX), JSON.stringify(packing        || {}))
        .input('packing_custom', sql.NVarChar(sql.MAX), JSON.stringify(packing_custom || []))
        .input('lain_lain',      sql.NVarChar(sql.MAX), JSON.stringify(lain           || {}))
        .input('lain_custom',    sql.NVarChar(sql.MAX), JSON.stringify(lain_custom    || []))
        .input('oplah_variants', sql.NVarChar(sql.MAX), JSON.stringify(oplah_variants || [])) // kolom baru
        .input('materi',         sql.NVarChar(sql.MAX), materi_val)               // kolom lama: materi
        .input('proses',         sql.NVarChar(sql.MAX), JSON.stringify(proses      || []))
        .query(`
          INSERT INTO TBL_FRPPDOC (
            no_frpp, tgl_frpp, nik, user_input, kategori_order, kode_customer, group_order, id_proyek,
            no_po_pemesan, kode_eksternal, nama_order, jenis_order,
            jum_pesanan, satuan, sta_proof, status_order, ukuran,
            dikirim_ke, acc_cetak, keterangan, ket_rev_rep, master_produk_id,
            packing, packing_custom, lain_lain, lain_custom,
            oplah_variants, materi, proses, level_status
          ) VALUES (
            @no_frpp, GETDATE(), @nik, @user_input, @kategori_order, @kode_customer, @group_order, @id_proyek,
            @no_po_pemesan, @kode_eksternal, @nama_order, @jenis_order,
            @jum_pesanan, @satuan, @sta_proof, @status_order, @ukuran,
            @dikirim_ke, @acc_cetak, @keterangan, @ket_rev_rep, @master_produk_id,
            @packing, @packing_custom, @lain_lain, @lain_custom,
            @oplah_variants, @materi, @proses, 10
          )
        `);

      // Insert TBL_FRPPSPEK
      for (let i = 0; i < (spesifikasi_items || []).length; i++) {
        const s = spesifikasi_items[i];
        const k = s.jenis_kertas || {};
        await transaction.request()
          .input('no_frpp',              sql.VarChar(50),   no_frpp)
          .input('urutan',               sql.Int,           i + 1)
          .input('jenis_pekerjaan',      sql.NVarChar(100), s.jenis_pekerjaan        || null)
          .input('kertas_nama',          sql.NVarChar(100), k.nama                   || null)
          .input('kertas_gramatur',      sql.NVarChar(20),  k.gramatur != null ? String(k.gramatur) : null)
          .input('kertas_grader',        sql.NVarChar(10),  k.grader                 || null)
          .input('kertas_merk',          sql.NVarChar(100), k.merk                   || null)
          .input('kertas_supplier',      sql.NVarChar(100), k.supplier               || null)
          .input('jenis_cetakan',        sql.NVarChar(20),  s.jenis_cetakan          || null)
          .input('jml_halaman',          sql.Int,           s.jml_halaman            ? Number(s.jml_halaman) : null)
          .input('uv_varnish',           sql.NVarChar(20),  s.uv_varnish             || 'TIDAK')
          .input('emboss',               sql.NVarChar(100), s.emboss                 || null)
          .input('deboss',               sql.NVarChar(100), s.deboss                 || null)
          .input('foil_jenis',           sql.NVarChar(50),  s.foil_jenis             || null)
          .input('foil_jenis_custom',    sql.NVarChar(100), s.foil_jenis_custom      || null)
          .input('foil_ket',             sql.NVarChar(200), s.foil_ket               || null)
          .input('flap',                 sql.NVarChar(100), s.flap                   || null)
          .input('laminasi_jenis',       sql.NVarChar(50),  s.laminasi_jenis         || null)
          .input('laminasi_jenis_custom',sql.NVarChar(100), s.laminasi_jenis_custom  || null)
          .input('uv_spot',              sql.NVarChar(100), s.uv_spot                || null)
          .input('punch_jenis',          sql.NVarChar(50),  s.punch_jenis            || 'Tidak')
          .input('lipat',                sql.NVarChar(100), s.lipat                  || null)
          .input('o_wire',               sql.NVarChar(20),  s.o_wire                 || 'TIDAK')
          .input('spiral',               sql.NVarChar(20),  s.spiral                 || 'TIDAK')
          .input('klem_seng',            sql.NVarChar(20),  s.klem_seng              || 'TIDAK')
          .query(`
            INSERT INTO TBL_FRPPSPEK (
              no_frpp, urutan, jenis_pekerjaan,
              kertas_nama, kertas_gramatur, kertas_grader, kertas_merk, kertas_supplier,
              jenis_cetakan, jml_halaman, uv_varnish, emboss, deboss,
              foil_jenis, foil_jenis_custom, foil_ket, flap,
              laminasi_jenis, laminasi_jenis_custom, uv_spot,
              punch_jenis, lipat, o_wire, spiral, klem_seng
            ) VALUES (
              @no_frpp, @urutan, @jenis_pekerjaan,
              @kertas_nama, @kertas_gramatur, @kertas_grader, @kertas_merk, @kertas_supplier,
              @jenis_cetakan, @jml_halaman, @uv_varnish, @emboss, @deboss,
              @foil_jenis, @foil_jenis_custom, @foil_ket, @flap,
              @laminasi_jenis, @laminasi_jenis_custom, @uv_spot,
              @punch_jenis, @lipat, @o_wire, @spiral, @klem_seng
            )
          `);
      }

      // Insert status history
      await transaction.request()
        .input('no_frpp',              sql.VarChar(50),  no_frpp)
        .input('level_status_updated', sql.Int,          10)
        .input('kode_status_updated',  sql.VarChar(50),  kode_status_10)
        .input('user_updated',         sql.VarChar(100), nik)
        .input('keterangan',           sql.NVarChar(500),'Dokumen FRPP dibuat')
        .query(`
          INSERT INTO tbl_frpp_history_status
            (no_frpp, level_status_updated, kode_status_updated, user_updated, keterangan, created_at)
          VALUES
            (@no_frpp, @level_status_updated, @kode_status_updated, @user_updated, @keterangan, GETDATE())
        `);
    }

    await transaction.commit();
    res.status(201).json({
      message: `${no_frpp_list.length} FRPP berhasil disimpan`,
      no_frpp_list,
    });
  } catch (err) {
    try { await transaction.rollback(); } catch {}
    next(err);
  }
}

async function getJenisKertas(req, res, next) {
  try {
    const { q = '' } = req.query;
    const like = `%${q}%`;
    const pool = await getPool();
    const result = await pool.request()
      .input('q1', sql.NVarChar, like)
      .input('q2', sql.NVarChar, like)
      .input('q3', sql.NVarChar, like)
      .input('q4', sql.NVarChar, like)
      .query(`
        SELECT jenis_kertas AS nama, gramatur, grade AS grader, merk, supplier
        FROM tbl_bahanbaku_jeniskertas
        WHERE jenis_kertas LIKE @q1 OR gramatur LIKE @q2 OR merk LIKE @q3 OR supplier LIKE @q4
        ORDER BY jenis_kertas, gramatur, merk, grade
      `);
    res.json({ data: result.recordset });
  } catch (err) { next(err); }
}

async function getJenisPekerjaan(req, res, next) {
  try {
    const { jenis_order } = req.query;
    const pool = await getPool();
    const result = await pool.request()
      .input('JENIS_ORDER', sql.NVarChar, jenis_order || '')
      .query(`
        SELECT UPPER(jns_pekerjaan) AS jns_pekerjaan
        FROM tbl_proses
        WHERE kategori = @JENIS_ORDER AND jns_pekerjaan <> 'Finishing'
        ORDER BY status
      `);
    res.json({ data: result.recordset });
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, createFrpp, revisiFrpp, requestApproval, approve, importKalkulasi, checkKalkulasi, validateKalkulasi, requestApprovalSph, approveSph, getProyekList, createProyek, getJenisOrder, getJenisPekerjaan, getJenisKertas };
