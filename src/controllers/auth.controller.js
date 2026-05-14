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
      .input('login', sql.VarChar, username)
      .query('SELECT id, username, password, full_name, email, nik, is_active FROM auth_users WHERE username = @login OR nik = @login');

    const user = result.recordset[0];
    if (!user) {
      return res.status(401).json({ message: 'Username/NIK atau password salah' });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'Akun tidak aktif' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Username/NIK atau password salah' });
    }

    const payload = { id: user.id, username: user.username, full_name: user.full_name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    let karyawan = null;
    if (user.nik) {
      try {
        const karRes = await pool.request()
          .input('nik', sql.VarChar(50), user.nik)
          .query(`
            SELECT TOP 1 nik, nama, nama_jabatan, nama_bagian, sta_pimpinan, nama_job, status_ker
            FROM [192.168.54.2].db_personaliamjc.dbo.v_detail_karyawan
            WHERE nik = @nik
          `);
        karyawan = karRes.recordset[0] || null;
      } catch {
        // linked server tidak terjangkau, lanjutkan tanpa data karyawan
      }
    }

    res.json({
      token,
      user: {
        id: user.id, username: user.username, full_name: user.full_name,
        email: user.email, nik: user.nik,
        ...(karyawan && {
          nama:         karyawan.nama,
          nama_jabatan: karyawan.nama_jabatan,
          nama_bagian:  karyawan.nama_bagian,
          nama_job:     karyawan.nama_job,
          sta_pimpinan: karyawan.sta_pimpinan,
          status_ker:   karyawan.status_ker,
        }),
      },
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
      .query('SELECT id, username, full_name, email, nik, is_active FROM auth_users WHERE id = @id');

    const user = userResult.recordset[0];
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    let karyawan = null;
    if (user.nik) {
      try {
        const karRes = await pool.request()
          .input('nik', sql.VarChar(50), user.nik)
          .query(`
            SELECT TOP 1 nik, nama, nama_jabatan, nama_bagian, sta_pimpinan, nama_job, status_ker
            FROM [192.168.54.2].db_personaliamjc.dbo.v_detail_karyawan
            WHERE nik = @nik
          `);
        karyawan = karRes.recordset[0] || null;
      } catch {
        // linked server tidak terjangkau, lanjutkan tanpa data karyawan
      }
    }

    // Menu yang boleh diakses:
    // (menu dari role) UNION (custom grant) MINUS (custom revoke) + semua ancestor-nya
    const menuResult = await pool.request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        ;WITH GrantedMenus AS (
          SELECT DISTINCT menu_id
          FROM (
            SELECT rm.menu_id FROM auth_role_menus rm
            JOIN auth_user_roles ur ON rm.role_id = ur.role_id WHERE ur.user_id = @userId
            UNION
            SELECT um.menu_id FROM auth_user_menus um WHERE um.user_id = @userId AND um.is_granted = 1
          ) G
          WHERE menu_id NOT IN (
            SELECT menu_id FROM auth_user_menus WHERE user_id = @userId AND is_granted = 0
          )
        ),
        Ancestors AS (
          SELECT m.parent_id AS id
          FROM auth_menus m JOIN GrantedMenus g ON m.id = g.menu_id
          WHERE m.parent_id IS NOT NULL
          UNION ALL
          SELECT m.parent_id
          FROM auth_menus m JOIN Ancestors a ON m.id = a.id
          WHERE m.parent_id IS NOT NULL
        )
        SELECT DISTINCT m.id, m.menu_name, m.menu_code, m.parent_id, m.icon, m.route_path, m.sort_order
        FROM auth_menus m
        WHERE m.is_active = 1
          AND (
            m.id IN (SELECT menu_id FROM GrantedMenus)
            OR m.id IN (SELECT id FROM Ancestors WHERE id IS NOT NULL)
          )
        ORDER BY m.sort_order, m.id
      `);

    const userOut = {
      ...user,
      ...(karyawan && {
        nama:         karyawan.nama,
        nama_jabatan: karyawan.nama_jabatan,
        nama_bagian:  karyawan.nama_bagian,
        nama_job:     karyawan.nama_job,
        sta_pimpinan: karyawan.sta_pimpinan,
        status_ker:   karyawan.status_ker,
      }),
    };

    res.json({ user: userOut, menus: menuResult.recordset });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { username, password, full_name, email, nik } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password minimal 6 karakter' });
    }
    if (!nik || !String(nik).trim()) {
      return res.status(400).json({ message: 'NIK wajib diisi' });
    }

    const pool = await getPool();

    // Validasi NIK ke database personalia
    const nikCheck = await pool.request()
      .input('nik', sql.VarChar(50), String(nik).trim())
      .query(`
        SELECT TOP 1 nik
        FROM [192.168.54.2].db_personaliamjc.dbo.v_detail_karyawan
        WHERE nik = @nik
      `);

    if (nikCheck.recordset.length === 0) {
      return res.status(403).json({ message: 'Register Gagal.. Hubungi IT..' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hash)
      .input('full_name', sql.VarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .input('nik', sql.VarChar, String(nik).trim())
      .query(`
        INSERT INTO auth_users (username, password, full_name, email, nik)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name, INSERTED.email, INSERTED.nik
        VALUES (@username, @password, @full_name, @email, @nik)
      `);

    res.status(201).json({ message: 'Registrasi berhasil', user: result.recordset[0] });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Username sudah digunakan' });
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { full_name, email, nik } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.user.id)
      .input('full_name', sql.VarChar, full_name || null)
      .input('email', sql.VarChar, email || null)
      .input('nik', sql.VarChar, nik || null)
      .query(`
        UPDATE auth_users
        SET full_name = @full_name, email = @email, nik = @nik, updated_at = GETDATE()
        WHERE id = @id
      `);
    const result = await pool.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT id, username, full_name, email, nik, is_active, created_at FROM auth_users WHERE id = @id');
    res.json({ message: 'Profil berhasil diperbarui', user: result.recordset[0] });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ message: 'Password lama dan baru wajib diisi' });
    if (new_password.length < 6)
      return res.status(400).json({ message: 'Password baru minimal 6 karakter' });

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT password FROM auth_users WHERE id = @id');

    const user = result.recordset[0];
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ message: 'Password lama tidak sesuai' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.request()
      .input('id', sql.Int, req.user.id)
      .input('password', sql.VarChar, hash)
      .query('UPDATE auth_users SET password = @password, updated_at = GETDATE() WHERE id = @id');

    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, register, updateProfile, changePassword };
