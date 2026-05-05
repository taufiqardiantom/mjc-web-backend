-- ============================================================
-- DDL  : tbl_checklistppm_* — Checklist PPM
-- DB   : NewProMJC
-- Run  : sekali, idempoten (IF NOT EXISTS di setiap tabel)
-- ============================================================
USE NewProMJC;
GO

-- ─── 1. Master Poin ──────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_poin', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_poin (
  id         INT            IDENTITY(1,1) PRIMARY KEY,
  urutan     TINYINT        NOT NULL,
  nama       NVARCHAR(100)  NOT NULL,
  is_active  BIT            NOT NULL DEFAULT 1,
  created_at DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- ─── 2. Master Subpoin ───────────────────────────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_subpoin', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_subpoin (
  id         INT            IDENTITY(1,1) PRIMARY KEY,
  id_poin    INT            NOT NULL,
  urutan     TINYINT        NOT NULL,
  nama       NVARCHAR(200)  NOT NULL,
  -- 'bahan_baku' | 'bahan_pendukung' | 'file_materi' | NULL
  has_detail NVARCHAR(30)   NULL,
  is_active  BIT            NOT NULL DEFAULT 1,
  created_at DATETIME       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT FK_subpoin_poin FOREIGN KEY (id_poin)
    REFERENCES dbo.tbl_checklistppm_poin(id)
);
GO

-- ─── 3. Check subpoin per SPO (latest state) ─────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_check', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_check (
  id         INT             IDENTITY(1,1) PRIMARY KEY,
  no_spo     NVARCHAR(50)   NOT NULL,
  id_subpoin INT            NOT NULL,
  -- 'OK' | 'NOT-OK'
  status     NVARCHAR(10)   NULL,
  tgl_check  DATETIME       NULL,
  nama_agent NVARCHAR(100)  NULL,
  keterangan NVARCHAR(1000) NULL,
  updated_at DATETIME       NULL,
  CONSTRAINT UQ_check_spo_subpoin UNIQUE (no_spo, id_subpoin),
  CONSTRAINT FK_check_subpoin FOREIGN KEY (id_subpoin)
    REFERENCES dbo.tbl_checklistppm_subpoin(id)
);
GO

-- ─── 4. Historis check subpoin ───────────────────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_check_history', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_check_history (
  id         INT             IDENTITY(1,1) PRIMARY KEY,
  no_spo     NVARCHAR(50)   NOT NULL,
  id_subpoin INT            NOT NULL,
  status     NVARCHAR(10)   NULL,
  tgl_check  DATETIME       NULL,
  nama_agent NVARCHAR(100)  NULL,
  keterangan NVARCHAR(1000) NULL,
  created_at DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- ─── 5. Check bahan baku per (no_spo, spek, kode_bahan) ─────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_bahanbaku_check', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_bahanbaku_check (
  id         INT             IDENTITY(1,1) PRIMARY KEY,
  no_spo     NVARCHAR(50)   NOT NULL,
  spek       NVARCHAR(100)  NOT NULL DEFAULT '',
  kode_bahan NVARCHAR(50)   NOT NULL,
  status     NVARCHAR(10)   NULL,
  tgl_check  DATETIME       NULL,
  nama_agent NVARCHAR(100)  NULL,
  keterangan NVARCHAR(1000) NULL,
  updated_at DATETIME       NULL,
  CONSTRAINT UQ_bahanbaku_check UNIQUE (no_spo, spek, kode_bahan)
);
GO

-- ─── 6. Historis check bahan baku ────────────────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_bahanbaku_history', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_bahanbaku_history (
  id         INT             IDENTITY(1,1) PRIMARY KEY,
  no_spo     NVARCHAR(50)   NOT NULL,
  spek       NVARCHAR(100)  NOT NULL DEFAULT '',
  kode_bahan NVARCHAR(50)   NOT NULL,
  status     NVARCHAR(10)   NULL,
  tgl_check  DATETIME       NULL,
  nama_agent NVARCHAR(100)  NULL,
  keterangan NVARCHAR(1000) NULL,
  created_at DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- ─── ALTER (jika tabel sudah terlanjur dibuat tanpa kolom spek) ───────────────
