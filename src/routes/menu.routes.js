const router = require('express').Router();
const c = require('../controllers/menu.controller');
const auth = require('../middleware/auth.middleware');

router.use(auth);

router.get('/', c.getAll);
router.get('/flat', c.getFlat);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
