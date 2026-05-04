const express = require('express');
const mysql = require('mysql2');
const app = express();

// Kết nối bằng link MYSQL_URL từ Railway
const connectionUri = "mysql://root:VXfQHDkTmWpSvfrEiuTljiAStgcckKEU@tramway.proxy.rlwy.net:57908/railway"; // Thay bằng link của bạn

const db = mysql.createConnection(connectionUri);

db.connect((err) => {
    if (err) {
        console.error('Kết nối Database thất bại: ' + err.stack);
        return;
    }
    console.log('Kết nối Database thành công!');
});

app.get('/api/hoa-don', (req, res) => {
    const query = `
        SELECT HD.MaHD, KH.HoTen AS TenKhach, NV.HoTen AS TenNhanVien, B.TenBan, HD.TongTien, HD.NgayLap
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

// Route test lấy dữ liệu từ bảng BAN bạn vừa tạo thành công
app.get('/api/test', (req, res) => {
    db.query("SELECT * FROM BAN", (err, results) => {
        if (err) {
            res.status(500).send("Lỗi truy vấn: " + err);
        } else {
            res.json({
                message: "Kết nối web và SQL thành công!",
                data: results
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
const path = require('path');

// Chỉ cho server biết thư mục chứa file giao diện
app.use(express.static(__dirname)); 

// Khi vào địa chỉ gốc, trả về file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
