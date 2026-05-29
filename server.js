const express = require('express');
const sql = require('mssql/msnodesqlv8');
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

const config = {
    connectionString: 'Driver={SQL Server Native Client 11.0};Server=DESKTOP-DKDCA09\\SQLEXPRESS;Database=QL_BoardGame;Trusted_Connection=yes;'
};

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
        await sql.connect(config);

        if (roleType === 'customer') {
            if (!phone) return res.status(400).send('Vui lòng nhập số điện thoại');
            const result = await sql.query(`SELECT MaKH, TenKH, SoDienThoai FROM KhachHang WHERE SoDienThoai = '${phone}'`);
            if (!result.recordset.length) return res.status(401).send('Số điện thoại không tồn tại');

            const user = result.recordset[0];
            const token = createToken();
            sessions.set(token, { role: 'customer', name: user.TenKH, type: 'customer', id: user.MaKH });
            return res.json({ token, role: 'customer', name: user.TenKH, id: user.MaKH });
        }

        if (!username || !password) {
            return res.status(400).send('Vui lòng nhập tài khoản và mật khẩu');
        }

        const result = await sql.query(`SELECT nv.MaNV, nv.TenNV, pq.TenQuyen
                                        FROM NhanVien nv
                                        JOIN PhanQuyen pq ON nv.MaQuyen = pq.MaQuyen
                                        WHERE nv.TaiKhoan = '${username}' AND nv.MatKhau = '${password}'`);
        if (!result.recordset.length) return res.status(401).send('Tài khoản hoặc mật khẩu không đúng');

        const user = result.recordset[0];
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
        await sql.connect(config);
        const result = await sql.query(`
            SELECT b.MaBan,
                   b.TenBan,
                   CASE WHEN hd.MaHD IS NOT NULL THEN N'Đã đặt' ELSE N'Trống' END AS TrangThai,
                   hd.MaHD,
                   hd.GioVao,
                   hd.TongTien,
                   hd.TrangThaiThanhToan,
                   hd.MaKH,
                   ISNULL(kh.TenKH, N'Khách lẻ') AS KhachHang,
                   nv.TenNV AS NhanVien
            FROM Ban b
            LEFT JOIN (
                SELECT * FROM HoaDon WHERE GioRa IS NULL
            ) hd ON b.MaBan = hd.MaBan
            LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
            LEFT JOIN NhanVien nv ON hd.MaNV = nv.MaNV
            ORDER BY b.MaBan
        `);
        res.json(result.recordset);
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

        await sql.connect(config);
        const check = await sql.query(`SELECT MaHD FROM HoaDon WHERE MaBan = ${banId} AND GioRa IS NULL`);
        if (check.recordset.length) {
            return res.status(409).send('Bàn này đã có người đặt');
        }

        const staffQuery = await sql.query(`SELECT TOP 1 MaNV FROM NhanVien WHERE MaQuyen = 1 ORDER BY MaNV`);
        const staffId = staffQuery.recordset.length ? staffQuery.recordset[0].MaNV : 1;

        const insert = `INSERT INTO HoaDon (MaNV, MaKH, MaBan, GioVao, TongTien, TrangThaiThanhToan)
                        OUTPUT INSERTED.MaHD
                        VALUES (${staffId}, ${req.user.id}, ${banId}, TRY_CONVERT(datetime, '${GioVao}', 120), 0, N'Chưa thanh toán')`;
        const insertResult = await sql.query(insert);
        const newInvoiceId = insertResult.recordset?.[0]?.MaHD;
        let totalAmount = 0;

        const selectedDrinkId = MaSP ? parseInt(MaSP, 10) : null;
        const selectedGameId = MaGame ? parseInt(MaGame, 10) : null;

        if (selectedDrinkId) {
            const priceResult = await sql.query(`SELECT DonGia FROM SanPham WHERE MaSP = ${selectedDrinkId}`);
            const price = priceResult.recordset.length ? priceResult.recordset[0].DonGia : 0;
            if (price > 0) {
                await sql.query(`INSERT INTO ChiTiet_SanPham (MaHD, MaSP, SoLuong, ThanhTien) VALUES (${newInvoiceId}, ${selectedDrinkId}, 1, ${price})`);
                totalAmount += price;
            }
        }

        if (selectedGameId) {
            const priceResult = await sql.query(`SELECT GiaThue FROM BoardGame WHERE MaGame = ${selectedGameId}`);
            const price = priceResult.recordset.length ? priceResult.recordset[0].GiaThue : 0;
            if (price > 0) {
                await sql.query(`INSERT INTO ChiTiet_ThueGame (MaHD, MaGame, SoLuong, ThanhTien) VALUES (${newInvoiceId}, ${selectedGameId}, 1, ${price})`);
                totalAmount += price;
            }
        }

        if (totalAmount > 0) {
            await sql.query(`UPDATE HoaDon SET TongTien = ${totalAmount} WHERE MaHD = ${newInvoiceId}`);
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
        await sql.connect(config);
        const result = await sql.query("SELECT * FROM BoardGame");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/boardgames', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenGame, GiaThue, TinhTrang } = req.body;
        await sql.connect(config);
        const query = `INSERT INTO BoardGame (TenGame, GiaThue, TinhTrang) 
                       VALUES (N'${TenGame}', ${GiaThue}, N'${TinhTrang}')`;
        await sql.query(query);
        res.json({ message: "Thêm game thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.put('/api/boardgames/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenGame, GiaThue, TinhTrang } = req.body;
        await sql.connect(config);
        const query = `UPDATE BoardGame 
                       SET TenGame = N'${TenGame}', 
                           GiaThue = ${parseInt(GiaThue)}, 
                           TinhTrang = N'${TinhTrang}' 
                       WHERE MaGame = ${parseInt(id)}`;
        await sql.query(query);
        res.json({ message: "Cập nhật game thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/boardgames/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await sql.connect(config);
        await sql.query(`DELETE FROM BoardGame WHERE MaGame = ${id}`);
        res.json({ message: "Xóa thành công!" });
    } catch (err) { res.status(500).send("Lỗi: Game đang nằm trong hóa đơn!"); }
});

// ==========================================
// --- QUẢN LÝ SẢN PHẨM (ĐỒ UỐNG) ---
// ==========================================

app.get('/api/drinks', async (req, res) => {
    try {
        await sql.connect(config);
        const result = await sql.query("SELECT * FROM SanPham");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/drinks', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenSP, DonGia, DonViTinh } = req.body;
        await sql.connect(config);
        const query = `INSERT INTO SanPham (TenSP, DonGia, DonViTinh) 
                       VALUES (N'${TenSP}', ${DonGia}, N'${DonViTinh}')`;
        await sql.query(query);
        res.json({ message: "Thêm sản phẩm thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.put('/api/drinks/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenSP, DonGia, DonViTinh } = req.body;
        await sql.connect(config);
        const query = `UPDATE SanPham 
                       SET TenSP = N'${TenSP}', 
                           DonGia = ${parseInt(DonGia)}, 
                           DonViTinh = N'${DonViTinh}' 
                       WHERE MaSP = ${parseInt(id)}`;
        await sql.query(query);
        res.json({ message: "Cập nhật thành công!" });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/drinks/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await sql.connect(config);
        await sql.query(`DELETE FROM SanPham WHERE MaSP = ${id}`);
        res.json({ message: "Xóa sản phẩm thành công!" });
    } catch (err) { res.status(500).send("Lỗi: Sản phẩm đang có trong hóa đơn!"); }
});

app.get('/api/invoices', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await sql.connect(config);
        const query = `SELECT hd.MaHD, b.TenBan, hd.TongTien, hd.TrangThaiThanhToan, hd.GioVao
                       FROM HoaDon hd
                       JOIN Ban b ON hd.MaBan = b.MaBan
                       ORDER BY hd.GioVao DESC`;
        const result = await sql.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        await sql.connect(config);
        const invoiceQuery = `SELECT hd.MaHD, b.TenBan, nv.TenNV AS NhanVien,
                                     ISNULL(kh.TenKH, N'Khách lẻ') AS KhachHang,
                                     hd.GioVao, hd.GioRa, hd.TongTien, hd.TrangThaiThanhToan
                              FROM HoaDon hd
                              JOIN Ban b ON hd.MaBan = b.MaBan
                              JOIN NhanVien nv ON hd.MaNV = nv.MaNV
                              LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
                              WHERE hd.MaHD = ${parseInt(id)}`;
        const invoiceResult = await sql.query(invoiceQuery);
        if (!invoiceResult.recordset.length) return res.status(404).send('Không tìm thấy hóa đơn');

        const detailDrinkQuery = `SELECT sp.TenSP, ctsp.SoLuong, ctsp.ThanhTien
                                  FROM ChiTiet_SanPham ctsp
                                  JOIN SanPham sp ON ctsp.MaSP = sp.MaSP
                                  WHERE ctsp.MaHD = ${parseInt(id)}`;
        const detailGameQuery = `SELECT bg.TenGame, ctg.SoLuong, ctg.ThanhTien
                                 FROM ChiTiet_ThueGame ctg
                                 JOIN BoardGame bg ON ctg.MaGame = bg.MaGame
                                 WHERE ctg.MaHD = ${parseInt(id)}`;

        const drinksResult = await sql.query(detailDrinkQuery);
        const gamesResult = await sql.query(detailGameQuery);

        res.json({
            invoice: invoiceResult.recordset[0],
            drinks: drinksResult.recordset,
            games: gamesResult.recordset
        });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/invoices/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await sql.connect(config);
        const result = await sql.query(`DELETE FROM HoaDon WHERE MaHD = ${parseInt(id)}`);
        if (!result.rowsAffected[0]) return res.status(404).send('Không tìm thấy hóa đơn');
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

        await sql.connect(config);
        const setGioRa = TrangThaiThanhToan === 'Đã thanh toán'
            ? `GioRa = GETDATE()`
            : `GioRa = NULL`;
        const updateQuery = `UPDATE HoaDon
                             SET TrangThaiThanhToan = N'${TrangThaiThanhToan}', ${setGioRa}
                             WHERE MaHD = ${parseInt(id)}`;
        await sql.query(updateQuery);
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
        await sql.connect(config);
        const result = await sql.query("SELECT MaKH, TenKH, SoDienThoai, DiemTichLuy FROM KhachHang ORDER BY MaKH");
        res.json(result.recordset);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/customers/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await sql.connect(config);
        // Kiểm tra xem khách hàng có hóa đơn đang hoạt động không
        const checkQuery = `SELECT COUNT(*) as Count FROM HoaDon WHERE MaKH = ${parseInt(id)} AND GioRa IS NULL`;
        const checkResult = await sql.query(checkQuery);
        if (checkResult.recordset[0].Count > 0) {
            return res.status(400).send('Không thể xóa khách hàng đang có đặt bàn chưa hoàn thành');
        }
        await sql.query(`DELETE FROM KhachHang WHERE MaKH = ${parseInt(id)}`);
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

        await sql.connect(config);
        // Tìm hóa đơn đang hoạt động của khách hàng cho bàn này
        const invoiceQuery = `SELECT MaHD FROM HoaDon 
                             WHERE MaBan = ${parseInt(tableId)} 
                             AND MaKH = ${req.user.id} 
                             AND GioRa IS NULL`;
        const invoiceResult = await sql.query(invoiceQuery);
        if (!invoiceResult.recordset.length) {
            return res.status(404).send('Không tìm thấy đặt bàn để hủy');
        }

        const maHD = invoiceResult.recordset[0].MaHD;
        // Xóa chi tiết hóa đơn trước (do cascade delete)
        await sql.query(`DELETE FROM HoaDon WHERE MaHD = ${maHD}`);
        res.json({ message: 'Hủy đặt bàn thành công' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Khởi chạy server
app.listen(3000, () => console.log("🚀 Server đang chạy tại http://localhost:3000"));