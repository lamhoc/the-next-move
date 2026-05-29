const express = require('express');
const mysql = require('mysql2/promise'); // Sử dụng thư viện mysql2 hỗ trợ async/await chuẩn hóa
const cors = require('cors');

const app = express();

// 1. Cấu hình middleware
app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

// 2. Trả về file giao diện chính
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Cấu hình kết nối linh hoạt bốc từ Biến môi trường tự động của Railway/Render
const pool = mysql.createPool({
    host: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Kiểm tra trạng thái thông mạch của database khi khởi động
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('👉 Kết nối cơ sở dữ liệu MySQL Railway thành công rực rỡ!');
        connection.release();
    } catch (err) {
        console.error('❌ Thất bại! Chưa kết nối được tới Database Railway:', err.message);
    }
})();

const sessions = new Map();

function createToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function authenticate(req, res, next) {
    if (req.path === '/login') return next();

    if (req.method === 'GET' && (req.path === '/boardgames' || req.path === '/drinks' || req.path === '/tables')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized');
    }

    const token = authHeader.replace('Bearer ', '');
    const session = sessions.get(token);
    if (!session) {
        return res.status(401).send('Invalid session');
    }

    req.user = session;
    next();
}

function authorize(allowedRoles) {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).send('Forbidden');
        }
        next();
    };
}

