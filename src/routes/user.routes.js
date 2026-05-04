const router = require('express').Router();
const c = require('../controllers/user.controller');
const auth = require('../middleware/auth.middleware');

router.use(auth);

router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

router.get('/:id/roles', c.getRoles);
router.post('/:id/roles', c.assignRole);
router.delete('/:id/roles/:roleId', c.removeRole);

router.get('/:id/menus', c.getUserMenus);
router.put('/:id/menus', c.setUserMenus);

module.exports = router;
