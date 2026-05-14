const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/database');

async function getAll(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT u.id, u.username, u.full_name, u.email, u.nik, u.is_active, u.created_at, u.last_seen,
             STUFF((
               SELECT ', ' + r2.role_name
               FROM auth_user_roles ur2
               JOIN auth_roles r2 ON ur2.role_id = r2.id
               WHERE ur2.user_id = u.id
               FOR XML PATH(''), TYPE
             ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS roles
      FROM auth_users u
      ORDER BY u.last_seen DESC, u.id
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT id, username, full_name, email, nik, is_active, created_at FROM auth_users WHERE id = @id');
    if (!result.recordset[0]) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(result.recordset[0]);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { username, password, full_name, email, nik, is_active = 1 } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi' });
    }
    const hash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hash)
      .input('full_name', sql.VarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .input('nik', sql.VarChar, nik || null)
      .input('is_active', sql.Bit, is_active)
      .query(`
        INSERT INTO auth_users (username, password, full_name, email, nik, is_active)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name, INSERTED.email, INSERTED.nik, INSERTED.is_active
        VALUES (@username, @password, @full_name, @email, @nik, @is_active)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Username sudah digunakan' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { full_name, email, nik, is_active, password } = req.body;
    const pool = await getPool();
    const req2 = pool.request().input('id', sql.Int, req.params.id)
      .input('full_name', sql.VarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .input('nik', sql.VarChar, nik || null)
      .input('is_active', sql.Bit, is_active != null ? is_active : 1);

    let query = `
      UPDATE auth_users SET full_name=@full_name, email=@email, nik=@nik, is_active=@is_active, updated_at=GETDATE()
    `;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      req2.input('password', sql.VarChar, hash);
      query += ', password=@password';
    }
    query += ' WHERE id=@id';

    const result = await req2.query(query);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json({ message: 'User berhasil diupdate' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ message: 'Password minimal 6 karakter' });

    const hash = await bcrypt.hash(new_password, 10);
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('password', sql.VarChar, hash)
      .query(`
        UPDATE auth_users
        SET password = @password, updated_at = GETDATE()
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0)
      return res.status(404).json({ message: 'User tidak ditemukan' });

    res.json({ message: 'Password berhasil direset' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM auth_users WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}

async function getRoles(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.params.id)
      .query(`
        SELECT r.id, r.role_name, r.description, r.is_active
        FROM auth_roles r
        JOIN auth_user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = @userId
        ORDER BY r.role_name
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

async function assignRole(req, res, next) {
  try {
    const { role_id } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('userId', sql.Int, req.params.id)
      .input('roleId', sql.Int, role_id)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM auth_user_roles WHERE user_id=@userId AND role_id=@roleId)
          INSERT INTO auth_user_roles (user_id, role_id) VALUES (@userId, @roleId)
      `);
    res.json({ message: 'Role berhasil ditambahkan' });
  } catch (err) {
    next(err);
  }
}

async function removeRole(req, res, next) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('userId', sql.Int, req.params.id)
      .input('roleId', sql.Int, req.params.roleId)
      .query('DELETE FROM auth_user_roles WHERE user_id=@userId AND role_id=@roleId');
    res.json({ message: 'Role berhasil dicabut' });
  } catch (err) {
    next(err);
  }
}

async function getUserMenus(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.params.id)
      .query(`
        SELECT um.menu_id, m.menu_name, m.menu_code, um.is_granted
        FROM auth_user_menus um
        JOIN auth_menus m ON um.menu_id = m.id
        WHERE um.user_id = @userId
        ORDER BY m.sort_order
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// body: { menus: [{ menu_id, is_granted }] }
async function setUserMenus(req, res, next) {
  try {
    const { menus } = req.body;
    const pool = await getPool();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      await t.request()
        .input('userId', sql.Int, req.params.id)
        .query('DELETE FROM auth_user_menus WHERE user_id = @userId');

      for (const m of (menus || [])) {
        await t.request()
          .input('userId', sql.Int, req.params.id)
          .input('menuId', sql.Int, m.menu_id)
          .input('isGranted', sql.Bit, m.is_granted != null ? m.is_granted : 1)
          .query('INSERT INTO auth_user_menus (user_id, menu_id, is_granted) VALUES (@userId, @menuId, @isGranted)');
      }
      await t.commit();
      res.json({ message: 'Custom menu user berhasil disimpan' });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, create, update, resetPassword, remove, getRoles, assignRole, removeRole, getUserMenus, setUserMenus };
