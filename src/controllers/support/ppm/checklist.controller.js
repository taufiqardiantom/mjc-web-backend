const { getPool, sql } = require('../../../config/database');

// ─── getAll ──────────────────────────────────────────────────────────────────
async function getAll(req, res, next) {
  try {
    const { tgl_order_from, tgl_order_to, tgl_deadline_from, tgl_deadline_to } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let dateWhere = '';
    if (tgl_order_from) {
      request.input('tgl_order_from', sql.Date, tgl_order_from);
      dateWhere += ' AND CONVERT(DATE, SPO.tgl_spo) >= @tgl_order_from';
    }
    if (tgl_order_to) {
      request.input('tgl_order_to', sql.Date, tgl_order_to);
      dateWhere += ' AND CONVERT(DATE, SPO.tgl_spo) <= @tgl_order_to';
    }
    if (tgl_deadline_from) {
      request.input('tgl_deadline_from', sql.Date, tgl_deadline_from);
      dateWhere += ' AND CONVERT(DATE, SPO.tgl_selesai) >= @tgl_deadline_from';
    }
    if (tgl_deadline_to) {
      request.input('tgl_deadline_to', sql.Date, tgl_deadline_to);
      dateWhere += ' AND CONVERT(DATE, SPO.tgl_selesai) <= @tgl_deadline_to';
    }

    const result = await request.query(`
      WITH CheckAgg AS (
        SELECT C.no_spo, SP.id_poin,
          SUM(CASE WHEN C.status = 'OK'     THEN 1 ELSE 0 END) AS ok_count,
          SUM(CASE WHEN C.status = 'NOT OK' THEN 1 ELSE 0 END) AS notok_count
        FROM NewProMJC.dbo.tbl_checklistppm_check C
        JOIN NewProMJC.dbo.tbl_checklistppm_subpoin SP ON SP.id = C.id_subpoin
        GROUP BY C.no_spo, SP.id_poin
      ),
      SubpoinTotals AS (
        SELECT id_poin, COUNT(*) AS total
        FROM NewProMJC.dbo.tbl_checklistppm_subpoin
        WHERE is_active = 1
        GROUP BY id_poin
      )
      SELECT
        SPO.tgl_spo, SPO.no_spo, SPO.nama_order, SPO.pemesan, CUS.nama,
        SPO.ukuran_jadi, REPLACE(SPO.jum_pesanan,',','') jum_pesanan,
        SPO.tgl_selesai, SPO.opt_order,
        ISNULL(CA1.ok_count,    0) pp_ok,    ISNULL(CA1.notok_count, 0) pp_notok,    ISNULL(ST1.total, 0) pp_total,
        ISNULL(CA2.ok_count,    0) dok_ok,   ISNULL(CA2.notok_count, 0) dok_notok,   ISNULL(ST2.total, 0) dok_total,
        ISNULL(CA3.ok_count,    0) op_ok,    ISNULL(CA3.notok_count, 0) op_notok,    ISNULL(ST3.total, 0) op_total
      FROM NewProMJC.dbo.tbl_SPODoc SPO
      LEFT JOIN NewProMJC.dbo.tbl_Customer CUS ON SPO.pemesan = CUS.kode
      OUTER APPLY (SELECT TOP 1 id FROM NewProMJC.dbo.tbl_checklistppm_poin WHERE urutan = 1) P1
      OUTER APPLY (SELECT TOP 1 id FROM NewProMJC.dbo.tbl_checklistppm_poin WHERE urutan = 2) P2
      OUTER APPLY (SELECT TOP 1 id FROM NewProMJC.dbo.tbl_checklistppm_poin WHERE urutan = 3) P3
      LEFT JOIN CheckAgg CA1 ON CA1.no_spo = SPO.no_spo AND CA1.id_poin = P1.id
      LEFT JOIN CheckAgg CA2 ON CA2.no_spo = SPO.no_spo AND CA2.id_poin = P2.id
      LEFT JOIN CheckAgg CA3 ON CA3.no_spo = SPO.no_spo AND CA3.id_poin = P3.id
      LEFT JOIN SubpoinTotals ST1 ON ST1.id_poin = P1.id
      LEFT JOIN SubpoinTotals ST2 ON ST2.id_poin = P2.id
      LEFT JOIN SubpoinTotals ST3 ON ST3.id_poin = P3.id
      WHERE RIGHT(SPO.no_subspo, 1) = 'A'
        ${dateWhere}
      ORDER BY SPO.tgl_spo, SPO.no_spo
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getByNospo ───────────────────────────────────────────────────────────────
async function getByNospo(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT SPO.tgl_spo, SPO.no_spo, SPO.nama_order, SPO.pemesan, CUS.nama,
               SPO.ukuran_jadi, REPLACE(SPO.jum_pesanan,',','') jum_pesanan,
               SPO.tgl_selesai, SPO.opt_order,
               '1' check_praproses, '2' check_dokumen, '3' check_onproses, '4' sta_sesuaideadline
        FROM NewProMJC.dbo.tbl_SPODoc SPO
        LEFT JOIN NewProMJC.dbo.tbl_Customer CUS ON SPO.pemesan = CUS.kode
        WHERE SPO.no_spo = @no_spo AND RIGHT(SPO.no_subspo, 1) = 'A'
        ORDER BY SPO.tgl_spo, SPO.no_spo
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getDetail ────────────────────────────────────────────────────────────────
// POST /detail  body: { no_spo }
// Returns: { spo, poin: [{ id, urutan, nama, subpoin: [{ id, urutan, nama, has_detail, check }] }] }
async function getDetail(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();

    const spoResult = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT TOP 1
          SPO.no_spo, SPO.nama_order, SPO.pemesan,
          SPO.ukuran_jadi, REPLACE(SPO.jum_pesanan,',','') AS jum_pesanan,
          SPO.tgl_spo, SPO.tgl_selesai, SPO.opt_order
        FROM NewProMJC.dbo.tbl_SPODoc SPO
        WHERE SPO.no_spo = @no_spo AND RIGHT(SPO.no_subspo, 1) = 'A'
      `);

    if (!spoResult.recordset.length)
      return res.status(404).json({ message: 'SPO tidak ditemukan' });
    const spo = spoResult.recordset[0];

    const poinResult = await pool.request().query(`
      SELECT id, urutan, nama
      FROM NewProMJC.dbo.tbl_checklistppm_poin
      WHERE is_active = 1
      ORDER BY urutan
    `);

    const subResult = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT
          S.id, S.id_poin, S.urutan, S.nama, S.has_detail,
          C.status, C.tgl_check, C.nama_agent, C.keterangan
        FROM NewProMJC.dbo.tbl_checklistppm_subpoin S
        LEFT JOIN NewProMJC.dbo.tbl_checklistppm_check C
          ON C.id_subpoin = S.id AND C.no_spo = @no_spo
        WHERE S.is_active = 1
        ORDER BY S.id_poin, S.urutan
      `);

    const poin = poinResult.recordset.map(p => ({
      id: p.id,
      urutan: p.urutan,
      nama: p.nama,
      subpoin: subResult.recordset
        .filter(s => s.id_poin === p.id)
        .map(s => ({
          id: s.id,
          urutan: s.urutan,
          nama: s.nama,
          has_detail: s.has_detail,
          check: s.status != null ? {
            status: s.status,
            tgl_check: s.tgl_check,
            nama_agent: s.nama_agent,
            keterangan: s.keterangan,
          } : null,
        })),
    }));

    res.json({ spo, poin });
  } catch (err) {
    next(err);
  }
}

// ─── saveCheck ────────────────────────────────────────────────────────────────
// POST /check  body: { no_spo, id_subpoin, status, keterangan }
async function saveCheck(req, res, next) {
  try {
    const { no_spo, id_subpoin, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('id_subpoin', sql.Int, id_subpoin)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_check
          WHERE no_spo = @no_spo AND id_subpoin = @id_subpoin
        )
          UPDATE NewProMJC.dbo.tbl_checklistppm_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND id_subpoin = @id_subpoin
        ELSE
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_check
            (no_spo, id_subpoin, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@no_spo, @id_subpoin, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('id_subpoin', sql.Int, id_subpoin)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO NewProMJC.dbo.tbl_checklistppm_check_history
          (no_spo, id_subpoin, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@no_spo, @id_subpoin, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getCheckHistory ──────────────────────────────────────────────────────────
// POST /check-history  body: { no_spo, id_subpoin }
async function getCheckHistory(req, res, next) {
  try {
    const { no_spo, id_subpoin } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('id_subpoin', sql.Int, id_subpoin)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM NewProMJC.dbo.tbl_checklistppm_check_history
        WHERE no_spo = @no_spo AND id_subpoin = @id_subpoin
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getBahanBaku ─────────────────────────────────────────────────────────────
// POST /bahanbaku/list  body: { no_spo }
// TODO: Ganti nama tabel bahan baku sesuai yang ada di database (tbl_BahanBaku)
//       Kolom yang dibutuhkan: spek, kode_bahan, nama_bahan, ukuran, satuan, jumlah
async function getBahanBaku(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();
    // const result = await pool.request()
    //   .input('no_spo', sql.NVarChar, no_spo)
    //   .query(`
    //     SELECT
    //       BB.spek, BB.kode_bahan, BB.nama_bahan, BB.ukuran, BB.satuan, BB.jumlah,
    //       CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
    //     FROM NewProMJC.dbo.tbl_BahanBaku BB
    //     LEFT JOIN NewProMJC.dbo.tbl_checklistppm_bahanbaku_check CHK
    //       ON CHK.no_spo = @no_spo AND CHK.kode_bahan = BB.kode_bahan
    //     WHERE BB.no_spo = @no_spo
    //     ORDER BY BB.kode_bahan
    //   `);
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECt SPO.no_spo, SPO.no_subspo, UPPER(BONDET.jenis_pekerjaan) spek, BONDET.asal_kertas, BONDET.kode_bahan,BB.nama_bahan, BB.ukuran, BB.unit satuan, BONDET.jumlah
		, CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
		FROM NewProMJC.dbo.tbl_SPODoc SPO 
		LEFT JOIN NewProMJC.dbo.tbl_BonKertasDoc BON ON BON.NO_SPO=SPO.no_subspo
		LEFT JOIN NewProMJC.dbo.tbl_BonKertasDetail BONDET ON BON.bon_kertas=BONDET.bon_kertas
		LEFT JOIN NewProMJC.dbo.tbl_bahanbaku BB ON BB.kode_bahan=BONDET.kode_bahan
		LEFT JOIN NewProMJC.dbo.tbl_checklistppm_bahanbaku_check CHK ON CHK.no_spo=SPO.no_spo AND CHK.kode_bahan=BONDET.kode_bahan AND CHK.spek=UPPER(BONDET.jenis_pekerjaan)
		WHERE SPO.no_spo = @no_spo
		ORDER BY TANGGAL DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── saveBahanBakuCheck ───────────────────────────────────────────────────────
// POST /bahanbaku/check  body: { no_spo, spek, kode_bahan, status, keterangan }
async function saveBahanBakuCheck(req, res, next) {
  try {
    const { no_spo, spek, kode_bahan, status, keterangan } = req.body;
    const spekVal = (spek ?? '').trim();
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('spek', sql.NVarChar, spekVal)
      .input('kode_bahan', sql.NVarChar, kode_bahan)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_check
          WHERE no_spo = @no_spo AND spek = @spek AND kode_bahan = @kode_bahan
        )
          UPDATE NewProMJC.dbo.tbl_checklistppm_bahanbaku_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND spek = @spek AND kode_bahan = @kode_bahan
        ELSE
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanbaku_check
            (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@no_spo, @spek, @kode_bahan, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('spek', sql.NVarChar, spekVal)
      .input('kode_bahan', sql.NVarChar, kode_bahan)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanbaku_history
          (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@no_spo, @spek, @kode_bahan, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check bahan baku berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getBahanBakuHistory ──────────────────────────────────────────────────────
// POST /bahanbaku/history  body: { no_spo, spek, kode_bahan }
async function getBahanBakuHistory(req, res, next) {
  try {
    const { no_spo, spek, kode_bahan } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('spek', sql.NVarChar, (spek ?? '').trim())
      .input('kode_bahan', sql.NVarChar, kode_bahan)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_history
        WHERE no_spo = @no_spo AND spek = @spek AND kode_bahan = @kode_bahan
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getBahanPendukung ────────────────────────────────────────────────────────
// POST /bahanpendukung/list  body: { no_spo }
// Auto-seeds RPO items (Tinta Khusus / Foil Khusus) on first load, then returns
// all items with check data + sumber (no_subrpo for RPO items, 'Manual' for custom).
async function getBahanPendukung(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();

    // Auto-insert RPO items if not yet seeded for this SPO
    await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung (no_spo, nama_bahan, kode_khusus, is_custom)
        SELECT DISTINCT @no_spo, X.jenis, '', 0
        FROM NewProMJC.dbo.tbl_RPODoc A
        LEFT JOIN NewProMJC.dbo.TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
        CROSS APPLY (
          SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
          UNION ALL
          SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
        ) X
        WHERE B.no_kalkulasi NOT LIKE '%BM%'
          AND B.no_spo = @no_spo
          AND NOT EXISTS (
            SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung
            WHERE no_spo = @no_spo AND nama_bahan = X.jenis AND is_custom = 0
          )
      `);

    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT
          BP.id, BP.nama_bahan, BP.kode_khusus, BP.is_custom,
          CASE WHEN BP.is_custom = 0
            THEN ISNULL(RPO.no_subrpo, '-')
            ELSE 'Manual'
          END AS sumber,
          CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
        FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung BP
        LEFT JOIN (
          SELECT DISTINCT X.jenis, A.no_subrpo, B.no_spo
          FROM NewProMJC.dbo.tbl_RPODoc A
          JOIN NewProMJC.dbo.TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
          CROSS APPLY (
            SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
            UNION ALL
            SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
          ) X
          WHERE B.no_spo = @no_spo AND B.no_kalkulasi NOT LIKE '%BM%'
        ) RPO ON RPO.jenis = BP.nama_bahan AND RPO.no_spo = @no_spo AND BP.is_custom = 0
        LEFT JOIN NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check CHK
          ON CHK.id_bahanpendukung = BP.id
        WHERE BP.no_spo = @no_spo
        ORDER BY BP.is_custom ASC, BP.created_at ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── addBahanPendukung ────────────────────────────────────────────────────────
// POST /bahanpendukung/add  body: { no_spo, nama_bahan, kode_khusus }
async function addBahanPendukung(req, res, next) {
  try {
    const { no_spo, nama_bahan, kode_khusus } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .input('nama_bahan', sql.NVarChar, nama_bahan)
      .input('kode_khusus', sql.NVarChar, kode_khusus || null)
      .query(`
        INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung
          (no_spo, nama_bahan, kode_khusus, is_custom)
        OUTPUT
          INSERTED.id, INSERTED.nama_bahan, INSERTED.kode_khusus,
          INSERTED.is_custom, INSERTED.created_at
        VALUES
          (@no_spo, @nama_bahan, @kode_khusus, 1)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    next(err);
  }
}

// ─── saveBahanPendukungCheck ──────────────────────────────────────────────────
// POST /bahanpendukung/check  body: { id_bahanpendukung, no_spo, status, keterangan }
async function saveBahanPendukungCheck(req, res, next) {
  try {
    const { id_bahanpendukung, no_spo, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('id_bp', sql.Int, id_bahanpendukung)
      .input('no_spo', sql.NVarChar, no_spo)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check
          WHERE id_bahanpendukung = @id_bp
        )
          UPDATE NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE id_bahanpendukung = @id_bp
        ELSE
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check
            (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@id_bp, @no_spo, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('id_bp', sql.Int, id_bahanpendukung)
      .input('no_spo', sql.NVarChar, no_spo)
      .input('status', sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung_history
          (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@id_bp, @no_spo, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check bahan pendukung berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getBahanPendukungHistory ─────────────────────────────────────────────────
// POST /bahanpendukung/history  body: { id_bahanpendukung }
async function getBahanPendukungHistory(req, res, next) {
  try {
    const { id_bahanpendukung } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id_bp', sql.Int, id_bahanpendukung)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_history
        WHERE id_bahanpendukung = @id_bp
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── bulkCheck ───────────────────────────────────────────────────────────────
// POST /bulk-check  body: { no_spo, id_poin, status, keterangan, tgl_check }
// Updates all subpoin + bahan baku + bahan pendukung under a poin in one call.
async function bulkCheck(req, res, next) {
  try {
    const { no_spo, id_poin, status, keterangan, tgl_check } = req.body;
    const nama_agent = req.user.full_name;
    const tgl_check_dt = new Date(tgl_check + 'T00:00:00');
    const pool = await getPool();

    // ── 1. Upsert all subpoin checks under this poin ──────────────────────────
    await pool.request()
      .input('no_spo',      sql.NVarChar,  no_spo)
      .input('id_poin',     sql.Int,       id_poin)
      .input('status',      sql.NVarChar,  status)
      .input('nama_agent',  sql.NVarChar,  nama_agent)
      .input('keterangan',  sql.NVarChar,  keterangan || null)
      .input('tgl_check',   sql.DateTime,  tgl_check_dt)
      .query(`
        DECLARE @ids TABLE (id INT);
        INSERT INTO @ids
          SELECT id FROM NewProMJC.dbo.tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND is_active = 1;

        UPDATE C
          SET status      = @status,    tgl_check  = @tgl_check,
              nama_agent  = @nama_agent, keterangan = @keterangan,
              updated_at  = GETDATE()
          FROM NewProMJC.dbo.tbl_checklistppm_check C
          WHERE C.no_spo = @no_spo AND C.id_subpoin IN (SELECT id FROM @ids);

        INSERT INTO NewProMJC.dbo.tbl_checklistppm_check
          (no_spo, id_subpoin, status, tgl_check, nama_agent, keterangan, updated_at)
          SELECT @no_spo, id, @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
          FROM @ids
          WHERE id NOT IN (
            SELECT id_subpoin FROM NewProMJC.dbo.tbl_checklistppm_check WHERE no_spo = @no_spo
          );

        INSERT INTO NewProMJC.dbo.tbl_checklistppm_check_history
          (no_spo, id_subpoin, status, tgl_check, nama_agent, keterangan)
          SELECT @no_spo, id, @status, @tgl_check, @nama_agent, @keterangan FROM @ids;
      `);

    // ── 2. Bahan Baku bulk check (only if poin has a bahan_baku subpoin) ──────
    await pool.request()
      .input('no_spo',      sql.NVarChar,  no_spo)
      .input('id_poin',     sql.Int,       id_poin)
      .input('status',      sql.NVarChar,  status)
      .input('nama_agent',  sql.NVarChar,  nama_agent)
      .input('keterangan',  sql.NVarChar,  keterangan || null)
      .input('tgl_check',   sql.DateTime,  tgl_check_dt)
      .query(`
        IF EXISTS (
          SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND has_detail = 'bahan_baku' AND is_active = 1
        )
        BEGIN
          UPDATE CHK
            SET status     = @status,     tgl_check  = @tgl_check,
                nama_agent = @nama_agent, keterangan = @keterangan,
                updated_at = GETDATE()
            FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_check CHK
            WHERE CHK.no_spo = @no_spo;

          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanbaku_check
            (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan, updated_at)
            SELECT DISTINCT @no_spo, UPPER(BONDET.jenis_pekerjaan), BONDET.kode_bahan,
                   @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
            FROM NewProMJC.dbo.tbl_SPODoc SPO
            LEFT JOIN NewProMJC.dbo.tbl_BonKertasDoc    BON    ON BON.NO_SPO    = SPO.no_subspo
            LEFT JOIN NewProMJC.dbo.tbl_BonKertasDetail BONDET ON BONDET.bon_kertas = BON.bon_kertas
            WHERE SPO.no_spo = @no_spo
              AND BONDET.kode_bahan IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_check
                WHERE no_spo    = @no_spo
                  AND spek      = UPPER(BONDET.jenis_pekerjaan)
                  AND kode_bahan = BONDET.kode_bahan
              );

          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanbaku_history
            (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan)
            SELECT DISTINCT @no_spo, UPPER(BONDET.jenis_pekerjaan), BONDET.kode_bahan,
                   @status, @tgl_check, @nama_agent, @keterangan
            FROM NewProMJC.dbo.tbl_SPODoc SPO
            LEFT JOIN NewProMJC.dbo.tbl_BonKertasDoc    BON    ON BON.NO_SPO    = SPO.no_subspo
            LEFT JOIN NewProMJC.dbo.tbl_BonKertasDetail BONDET ON BONDET.bon_kertas = BON.bon_kertas
            WHERE SPO.no_spo = @no_spo AND BONDET.kode_bahan IS NOT NULL;
        END
      `);

    // ── 3. Bahan Pendukung bulk check (auto-seed RPO first, then upsert) ──────
    await pool.request()
      .input('no_spo',      sql.NVarChar,  no_spo)
      .input('id_poin',     sql.Int,       id_poin)
      .input('status',      sql.NVarChar,  status)
      .input('nama_agent',  sql.NVarChar,  nama_agent)
      .input('keterangan',  sql.NVarChar,  keterangan || null)
      .input('tgl_check',   sql.DateTime,  tgl_check_dt)
      .query(`
        IF EXISTS (
          SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND has_detail = 'bahan_pendukung' AND is_active = 1
        )
        BEGIN
          -- Auto-seed RPO items (mirrors getBahanPendukung seeding)
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung (no_spo, nama_bahan, kode_khusus, is_custom)
          SELECT DISTINCT @no_spo, X.jenis, '', 0
          FROM NewProMJC.dbo.tbl_RPODoc A
          LEFT JOIN NewProMJC.dbo.TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
          CROSS APPLY (
            SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
            UNION ALL
            SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
          ) X
          WHERE B.no_kalkulasi NOT LIKE '%BM%'
            AND B.no_spo = @no_spo
            AND NOT EXISTS (
              SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung
              WHERE no_spo = @no_spo AND nama_bahan = X.jenis AND is_custom = 0
            );

          -- Update existing checks
          UPDATE CHK
            SET status     = @status,     tgl_check  = @tgl_check,
                nama_agent = @nama_agent, keterangan = @keterangan,
                updated_at = GETDATE()
            FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check CHK
            JOIN NewProMJC.dbo.tbl_checklistppm_bahanpendukung BP ON BP.id = CHK.id_bahanpendukung
            WHERE BP.no_spo = @no_spo;

          -- Insert missing checks
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check
            (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan, updated_at)
            SELECT BP.id, @no_spo, @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
            FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung BP
            WHERE BP.no_spo = @no_spo
              AND NOT EXISTS (
                SELECT 1 FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_check
                WHERE id_bahanpendukung = BP.id
              );

          -- History
          INSERT INTO NewProMJC.dbo.tbl_checklistppm_bahanpendukung_history
            (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan)
            SELECT BP.id, @no_spo, @status, @tgl_check, @nama_agent, @keterangan
            FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung BP
            WHERE BP.no_spo = @no_spo;
        END
      `);

    res.json({ message: 'Bulk check berhasil disimpan' });
  } catch (err) {
    next(err);
  }
}

// ─── getDailyReport ───────────────────────────────────────────────────────────
// POST /report/daily  body: { tanggal, agent }
// Returns unified check history: subpoin + bahan baku + bahan pendukung
async function getDailyReport(req, res, next) {
  try {
    const { tanggal, agent = '' } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('tanggal', sql.Date, tanggal)
      .input('agent', sql.NVarChar, agent)
      .query(`
        -- Subpoin checks
        SELECT
          H.no_spo,
          P.nama      AS poin,
          SP.nama     AS subpoin,
          ''          AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                       AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')       AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                          AS keterangan,
          H.nama_agent
        FROM NewProMJC.dbo.tbl_checklistppm_check_history H
        JOIN NewProMJC.dbo.tbl_checklistppm_subpoin SP ON SP.id = H.id_subpoin
        JOIN NewProMJC.dbo.tbl_checklistppm_poin    P  ON P.id  = SP.id_poin
        LEFT JOIN NewProMJC.dbo.tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE CONVERT(DATE, H.tgl_check) = @tanggal
          AND (@agent = '' OR H.nama_agent = @agent)

        UNION ALL

        -- Bahan baku checks
        SELECT
          H.no_spo,
          ISNULL((SELECT TOP 1 P2.nama
                  FROM NewProMJC.dbo.tbl_checklistppm_poin P2
                  JOIN NewProMJC.dbo.tbl_checklistppm_subpoin SP2 ON SP2.id_poin = P2.id
                  WHERE SP2.has_detail = 'bahan_baku' AND SP2.is_active = 1), '-')         AS poin,
          ISNULL((SELECT TOP 1 SP2.nama
                  FROM NewProMJC.dbo.tbl_checklistppm_subpoin SP2
                  WHERE SP2.has_detail = 'bahan_baku' AND SP2.is_active = 1), 'Bahan Baku') AS subpoin,
          ISNULL(H.spek,'') + CASE WHEN ISNULL(H.kode_bahan,'') <> '' THEN ' / ' + H.kode_bahan ELSE '' END AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                       AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')       AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                          AS keterangan,
          H.nama_agent
        FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_history H
        LEFT JOIN NewProMJC.dbo.tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE CONVERT(DATE, H.tgl_check) = @tanggal
          AND (@agent = '' OR H.nama_agent = @agent)

        UNION ALL

        -- Bahan pendukung checks
        SELECT
          H.no_spo,
          ISNULL((SELECT TOP 1 P2.nama
                  FROM NewProMJC.dbo.tbl_checklistppm_poin P2
                  JOIN NewProMJC.dbo.tbl_checklistppm_subpoin SP2 ON SP2.id_poin = P2.id
                  WHERE SP2.has_detail = 'bahan_pendukung' AND SP2.is_active = 1), '-')             AS poin,
          ISNULL((SELECT TOP 1 SP2.nama
                  FROM NewProMJC.dbo.tbl_checklistppm_subpoin SP2
                  WHERE SP2.has_detail = 'bahan_pendukung' AND SP2.is_active = 1), 'Bahan Pendukung') AS subpoin,
          ISNULL(BP.nama_bahan,'')                         AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                       AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')       AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                          AS keterangan,
          H.nama_agent
        FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_history H
        LEFT JOIN NewProMJC.dbo.tbl_checklistppm_bahanpendukung BP ON BP.id = H.id_bahanpendukung
        LEFT JOIN NewProMJC.dbo.tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE CONVERT(DATE, H.tgl_check) = @tanggal
          AND (@agent = '' OR H.nama_agent = @agent)

        ORDER BY tgl_check, no_spo, poin
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getReportAgents ──────────────────────────────────────────────────────────
// GET /report/agents
async function getReportAgents(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT nama_agent
      FROM (
        SELECT nama_agent FROM NewProMJC.dbo.tbl_checklistppm_check_history
        UNION
        SELECT nama_agent FROM NewProMJC.dbo.tbl_checklistppm_bahanbaku_history
        UNION
        SELECT nama_agent FROM NewProMJC.dbo.tbl_checklistppm_bahanpendukung_history
      ) A
      WHERE nama_agent IS NOT NULL AND nama_agent <> ''
      ORDER BY nama_agent
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAll,
  getByNospo,
  getDetail,
  saveCheck,
  getCheckHistory,
  getBahanBaku,
  saveBahanBakuCheck,
  getBahanBakuHistory,
  getBahanPendukung,
  addBahanPendukung,
  saveBahanPendukungCheck,
  getBahanPendukungHistory,
  bulkCheck,
  getDailyReport,
  getReportAgents,
};
