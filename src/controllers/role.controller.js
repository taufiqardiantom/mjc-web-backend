const { getPool, sql } = require('../config/database');

async function getAll(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, role_name, description, is_active, created_at FROM auth_roles ORDER BY id');
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
      .query('SELECT id, role_name, description, is_active, created_at FROM auth_roles WHERE id = @id');
    if (!result.recordset[0]) return res.status(404).json({ message: 'Role tidak ditemukan' });
    res.json(result.recordset[0]);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { role_name, description, is_active = 1 } = req.body;
    if (!role_name) return res.status(400).json({ message: 'Nama role wajib diisi' });
    const pool = await getPool();
    const result = await pool.request()
      .input('role_name', sql.VarChar, role_name)
      .input('description', sql.VarChar, description || null)
      .input('is_active', sql.Bit, is_active)
      .query(`
        INSERT INTO auth_roles (role_name, description, is_active)
        OUTPUT INSERTED.id, INSERTED.role_name, INSERTED.description, INSERTED.is_active
        VALUES (@role_name, @description, @is_active)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Nama role sudah digunakan' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { role_name, description, is_active } = req.body;
    if (!role_name) return res.status(400).json({ message: 'Nama role wajib diisi' });
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('role_name', sql.VarChar, role_name)
      .input('description', sql.VarChar, description || null)
      .input('is_active', sql.Bit, is_active != null ? is_active : 1)
      .query('UPDATE auth_roles SET role_name=@role_name, description=@description, is_active=@is_active WHERE id=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Role tidak ditemukan' });
    res.json({ message: 'Role berhasil diupdate' });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Nama role sudah digunakan' });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM auth_roles WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Role tidak ditemukan' });
    res.json({ message: 'Role berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}

async function getRoleMenus(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('roleId', sql.Int, req.params.id)
      .query(`
        SELECT m.id, m.menu_name, m.menu_code, m.parent_id, m.icon, m.route_path, m.sort_order
        FROM auth_menus m
        JOIN auth_role_menus rm ON m.id = rm.menu_id
        WHERE rm.role_id = @roleId
        ORDER BY m.sort_order
      `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

// body: { menu_ids: [1, 2, 3] }
async function setRoleMenus(req, res, next) {
  try {
    const { menu_ids } = req.body;
    const pool = await getPool();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      await t.request()
        .input('roleId', sql.Int, req.params.id)
        .query('DELETE FROM auth_role_menus WHERE role_id = @roleId');

      for (const menuId of (menu_ids || [])) {
        await t.request()
          .input('roleId', sql.Int, req.params.id)
          .input('menuId', sql.Int, menuId)
          .query('INSERT INTO auth_role_menus (role_id, menu_id) VALUES (@roleId, @menuId)');
      }
      await t.commit();
      res.json({ message: 'Menu role berhasil disimpan' });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, create, update, remove, getRoleMenus, setRoleMenus };
