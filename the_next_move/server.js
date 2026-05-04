const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Kết nối database bằng biến môi trường của Railway
const db = mysql.createConnection(process.env.MYSQL_URL || {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'coffee_db'
});

db.connect(err => {
    if (err) console.log("Lỗi kết nối DB: ", err);
    else console.log("Đã kết nối Database thành công!");
});

// API lấy danh sách bàn trống
app.get('/api/ban', (req, res) => {
    db.query("SELECT * FROM BAN WHERE TrangThai = 'Trống'", (err, result) => {
        if (err) res.status(500).send(err);
        else res.json(result);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));