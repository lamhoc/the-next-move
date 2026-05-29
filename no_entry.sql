-- =======================================================
-- ĐỒ ÁN: HỆ THỐNG QUẢN LÝ DỊCH VỤ BOARD GAME & COFFEE
-- 25CT401
-- Khoa: Công nghệ thông tin
-- =======================================================

CREATE DATABASE QL_BoardGame;
GO
USE QL_BoardGame;
GO


-- 1. Bảng Phân Quyền
CREATE TABLE PhanQuyen (
    MaQuyen INT IDENTITY(1,1) PRIMARY KEY,
    TenQuyen NVARCHAR(50) NOT NULL
);

-- 2. Bảng Nhân Viên
CREATE TABLE NhanVien (
    MaNV INT IDENTITY(1,1) PRIMARY KEY,
    TenNV NVARCHAR(100) NOT NULL,
    SoDienThoai VARCHAR(15),
    TaiKhoan VARCHAR(50) UNIQUE NOT NULL,
    MatKhau VARCHAR(50) NOT NULL,
    MaQuyen INT FOREIGN KEY REFERENCES PhanQuyen(MaQuyen)
);

-- 3. Bảng Khách Hàng
CREATE TABLE KhachHang (
    MaKH INT IDENTITY(1,1) PRIMARY KEY,
    TenKH NVARCHAR(100) NOT NULL,
    SoDienThoai VARCHAR(15) UNIQUE,
    DiemTichLuy INT DEFAULT 0
);

-- 4. Bảng Bàn
CREATE TABLE Ban (
    MaBan INT IDENTITY(1,1) PRIMARY KEY,
    TenBan NVARCHAR(50) NOT NULL,
    TrangThai NVARCHAR(50) DEFAULT N'Trống' -- Trống / Đang sử dụng
);

-- 5. Bảng Sản Phẩm (Nước uống/Đồ ăn)
CREATE TABLE SanPham (
    MaSP INT IDENTITY(1,1) PRIMARY KEY,
    TenSP NVARCHAR(100) NOT NULL,
    DonGia DECIMAL(18,0) CHECK (DonGia >= 0),
    DonViTinh NVARCHAR(20)
);

-- 6. Bảng Kho Board Game
CREATE TABLE BoardGame (
    MaGame INT IDENTITY(1,1) PRIMARY KEY,
    TenGame NVARCHAR(100) NOT NULL,
    GiaThue DECIMAL(18,0) CHECK (GiaThue >= 0),
    TinhTrang NVARCHAR(50) DEFAULT N'Sẵn sàng' -- Sẵn sàng / Đang cho thuê / Bảo trì
);

-- 7. Bảng Hóa Đơn
CREATE TABLE HoaDon (
    MaHD INT IDENTITY(1,1) PRIMARY KEY,
    MaNV INT FOREIGN KEY REFERENCES NhanVien(MaNV),
    MaKH INT FOREIGN KEY REFERENCES KhachHang(MaKH) NULL,
    MaBan INT FOREIGN KEY REFERENCES Ban(MaBan),
    GioVao DATETIME DEFAULT GETDATE(),
    GioRa DATETIME NULL,
    TongTien DECIMAL(18,0) DEFAULT 0,
    TrangThaiThanhToan NVARCHAR(50) DEFAULT N'Chưa thanh toán'
);

-- 8. Bảng Chi Tiết Hóa Đơn - Sản Phẩm
CREATE TABLE ChiTiet_SanPham (
    MaHD INT FOREIGN KEY REFERENCES HoaDon(MaHD) ON DELETE CASCADE,
    MaSP INT FOREIGN KEY REFERENCES SanPham(MaSP),
    SoLuong INT DEFAULT 1 CHECK (SoLuong > 0),
    ThanhTien DECIMAL(18,0),
    PRIMARY KEY (MaHD, MaSP)
);

-- 9. Bảng Chi Tiết Hóa Đơn - Thuê Game
CREATE TABLE ChiTiet_ThueGame (
    MaHD INT FOREIGN KEY REFERENCES HoaDon(MaHD) ON DELETE CASCADE,
    MaGame INT FOREIGN KEY REFERENCES BoardGame(MaGame),
    SoLuong INT DEFAULT 1 CHECK (SoLuong > 0),
    ThanhTien DECIMAL(18,0),
    PRIMARY KEY (MaHD, MaGame)
);
GO

