const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Link Public (Không có chữ internal) từ Railway
const connectionUri = "mysql://root:VXfQHDkTmWpSvfrEiuTljiAStgcckKEU@tramway.proxy.rlwy.net:57908/railway"; 
const db = mysql.createConnection(connectionUri);

db.connect((err) => {
    if (err) { console.error('Kết nối thất bại: ' + err.stack); return; }
    console.log('Kết nối Database thành công!');
});

app.use(express.static(__dirname));

// --- CÁC CỔNG DỮ LIỆU (API) ---
// Thêm dòng này ở đầu file server.js (dưới chỗ require express)
app.use(express.json()); 

app.post('/api/dat-ban/:id', (req, res) => {
    const maBan = req.params.id;
    const query = "UPDATE BAN SET TrangThai = 'Đã đặt' WHERE MaBan = ?";
    db.query(query, [maBan], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Đặt bàn thành công!" });
    });
});
// 1. Lấy danh sách BÀN (Khớp với nút Quản lý Bàn)
app.get('/api/test', (req, res) => {
    db.query("SELECT * FROM BAN", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json({ data: results });
    });
});

// 2. Lấy danh sách HÓA ĐƠN (Khớp với nút Lịch sử Hóa đơn)
app.get('/api/hoa-don', (req, res) => {
    const query = `
        SELECT HD.MaHD, KH.HoTen AS TenKhach, NV.HoTen AS TenNhanVien, B.TenBan, HD.TongTien, HD.HinhThucThanhToan
        FROM HOA_DON HD
        JOIN KHACH_HANG KH ON HD.MaKH = KH.MaKH
        JOIN NHAN_VIEN NV ON HD.MaNV = NV.MaNV
        JOIN BAN B ON HD.MaBan = B.MaBan
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// 3. Lấy danh sách BOARD GAME (Khớp với nút Kho Board Game)
app.get('/api/games', (req, res) => {
    db.query("SELECT * FROM BOARD_GAME", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// 4. Lấy danh sách NHÂN VIÊN (Khớp với nút Nhân viên)
app.get('/api/nhan-vien', (req, res) => {
    db.query("SELECT * FROM NHAN_VIEN", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// Route trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server chạy tại port ${PORT}`); });
