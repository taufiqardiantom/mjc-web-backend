const { getPool, sql } = require('../config/database');

async function getAll(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, menu_name, menu_code, parent_id, icon, route_path, sort_order, is_active, created_at
      FROM auth_menus
      ORDER BY sort_order, id
    `);
    // Build tree
    const flat = result.recordset;
    const map = {};
    const roots = [];
    flat.forEach(m => { map[m.id] = { ...m, children: [] }; });
    flat.forEach(m => {
      if (m.parent_id && map[m.parent_id]) {
        map[m.parent_id].children.push(map[m.id]);
      } else {
        roots.push(map[m.id]);
      }
    });
    res.json(roots);
  } catch (err) {
    next(err);
  }
}

async function getFlat(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, menu_name, menu_code, parent_id, icon, route_path, sort_order, is_active
      FROM auth_menus ORDER BY sort_order, id
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { menu_name, menu_code, parent_id, icon, route_path, sort_order = 0, is_active = 1 } = req.body;
    if (!menu_name || !menu_code) {
      return res.status(400).json({ message: 'Nama menu dan kode menu wajib diisi' });
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('menu_name', sql.VarChar, menu_name)
      .input('menu_code', sql.VarChar, menu_code.toUpperCase())
      .input('parent_id', sql.Int, parent_id || null)
      .input('icon', sql.VarChar, icon || null)
      .input('route_path', sql.VarChar, route_path || null)
      .input('sort_order', sql.Int, sort_order)
      .input('is_active', sql.Bit, is_active)
      .query(`
        INSERT INTO auth_menus (menu_name, menu_code, parent_id, icon, route_path, sort_order, is_active)
        OUTPUT INSERTED.*
        VALUES (@menu_name, @menu_code, @parent_id, @icon, @route_path, @sort_order, @is_active)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Kode menu sudah digunakan' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { menu_name, menu_code, parent_id, icon, route_path, sort_order, is_active } = req.body;
    if (!menu_name || !menu_code) {
      return res.status(400).json({ message: 'Nama menu dan kode menu wajib diisi' });
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('menu_name', sql.VarChar, menu_name)
      .input('menu_code', sql.VarChar, menu_code.toUpperCase())
      .input('parent_id', sql.Int, parent_id || null)
      .input('icon', sql.VarChar, icon || null)
      .input('route_path', sql.VarChar, route_path || null)
      .input('sort_order', sql.Int, sort_order != null ? sort_order : 0)
      .input('is_active', sql.Bit, is_active != null ? is_active : 1)
      .query(`
        UPDATE auth_menus SET menu_name=@menu_name, menu_code=@menu_code, parent_id=@parent_id,
          icon=@icon, route_path=@route_path, sort_order=@sort_order, is_active=@is_active
        WHERE id=@id
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Menu tidak ditemukan' });
    res.json({ message: 'Menu berhasil diupdate' });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Kode menu sudah digunakan' });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const pool = await getPool();
    // Cek apakah ada submenu
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS cnt FROM auth_menus WHERE parent_id = @id');
    if (check.recordset[0].cnt > 0) {
      return res.status(400).json({ message: 'Menu masih memiliki submenu, hapus submenu terlebih dahulu' });
    }
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM auth_menus WHERE id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Menu tidak ditemukan' });
    res.json({ message: 'Menu berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getFlat, create, update, remove };
