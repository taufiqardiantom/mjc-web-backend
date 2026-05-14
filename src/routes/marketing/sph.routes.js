const router = require('express').Router();
const auth   = require('../../middleware/auth.middleware');
const c      = require('../../controllers/marketing/sph.controller');

router.use(auth);

router.post('/',                             c.create);
router.post('/:no_frpp/request-approval',   c.requestApproval);

module.exports = router;
