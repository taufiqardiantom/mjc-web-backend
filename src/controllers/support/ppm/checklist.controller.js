const { getPool, sql } = require('../../../config/database');

// ─── getAll ──────────────────────────────────────────────────────────────────
async function getAll(req, res, next) {
  try {
    const { tgl_order_from, tgl_order_to, tgl_deadline_from, tgl_deadline_to } = req.query;
    const pool = await getPool();
    const request = pool.request();

    // Default: first day of 2 months ago when not supplied
    const now = new Date();
    const defaultAwal = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const defaultAkhir = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);

    request.input('tgl_awal',  sql.Date, tgl_order_from || defaultAwal);
    request.input('tgl_akhir', sql.Date, tgl_order_to   || defaultAkhir);

    let extraWhere = '';
    if (tgl_deadline_from) {
      request.input('tgl_deadline_from', sql.Date, tgl_deadline_from);
      extraWhere += ' AND CONVERT(DATE, SPO.tgl_selesai) >= @tgl_deadline_from';
    }
    if (tgl_deadline_to) {
      request.input('tgl_deadline_to', sql.Date, tgl_deadline_to);
      extraWhere += ' AND CONVERT(DATE, SPO.tgl_selesai) <= @tgl_deadline_to';
    }

    const result = await request.query(`
      WITH CheckAgg AS (
        SELECT C.no_spo, SP.id_poin,
          SUM(CASE WHEN C.status = 'OK'     THEN 1 ELSE 0 END) AS ok_count,
          SUM(CASE WHEN C.status = 'NOT OK' THEN 1 ELSE 0 END) AS notok_count
        FROM tbl_checklistppm_check C
        JOIN tbl_checklistppm_subpoin SP ON SP.id = C.id_subpoin
        GROUP BY C.no_spo, SP.id_poin
      ),
      SubpoinTotals AS (
        SELECT id_poin, COUNT(*) AS total
        FROM tbl_checklistppm_subpoin
        WHERE is_active = 1
        GROUP BY id_poin
      )
      SELECT
        SPO.tgl_spo, SPO.no_spo, SPO.nama_order, SPO.pemesan kode, CUS.nama pemesan,
        SPO.ukuran_jadi, REPLACE(SPO.jum_pesanan,',','') jum_pesanan,
        MTS.terima, MTS.kirim, MTS.konv, MTS.adj, MTS.kl_oplah, MTS.kl_kirim, MTS.saldo_akhir,
        SPO.tgl_selesai, INN_DL.terima_dl,
        INN_DL.terima_dl*1.0/CONVERT(DECIMAL,REPLACE(SPO.jum_pesanan,',','')) persen_terima_dl,
        IIF(CONVERT(DATE,GETDATE())<=CONVERT(DATE,tgl_selesai),'process',
          IIF(INN_DL.terima_dl*1.0/CONVERT(DECIMAL,REPLACE(SPO.jum_pesanan,',',''))<0.95,'Late','On-Time')) sta_terima_dl,
        IIF(INN_DL.terima_dl*1.0/CONVERT(DECIMAL,REPLACE(SPO.jum_pesanan,',',''))<0.95,'Late','On-Time') sta_terima_dl2,
        SPO.opt_order,
        ISNULL(CA1.ok_count,    0) pp_ok,    ISNULL(CA1.notok_count, 0) pp_notok,    ISNULL(ST1.total, 0) pp_total,
        ISNULL(CA2.ok_count,    0) dok_ok,   ISNULL(CA2.notok_count, 0) dok_notok,   ISNULL(ST2.total, 0) dok_total,
        ISNULL(CA3.ok_count,    0) op_ok,    ISNULL(CA3.notok_count, 0) op_notok,    ISNULL(ST3.total, 0) op_total
      FROM tbl_SPODoc SPO
      LEFT JOIN tbl_Customer CUS ON SPO.pemesan = CUS.kode
      OUTER APPLY (SELECT TOP 1 id FROM tbl_checklistppm_poin WHERE urutan = 1) P1
      OUTER APPLY (SELECT TOP 1 id FROM tbl_checklistppm_poin WHERE urutan = 2) P2
      OUTER APPLY (SELECT TOP 1 id FROM tbl_checklistppm_poin WHERE urutan = 3) P3
      LEFT JOIN CheckAgg CA1 ON CA1.no_spo = SPO.no_spo AND CA1.id_poin = P1.id
      LEFT JOIN CheckAgg CA2 ON CA2.no_spo = SPO.no_spo AND CA2.id_poin = P2.id
      LEFT JOIN CheckAgg CA3 ON CA3.no_spo = SPO.no_spo AND CA3.id_poin = P3.id
      LEFT JOIN SubpoinTotals ST1 ON ST1.id_poin = P1.id
      LEFT JOIN SubpoinTotals ST2 ON ST2.id_poin = P2.id
      LEFT JOIN SubpoinTotals ST3 ON ST3.id_poin = P3.id
      LEFT JOIN (SELECT no_spo, terima, kirim, konv, adj, kl_oplah, kl_kirim, saldo_akhir
        FROM mon_stok_periode_end(@tgl_awal, GETDATE())) MTS ON MTS.no_spo = SPO.no_spo
      CROSS APPLY (SELECT terima terima_dl
        FROM mon_stok_periode_end(@tgl_awal, SPO.tgl_selesai) WHERE no_spo = SPO.no_spo) INN_DL
      WHERE RIGHT(SPO.no_subspo, 1) = 'A'
        AND CONVERT(DATE, SPO.tgl_spo) BETWEEN @tgl_awal AND @tgl_akhir
        ${extraWhere}
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
        FROM tbl_SPODoc SPO
        LEFT JOIN tbl_Customer CUS ON SPO.pemesan = CUS.kode
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
        FROM tbl_SPODoc SPO
        WHERE SPO.no_spo = @no_spo AND RIGHT(SPO.no_subspo, 1) = 'A'
      `);

    if (!spoResult.recordset.length)
      return res.status(404).json({ message: 'SPO tidak ditemukan' });
    const spo = spoResult.recordset[0];

    const poinResult = await pool.request().query(`
      SELECT id, urutan, nama
      FROM tbl_checklistppm_poin
      WHERE is_active = 1
      ORDER BY urutan
    `);

    const subResult = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT
          S.id, S.id_poin, S.urutan, S.nama, S.has_detail,
          C.status, C.tgl_check, C.nama_agent, C.keterangan
        FROM tbl_checklistppm_subpoin S
        LEFT JOIN tbl_checklistppm_check C
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
          SELECT 1 FROM tbl_checklistppm_check
          WHERE no_spo = @no_spo AND id_subpoin = @id_subpoin
        )
          UPDATE tbl_checklistppm_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND id_subpoin = @id_subpoin
        ELSE
          INSERT INTO tbl_checklistppm_check
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
        INSERT INTO tbl_checklistppm_check_history
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
        FROM tbl_checklistppm_check_history
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
    //     FROM tbl_BahanBaku BB
    //     LEFT JOIN tbl_checklistppm_bahanbaku_check CHK
    //       ON CHK.no_spo = @no_spo AND CHK.kode_bahan = BB.kode_bahan
    //     WHERE BB.no_spo = @no_spo
    //     ORDER BY BB.kode_bahan
    //   `);
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT SPO.no_spo, SPO.no_subspo, UPPER(BONDET.jenis_pekerjaan) spek, BONDET.asal_kertas, BONDET.kode_bahan,
               BB.nama_bahan, BB.ukuran, BB.unit satuan, BONDET.jumlah,
               STOK.rumus_acc stok_aktual, STOK.rumus_byg stok_bayang,
               IIF(BONDET.jumlah<=STOK.rumus_acc,'CUKUP','KURANG') sta_stok_aktual,
               IIF(BONDET.jumlah<=STOK.rumus_byg,'CUKUP','KURANG') sta_stok_bayang,
               IIF(
                 IIF(BONDET.jumlah<=STOK.rumus_acc,'CUKUP','KURANG')='CUKUP'
                 AND IIF(BONDET.jumlah<=STOK.rumus_byg,'CUKUP','KURANG')='CUKUP',
                 'CUKUP','KURANG'
               ) sta_stok_all,
               CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
        FROM tbl_SPODoc SPO
        LEFT JOIN tbl_BonKertasDoc BON ON BON.NO_SPO=SPO.no_subspo
        LEFT JOIN tbl_BonKertasDetail BONDET ON BON.bon_kertas=BONDET.bon_kertas
        LEFT JOIN tbl_bahanbaku BB ON BB.kode_bahan=BONDET.kode_bahan
        LEFT JOIN tbl_checklistppm_bahanbaku_check CHK
          ON CHK.no_spo=SPO.no_spo AND CHK.kode_bahan=BONDET.kode_bahan AND CHK.spek=UPPER(BONDET.jenis_pekerjaan)
        LEFT JOIN v_kertas_stock_banding STOK ON STOK.kode_bahan=BONDET.kode_bahan
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
          SELECT 1 FROM tbl_checklistppm_bahanbaku_check
          WHERE no_spo = @no_spo AND spek = @spek AND kode_bahan = @kode_bahan
        )
          UPDATE tbl_checklistppm_bahanbaku_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND spek = @spek AND kode_bahan = @kode_bahan
        ELSE
          INSERT INTO tbl_checklistppm_bahanbaku_check
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
        INSERT INTO tbl_checklistppm_bahanbaku_history
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
        FROM tbl_checklistppm_bahanbaku_history
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
        INSERT INTO tbl_checklistppm_bahanpendukung (no_spo, nama_bahan, kode_khusus, is_custom)
        SELECT DISTINCT @no_spo, X.jenis, '', 0
        FROM tbl_RPODoc A
        LEFT JOIN TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
        CROSS APPLY (
          SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
          UNION ALL
          SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
        ) X
        WHERE B.no_kalkulasi NOT LIKE '%BM%'
          AND B.no_spo = @no_spo
          AND NOT EXISTS (
            SELECT 1 FROM tbl_checklistppm_bahanpendukung
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
        FROM tbl_checklistppm_bahanpendukung BP
        LEFT JOIN (
          SELECT DISTINCT X.jenis, A.no_subrpo, B.no_spo
          FROM tbl_RPODoc A
          JOIN TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
          CROSS APPLY (
            SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
            UNION ALL
            SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
          ) X
          WHERE B.no_spo = @no_spo AND B.no_kalkulasi NOT LIKE '%BM%'
        ) RPO ON RPO.jenis = BP.nama_bahan AND RPO.no_spo = @no_spo AND BP.is_custom = 0
        LEFT JOIN tbl_checklistppm_bahanpendukung_check CHK
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
        INSERT INTO tbl_checklistppm_bahanpendukung
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
          SELECT 1 FROM tbl_checklistppm_bahanpendukung_check
          WHERE id_bahanpendukung = @id_bp
        )
          UPDATE tbl_checklistppm_bahanpendukung_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE id_bahanpendukung = @id_bp
        ELSE
          INSERT INTO tbl_checklistppm_bahanpendukung_check
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
        INSERT INTO tbl_checklistppm_bahanpendukung_history
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
        FROM tbl_checklistppm_bahanpendukung_history
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
          SELECT id FROM tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND is_active = 1;

        UPDATE C
          SET status      = @status,    tgl_check  = @tgl_check,
              nama_agent  = @nama_agent, keterangan = @keterangan,
              updated_at  = GETDATE()
          FROM tbl_checklistppm_check C
          WHERE C.no_spo = @no_spo AND C.id_subpoin IN (SELECT id FROM @ids);

        INSERT INTO tbl_checklistppm_check
          (no_spo, id_subpoin, status, tgl_check, nama_agent, keterangan, updated_at)
          SELECT @no_spo, id, @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
          FROM @ids
          WHERE id NOT IN (
            SELECT id_subpoin FROM tbl_checklistppm_check WHERE no_spo = @no_spo
          );

        INSERT INTO tbl_checklistppm_check_history
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
          SELECT 1 FROM tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND has_detail = 'bahan_baku' AND is_active = 1
        )
        BEGIN
          UPDATE CHK
            SET status     = @status,     tgl_check  = @tgl_check,
                nama_agent = @nama_agent, keterangan = @keterangan,
                updated_at = GETDATE()
            FROM tbl_checklistppm_bahanbaku_check CHK
            WHERE CHK.no_spo = @no_spo;

          INSERT INTO tbl_checklistppm_bahanbaku_check
            (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan, updated_at)
            SELECT DISTINCT @no_spo, UPPER(BONDET.jenis_pekerjaan), BONDET.kode_bahan,
                   @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
            FROM tbl_SPODoc SPO
            LEFT JOIN tbl_BonKertasDoc    BON    ON BON.NO_SPO    = SPO.no_subspo
            LEFT JOIN tbl_BonKertasDetail BONDET ON BONDET.bon_kertas = BON.bon_kertas
            WHERE SPO.no_spo = @no_spo
              AND BONDET.kode_bahan IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM tbl_checklistppm_bahanbaku_check
                WHERE no_spo    = @no_spo
                  AND spek      = UPPER(BONDET.jenis_pekerjaan)
                  AND kode_bahan = BONDET.kode_bahan
              );

          INSERT INTO tbl_checklistppm_bahanbaku_history
            (no_spo, spek, kode_bahan, status, tgl_check, nama_agent, keterangan)
            SELECT DISTINCT @no_spo, UPPER(BONDET.jenis_pekerjaan), BONDET.kode_bahan,
                   @status, @tgl_check, @nama_agent, @keterangan
            FROM tbl_SPODoc SPO
            LEFT JOIN tbl_BonKertasDoc    BON    ON BON.NO_SPO    = SPO.no_subspo
            LEFT JOIN tbl_BonKertasDetail BONDET ON BONDET.bon_kertas = BON.bon_kertas
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
          SELECT 1 FROM tbl_checklistppm_subpoin
          WHERE id_poin = @id_poin AND has_detail = 'bahan_pendukung' AND is_active = 1
        )
        BEGIN
          -- Auto-seed RPO items (mirrors getBahanPendukung seeding)
          INSERT INTO tbl_checklistppm_bahanpendukung (no_spo, nama_bahan, kode_khusus, is_custom)
          SELECT DISTINCT @no_spo, X.jenis, '', 0
          FROM tbl_RPODoc A
          LEFT JOIN TBL_KALKULASIDOC B ON A.no_subrpo = B.no_subrpo
          CROSS APPLY (
            SELECT 'Tinta Khusus' AS jenis WHERE A.tinta = 1
            UNION ALL
            SELECT 'Foil Khusus'  AS jenis WHERE A.sta_foilkhusus = 1
          ) X
          WHERE B.no_kalkulasi NOT LIKE '%BM%'
            AND B.no_spo = @no_spo
            AND NOT EXISTS (
              SELECT 1 FROM tbl_checklistppm_bahanpendukung
              WHERE no_spo = @no_spo AND nama_bahan = X.jenis AND is_custom = 0
            );

          -- Update existing checks
          UPDATE CHK
            SET status     = @status,     tgl_check  = @tgl_check,
                nama_agent = @nama_agent, keterangan = @keterangan,
                updated_at = GETDATE()
            FROM tbl_checklistppm_bahanpendukung_check CHK
            JOIN tbl_checklistppm_bahanpendukung BP ON BP.id = CHK.id_bahanpendukung
            WHERE BP.no_spo = @no_spo;

          -- Insert missing checks
          INSERT INTO tbl_checklistppm_bahanpendukung_check
            (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan, updated_at)
            SELECT BP.id, @no_spo, @status, @tgl_check, @nama_agent, @keterangan, GETDATE()
            FROM tbl_checklistppm_bahanpendukung BP
            WHERE BP.no_spo = @no_spo
              AND NOT EXISTS (
                SELECT 1 FROM tbl_checklistppm_bahanpendukung_check
                WHERE id_bahanpendukung = BP.id
              );

          -- History
          INSERT INTO tbl_checklistppm_bahanpendukung_history
            (id_bahanpendukung, no_spo, status, tgl_check, nama_agent, keterangan)
            SELECT BP.id, @no_spo, @status, @tgl_check, @nama_agent, @keterangan
            FROM tbl_checklistppm_bahanpendukung BP
            WHERE BP.no_spo = @no_spo;
        END
      `);

    res.json({ message: 'Bulk check berhasil disimpan' });
  } catch (err) {
    next(err);
  }
}

// ─── getProsesCetak ───────────────────────────────────────────────────────────
// POST /prosescetak/list  body: { no_spo }
async function getProsesCetak(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT KAL.no_spo,
               IIF(SUBSTRING(KAL.no_subrpo, 5, 2) = 'BM', '1', '0') sta_bm,
               DB.no_subrpo, DB.urut, UPPER(pekerjaan) pekerjaan,
               beban, awal, akhir, hasil, rusak, kurang,
               CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
        FROM tbl_kalkulasidoc KAL
        CROSS APPLY (
          SELECT *, IIF(BEBAN - HASIL < 0, 0, BEBAN - HASIL) AS kurang
          FROM (
            SELECT a.no_subrpo, a.urut, a.proses,
                   a.jns_pekerjaan + '- ' + a.proses AS pekerjaan,
                   ISNULL(xx.OKK, '-') AS OKK,
                   ISNULL(CONVERT(VARCHAR(8), tgl_target, 3), '-') AS tgl_target,
                   ISNULL(a.beban, 0) AS beban,
                   ISNULL(CONVERT(VARCHAR(8), b.a, 3), '-') AS awal,
                   ISNULL(CONVERT(VARCHAR(8), b.b, 3), '-') AS akhir,
                   ISNULL(b.hasil, 0) AS hasil,
                   ISNULL(b.rusak, 0) AS rusak,
                   IIF(UPPER(a.proses) LIKE '% CETAK %', 'Cetak', 'Finishing') AS jenis
            FROM tbl_RPOjadwal a
            LEFT JOIN view_rpo_real b
              ON a.no_subrpo = b.no_subrpo AND a.urut = b.id_urut
            LEFT JOIN (
              SELECT urut, 'V ' AS OKK
              FROM tbl_RPOprogram
              WHERE no_subrpo = KAL.no_subrpo
                AND jum_program > 0
                AND (mesin_detail = 'Cetak Luar' OR mesin_detail = 'Finishing Luar')
            ) AS xx ON a.urut = xx.urut
            WHERE a.no_subrpo = KAL.no_subrpo
              AND tipe = '2 '
              AND a.proses <> 'Montage'
          ) AS tb

          UNION ALL

          SELECT LEFT(no_mt, 16), a.idnya, proses,
                 'Finishing - ' + proses AS pekerjaan,
                 '-', '-', 0,
                 ISNULL(CONVERT(VARCHAR(8), MIN(a.jam_mulai), 3), '-') AS awal,
                 ISNULL(CONVERT(VARCHAR(8), MAX(a.jam_selesai), 3), '-') AS akhir,
                 SUM(n_baik), SUM(n_rusak), 'Finishing', 0
          FROM tbl_RPOPK_REAL a
          LEFT JOIN tbl_proses_detail b ON a.idnya = b.id
          WHERE LEFT(no_mt, 16) = KAL.no_subrpo
            AND id_urut = 9999
            AND b.tipe = 2
            AND LEFT(mesin_detail, 18) <> 'Sortir - Perbaikan'
          GROUP BY LEFT(no_mt, 16), a.idnya, proses

          UNION ALL

          SELECT LEFT(no_mt, 16), 50000, 'Sortir Perbaikan',
                 'Finishing - Sortir Perbaikan',
                 '-', '-', 0,
                 ISNULL(CONVERT(VARCHAR(8), MIN(a.jam_mulai), 3), '-') AS awal,
                 ISNULL(CONVERT(VARCHAR(8), MAX(a.jam_selesai), 3), '-') AS akhir,
                 SUM(n_baik), SUM(n_rusak), 'Finishing', 0
          FROM tbl_RPOPK_REAL a
          WHERE LEFT(no_mt, 16) = KAL.no_subrpo
            AND LEFT(mesin_detail, 18) = 'Sortir - Perbaikan'
          GROUP BY LEFT(no_mt, 16)
        ) DB
        LEFT JOIN tbl_checklistppm_prosescetak_check CHK
          ON CHK.no_spo = KAL.no_spo AND CHK.no_subrpo = DB.no_subrpo AND CHK.urut = DB.urut
        WHERE KAL.no_spo = @no_spo
          AND proses LIKE '%CETAK%'
        ORDER BY sta_bm, urut
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getProsesPascaCetak ──────────────────────────────────────────────────────
// POST /prosespascacetak/list  body: { no_spo }
async function getProsesPascaCetak(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT KAL.no_spo,
               IIF(SUBSTRING(KAL.no_subrpo, 5, 2) = 'BM', '1', '0') sta_bm,
               DB.no_subrpo, DB.urut, UPPER(pekerjaan) pekerjaan,
               beban, awal, akhir, hasil, rusak, kurang,
               CHK.status, CHK.tgl_check, CHK.nama_agent, CHK.keterangan
        FROM tbl_kalkulasidoc KAL
        CROSS APPLY (
          SELECT *, IIF(BEBAN - HASIL < 0, 0, BEBAN - HASIL) AS kurang
          FROM (
            SELECT a.no_subrpo, a.urut, a.proses,
                   a.jns_pekerjaan + '- ' + a.proses AS pekerjaan,
                   ISNULL(xx.OKK, '-') AS OKK,
                   ISNULL(CONVERT(VARCHAR(8), tgl_target, 3), '-') AS tgl_target,
                   ISNULL(a.beban, 0) AS beban,
                   ISNULL(CONVERT(VARCHAR(8), b.a, 3), '-') AS awal,
                   ISNULL(CONVERT(VARCHAR(8), b.b, 3), '-') AS akhir,
                   ISNULL(b.hasil, 0) AS hasil,
                   ISNULL(b.rusak, 0) AS rusak,
                   IIF(UPPER(a.proses) LIKE '% CETAK %', 'Cetak', 'Finishing') AS jenis
            FROM tbl_RPOjadwal a
            LEFT JOIN view_rpo_real b
              ON a.no_subrpo = b.no_subrpo AND a.urut = b.id_urut
            LEFT JOIN (
              SELECT urut, 'V ' AS OKK
              FROM tbl_RPOprogram
              WHERE no_subrpo = KAL.no_subrpo
                AND jum_program > 0
                AND (mesin_detail = 'Cetak Luar' OR mesin_detail = 'Finishing Luar')
            ) AS xx ON a.urut = xx.urut
            WHERE a.no_subrpo = KAL.no_subrpo
              AND tipe = '2 '
              AND a.proses <> 'Montage'
          ) AS tb

          UNION ALL

          SELECT LEFT(no_mt, 16), a.idnya, proses,
                 'Finishing - ' + proses AS pekerjaan,
                 '-', '-', 0,
                 ISNULL(CONVERT(VARCHAR(8), MIN(a.jam_mulai), 3), '-') AS awal,
                 ISNULL(CONVERT(VARCHAR(8), MAX(a.jam_selesai), 3), '-') AS akhir,
                 SUM(n_baik), SUM(n_rusak), 'Finishing', 0
          FROM tbl_RPOPK_REAL a
          LEFT JOIN tbl_proses_detail b ON a.idnya = b.id
          WHERE LEFT(no_mt, 16) = KAL.no_subrpo
            AND id_urut = 9999
            AND b.tipe = 2
            AND LEFT(mesin_detail, 18) <> 'Sortir - Perbaikan'
          GROUP BY LEFT(no_mt, 16), a.idnya, proses

          UNION ALL

          SELECT LEFT(no_mt, 16), 50000, 'Sortir Perbaikan',
                 'Finishing - Sortir Perbaikan',
                 '-', '-', 0,
                 ISNULL(CONVERT(VARCHAR(8), MIN(a.jam_mulai), 3), '-') AS awal,
                 ISNULL(CONVERT(VARCHAR(8), MAX(a.jam_selesai), 3), '-') AS akhir,
                 SUM(n_baik), SUM(n_rusak), 'Finishing', 0
          FROM tbl_RPOPK_REAL a
          WHERE LEFT(no_mt, 16) = KAL.no_subrpo
            AND LEFT(mesin_detail, 18) = 'Sortir - Perbaikan'
          GROUP BY LEFT(no_mt, 16)
        ) DB
        LEFT JOIN tbl_checklistppm_prosespascacetak_check CHK
          ON CHK.no_spo = KAL.no_spo AND CHK.no_subrpo = DB.no_subrpo AND CHK.urut = DB.urut
        WHERE KAL.no_spo = @no_spo
          AND proses NOT LIKE '%CETAK%'
        ORDER BY sta_bm, urut
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── bulkProsesPascaCetakCheck ────────────────────────────────────────────────
// POST /prosespascacetak/bulk-check  body: { no_spo, items:[{no_subrpo,urut}], status, keterangan }
async function bulkProsesPascaCetakCheck(req, res, next) {
  try {
    const { no_spo, items, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    for (const { no_subrpo, urut } of items) {
      await pool.request()
        .input('no_spo',     sql.NVarChar, no_spo)
        .input('no_subrpo',  sql.NVarChar, no_subrpo)
        .input('urut',       sql.Int,      urut)
        .input('status',     sql.NVarChar, status)
        .input('nama_agent', sql.NVarChar, nama_agent)
        .input('keterangan', sql.NVarChar, keterangan || null)
        .query(`
          IF EXISTS (
            SELECT 1 FROM tbl_checklistppm_prosespascacetak_check
            WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
          )
            UPDATE tbl_checklistppm_prosespascacetak_check
            SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
                keterangan = @keterangan, updated_at = GETDATE()
            WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
          ELSE
            INSERT INTO tbl_checklistppm_prosespascacetak_check
              (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan, updated_at)
            VALUES
              (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
        `);

      await pool.request()
        .input('no_spo',     sql.NVarChar, no_spo)
        .input('no_subrpo',  sql.NVarChar, no_subrpo)
        .input('urut',       sql.Int,      urut)
        .input('status',     sql.NVarChar, status)
        .input('nama_agent', sql.NVarChar, nama_agent)
        .input('keterangan', sql.NVarChar, keterangan || null)
        .query(`
          INSERT INTO tbl_checklistppm_prosespascacetak_history
            (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan)
          VALUES
            (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan)
        `);
    }

    res.json({ message: `${items.length} proses berhasil di-check`, nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── saveProsesPascaCetakCheck ────────────────────────────────────────────────
// POST /prosespascacetak/check  body: { no_spo, no_subrpo, urut, status, keterangan }
async function saveProsesPascaCetakCheck(req, res, next) {
  try {
    const { no_spo, no_subrpo, urut, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('no_subrpo',  sql.NVarChar, no_subrpo)
      .input('urut',       sql.Int,      urut)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM tbl_checklistppm_prosespascacetak_check
          WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        )
          UPDATE tbl_checklistppm_prosespascacetak_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        ELSE
          INSERT INTO tbl_checklistppm_prosespascacetak_check
            (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('no_subrpo',  sql.NVarChar, no_subrpo)
      .input('urut',       sql.Int,      urut)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO tbl_checklistppm_prosespascacetak_history
          (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check proses pasca cetak berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getProsesPascaCetakHistory ───────────────────────────────────────────────
// POST /prosespascacetak/history  body: { no_spo, no_subrpo, urut }
async function getProsesPascaCetakHistory(req, res, next) {
  try {
    const { no_spo, no_subrpo, urut } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo',    sql.NVarChar, no_spo)
      .input('no_subrpo', sql.NVarChar, no_subrpo)
      .input('urut',      sql.Int,      urut)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM tbl_checklistppm_prosespascacetak_history
        WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── saveProsesCetakCheck ─────────────────────────────────────────────────────
// POST /prosescetak/check  body: { no_spo, no_subrpo, urut, status, keterangan }
async function saveProsesCetakCheck(req, res, next) {
  try {
    const { no_spo, no_subrpo, urut, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('no_subrpo',  sql.NVarChar, no_subrpo)
      .input('urut',       sql.Int,      urut)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM tbl_checklistppm_prosescetak_check
          WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        )
          UPDATE tbl_checklistppm_prosescetak_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        ELSE
          INSERT INTO tbl_checklistppm_prosescetak_check
            (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('no_subrpo',  sql.NVarChar, no_subrpo)
      .input('urut',       sql.Int,      urut)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO tbl_checklistppm_prosescetak_history
          (no_spo, no_subrpo, urut, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@no_spo, @no_subrpo, @urut, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check proses cetak berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getProsesCetakHistory ────────────────────────────────────────────────────
// POST /prosescetak/history  body: { no_spo, no_subrpo, urut }
async function getProsesCetakHistory(req, res, next) {
  try {
    const { no_spo, no_subrpo, urut } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo',    sql.NVarChar, no_spo)
      .input('no_subrpo', sql.NVarChar, no_subrpo)
      .input('urut',      sql.Int,      urut)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM tbl_checklistppm_prosescetak_history
        WHERE no_spo = @no_spo AND no_subrpo = @no_subrpo AND urut = @urut
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getArtwork ───────────────────────────────────────────────────────────────
// POST /artwork/list  body: { no_spo }
async function getArtwork(req, res, next) {
  try {
    const { no_spo } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo', sql.NVarChar, no_spo)
      .query(`
        SELECT ARW.no_subrpo, ARW.pekerjaan, ARW.status_akhir, ARW.nik_status_akhir,
               UPPER(USR.nama_lengkap) nama_lengkap,
               ARW.ket_status_akhir, ARW.tgl_status_akhir,
               ( SELECT DISTINCT SUBSTRING((
                   SELECT DISTINCT ', ' + no_bukti
                   FROM tbl_materi_softcopy_detail
                   WHERE no_po = x.no_po
                   FOR XML PATH('')
                   ), 3, 1000) no_fpms
                 FROM tbl_materi_softcopy_detail x
                 WHERE x.no_po = ARW.no_subrpo
               ) no_fpms,
               CHK.status chk_status, CHK.tgl_check chk_tgl_check,
               CHK.nama_agent chk_nama_agent, CHK.keterangan chk_keterangan, RPO.tgl_materi tgl_batas_materi
        FROM tbl_artwork ARW
        LEFT JOIN tbl_kalkulasidoc KAL ON ARW.no_subrpo = KAL.no_subrpo
        LEFT JOIN v_users USR ON USR.nik = ARW.nik_status_akhir
        LEFT JOIN tbl_checklistppm_filemateri_check CHK
          ON CHK.no_spo = KAL.no_spo AND CHK.pekerjaan = ARW.pekerjaan
        LEFT JOIN tbl_rpodoc RPO ON ARW.no_subrpo=RPO.no_subrpo
        WHERE KAL.no_kalkulasi <> 'BM' AND KAL.no_spo = @no_spo
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── saveFilemateriCheck ──────────────────────────────────────────────────────
// POST /artwork/check  body: { no_spo, pekerjaan, status, keterangan }
async function saveFilemateriCheck(req, res, next) {
  try {
    const { no_spo, pekerjaan, status, keterangan } = req.body;
    const nama_agent = req.user.full_name;
    const pool = await getPool();

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('pekerjaan',  sql.NVarChar, pekerjaan)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        IF EXISTS (
          SELECT 1 FROM tbl_checklistppm_filemateri_check
          WHERE no_spo = @no_spo AND pekerjaan = @pekerjaan
        )
          UPDATE tbl_checklistppm_filemateri_check
          SET status = @status, tgl_check = GETDATE(), nama_agent = @nama_agent,
              keterangan = @keterangan, updated_at = GETDATE()
          WHERE no_spo = @no_spo AND pekerjaan = @pekerjaan
        ELSE
          INSERT INTO tbl_checklistppm_filemateri_check
            (no_spo, pekerjaan, status, tgl_check, nama_agent, keterangan, updated_at)
          VALUES
            (@no_spo, @pekerjaan, @status, GETDATE(), @nama_agent, @keterangan, GETDATE())
      `);

    await pool.request()
      .input('no_spo',     sql.NVarChar, no_spo)
      .input('pekerjaan',  sql.NVarChar, pekerjaan)
      .input('status',     sql.NVarChar, status)
      .input('nama_agent', sql.NVarChar, nama_agent)
      .input('keterangan', sql.NVarChar, keterangan || null)
      .query(`
        INSERT INTO tbl_checklistppm_filemateri_history
          (no_spo, pekerjaan, status, tgl_check, nama_agent, keterangan)
        VALUES
          (@no_spo, @pekerjaan, @status, GETDATE(), @nama_agent, @keterangan)
      `);

    res.json({ message: 'Check file materi berhasil disimpan', nama_agent });
  } catch (err) {
    next(err);
  }
}

// ─── getFilemateriHistory ─────────────────────────────────────────────────────
// POST /artwork/history  body: { no_spo, pekerjaan }
async function getFilemateriHistory(req, res, next) {
  try {
    const { no_spo, pekerjaan } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('no_spo',    sql.NVarChar, no_spo)
      .input('pekerjaan', sql.NVarChar, pekerjaan)
      .query(`
        SELECT status, tgl_check, nama_agent, keterangan, created_at
        FROM tbl_checklistppm_filemateri_history
        WHERE no_spo = @no_spo AND pekerjaan = @pekerjaan
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getDailyReport ───────────────────────────────────────────────────────────
// POST /report/daily  body: { tanggal, agent }
async function getDailyReport(req, res, next) {
  try {
    const { tanggal, agent = '' } = req.body;
    const pool = await getPool();

    // Ensure all history tables exist before querying
    await pool.request().query(`
      IF OBJECT_ID('tbl_checklistppm_check_history','U') IS NULL
        CREATE TABLE tbl_checklistppm_check_history (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          no_spo     NVARCHAR(50)  NOT NULL,
          id_subpoin INT           NOT NULL,
          status     NVARCHAR(20),
          tgl_check  DATETIME,
          nama_agent NVARCHAR(100),
          keterangan NVARCHAR(500),
          created_at DATETIME DEFAULT GETDATE()
        );
      IF OBJECT_ID('tbl_checklistppm_bahanbaku_history','U') IS NULL
        CREATE TABLE tbl_checklistppm_bahanbaku_history (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          no_spo     NVARCHAR(50)  NOT NULL,
          spek       NVARCHAR(100),
          kode_bahan NVARCHAR(50),
          status     NVARCHAR(20),
          tgl_check  DATETIME,
          nama_agent NVARCHAR(100),
          keterangan NVARCHAR(500),
          created_at DATETIME DEFAULT GETDATE()
        );
      IF OBJECT_ID('tbl_checklistppm_bahanpendukung_history','U') IS NULL
        CREATE TABLE tbl_checklistppm_bahanpendukung_history (
          id                INT IDENTITY(1,1) PRIMARY KEY,
          id_bahanpendukung INT           NOT NULL,
          no_spo            NVARCHAR(50)  NOT NULL,
          status            NVARCHAR(20),
          tgl_check         DATETIME,
          nama_agent        NVARCHAR(100),
          keterangan        NVARCHAR(500),
          created_at        DATETIME DEFAULT GETDATE()
        );
      IF OBJECT_ID('tbl_checklistppm_prosescetak_history','U') IS NULL
        CREATE TABLE tbl_checklistppm_prosescetak_history (
          id         INT IDENTITY(1,1) PRIMARY KEY,
          no_spo     NVARCHAR(50)  NOT NULL,
          no_subrpo  NVARCHAR(50)  NOT NULL,
          urut       INT           NOT NULL,
          status     NVARCHAR(20),
          tgl_check  DATETIME,
          nama_agent NVARCHAR(100),
          keterangan NVARCHAR(500),
          created_at DATETIME DEFAULT GETDATE()
        );
    `);

    // Range filter avoids CONVERT(DATE,...) and keeps index use
    const tglFrom = `${tanggal} 00:00:00`;
    const tglTo   = `${tanggal} 23:59:59`;

    const result = await pool.request()
      .input('tgl_from', sql.DateTime, tglFrom)
      .input('tgl_to',   sql.DateTime, tglTo)
      .input('agent',    sql.NVarChar, agent)
      .query(`
        -- Resolve poin/subpoin label for each category once (CTE, not per-row subquery)
        ;WITH
        BbLabel AS (
          SELECT TOP 1 P.nama AS poin, SP.nama AS subpoin
          FROM tbl_checklistppm_poin P
          JOIN tbl_checklistppm_subpoin SP ON SP.id_poin = P.id
          WHERE SP.has_detail = 'bahan_baku' AND SP.is_active = 1
        ),
        BpLabel AS (
          SELECT TOP 1 P.nama AS poin, SP.nama AS subpoin
          FROM tbl_checklistppm_poin P
          JOIN tbl_checklistppm_subpoin SP ON SP.id_poin = P.id
          WHERE SP.has_detail = 'bahan_pendukung' AND SP.is_active = 1
        ),
        PcLabel AS (
          SELECT TOP 1 P.nama AS poin, SP.nama AS subpoin
          FROM tbl_checklistppm_poin P
          JOIN tbl_checklistppm_subpoin SP ON SP.id_poin = P.id
          WHERE SP.has_detail = 'proses_cetak' AND SP.is_active = 1
        )

        -- Subpoin checks
        SELECT
          H.no_spo,
          P.nama                                             AS poin,
          SP.nama                                            AS subpoin,
          N''                                                AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                         AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')         AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                            AS keterangan,
          H.nama_agent
        FROM tbl_checklistppm_check_history H
        JOIN tbl_checklistppm_subpoin SP ON SP.id = H.id_subpoin
        JOIN tbl_checklistppm_poin    P  ON P.id  = SP.id_poin
        LEFT JOIN tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE H.tgl_check BETWEEN @tgl_from AND @tgl_to
          AND (@agent = '' OR H.nama_agent = @agent)

        UNION ALL

        -- Bahan Baku checks
        SELECT
          H.no_spo,
          ISNULL(L.poin,   '-')            AS poin,
          ISNULL(L.subpoin,'Bahan Baku')   AS subpoin,
          ISNULL(H.spek,'') + CASE WHEN ISNULL(H.kode_bahan,'') <> '' THEN ' / ' + H.kode_bahan ELSE '' END AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                         AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')         AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                            AS keterangan,
          H.nama_agent
        FROM tbl_checklistppm_bahanbaku_history H
        LEFT JOIN BbLabel L ON 1=1
        LEFT JOIN tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE H.tgl_check BETWEEN @tgl_from AND @tgl_to
          AND (@agent = '' OR H.nama_agent = @agent)

        UNION ALL

        -- Bahan Pendukung checks
        SELECT
          H.no_spo,
          ISNULL(L.poin,   '-')                AS poin,
          ISNULL(L.subpoin,'Bahan Pendukung')  AS subpoin,
          ISNULL(BPK.nama_bahan,'')            AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                         AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')         AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                            AS keterangan,
          H.nama_agent
        FROM tbl_checklistppm_bahanpendukung_history H
        LEFT JOIN BpLabel L ON 1=1
        LEFT JOIN tbl_checklistppm_bahanpendukung BPK ON BPK.id = H.id_bahanpendukung
        LEFT JOIN tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE H.tgl_check BETWEEN @tgl_from AND @tgl_to
          AND (@agent = '' OR H.nama_agent = @agent)

        UNION ALL

        -- Proses Cetak checks
        SELECT
          H.no_spo,
          ISNULL(L.poin,   '-')                                              AS poin,
          ISNULL(L.subpoin,'Proses Cetak')                                   AS subpoin,
          ISNULL(RJ.jns_pekerjaan + '- ', '') + ISNULL(RJ.proses, H.no_subrpo) AS spek,
          H.tgl_check,
          ISNULL(SPO.nama_order, '')                                         AS nama_order,
          REPLACE(ISNULL(SPO.jum_pesanan,''),',','')                         AS jum_pesanan,
          H.status,
          ISNULL(H.keterangan,'')                                            AS keterangan,
          H.nama_agent
        FROM tbl_checklistppm_prosescetak_history H
        LEFT JOIN PcLabel L ON 1=1
        LEFT JOIN tbl_RPOjadwal RJ
          ON RJ.no_subrpo = H.no_subrpo AND RJ.urut = H.urut
        LEFT JOIN tbl_SPODoc SPO
          ON SPO.no_spo = H.no_spo AND RIGHT(SPO.no_subspo,1) = 'A'
        WHERE H.tgl_check BETWEEN @tgl_from AND @tgl_to
          AND (@agent = '' OR H.nama_agent = @agent)

        ORDER BY tgl_check, no_spo, poin
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getReportAgents ──────────────────────────────────────────────────────────
// GET /report/agents  — collect distinct agents across all history tables
async function getReportAgents(req, res, next) {
  try {
    const pool = await getPool();

    // Build SELECT list only for tables that actually exist
    const tables = [
      'tbl_checklistppm_check_history',
      'tbl_checklistppm_bahanbaku_history',
      'tbl_checklistppm_bahanpendukung_history',
      'tbl_checklistppm_prosescetak_history',
    ];

    const existRes = await pool.request().query(
      tables.map(t =>
        `SELECT CASE WHEN OBJECT_ID('${t}','U') IS NOT NULL THEN 1 ELSE 0 END AS ex`
      ).join(' UNION ALL ')
    );

    const selects = existRes.recordset
      .map((r, i) => r.ex ? `SELECT nama_agent FROM ${tables[i]}` : null)
      .filter(Boolean);

    if (!selects.length) return res.json([]);

    const result = await pool.request().query(`
      SELECT DISTINCT nama_agent
      FROM (${selects.join(' UNION ALL ')}) A
      WHERE nama_agent IS NOT NULL AND nama_agent <> ''
      ORDER BY nama_agent
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// ─── getServerTime ────────────────────────────────────────────────────────────
// GET /server-time
async function getServerTime(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT GETDATE() AS server_time`);
    res.json({ server_time: result.recordset[0].server_time });
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
  getProsesCetak,
  getProsesPascaCetak,
  bulkProsesPascaCetakCheck,
  saveProsesPascaCetakCheck,
  getProsesPascaCetakHistory,
  saveProsesCetakCheck,
  getProsesCetakHistory,
  getArtwork,
  saveFilemateriCheck,
  getFilemateriHistory,
  getDailyReport,
  getReportAgents,
  getServerTime,
};
