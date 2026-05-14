const router = require('express').Router();
const auth   = require('../../middleware/auth.middleware');
const c      = require('../../controllers/marketing/frpp.controller');

router.use(auth);

// Static routes — harus didefinisikan sebelum wildcard/regex
router.get('/',              c.getAll);
router.post('/',             c.createFrpp);
router.get('/proyek-list',      c.getProyekList);
router.get('/jenis-order',      c.getJenisOrder);
router.get('/jenis-pekerjaan',  c.getJenisPekerjaan);
router.get('/jenis-kertas',     c.getJenisKertas);
router.post('/proyek',          c.createProyek);

// Helper: inject no_frpp dari regex capture group ke req.params
function withNoFrpp(handler) {
  return (req, res, next) => {
    req.params.no_frpp = decodeURIComponent(req.params[0]);
    handler(req, res, next);
  };
}

// Regex routes: menangkap no_frpp yang mengandung slash (karena gateway
// mendecode %2F → / sebelum proxy, sehingga /:no_frpp tidak bisa match)
// Urutan penting: suffix yang lebih panjang harus lebih dulu
router.put(/^\/(.+)\/revisi$/,                withNoFrpp(c.revisiFrpp));
router.post(/^\/(.+)\/request-approval-sph$/, withNoFrpp(c.requestApprovalSph));
router.post(/^\/(.+)\/request-approval$/,     withNoFrpp(c.requestApproval));
router.post(/^\/(.+)\/import-kalkulasi$/,     withNoFrpp(c.importKalkulasi));
router.post(/^\/(.+)\/check-kalkulasi$/,      withNoFrpp(c.checkKalkulasi));
router.post(/^\/(.+)\/validate-kalkulasi$/,   withNoFrpp(c.validateKalkulasi));
router.post(/^\/(.+)\/approve-sph$/,          withNoFrpp(c.approveSph));
router.post(/^\/(.+)\/approve$/,              withNoFrpp(c.approve));
router.get(/^\/(.+)$/,                        withNoFrpp(c.getOne));

module.exports = router;
