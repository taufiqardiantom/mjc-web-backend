const { getPool, sql } = require('../../config/database');

async function getAll(req, res, next) {
  try {
    const {
      search       = '',
      sta_aktif    = 'AKTIF',
      sta_hold     = '',
      kode_prefix  = '',
      nama_pwk     = '',
      page         = 1,
      limit        = 100,
    } = req.query;

    const pool    = await getPool();
    const request = pool.request();

    const where  = [];
    const inputs = [];

    if (sta_aktif && sta_aktif !== 'ALL') {
      where.push('sta_aktif = @sta_aktif');
      inputs.push({ name: 'sta_aktif', type: sql.VarChar(20), val: sta_aktif });
    }
    if (sta_hold && sta_hold !== 'ALL') {
      where.push('sta_hold = @sta_hold');
      inputs.push({ name: 'sta_hold', type: sql.VarChar(20), val: sta_hold });
    }
    if (kode_prefix) {
      where.push('LEFT(kode, 6) = @kode_prefix');
      inputs.push({ name: 'kode_prefix', type: sql.VarChar(6), val: kode_prefix });
    }
    if (nama_pwk) {
      where.push('nama_pwk = @nama_pwk');
      inputs.push({ name: 'nama_pwk', type: sql.NVarChar(100), val: nama_pwk });
    }
    if (search) {
      where.push('(kode LIKE @search OR nama LIKE @search OR telepon LIKE @search OR email LIKE @search OR npwp LIKE @search OR person LIKE @search)');
      inputs.push({ name: 'search', type: sql.NVarChar(500), val: `%${search}%` });
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(500, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    inputs.forEach(({ name, type, val }) => request.input(name, type, val));
    request.input('offset',   sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    const countReq = pool.request();
    inputs.forEach(({ name, type, val }) => countReq.input(name, type, val));

    const [dataResult, countResult] = await Promise.all([
      request.query(`
        SELECT kode, idnama, nama, alamat, provinsi, kabupaten, kecamatan,
               telepon, fax, npwp, person, alamat_person, provinsi_person,
               kabupaten_person, kecamatan_person, telepon_person, nik_person,
               email, g_order, nama_pwk, [group], subgroup, kategori,
               created_at, sta_aktif, sta_hold, jatuh_tempo, plafon1, plafon2,
               tgl_pertama_sp, tgl_akhir_sp,
               DATEDIFF(DAY, tgl_akhir_sp, GETDATE()) AS hari_tidak_order
        FROM v_customer
        ${whereStr}
        ORDER BY kode
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
      countReq.query(`SELECT COUNT(*) AS total FROM v_customer ${whereStr}`),
    ]);

    res.json({
      data:  dataResult.recordset,
      total: countResult.recordset[0].total,
      page:  pageNum,
      limit: pageSize,
    });
  } catch (err) {
    next(err);
  }
}

// Export tanpa pagination — semua data sesuai filter untuk keperluan Excel
async function exportAll(req, res, next) {
  try {
    const {
      search      = '',
      sta_aktif   = 'AKTIF',
      sta_hold    = '',
      kode_prefix = '',
      nama_pwk    = '',
    } = req.query;

    const pool    = await getPool();
    const request = pool.request();
    const where   = [];
    const inputs  = [];

    if (sta_aktif && sta_aktif !== 'ALL') {
      where.push('sta_aktif = @sta_aktif');
      inputs.push({ name: 'sta_aktif', type: sql.VarChar(20), val: sta_aktif });
    }
    if (sta_hold && sta_hold !== 'ALL') {
      where.push('sta_hold = @sta_hold');
      inputs.push({ name: 'sta_hold', type: sql.VarChar(20), val: sta_hold });
    }
    if (kode_prefix) {
      where.push('LEFT(kode, 6) = @kode_prefix');
      inputs.push({ name: 'kode_prefix', type: sql.VarChar(6), val: kode_prefix });
    }
    if (nama_pwk) {
      where.push('nama_pwk = @nama_pwk');
      inputs.push({ name: 'nama_pwk', type: sql.NVarChar(100), val: nama_pwk });
    }
    if (search) {
      where.push('(kode LIKE @search OR nama LIKE @search OR telepon LIKE @search OR email LIKE @search OR npwp LIKE @search OR person LIKE @search)');
      inputs.push({ name: 'search', type: sql.NVarChar(500), val: `%${search}%` });
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    inputs.forEach(({ name, type, val }) => request.input(name, type, val));

    const result = await request.query(`
      SELECT kode, idnama, nama, alamat, provinsi, kabupaten, kecamatan,
             telepon, fax, npwp, person, alamat_person, provinsi_person,
             kabupaten_person, kecamatan_person, telepon_person, nik_person,
             email, g_order, nama_pwk, [group], subgroup, kategori,
             created_at, sta_aktif, sta_hold, jatuh_tempo, plafon1, plafon2,
             tgl_pertama_sp
      FROM v_customer
      ${whereStr}
      ORDER BY kode
    `);

    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

// Nilai unik untuk dropdown filter LEFT(kode,6) dan nama_pwk
async function getFilterOptions(req, res, next) {
  try {
    const pool = await getPool();
    const [prefixResult, pwkResult] = await Promise.all([
      pool.request().query(`SELECT DISTINCT LEFT(kode, 6) AS kode_prefix FROM v_customer WHERE kode IS NOT NULL ORDER BY 1`),
      pool.request().query(`SELECT DISTINCT nama_pwk FROM v_customer WHERE nama_pwk IS NOT NULL AND nama_pwk <> '' ORDER BY nama_pwk`),
    ]);
    res.json({
      kode_prefixes: prefixResult.recordset.map(r => r.kode_prefix),
      nama_pwk_list: pwkResult.recordset.map(r => r.nama_pwk),
    });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const { kode } = req.params;
    const pool     = await getPool();

    const result = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`
        SELECT kode, idnama, nama, alamat, provinsi, kabupaten, kecamatan,
               telepon, fax, npwp, person, alamat_person, provinsi_person,
               kabupaten_person, kecamatan_person, telepon_person, nik_person,
               email, g_order, nama_pwk, [group], subgroup, kategori,
               created_at, sta_aktif, sta_hold, jatuh_tempo, plafon1, plafon2,
               tgl_pertama_sp, tgl_akhir_sp,
               DATEDIFF(DAY, tgl_akhir_sp, GETDATE()) AS hari_tidak_order
        FROM v_customer
        WHERE kode = @kode
      `);

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Customer tidak ditemukan' });

    res.json(result.recordset[0]);
  } catch (err) {
    next(err);
  }
}

// TODO: Sesuaikan query dengan tabel/view pesanan yang tersedia di database
async function getOrders(req, res, next) {
  try {
    const { kode } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pool     = await getPool();
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    // Ganti query ini dengan view/tabel pesanan yang sesuai
    // Contoh: FROM v_pesanan WHERE kode_customer = @kode
    const [dataResult, countResult] = await Promise.all([
      pool.request()
        .input('kode',     sql.VarChar(50), kode)
        .input('offset',   sql.Int,         offset)
        .input('pageSize', sql.Int,         pageSize)
        .query(`
          SELECT TOP 0 CAST(NULL AS VARCHAR(50)) AS no_order,
                       CAST(NULL AS DATETIME)    AS tgl_order,
                       CAST(NULL AS VARCHAR(200)) AS keterangan,
                       CAST(NULL AS NUMERIC)     AS nilai
          WHERE 1=0
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `),
      pool.request()
        .input('kode', sql.VarChar(50), kode)
        .query(`SELECT 0 AS total`),
    ]);

    res.json({
      data:  dataResult.recordset,
      total: countResult.recordset[0].total,
      page:  pageNum,
      limit: pageSize,
    });
  } catch (err) {
    next(err);
  }
}

// ─── updateJatuhTempo ─────────────────────────────────────────────────────────
// PUT /:kode/jatuh-tempo  body: { jatuh_tempo, keterangan }
async function updateJatuhTempo(req, res, next) {
  try {
    const { kode } = req.params;
    const { jatuh_tempo, keterangan } = req.body;
    const nama_agent = req.user?.full_name ?? 'system';
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('tbl_customer_jatuhtempo_history', 'U') IS NULL
        CREATE TABLE tbl_customer_jatuhtempo_history (
          id               INT IDENTITY(1,1) PRIMARY KEY,
          kode             VARCHAR(50)   NOT NULL,
          jatuh_tempo_lama NUMERIC(3,0)  NULL,
          jatuh_tempo_baru NUMERIC(3,0)  NOT NULL,
          keterangan       NVARCHAR(500) NULL,
          nama_agent       NVARCHAR(100) NULL,
          created_at       DATETIME      DEFAULT GETDATE()
        )
    `);

    const cur = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`SELECT jatuh_tempo FROM tbl_customer WHERE kode = @kode`);
    const jatuh_tempo_lama = cur.recordset[0]?.jatuh_tempo ?? null;

    await pool.request()
      .input('kode',        sql.VarChar(50),  kode)
      .input('jatuh_tempo', sql.Int,          jatuh_tempo)
      .query(`UPDATE tbl_customer SET jatuh_tempo = @jatuh_tempo WHERE kode = @kode`);

    await pool.request()
      .input('kode',       sql.VarChar(50),   kode)
      .input('lama',       sql.Int,           jatuh_tempo_lama)
      .input('baru',       sql.Int,           jatuh_tempo)
      .input('keterangan', sql.NVarChar(500), keterangan || null)
      .input('nama_agent', sql.NVarChar(100), nama_agent)
      .query(`
        INSERT INTO tbl_customer_jatuhtempo_history
          (kode, jatuh_tempo_lama, jatuh_tempo_baru, keterangan, nama_agent)
        VALUES (@kode, @lama, @baru, @keterangan, @nama_agent)
      `);

    res.json({ message: 'Jatuh tempo berhasil diperbarui', jatuh_tempo, nama_agent });
  } catch (err) { next(err); }
}

// ─── getJatuhTempoHistory ─────────────────────────────────────────────────────
// GET /:kode/jatuh-tempo/history
async function getJatuhTempoHistory(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('tbl_customer_jatuhtempo_history', 'U') IS NULL
        CREATE TABLE tbl_customer_jatuhtempo_history (
          id               INT IDENTITY(1,1) PRIMARY KEY,
          kode             VARCHAR(50)   NOT NULL,
          jatuh_tempo_lama NUMERIC(3,0)  NULL,
          jatuh_tempo_baru NUMERIC(3,0)  NOT NULL,
          keterangan       NVARCHAR(500) NULL,
          nama_agent       NVARCHAR(100) NULL,
          created_at       DATETIME      DEFAULT GETDATE()
        )
    `);

    const result = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`
        SELECT jatuh_tempo_lama, jatuh_tempo_baru, keterangan, nama_agent, created_at
        FROM tbl_customer_jatuhtempo_history
        WHERE kode = @kode
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) { next(err); }
}

// ─── updateHoldStatus ─────────────────────────────────────────────────────────
// PUT /:kode/hold-status  body: { sta_hold: 'HOLD'|'TIDAK', keterangan }
async function updateHoldStatus(req, res, next) {
  try {
    const { kode } = req.params;
    const { sta_hold, keterangan } = req.body;
    if (!['HOLD', 'TIDAK'].includes(sta_hold))
      return res.status(400).json({ message: 'sta_hold harus HOLD atau TIDAK' });

    // tbl_customer stores 1 (HOLD) / 0 (OPEN)
    const sta_hold_num = sta_hold === 'HOLD' ? 1 : 0;

    const nama_agent = req.user?.full_name ?? 'system';
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('tbl_customer_hold_history', 'U') IS NULL
        CREATE TABLE tbl_customer_hold_history (
          id            INT IDENTITY(1,1) PRIMARY KEY,
          kode          VARCHAR(50)   NOT NULL,
          sta_hold_lama VARCHAR(20)   NULL,
          sta_hold_baru VARCHAR(20)   NOT NULL,
          keterangan    NVARCHAR(500) NULL,
          nama_agent    NVARCHAR(100) NULL,
          created_at    DATETIME      DEFAULT GETDATE()
        )
    `);

    // get current numeric value and convert to label for history
    const cur = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`SELECT sta_hold FROM tbl_customer WHERE kode = @kode`);
    const rawLama     = cur.recordset[0]?.sta_hold;
    const sta_hold_lama = rawLama == null ? null : (rawLama == 1 ? 'HOLD' : 'TIDAK');

    await pool.request()
      .input('kode',         sql.VarChar(50), kode)
      .input('sta_hold_num', sql.Int,         sta_hold_num)
      .query(`UPDATE tbl_customer SET sta_hold = @sta_hold_num WHERE kode = @kode`);

    await pool.request()
      .input('kode',  sql.VarChar(50),   kode)
      .input('lama',  sql.VarChar(20),   sta_hold_lama)
      .input('baru',  sql.VarChar(20),   sta_hold)
      .input('ket',   sql.NVarChar(500), keterangan || null)
      .input('agent', sql.NVarChar(100), nama_agent)
      .query(`
        INSERT INTO tbl_customer_hold_history
          (kode, sta_hold_lama, sta_hold_baru, keterangan, nama_agent)
        VALUES (@kode, @lama, @baru, @ket, @agent)
      `);

    res.json({ message: `Status hold berhasil diubah ke ${sta_hold}`, sta_hold, nama_agent });
  } catch (err) { next(err); }
}

// ─── getHoldHistory ───────────────────────────────────────────────────────────
// GET /:kode/hold-status/history
async function getHoldHistory(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('tbl_customer_hold_history', 'U') IS NULL
        CREATE TABLE tbl_customer_hold_history (
          id           INT IDENTITY(1,1) PRIMARY KEY,
          kode         VARCHAR(50)   NOT NULL,
          sta_hold_lama VARCHAR(20)  NULL,
          sta_hold_baru VARCHAR(20)  NOT NULL,
          keterangan   NVARCHAR(500) NULL,
          nama_agent   NVARCHAR(100) NULL,
          created_at   DATETIME      DEFAULT GETDATE()
        )
    `);

    const result = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`
        SELECT sta_hold_lama, sta_hold_baru, keterangan, nama_agent, created_at
        FROM tbl_customer_hold_history
        WHERE kode = @kode
        ORDER BY created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) { next(err); }
}

// GET /:kode/transaksi?page=1&limit=50
async function getTransaksi(req, res, next) {
  try {
    const { kode } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(500, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    const pool = await getPool();

    const dataReq  = pool.request();
    const countReq = pool.request();
    dataReq.timeout  = 15000;
    countReq.timeout = 15000;

    dataReq.input('kode_customer', sql.VarChar(50), kode);
    dataReq.input('offset',        sql.Int,         offset);
    dataReq.input('pageSize',      sql.Int,         pageSize);
    countReq.input('kode_customer', sql.VarChar(50), kode);

    const [dataResult, countResult] = await Promise.all([
      dataReq.query(`
        WITH Base AS (
          SELECT PERIODE, no_trans, tanggal, no_bukti,
                 UPPER(keterangan) AS keterangan,
                 CASE
                     WHEN keterangan LIKE '%ADJUSMENT%'  THEN 'Penyesuaian'
                     WHEN keterangan LIKE '%KOREKSI%'    THEN 'Penyesuaian'
                     WHEN keterangan LIKE '%pendapatan%' THEN 'Pendapatan'
                     WHEN keterangan LIKE '%penjualan%'  THEN 'Penjualan'
                     WHEN keterangan LIKE '%retur%'      THEN 'Retur'
                     WHEN keterangan LIKE '%jurnal%'     THEN 'Pendapatan Lain'
                     ELSE 'Penyesuaian'
                 END AS jenis_transaksi,
                 SUM(debit)  AS debit,
                 SUM(kredit) AS kredit,
                 SUM(SUM(debit) - SUM(kredit)) OVER (ORDER BY tanggal, no_trans) AS saldo_berjalan
          FROM tbl_transaksi
          WHERE LEFT(ctrlAcc, 3) = '105'
            AND kode_perk = @kode_customer
            AND no_bukti <> 'SA'
          GROUP BY PERIODE, no_trans, tanggal, no_bukti, keterangan
        )
        SELECT * FROM Base
        ORDER BY tanggal DESC, no_trans DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
      countReq.query(`
        SELECT COUNT(*) AS total
        FROM (
          SELECT no_trans
          FROM tbl_transaksi
          WHERE LEFT(ctrlAcc, 3) = '105'
            AND kode_perk = @kode_customer
            AND no_bukti <> 'SA'
          GROUP BY PERIODE, no_trans, tanggal, no_bukti, keterangan
        ) AS C
      `),
    ]);

    res.json({
      data:  dataResult.recordset,
      total: countResult.recordset[0].total,
      page:  pageNum,
      limit: pageSize,
    });
  } catch (err) {
    next(err);
  }
}

