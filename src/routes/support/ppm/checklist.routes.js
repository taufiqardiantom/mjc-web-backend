const router = require('express').Router();
const ctrl = require('../../../controllers/support/ppm/checklist.controller');
const auth = require('../../../middleware/auth.middleware');

router.use(auth);

// ─── List & by-SPO (existing) ─────────────────────────────────────────────────
router.get('/server-time', ctrl.getServerTime);
router.get('/', ctrl.getAll);
router.post('/byspo', ctrl.getByNospo);

// ─── Detail (poin + subpoin + check status) ───────────────────────────────────
router.post('/detail', ctrl.getDetail);

// ─── Check subpoin ────────────────────────────────────────────────────────────
router.post('/check', ctrl.saveCheck);
router.post('/check-history', ctrl.getCheckHistory);

// ─── Bahan Baku ───────────────────────────────────────────────────────────────
router.post('/bahanbaku/list', ctrl.getBahanBaku);
router.post('/bahanbaku/check', ctrl.saveBahanBakuCheck);
router.post('/bahanbaku/history', ctrl.getBahanBakuHistory);

// ─── Bahan Pendukung ──────────────────────────────────────────────────────────
router.post('/bahanpendukung/list', ctrl.getBahanPendukung);
router.post('/bahanpendukung/add', ctrl.addBahanPendukung);
router.post('/bahanpendukung/check', ctrl.saveBahanPendukungCheck);
router.post('/bahanpendukung/history', ctrl.getBahanPendukungHistory);

// ─── Bulk Check ───────────────────────────────────────────────────────────────
router.post('/bulk-check', ctrl.bulkCheck);

// ─── Proses Cetak ─────────────────────────────────────────────────────────────
router.post('/prosescetak/list', ctrl.getProsesCetak);
router.post('/prosescetak/check', ctrl.saveProsesCetakCheck);
router.post('/prosescetak/history', ctrl.getProsesCetakHistory);

// ─── Proses Pasca Cetak ───────────────────────────────────────────────────────
router.post('/prosespascacetak/list', ctrl.getProsesPascaCetak);
router.post('/prosespascacetak/bulk-check', ctrl.bulkProsesPascaCetakCheck);
router.post('/prosespascacetak/check', ctrl.saveProsesPascaCetakCheck);
router.post('/prosespascacetak/history', ctrl.getProsesPascaCetakHistory);

// ─── Artwork / File Materi ────────────────────────────────────────────────────
router.post('/artwork/list', ctrl.getArtwork);
router.post('/artwork/check', ctrl.saveFilemateriCheck);
router.post('/artwork/history', ctrl.getFilemateriHistory);

// ─── Report Harian ────────────────────────────────────────────────────────────
router.post('/report/daily', ctrl.getDailyReport);
router.get('/report/agents', ctrl.getReportAgents);

module.exports = router;
