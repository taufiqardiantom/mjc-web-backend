const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/database');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT id, username, password, full_name, email, is_active FROM auth_users WHERE username = @username');

    const user = result.recordset[0];
    if (!user) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'Akun tidak aktif' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const payload = { id: user.id, username: user.username, full_name: user.full_name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const pool = await getPool();

    // User info
    const userResult = await pool.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT id, username, full_name, email, is_active FROM auth_users WHERE id = @id');

    const user = userResult.recordset[0];
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Menu yang boleh diakses:
    // (menu dari role user) UNION (user_menus is_granted=1) MINUS (user_menus is_granted=0)
    const menuResult = await pool.request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT DISTINCT m.id, m.menu_name, m.menu_code, m.parent_id, m.icon, m.route_path, m.sort_order
        FROM auth_menus m
        WHERE m.is_active = 1
          AND (
            -- dari role
            m.id IN (
              SELECT rm.menu_id FROM auth_role_menus rm
              JOIN auth_user_roles ur ON rm.role_id = ur.role_id
              WHERE ur.user_id = @userId
            )
            -- atau custom grant
            OR m.id IN (
              SELECT um.menu_id FROM auth_user_menus um
              WHERE um.user_id = @userId AND um.is_granted = 1
            )
          )
          -- kecuali yang dicabut
          AND m.id NOT IN (
            SELECT um.menu_id FROM auth_user_menus um
            WHERE um.user_id = @userId AND um.is_granted = 0
          )
        ORDER BY m.sort_order, m.id
      `);

    res.json({ user, menus: menuResult.recordset });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { username, password, full_name, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter' });
    }

    const hash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hash)
      .input('full_name', sql.VarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .query(`
        INSERT INTO auth_users (username, password, full_name, email)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name, INSERTED.email
        VALUES (@username, @password, @full_name, @email)
      `);

    res.status(201).json({ message: 'Registrasi berhasil', user: result.recordset[0] });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Username sudah digunakan' });
    next(err);
  }
}

module.exports = { login, me, register };