app.post('/api/login', async (req, res) => {
    const { roleType, username, password, phone } = req.body;

    try {
        if (roleType === 'customer') {
            if (!phone) return res.status(400).send('Vui lòng nhập số điện thoại');
            const [rows] = await pool.query('SELECT MaKH, TenKH, SoDienThoai FROM KhachHang WHERE SoDienThoai = ?', [phone]);
            if (!rows.length) return res.status(401).send('Số điện thoại không tồn tại');

            const user = rows[0];
            const token = createToken();
            sessions.set(token, { role: 'customer', name: user.TenKH, type: 'customer', id: user.MaKH });
            return res.json({ token, role: 'customer', name: user.TenKH, id: user.MaKH });
        }

        if (!username || !password) {
            return res.status(400).send('Vui lòng nhập tài khoản và mật khẩu');
        }

        const [rows] = await pool.query(`SELECT nv.MaNV, nv.TenNV, pq.TenQuyen
                                        FROM NhanVien nv
                                        JOIN PhanQuyen pq ON nv.MaQuyen = pq.MaQuyen
                                        WHERE nv.TaiKhoan = ? AND nv.MatKhau = ?`, [username, password]);
        if (!rows.length) return res.status(401).send('Tài khoản hoặc mật khẩu không đúng');

        const user = rows[0];
        const role = user.TenQuyen.includes('Quản lý') ? 'admin' : 'staff';
        const token = createToken();
        sessions.set(token, { role, name: user.TenNV, type: 'employee', id: user.MaNV });
        return res.json({ token, role, name: user.TenNV, id: user.MaNV });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.use('/api', authenticate);

app.post('/api/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        sessions.delete(token);
    }
    res.json({ message: 'Đã đăng xuất' });
});

app.get('/api/profile', (req, res) => {
    res.json({ name: req.user.name, role: req.user.role, type: req.user.type, id: req.user.id });
});

app.get('/api/tables', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT b.MaBan,
                   b.TenBan,
                   CASE WHEN hd.MaHD IS NOT NULL THEN 'Đã đặt' ELSE 'Trống' END AS TrangThai,
                   hd.MaHD,
                   hd.GioVao,
                   hd.TongTien,
                   hd.TrangThaiThanhToan,
                   hd.MaKH,
                   IFNULL(kh.TenKH, 'Khách lẻ') AS KhachHang,
                   nv.TenNV AS NhanVien
            FROM Ban b
            LEFT JOIN (
                SELECT * FROM HoaDon WHERE GioRa IS NULL
            ) hd ON b.MaBan = hd.MaBan
            LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
            LEFT JOIN NhanVien nv ON hd.MaNV = nv.MaNV
            ORDER BY b.MaBan
        `);
        res.json(rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/book-table', async (req, res) => {
    try {
        const { MaBan, MaSP, MaGame, GioVao } = req.body;
        const banId = parseInt(MaBan, 10);
        if (!banId) return res.status(400).send('Thiếu thông tin bàn');
        if (!GioVao) return res.status(400).send('Vui lòng chọn thời gian vào');
        if (!req.user || req.user.role !== 'customer') {
            return res.status(403).send('Chỉ khách hàng mới được đặt trước');
        }

        const [check] = await pool.query('SELECT MaHD FROM HoaDon WHERE MaBan = ? AND GioRa IS NULL', [banId]);
        if (check.length) {
            return res.status(409).send('Bàn này đã có người đặt');
        }

        const [staffQuery] = await pool.query('SELECT MaNV FROM NhanVien WHERE MaQuyen = 1 ORDER BY MaNV LIMIT 1');
        const staffId = staffQuery.length ? staffQuery[0].MaNV : 1;

        // Xử lý định dạng ngày giờ tương thích với chuỗi đầu vào nhận được từ client
        const formattedDate = new Date(GioVao).toISOString().slice(0, 19).replace('T', ' ');

        const [insertResult] = await pool.query(
            'INSERT INTO HoaDon (MaNV, MaKH, MaBan, GioVao, TongTien, TrangThaiThanhToan) VALUES (?, ?, ?, ?, 0, ?)',
            [staffId, req.user.id, banId, formattedDate, 'Chưa thanh toán']
        );
        const newInvoiceId = insertResult.insertId;
        let totalAmount = 0;

        const selectedDrinkId = MaSP ? parseInt(MaSP, 10) : null;
        const selectedGameId = MaGame ? parseInt(MaGame, 10) : null;

        if (selectedDrinkId) {
            const [priceResult] = await pool.query('SELECT DonGia FROM SanPham WHERE MaSP = ?', [selectedDrinkId]);
            const price = priceResult.length ? priceResult[0].DonGia : 0;
            if (price > 0) {
                await pool.query('INSERT INTO ChiTiet_SanPham (MaHD, MaSP, SoLuong, ThanhTien) VALUES (?, ?, 1, ?)', [newInvoiceId, selectedDrinkId, price]);
                totalAmount += price;
            }
        }

        if (selectedGameId) {
            const [priceResult] = await pool.query('SELECT GiaThue FROM BoardGame WHERE MaGame = ?', [selectedGameId]);
            const price = priceResult.length ? priceResult[0].GiaThue : 0;
            if (price > 0) {
                await pool.query('INSERT INTO ChiTiet_ThueGame (MaHD, MaGame, SoLuong, ThanhTien) VALUES (?, ?, 1, ?)', [newInvoiceId, selectedGameId, price]);
                totalAmount += price;
            }
        }

        if (totalAmount > 0) {
            await pool.query('UPDATE HoaDon SET TongTien = ? WHERE MaHD = ?', [totalAmount, newInvoiceId]);
        }

        res.json({ message: 'Đặt bàn thành công' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================================
// --- QUẢN LÝ BOARD GAME ---
// ==========================================
app.get('/api/boardgames', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM BoardGame");
        res.json(rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/boardgames', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenGame, GiaThue, TinhTrang } = req.body;
        await pool.query('INSERT INTO BoardGame (TenGame, GiaThue, TinhTrang) VALUES (?, ?, ?)', [TenGame, GiaThue, TinhTrang]);
        res.json({ message: "Thêm game thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.put('/api/boardgames/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenGame, GiaThue, TinhTrang } = req.body;
        await pool.query('UPDATE BoardGame SET TenGame = ?, GiaThue = ?, TinhTrang = ? WHERE MaGame = ?', [TenGame, parseInt(GiaThue), TinhTrang, parseInt(id)]);
        res.json({ message: "Cập nhật game thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/boardgames/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM BoardGame WHERE MaGame = ?', [id]);
        res.json({ message: "Xóa thành công!" });
    } catch (err) { res.status(500).send("Lỗi: Game đang nằm trong hóa đơn!"); }
});

// ==========================================
// --- QUẢN LÝ SẢN PHẨM (ĐỒ UỐNG) ---
// ==========================================
app.get('/api/drinks', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM SanPham");
        res.json(rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/drinks', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenSP, DonGia, DonViTinh } = req.body;
        await pool.query('INSERT INTO SanPham (TenSP, DonGia, DonViTinh) VALUES (?, ?, ?)', [TenSP, DonGia, DonViTinh]);
        res.json({ message: "Thêm sản phẩm thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.put('/api/drinks/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenSP, DonGia, DonViTinh } = req.body;
        await pool.query('UPDATE SanPham SET TenSP = ?, DonGia = ?, DonViTinh = ? WHERE MaSP = ?', [TenSP, parseInt(DonGia), DonViTinh, parseInt(id)]);
        res.json({ message: "Cập nhật thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/drinks/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM SanPham WHERE MaSP = ?', [id]);
        res.json({ message: "Xóa sản phẩm thành công!" });
    } catch (err) { res.status(500).send("Lỗi: Sản phẩm đang có trong hóa đơn!"); }
});

app.get('/api/invoices', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT hd.MaHD, b.TenBan, hd.TongTien, hd.TrangThaiThanhToan, hd.GioVao
                       FROM HoaDon hd
                       JOIN Ban b ON hd.MaBan = b.MaBan
                       ORDER BY hd.GioVao DESC`);
        res.json(rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const [invoiceResult] = await pool.query(`SELECT hd.MaHD, b.TenBan, nv.TenNV AS NhanVien,
                                     IFNULL(kh.TenKH, 'Khách lẻ') AS KhachHang,
                                     hd.GioVao, hd.GioRa, hd.TongTien, hd.TrangThaiThanhToan
                              FROM HoaDon hd
                              JOIN Ban b ON hd.MaBan = b.MaBan
                              JOIN NhanVien nv ON hd.MaNV = nv.MaNV
                              LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
                              WHERE hd.MaHD = ?`, [parseInt(id)]);
        if (!invoiceResult.length) return res.status(404).send('Không tìm thấy hóa đơn');

        const [drinksResult] = await pool.query(`SELECT sp.TenSP, ctsp.SoLuong, ctsp.ThanhTien
                                  FROM ChiTiet_SanPham ctsp
                                  JOIN SanPham sp ON ctsp.MaSP = sp.MaSP
                                  WHERE ctsp.MaHD = ?`, [parseInt(id)]);
        const [gamesResult] = await pool.query(`SELECT bg.TenGame, ctg.SoLuong, ctg.ThanhTien
                                 FROM ChiTiet_ThueGame ctg
                                 JOIN BoardGame bg ON ctg.MaGame = bg.MaGame
                                 WHERE ctg.MaHD = ?`, [parseInt(id)]);

        res.json({
            invoice: invoiceResult[0],
            drinks: drinksResult,
            games: gamesResult
        });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/invoices/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM HoaDon WHERE MaHD = ?', [parseInt(id)]);
        if (result.affectedRows === 0) return res.status(404).send('Không tìm thấy hóa đơn');
        res.json({ message: 'Xóa hóa đơn thành công!' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TrangThaiThanhToan } = req.body;
        const allowedStatuses = ['Chưa thanh toán', 'Đã thanh toán'];
        if (!allowedStatuses.includes(TrangThaiThanhToan)) {
            return res.status(400).send('Trạng thái thanh toán không hợp lệ');
        }

        const setGioRa = TrangThaiThanhToan === 'Đã thanh toán' ? 'GioRa = NOW()' : 'GioRa = NULL';
        await pool.query(`UPDATE HoaDon SET TrangThaiThanhToan = ?, ${setGioRa} WHERE MaHD = ?`, [TrangThaiThanhToan, parseInt(id)]);
        res.json({ message: 'Cập nhật trạng thái hóa đơn thành công' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================================
// --- QUẢN LÝ KHÁCH HÀNG ---
// ==========================================
app.get('/api/customers', authorize(['admin']), async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT MaKH, TenKH, SoDienThoai, DiemTichLuy FROM KhachHang ORDER BY MaKH");
        res.json(rows);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/customers/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [checkResult] = await pool.query('SELECT COUNT(*) as Count FROM HoaDon WHERE MaKH = ? AND GioRa IS NULL', [parseInt(id)]);
        if (checkResult[0].Count > 0) {
            return res.status(400).send('Không thể xóa khách hàng đang có đặt bàn chưa hoàn thành');
        }
        await pool.query('DELETE FROM KhachHang WHERE MaKH = ?', [parseInt(id)]);
        res.json({ message: "Xóa khách hàng thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// --- HỦY ĐẶT BÀN (CHO KHÁCH HÀNG) ---
// ==========================================
app.delete('/api/cancel-booking/:tableId', async (req, res) => {
    try {
        const { tableId } = req.params;
        if (!req.user || req.user.role !== 'customer') {
            return res.status(403).send('Chỉ khách hàng mới được hủy đặt bàn');
        }

        const [invoiceResult] = await pool.query(`SELECT MaHD FROM HoaDon 
                             WHERE MaBan = ? 
                             AND MaKH = ? 
                             AND GioRa IS NULL`, [parseInt(tableId), req.user.id]);
        if (!invoiceResult.length) {
            return res.status(404).send('Không tìm thấy đặt bàn để hủy');
        }

        const maHD = invoiceResult[0].MaHD;
        await pool.query('DELETE FROM HoaDon WHERE MaHD = ?', [maHD]);
        res.json({ message: 'Hủy đặt bàn thành công' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Khởi chạy server tại PORT động do Render cấp hoặc mặc định 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy thành công tại Port: ${PORT}`));
