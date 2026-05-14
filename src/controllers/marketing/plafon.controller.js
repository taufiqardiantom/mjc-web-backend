const { getPool, sql } = require('../../config/database');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ─── File upload setup ───────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../../uploads/plafon');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf')
      return cb(new Error('Hanya file PDF yang diizinkan'));
    cb(null, true);
  },
});

// ─── Ensure history table ────────────────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('customer_plafon_history', 'U') IS NULL
    CREATE TABLE customer_plafon_history (
      id          INT IDENTITY(1,1) PRIMARY KEY,
      kode        VARCHAR(50)    NOT NULL,
      nama        NVARCHAR(200)  NULL,
      plafon1_old NUMERIC(18,2)  NULL,
      plafon2_old NUMERIC(18,2)  NULL,
      plafon1_new NUMERIC(18,2)  NULL,
      plafon2_new NUMERIC(18,2)  NULL,
      notes       NVARCHAR(500)  NULL,
      file_name   NVARCHAR(255)  NULL,
      file_path   NVARCHAR(500)  NULL,
      created_at  DATETIME       NOT NULL DEFAULT GETDATE(),
      created_by  NVARCHAR(100)  NULL,
      ip_address  VARCHAR(50)    NULL
    )
  `);
  tableReady = true;
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

// GET /api/marketing/plafon/customer/:kode
async function getCustomerPlafon(req, res, next) {
  try {
    const { kode } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`
        SELECT kode, nama, plafon1, plafon2, sta_aktif, sta_hold
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

// POST /api/marketing/plafon/customer/:kode
async function updatePlafon(req, res, next) {
  try {
    const { kode } = req.params;
    const { plafon1_new, plafon2_new, notes } = req.body;
    const file = req.file;

    await ensureTable();
    const pool = await getPool();

    const current = await pool.request()
      .input('kode', sql.VarChar(50), kode)
      .query(`SELECT kode, nama, plafon1, plafon2 FROM v_customer WHERE kode = @kode`);
    if (!current.recordset.length)
      return res.status(404).json({ message: 'Customer tidak ditemukan' });

    const { nama, plafon1: plafon1_old, plafon2: plafon2_old } = current.recordset[0];

    if (plafon1_new == null || plafon1_new === '' || plafon2_new == null || plafon2_new === '')
      return res.status(400).json({ message: 'Plafon 1 dan Plafon 2 wajib diisi' });

    await pool.request()
      .input('kode', sql.VarChar(50),    kode)
      .input('p1',   sql.Numeric(18, 2), Number(plafon1_new))
      .input('p2',   sql.Numeric(18, 2), Number(plafon2_new))
      .query(`UPDATE tbl_customer SET plafon1 = @p1, plafon2 = @p2 WHERE kode = @kode`);

    await pool.request()
      .input('kode',        sql.VarChar(50),    kode)
      .input('nama',        sql.NVarChar(200),   nama            || null)
      .input('plafon1_old', sql.Numeric(18, 2),  plafon1_old     ?? null)
      .input('plafon2_old', sql.Numeric(18, 2),  plafon2_old     ?? null)
      .input('plafon1_new', sql.Numeric(18, 2),  plafon1_new != null ? Number(plafon1_new) : null)
      .input('plafon2_new', sql.Numeric(18, 2),  plafon2_new != null ? Number(plafon2_new) : null)
      .input('notes',       sql.NVarChar(500),   notes           || null)
      .input('file_name',   sql.NVarChar(255),   file ? file.originalname : null)
      .input('file_path',   sql.NVarChar(500),   file ? file.filename     : null)
      .input('created_by',  sql.NVarChar(100),   req.user?.username       || null)
      .input('ip_address',  sql.VarChar(50),     getIp(req))
      .query(`
        INSERT INTO tbl_customer_plafon_history
          (kode, nama, plafon1_old, plafon2_old, plafon1_new, plafon2_new,
           notes, file_name, file_path, created_by, ip_address)
        VALUES
          (@kode, @nama, @plafon1_old, @plafon2_old, @plafon1_new, @plafon2_new,
           @notes, @file_name, @file_path, @created_by, @ip_address)
      `);

    res.json({ message: 'Plafon berhasil disimpan' });
  } catch (err) {
    next(err);
  }
}

// GET /api/marketing/plafon/history?kode=&page=&limit=
async function getHistory(req, res, next) {
  try {
    await ensureTable();
    const { kode, page = 1, limit = 20 } = req.query;
    const pool    = await getPool();
    const where   = [];
    const inputs  = [];

    if (kode) {
      where.push('kode = @kode');
      inputs.push({ name: 'kode', type: sql.VarChar(50), val: kode });
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    const dataReq  = pool.request();
    const countReq = pool.request();
    inputs.forEach(({ name, type, val }) => {
      dataReq.input(name, type, val);
      countReq.input(name, type, val);
    });
    dataReq.input('offset',   sql.Int, offset);
    dataReq.input('pageSize', sql.Int, pageSize);

    const [dataResult, countResult] = await Promise.all([
      dataReq.query(`
        SELECT id, kode, nama, plafon1_old, plafon2_old, plafon1_new, plafon2_new,
               notes, file_name, file_path, created_at, created_by, ip_address
        FROM tbl_customer_plafon_history 
        ${whereStr}
        ORDER BY created_at DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `),
      countReq.query(`SELECT COUNT(*) AS total FROM tbl_customer_plafon_history ${whereStr}`),
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

// GET /api/marketing/plafon/file/:filename — serve PDF dengan auth
function serveFile(req, res, next) {
  try {
    const safeName = path.basename(req.params.filename); // cegah path traversal
    const filePath = path.join(uploadDir, safeName);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: 'File tidak ditemukan' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { getCustomerPlafon, updatePlafon, getHistory, serveFile, upload };