-- =========================================
-- THÊM DỮ LIỆU MẪU (MOCK DATA)
-- =========================================

INSERT INTO PhanQuyen (TenQuyen) VALUES (N'Quản lý'), (N'Thu ngân');

INSERT INTO NhanVien (TenNV, SoDienThoai, TaiKhoan, MatKhau, MaQuyen) 
VALUES (N'Admin Chính', '0901234567', 'admin', '123456', 1),
       (N'Nhân viên 1', '0987654321', 'staff1', '123456', 2);

INSERT INTO Ban (TenBan, TrangThai)
VALUES
(N'Bàn 1', N'Trống'),
(N'Bàn 2', N'Đang sử dụng'),
(N'Bàn 3', N'Trống'),
(N'Bàn 4', N'Đang sử dụng'),
(N'Bàn 5', N'Trống'),
(N'Bàn VIP', N'Trống');

INSERT INTO SanPham (TenSP, DonGia, DonViTinh)
VALUES
(N'Trà sữa', 35000, N'Ly'),
(N'Cà phê sữa', 30000, N'Ly'),
(N'Nước suối', 10000, N'Chai'),
(N'Mì cay', 45000, N'Tô'),
(N'Khoai tây chiên', 40000, N'Phần'),
(N'Bánh ngọt', 25000, N'Cái');

INSERT INTO BoardGame (TenGame, GiaThue, TinhTrang)
VALUES
(N'Ma Sói', 50000, N'Sẵn sàng'),
(N'Cờ Tỷ Phú', 40000, N'Sẵn sàng'),
(N'Uno', 30000, N'Sẵn sàng'),
(N'Exploding Kittens', 45000, N'Đang cho thuê'),
(N'Catan', 60000, N'Sẵn sàng'),
(N'Dobble', 35000, N'Bảo trì');

INSERT INTO NhanVien (TenNV, SoDienThoai, TaiKhoan, MatKhau, MaQuyen)
VALUES
(N'Nguyễn Văn Admin', '0901234567', 'phache', '123456', 1),
(N'Trần Minh Khang', '0912345678', 'khangnv', '123456', 2),
(N'Lê Hoài Nam', '0923456789', 'namnv', '123456', 2),
(N'Phạm Quốc Bảo', '0934567891', 'baonv', '123456', 2);

INSERT INTO KhachHang (TenKH, SoDienThoai, DiemTichLuy)
VALUES
(N'Nguyễn Văn A', '0987654321', 2000),
(N'Lâm Chấn Đông', '0123456789', 3000),
(N'Trần Thị Mai', '0978123456', 1500),
(N'Hoàng Minh Đức', '0966111222', 500),
(N'Phạm Gia Huy', '0944332211', 1000);

INSERT INTO Ban (TenBan, TrangThai)
VALUES
(N'Bàn 1', N'Trống'),
(N'Bàn 2', N'Đang sử dụng'),
(N'Bàn 3', N'Trống'),
(N'Bàn 4', N'Đang sử dụng'),
(N'Bàn 5', N'Trống'),
(N'Bàn VIP', N'Trống');

INSERT INTO HoaDon (MaNV, MaKH, MaBan, GioVao, GioRa, TongTien, TrangThaiThanhToan)
VALUES
(2, 1, 2, '2025-05-10 08:00:00', '2025-05-10 11:00:00', 165000, N'Đã thanh toán'),

(3, 2, 4, '2025-05-10 09:00:00', NULL, 120000, N'Chưa thanh toán'),

(2, 3, 1, '2025-05-09 18:00:00', '2025-05-09 21:00:00', 210000, N'Đã thanh toán'),

(4, NULL, 3, '2025-05-10 10:30:00', NULL, 70000, N'Chưa thanh toán');

INSERT INTO ChiTiet_SanPham (MaHD, MaSP, SoLuong, ThanhTien)
VALUES
(1, 1, 2, 70000),
(1, 5, 1, 40000),
(1, 2, 1, 30000),

(2, 4, 2, 90000),
(2, 3, 3, 30000),

(3, 1, 3, 105000),
(3, 6, 2, 50000),

(4, 2, 1, 30000);

INSERT INTO ChiTiet_ThueGame (MaHD, MaGame, SoLuong, ThanhTien)
VALUES
(1, 1, 1, 50000),
(1, 3, 1, 30000),

(2, 4, 1, 45000),

(3, 5, 1, 60000),

(4, 2, 1, 40000);