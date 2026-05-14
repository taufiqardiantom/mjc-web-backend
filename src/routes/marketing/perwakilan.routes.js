const router = require('express').Router();
const auth   = require('../../middleware/auth.middleware');
const c      = require('../../controllers/marketing/perwakilan.controller');

router.use(auth);
router.get('/', c.getAll);

module.exports = router;