-- Jalankan blok ini HANYA jika tabel sudah ada sebelumnya:
-- ALTER TABLE dbo.tbl_checklistppm_bahanbaku_check DROP CONSTRAINT UQ_bahanbaku_check;
-- ALTER TABLE dbo.tbl_checklistppm_bahanbaku_check ADD spek NVARCHAR(100) NOT NULL DEFAULT '';
-- ALTER TABLE dbo.tbl_checklistppm_bahanbaku_check ADD CONSTRAINT UQ_bahanbaku_check UNIQUE (no_spo, spek, kode_bahan);
-- ALTER TABLE dbo.tbl_checklistppm_bahanbaku_history ADD spek NVARCHAR(100) NOT NULL DEFAULT '';
GO

-- ─── 7. Bahan pendukung per SPO (master + tambahan manual agent) ──────────────
IF OBJECT_ID('dbo.tbl_checklistppm_bahanpendukung', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_bahanpendukung (
  id          INT             IDENTITY(1,1) PRIMARY KEY,
  no_spo      NVARCHAR(50)   NOT NULL,
  nama_bahan  NVARCHAR(200)  NOT NULL,
  kode_khusus NVARCHAR(100)  NULL,
  -- 1 = ditambah manual agent, 0 = dari master/query
  is_custom   BIT            NOT NULL DEFAULT 1,
  created_at  DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- ─── 8. Check bahan pendukung (1 row per item) ───────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_bahanpendukung_check', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_bahanpendukung_check (
  id                INT             IDENTITY(1,1) PRIMARY KEY,
  id_bahanpendukung INT            NOT NULL,
  no_spo            NVARCHAR(50)   NOT NULL,
  status            NVARCHAR(10)   NULL,
  tgl_check         DATETIME       NULL,
  nama_agent        NVARCHAR(100)  NULL,
  keterangan        NVARCHAR(1000) NULL,
  updated_at        DATETIME       NULL,
  CONSTRAINT UQ_bahanpendukung_check UNIQUE (id_bahanpendukung),
  CONSTRAINT FK_bpcheck_bp FOREIGN KEY (id_bahanpendukung)
    REFERENCES dbo.tbl_checklistppm_bahanpendukung(id)
);
GO

-- ─── 9. Historis check bahan pendukung ───────────────────────────────────────
IF OBJECT_ID('dbo.tbl_checklistppm_bahanpendukung_history', 'U') IS NULL
CREATE TABLE dbo.tbl_checklistppm_bahanpendukung_history (
  id                INT             IDENTITY(1,1) PRIMARY KEY,
  id_bahanpendukung INT            NOT NULL,
  no_spo            NVARCHAR(50)   NOT NULL,
  status            NVARCHAR(10)   NULL,
  tgl_check         DATETIME       NULL,
  nama_agent        NVARCHAR(100)  NULL,
  keterangan        NVARCHAR(1000) NULL,
  created_at        DATETIME       NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- SEED: Poin & Subpoin (hanya jika tabel kosong)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.tbl_checklistppm_poin)
BEGIN
  SET IDENTITY_INSERT dbo.tbl_checklistppm_poin ON;
  INSERT INTO dbo.tbl_checklistppm_poin (id, urutan, nama) VALUES
    (1, 1, 'Pra-Proses'),
    (2, 2, 'Dokumen'),
    (3, 3, 'On Proses Monitoring');
  SET IDENTITY_INSERT dbo.tbl_checklistppm_poin OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_checklistppm_subpoin)
BEGIN
  INSERT INTO dbo.tbl_checklistppm_subpoin (id_poin, urutan, nama, has_detail) VALUES
    -- 1. Pra-Proses
    (1, 1, 'Ketersediaan Bahan Baku',                   'bahan_baku'),
    (1, 2, 'Ketersediaan Bahan Pendukung',              'bahan_pendukung'),
    (1, 3, 'Proses File / Materi Masuk',                'file_materi'),
    -- 2. Dokumen
    (2, 1, 'Cetak ACC Pemesan / Produksi / Marketing',  NULL),
    (2, 2, 'Critical Point / Catatan Penting',          NULL),
    (2, 3, 'Instruksi',                                 NULL),
    (2, 4, 'Keterangan Cetak',                          NULL),
    (2, 5, 'Keterangan Finishing',                      NULL),
    (2, 6, 'Kode Tinta Khusus',                         NULL),
    (2, 7, 'Insheet',                                   NULL),
    -- 3. On Proses Monitoring
    (3, 1, 'Proses Cetak',                              NULL),
    (3, 2, 'Proses Penyelesaian',                       NULL),
    (3, 3, 'Proses Packing',                            NULL),
    (3, 4, 'Proses Kirim',                              NULL);
END
GO
