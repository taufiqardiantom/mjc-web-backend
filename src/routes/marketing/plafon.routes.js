const router = require('express').Router();
const auth   = require('../../middleware/auth.middleware');
const c      = require('../../controllers/marketing/plafon.controller');

router.use(auth);

router.get('/history',              c.getHistory);
router.get('/file/:filename',       c.serveFile);
router.get('/customer/:kode',       c.getCustomerPlafon);
router.post('/customer/:kode',      c.upload.single('file'), c.updatePlafon);

module.exports = router;
