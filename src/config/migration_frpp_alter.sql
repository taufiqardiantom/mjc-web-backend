-- ============================================================
-- Migration: tambah kolom baru ke TBL_FRPPDOC & TBL_FRPPSPEK
-- Kolom lama yang sudah ada TIDAK diubah, hanya menambah yang belum ada.
-- Jalankan satu kali di SQL Server (aman diulang karena pakai IF NOT EXISTS)
-- ============================================================

-- ── TBL_FRPPDOC — kolom yang belum ada di tabel lama ────────

-- Kolom baru: id_proyek (referensi proyek, tidak ada di skema lama)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'id_proyek')
    ALTER TABLE TBL_FRPPDOC ADD id_proyek INT NULL;

-- Kolom baru: no_po_pemesan
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'no_po_pemesan')
    ALTER TABLE TBL_FRPPDOC ADD no_po_pemesan NVARCHAR(100) NULL;

-- Kolom baru: kode_eksternal
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'kode_eksternal')
    ALTER TABLE TBL_FRPPDOC ADD kode_eksternal NVARCHAR(100) NULL;

-- Kolom baru: status_order
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'status_order')
    ALTER TABLE TBL_FRPPDOC ADD status_order NVARCHAR(20) NULL DEFAULT 'BARU';

-- Kolom baru: master_produk_id
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'master_produk_id')
    ALTER TABLE TBL_FRPPDOC ADD master_produk_id INT NULL;

-- Kolom baru: packing (JSON)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'packing')
    ALTER TABLE TBL_FRPPDOC ADD packing NVARCHAR(MAX) NULL;

-- Kolom baru: packing_custom (JSON)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'packing_custom')
    ALTER TABLE TBL_FRPPDOC ADD packing_custom NVARCHAR(MAX) NULL;

-- Kolom baru: lain_lain (JSON)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'lain_lain')
    ALTER TABLE TBL_FRPPDOC ADD lain_lain NVARCHAR(MAX) NULL;

-- Kolom baru: lain_custom (JSON)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'lain_custom')
    ALTER TABLE TBL_FRPPDOC ADD lain_custom NVARCHAR(MAX) NULL;

-- Kolom baru: proses (JSON array jenis proses)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'proses')
    ALTER TABLE TBL_FRPPDOC ADD proses NVARCHAR(MAX) NULL;

-- Kolom baru: oplah_variants (JSON array semua varian oplah)
-- Kolom lama jum_pesanan tetap menyimpan INT oplah per dokumen
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPDOC') AND name = 'oplah_variants')
    ALTER TABLE TBL_FRPPDOC ADD oplah_variants NVARCHAR(MAX) NULL;


-- ── TBL_FRPPSPEK ─────────────────────────────────────────────
-- Buat tabel jika belum ada
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND type = 'U')
BEGIN
    CREATE TABLE TBL_FRPPSPEK (
        id                    INT IDENTITY(1,1) PRIMARY KEY,
        no_frpp               VARCHAR(50)    NOT NULL,
        urutan                INT            NOT NULL,
        jenis_pekerjaan       NVARCHAR(100)  NULL,
        kertas_nama           NVARCHAR(100)  NULL,
        kertas_gramatur       NVARCHAR(20)   NULL,
        kertas_grader         NVARCHAR(10)   NULL,
        kertas_merk           NVARCHAR(100)  NULL,
        kertas_supplier       NVARCHAR(100)  NULL,
        jenis_cetakan         NVARCHAR(20)   NULL,
        jml_halaman           INT            NULL,
        uv_varnish            NVARCHAR(20)   NULL,
        emboss                NVARCHAR(100)  NULL,
        deboss                NVARCHAR(100)  NULL,
        foil_jenis            NVARCHAR(50)   NULL,
        foil_jenis_custom     NVARCHAR(100)  NULL,
        foil_ket              NVARCHAR(200)  NULL,
        flap                  NVARCHAR(100)  NULL,
        laminasi_jenis        NVARCHAR(50)   NULL,
        laminasi_jenis_custom NVARCHAR(100)  NULL,
        uv_spot               NVARCHAR(100)  NULL,
        punch_jenis           NVARCHAR(50)   NULL,
        lipat                 NVARCHAR(100)  NULL,
        o_wire                NVARCHAR(20)   NULL,
        spiral                NVARCHAR(20)   NULL,
        klem_seng             NVARCHAR(20)   NULL
    );
END
ELSE
BEGIN
    -- Tabel sudah ada, tambahkan kolom yang mungkin belum ada
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'urutan')
        ALTER TABLE TBL_FRPPSPEK ADD urutan INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'jenis_pekerjaan')
        ALTER TABLE TBL_FRPPSPEK ADD jenis_pekerjaan NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'kertas_nama')
        ALTER TABLE TBL_FRPPSPEK ADD kertas_nama NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'kertas_gramatur')
        ALTER TABLE TBL_FRPPSPEK ADD kertas_gramatur NVARCHAR(20) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'kertas_grader')
        ALTER TABLE TBL_FRPPSPEK ADD kertas_grader NVARCHAR(10) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'kertas_merk')
        ALTER TABLE TBL_FRPPSPEK ADD kertas_merk NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'kertas_supplier')
        ALTER TABLE TBL_FRPPSPEK ADD kertas_supplier NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'jenis_cetakan')
        ALTER TABLE TBL_FRPPSPEK ADD jenis_cetakan NVARCHAR(20) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'jml_halaman')
        ALTER TABLE TBL_FRPPSPEK ADD jml_halaman INT NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'uv_varnish')
        ALTER TABLE TBL_FRPPSPEK ADD uv_varnish NVARCHAR(20) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'emboss')
        ALTER TABLE TBL_FRPPSPEK ADD emboss NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'deboss')
        ALTER TABLE TBL_FRPPSPEK ADD deboss NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'foil_jenis')
        ALTER TABLE TBL_FRPPSPEK ADD foil_jenis NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'foil_jenis_custom')
        ALTER TABLE TBL_FRPPSPEK ADD foil_jenis_custom NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'foil_ket')
        ALTER TABLE TBL_FRPPSPEK ADD foil_ket NVARCHAR(200) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'flap')
        ALTER TABLE TBL_FRPPSPEK ADD flap NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'laminasi_jenis')
        ALTER TABLE TBL_FRPPSPEK ADD laminasi_jenis NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'laminasi_jenis_custom')
        ALTER TABLE TBL_FRPPSPEK ADD laminasi_jenis_custom NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'uv_spot')
        ALTER TABLE TBL_FRPPSPEK ADD uv_spot NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'punch_jenis')
        ALTER TABLE TBL_FRPPSPEK ADD punch_jenis NVARCHAR(50) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'lipat')
        ALTER TABLE TBL_FRPPSPEK ADD lipat NVARCHAR(100) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'o_wire')
        ALTER TABLE TBL_FRPPSPEK ADD o_wire NVARCHAR(20) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'spiral')
        ALTER TABLE TBL_FRPPSPEK ADD spiral NVARCHAR(20) NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TBL_FRPPSPEK') AND name = 'klem_seng')
        ALTER TABLE TBL_FRPPSPEK ADD klem_seng NVARCHAR(20) NULL;
END