// GET /:kode/pendapatan-summary
async function getPendapatanSummary(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('kode_customer', sql.VarChar(50), kode)
      .query(`
        SELECT periode, YEAR(tanggal) tahun, MONTH(tanggal) bulan, SUM(kredit - debit) jumlah
        FROM (
            SELECT periode, no_trans, tanggal, no_bukti, keterangan, debit, kredit
            FROM tbl_transaksi
            WHERE LEFT(ctrlAcc, 3) = '105'
              AND kode_perk = @kode_customer
              AND no_bukti <> 'SA'
              AND keterangan LIKE '%PENDAPATAN%'
        ) AS DB
        GROUP BY periode, YEAR(tanggal), MONTH(tanggal)
        ORDER BY YEAR(tanggal) DESC, MONTH(tanggal) DESC
      `);
    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

// GET /:kode/piutang-summary
async function getPiutangSummary(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('kode_customer', sql.VarChar(50), kode)
      .query(`
        SELECT YEAR(tanggal) tahun, MONTH(tanggal) bulan,
               SUM(debit) debit, SUM(kredit) kredit,
               SUM(SUM(debit)-SUM(kredit)) OVER (ORDER BY YEAR(tanggal), MONTH(tanggal) ROWS UNBOUNDED PRECEDING) - (SUM(debit)-SUM(kredit)) AS saldo_sebelum,
               ABS(SUM(debit)-SUM(kredit)) AS nilai,
               SUM(SUM(debit)-SUM(kredit)) OVER (ORDER BY YEAR(tanggal), MONTH(tanggal)) saldo_berjalan,
               GETDATE() tanggal_download
        FROM (
            SELECT TOP 1 * FROM (
                SELECT periode, no_trans, no_bukti, tanggal, keterangan, kode_perk, ref, debit, kredit, Adj, ctrlAcc, sortid
                FROM tbl_transaksi
                WHERE tanggal = '2000-01-01' AND kode_perk = @kode_customer AND no_bukti = 'SA'
                UNION ALL
                SELECT DISTINCT '0', '0', 'SA', '2000-01-01', 'Saldo Awal Generate', @kode_customer, '999-99-99-9999',
                       CASE WHEN SUM(debit) - SUM(kredit) > 0 THEN SUM(debit) - SUM(kredit) ELSE 0 END,
                       CASE WHEN SUM(debit) - SUM(kredit) < 0 THEN SUM(debit) - SUM(kredit) ELSE 0 END,
                       '', '105-06-02-0000', '0'
                FROM tbl_transaksi
                WHERE tanggal < '2000-01-01' AND kode_perk = @kode_customer AND no_bukti <> 'SA'
            ) AS SA ORDER BY no_trans DESC

            UNION ALL
            SELECT periode, no_trans, no_bukti, tanggal, keterangan, kode_perk, ref, debit, kredit, Adj, ctrlAcc, sortid
            FROM tbl_transaksi
            WHERE tanggal >= '2000-01-01' AND tanggal <= GETDATE()
              AND kode_perk = @kode_customer AND no_bukti <> 'SA'
        ) AS DB
        GROUP BY YEAR(tanggal), MONTH(tanggal)
        ORDER BY YEAR(tanggal) DESC, MONTH(tanggal) DESC
      `);
    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

// GET /:kode/sp-belum-piutang
async function getSpBelumPiutang(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('kode_customer', sql.VarChar(50), kode)
      .query(`
        SELECT *, GETDATE() AS tanggal_download
        FROM MJC_SP_PIUTANG_STOK_DETAIL(@kode_customer)
        ORDER BY tanggal DESC
      `);
    res.json({ data: result.recordset });
  } catch (err) {
    next(err);
  }
}

// GET /:kode/piutang
async function getPiutang(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();
    const piutangReq = pool.request();
    piutangReq.timeout = 15000;
    piutangReq.input('kode_customer', sql.VarChar(50), kode);
    const result = await piutangReq.query(`
        SELECT RKP.keterangan, RKP.pemesan,
               ISNULL(RKP.stok,    0)                              AS stok,
               ISNULL(RKP.piutang, 0)                              AS piutang,
               ISNULL(RKP.piutang, 0) + ISNULL(RKP.stok, 0)       AS total_piutangwip,
               ISNULL(CUS.plafon1, 0)                              AS plafon1,
               ISNULL(CUS.plafon2, 0)                              AS plafon2,
               ISNULL(CUS.plafon1, 0) - (ISNULL(RKP.piutang, 0) + ISNULL(RKP.stok, 0)) AS sisa_order
        FROM tbl_Customer CUS
        OUTER APPLY MJC_SP_PIUTANG_STOK_ROW(CUS.kode) RKP
        WHERE CUS.kode = @kode_customer
      `);

    if (!result.recordset.length)
      return res.status(404).json({ message: 'Customer tidak ditemukan' });

    res.json(result.recordset[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, exportAll, getFilterOptions, getOne, getOrders, getPiutang, getSpBelumPiutang, getPiutangSummary, getPendapatanSummary, getTransaksi, updateJatuhTempo, getJatuhTempoHistory, updateHoldStatus, getHoldHistory };
