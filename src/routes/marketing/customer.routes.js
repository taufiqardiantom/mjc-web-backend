const router = require('express').Router();
const auth   = require('../../middleware/auth.middleware');
const c      = require('../../controllers/marketing/customer.controller');

router.use(auth);

router.get('/filter-options',              c.getFilterOptions);
router.get('/export',                     c.exportAll);
router.get('/',                           c.getAll);
router.get('/:kode/jatuh-tempo/history',  c.getJatuhTempoHistory);
router.put('/:kode/jatuh-tempo',          c.updateJatuhTempo);
router.get('/:kode/hold-status/history',  c.getHoldHistory);
router.put('/:kode/hold-status',          c.updateHoldStatus);
router.get('/:kode/orders',               c.getOrders);
router.get('/:kode/piutang',              c.getPiutang);
router.get('/:kode/sp-belum-piutang',     c.getSpBelumPiutang);
router.get('/:kode/piutang-summary',      c.getPiutangSummary);
router.get('/:kode/pendapatan-summary',   c.getPendapatanSummary);
router.get('/:kode/transaksi',            c.getTransaksi);
router.get('/:kode',                      c.getOne);

module.exports = router;
