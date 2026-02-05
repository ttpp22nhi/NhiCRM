# CRM MobiFone Frontend

Frontend application cho hệ thống CRM MobiFone được xây dựng với Next.js 14 và Tailwind CSS.

## Tính năng

- 🔐 Đăng nhập / Đăng ký
- 👥 Quản lý khách hàng
- 📊 Dashboard tổng quan
- 🔒 Bảo mật với JWT Token
- 👨‍💼 Phân quyền Admin/Sales

## Yêu cầu

- Node.js 18+ 
- npm hoặc yarn

## Cài đặt

1. Cài đặt dependencies:
```bash
npm install
```

2. Tạo file `.env.local` (copy từ `.env.local.example`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

3. Chạy development server:
```bash
npm run dev
```

4. Mở trình duyệt tại [http://localhost:3001](http://localhost:3001)

## Cấu trúc dự án

```
crm-frontend/
├── app/                    # Next.js App Router
│   ├── login/             # Trang đăng nhập
│   ├── register/          # Trang đăng ký
│   ├── dashboard/         # Trang dashboard
│   └── customers/         # Trang quản lý khách hàng
├── components/             # React components
│   ├── Navbar.tsx         # Navigation bar
│   ├── ProtectedRoute.tsx # Route protection
│   ├── CustomerList.tsx   # Danh sách khách hàng
│   └── CustomerForm.tsx   # Form thêm/sửa khách hàng
├── contexts/              # React Context
│   └── AuthContext.tsx    # Authentication context
└── lib/                   # Utilities
    └── api.ts             # API client
```

## Scripts

- `npm run dev` - Chạy development server
- `npm run build` - Build production
- `npm run start` - Chạy production server
- `npm run lint` - Kiểm tra lỗi code

## Kết nối với Backend

Đảm bảo backend đang chạy tại `http://localhost:3000` (hoặc cập nhật `NEXT_PUBLIC_API_URL` trong `.env.local`).

Backend cần có CORS được cấu hình để cho phép frontend gọi API.

















