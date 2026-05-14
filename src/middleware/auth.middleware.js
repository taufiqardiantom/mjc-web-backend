const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Update last_seen — fire-and-forget, tidak memblokir response
    getPool().then((pool) =>
      pool.request()
        .input('id', sql.Int, decoded.id)
        .query('UPDATE auth_users SET last_seen = GETDATE() WHERE id = @id')
    ).catch(() => {});

    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa' });
  }
}

module.exports = authMiddleware;
