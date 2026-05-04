const router = require('express').Router();
const c = require('../controllers/role.controller');
const auth = require('../middleware/auth.middleware');

router.use(auth);

router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

router.get('/:id/menus', c.getRoleMenus);
router.put('/:id/menus', c.setRoleMenus);

module.exports = router;
