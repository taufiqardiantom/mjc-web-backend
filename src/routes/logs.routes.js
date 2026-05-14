const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const c      = require('../controllers/logs.controller');

router.use(auth);

router.get('/',        c.getAll);
router.delete('/old',  c.deleteOld);
router.delete('/:id',  c.deleteOne);

module.exports = router;
