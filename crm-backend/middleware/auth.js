import jwt from 'jsonwebtoken';

/**
 * Middleware xác thực mã Token (JWT)
 * Kiểm tra Header Authorization: Bearer <token>
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Token thường có dạng "Bearer ABCXYZ..."
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Truy cập bị từ chối. Vui lòng cung cấp mã xác thực (Token).' 
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'crm_secret_key_2025';
    const decoded = jwt.verify(token, secret);
    
    // Gán thông tin user vào request để các controller sau có thể sử dụng
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' 
    });
  }
};

/**
 * Middleware kiểm tra quyền Admin
 * Phải được sử dụng sau verifyToken
 */
export const verifyAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Vui lòng đăng nhập trước.' 
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' 
    });
  }

  next();
};
