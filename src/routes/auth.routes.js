const router = require('express').Router();
const { login, me, register, updateProfile, changePassword } = require('../controllers/auth.controller');
const auth = require('../middleware/auth.middleware');

router.post('/login', login);
router.post('/register', register);
router.get('/me', auth, me);
router.patch('/profile', auth, updateProfile);
router.patch('/change-password', auth, changePassword);

module.exports = router;
