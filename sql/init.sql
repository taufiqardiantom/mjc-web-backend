-- ============================================================
-- MJC Web App - Database Initialization Script
-- SQL Server 2014
-- ============================================================

USE mjc_db;
GO

-- 1. Users
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  username   VARCHAR(100) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  full_name  VARCHAR(200) NULL,
  email      VARCHAR(200) NULL,
  is_active  BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- 2. Roles
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
CREATE TABLE roles (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  role_name   VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  is_active   BIT NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- 3. Menus (self-referencing untuk submenu)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='menus' AND xtype='U')
CREATE TABLE menus (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  menu_name   VARCHAR(100) NOT NULL,
  menu_code   VARCHAR(50)  NOT NULL UNIQUE,
  parent_id   INT NULL REFERENCES menus(id),
  icon        VARCHAR(100) NULL,
  route_path  VARCHAR(200) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BIT NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- 4. User Roles (many-to-many)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_roles' AND xtype='U')
CREATE TABLE user_roles (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  role_id    INT NOT NULL REFERENCES roles(id),
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);
GO

-- 5. Role Menus (default menu per role)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='role_menus' AND xtype='U')
CREATE TABLE role_menus (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  role_id    INT NOT NULL REFERENCES roles(id),
  menu_id    INT NOT NULL REFERENCES menus(id),
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT uq_role_menu UNIQUE (role_id, menu_id)
);
GO

-- 6. User Menus (custom override per user)
--    is_granted=1 => tambahkan menu ini ke user (walau role tidak punya)
--    is_granted=0 => cabut menu ini dari user (walau role punya)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_menus' AND xtype='U')
CREATE TABLE user_menus (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  menu_id    INT NOT NULL REFERENCES menus(id),
  is_granted BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT uq_user_menu UNIQUE (user_id, menu_id)
);
GO

-- ============================================================
-- Seed Data: Admin user + Admin role + menus default
-- ============================================================

-- Admin role
IF NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Administrator')
  INSERT INTO roles (role_name, description) VALUES ('Administrator', 'Full access role');
GO

-- Admin user (password: admin123)
IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')
  INSERT INTO users (username, password, full_name, email)
  VALUES ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin@mjc.com');
GO

-- Assign admin role to admin user
IF NOT EXISTS (SELECT 1 FROM user_roles ur
               JOIN users u ON ur.user_id = u.id AND u.username = 'admin'
               JOIN roles r ON ur.role_id = r.id AND r.role_name = 'Administrator')
  INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id FROM users u, roles r
  WHERE u.username = 'admin' AND r.role_name = 'Administrator';
GO

-- Default menus
IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'DASHBOARD')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  VALUES ('Dashboard', 'DASHBOARD', NULL, 'HomeIcon', '/dashboard', 1);
GO

IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'USER_MGMT')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  VALUES ('User Management', 'USER_MGMT', NULL, 'UsersIcon', NULL, 2);
GO

IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'USERS')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  SELECT 'Users', 'USERS', id, 'UserIcon', '/users', 1 FROM menus WHERE menu_code = 'USER_MGMT';
GO

IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'ROLES')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  SELECT 'Roles', 'ROLES', id, 'ShieldCheckIcon', '/roles', 2 FROM menus WHERE menu_code = 'USER_MGMT';
GO

IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'CONFIG')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  VALUES ('Konfigurasi', 'CONFIG', NULL, 'Cog6ToothIcon', NULL, 3);
GO

IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_code = 'MENUS')
  INSERT INTO menus (menu_name, menu_code, parent_id, icon, route_path, sort_order)
  SELECT 'Menu Manager', 'MENUS', id, 'Bars3Icon', '/menus', 1 FROM menus WHERE menu_code = 'CONFIG';
GO

-- Assign all menus to Administrator role
INSERT INTO role_menus (role_id, menu_id)
SELECT r.id, m.id
FROM roles r, menus m
WHERE r.role_name = 'Administrator'
  AND NOT EXISTS (
    SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );
GO
