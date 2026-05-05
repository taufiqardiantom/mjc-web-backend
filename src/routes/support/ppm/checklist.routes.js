const router = require('express').Router();
const ctrl = require('../../../controllers/support/ppm/checklist.controller');
const auth = require('../../../middleware/auth.middleware');

router.use(auth);

// ─── List & by-SPO (existing) ─────────────────────────────────────────────────
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

// ─── Report Harian ────────────────────────────────────────────────────────────
router.post('/report/daily', ctrl.getDailyReport);
router.get('/report/agents', ctrl.getReportAgents);

module.exports = router;
