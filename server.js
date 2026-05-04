const express = require('express');
const mysql = require('mysql2');
const app = express();

// Kết nối bằng link MYSQL_URL từ Railway
const connectionUri = "mysql://root:VXfQHDkTmWpSvfrEiuTljiAStgcckKEU@mysql.railway.internal:3306/railway"; // Thay bằng link của bạn

const db = mysql.createConnection(connectionUri);

db.connect((err) => {
    if (err) {
        console.error('Kết nối Database thất bại: ' + err.stack);
        return;
    }
    console.log('Kết nối Database thành công!');
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
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});