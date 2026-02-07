# CRM MobiFone - Hướng dẫn Trình bày Tính năng Sản phẩm

> Tài liệu này hỗ trợ trình bày và demo các tính năng của hệ thống CRM MobiFone cho khách hàng, stakeholder, hoặc team phát triển.

---

## 📋 Mục lục

1. [Giới thiệu Tổng quan](#giới-thiệu-tổng-quan)
2. [Cấu trúc Trình bày](#cấu-trúc-trình-bày)
3. [Chi tiết từng Tính năng](#chi-tiết-từng-tính-năng)
4. [Demo Script](#demo-script)
5. [Câu hỏi Thường gặp (FAQ)](#câu-hỏi-thường-gặp-faq)
6. [Tips Trình bày](#tips-trình-bày)

---

## 🎯 Giới thiệu Tổng quan

### Hệ thống CRM MobiFone là gì?

**CRM MobiFone** là hệ thống quản lý quan hệ khách hàng được thiết kế đặc biệt cho các đơn vị kinh doanh của MobiFone, hỗ trợ quản lý toàn diện từ khách hàng, nhân viên, công việc đến tương tác và báo cáo.

### Giá trị cốt lõi

✅ **Quản lý tập trung**: Tất cả thông tin khách hàng, nhân viên, công việc ở một nơi  
✅ **Phân quyền linh hoạt**: 3 cấp độ quyền (Admin, Manager, Sales) với quyền hạn rõ ràng  
✅ **Tự động hóa**: Tự động tạo interaction khi hoàn thành task, thông báo real-time  
✅ **Báo cáo trực quan**: Dashboard với biểu đồ và thống kê chi tiết  
✅ **Dễ sử dụng**: Giao diện hiện đại, responsive, tối ưu cho mọi thiết bị  

---

## 📊 Cấu trúc Trình bày

### Thứ tự đề xuất (30-45 phút)

1. **Mở đầu** (2 phút)
   - Giới thiệu hệ thống
   - Đăng nhập và demo tài khoản

2. **Dashboard Tổng quan** (5 phút)
   - Stats cards
   - Biểu đồ phân tích
   - Bộ lọc thời gian

3. **Quản lý Khách hàng** (10 phút)
   - Danh sách khách hàng
   - Tìm kiếm và lọc
   - Tạo/Sửa/Xóa khách hàng
   - Chi tiết khách hàng và lịch sử tương tác
   - Xuất Excel

4. **Quản lý Công việc** (8 phút)
   - Danh sách tasks
   - Calendar view
   - Hoàn thành task và tạo interaction
   - Thông báo

5. **Quản lý Nhân viên** (5 phút) - Chỉ Admin
   - Danh sách nhân viên
   - Tạo/Sửa nhân viên
   - Reset mật khẩu

6. **Phân quyền & Bảo mật** (5 phút)
   - Demo các role khác nhau
   - Phân quyền theo chức năng

7. **Q&A** (5-10 phút)

---

## 🎬 Chi tiết từng Tính năng

### 1. Dashboard Tổng quan

#### Điểm nhấn:
- **4 chỉ số quan trọng** hiển thị ngay đầu trang
- **Biểu đồ trực quan** giúp nắm bắt tình hình nhanh chóng
- **Bộ lọc thời gian** linh hoạt (Tháng/Quý/Năm)

#### Cách trình bày:

```
"Đây là trang Dashboard - trái tim của hệ thống. Ngay khi đăng nhập, 
bạn sẽ thấy 4 chỉ số quan trọng nhất:
- Tổng doanh số từ các deal thành công
- Tổng số khách hàng hiện có
- Số lượng công việc đang chờ xử lý
- Tổng số tương tác trong tháng

Bên dưới là 3 biểu đồ phân tích:
1. Pie Chart cho thấy phân bổ khách hàng theo từng loại 
   (Sở ban ngành, Công an, Doanh nghiệp...)
2. Bar Chart hiển thị top nhân viên xuất sắc dựa trên 
   doanh số và số khách hàng quản lý
3. Bar Chart theo dõi tiến độ Deal qua các giai đoạn

Bạn có thể lọc dữ liệu theo Tháng này, Quý này, hoặc Năm nay 
để xem xu hướng theo thời gian."
```

#### Demo Steps:
1. Mở trang Dashboard
2. Giải thích từng stats card
3. Hover vào các biểu đồ để xem chi tiết
4. Thay đổi bộ lọc thời gian và quan sát dữ liệu thay đổi

---

### 2. Quản lý Khách hàng

#### Điểm nhấn:
- **Tìm kiếm thông minh** với debounce (không gây tải server)
- **Lọc đa dạng** theo nhiều loại khách hàng cùng lúc
- **Phân trang** tối ưu hiệu suất
- **Xuất Excel** với định dạng tiếng Việt
- **Soft Delete** đảm bảo dữ liệu không mất

#### Cách trình bày:

```
"Trang Quản lý Khách hàng là nơi bạn quản lý toàn bộ thông tin khách hàng.

**Tìm kiếm & Lọc:**
- Thanh tìm kiếm hỗ trợ tìm theo tên, email, số điện thoại, tên công ty
- Bộ lọc cho phép chọn nhiều loại khách hàng cùng lúc (ví dụ: 
  vừa xem Sở ban ngành, vừa xem Công an Tỉnh)
- Hệ thống tự động debounce để không gây tải server

**Phân trang:**
- Mặc định hiển thị 10 khách hàng mỗi trang
- Có thể chọn 20 hoặc 50 records
- Điều hướng dễ dàng với nút Trang trước/Trang sau

**Xuất Excel:**
- Một click để xuất toàn bộ danh sách hiện tại (đã lọc)
- File Excel có định dạng tiếng Việt, dễ đọc
- Tên file tự động: Danh_sach_khach_hang_CRM_20250115.xlsx

**Quản lý Khách hàng:**
- Tạo mới: Form đầy đủ với 9 loại khách hàng MobiFone
- Sửa: Sử dụng lại các dropdown chuẩn, đảm bảo dữ liệu nhất quán
- Xóa: Soft delete - dữ liệu vẫn được lưu, chỉ ẩn khỏi danh sách
- Chi tiết: Xem đầy đủ thông tin và lịch sử tương tác"
```

#### Demo Steps:
1. Mở trang `/customers`
2. Demo tìm kiếm: Nhập tên khách hàng
3. Demo lọc: Chọn nhiều loại khách hàng
4. Demo phân trang: Chuyển trang, thay đổi page size
5. Click "Xuất Excel" và mở file
6. Click "Thêm khách hàng" → Điền form → Lưu
7. Click "Sửa" (icon bút chì) → Cập nhật → Lưu
8. Click "Xóa" (icon thùng rác) → Xác nhận
9. Click tên khách hàng → Xem trang chi tiết

---

### 3. Chi tiết Khách hàng & Lịch sử Tương tác

#### Điểm nhấn:
- **Timeline trực quan** hiển thị toàn bộ lịch sử tương tác
- **Thêm tương tác nhanh** ngay trên trang chi tiết
- **Icon và màu sắc** giúp nhận biết loại và trạng thái

#### Cách trình bày:

```
"Trang chi tiết khách hàng cung cấp cái nhìn toàn diện về khách hàng.

**Thông tin cơ bản:**
- Tất cả thông tin khách hàng được hiển thị rõ ràng
- Thông tin người chăm sóc (assigned employee)

**Lịch sử Tương tác (Timeline):**
- Hiển thị theo thời gian, mới nhất lên đầu
- Mỗi tương tác có:
  - Icon theo loại: 📞 Call, ✉️ Email, 👥 Meeting, 💬 Zalo/Social
  - Badge trạng thái: Thành công (xanh), Hẹn gọi lại (vàng), Thất bại (đỏ)
  - Nội dung trao đổi
  - Người thực hiện và thời gian

**Thêm tương tác:**
- Click 'Thêm tương tác' để ghi lại cuộc gọi, email, meeting...
- Form đơn giản, điền nhanh
- Tự động lưu vào timeline"
```

#### Demo Steps:
1. Mở trang chi tiết khách hàng
2. Scroll xuống phần "Lịch sử Tương tác"
3. Giải thích timeline
4. Click "Thêm tương tác" → Điền form → Lưu
5. Quan sát timeline tự động cập nhật

---

### 4. Quản lý Công việc (Tasks)

#### Điểm nhấn:
- **2 chế độ xem**: List (card) và Calendar
- **Tự động tạo interaction** khi hoàn thành task
- **Thông báo real-time** cho task mới và sắp đến hạn
- **Cảnh báo trực quan** cho task quá hạn

#### Cách trình bày:

```
"Trang Quản lý Công việc giúp theo dõi và quản lý mọi nhiệm vụ.

**2 Chế độ xem:**
1. **List View**: Xem dạng card, dễ quét mắt
2. **Calendar View**: Xem theo lịch, chọn ngày để xem tasks

**Màu sắc & Cảnh báo:**
- Xanh: Task bình thường
- Cam: Task sắp đến hạn (trong 24h)
- Đỏ + Nhấp nháy: Task quá hạn
- Xám: Task đã hoàn thành

**Hoàn thành Task:**
Khi nhân viên hoàn thành một task:
1. Click 'Hoàn thành'
2. Modal yêu cầu nhập 'Kết quả công việc'
3. Hệ thống tự động:
   - Đánh dấu task là completed
   - Tạo một interaction trong lịch sử khách hàng
   - Đảm bảo mọi công việc đều có vết trong timeline

**Thông báo:**
- Browser notification khi có task mới được giao
- Nhắc nhở khi task sắp đến hạn (30 phút trước)
- Icon chuông trên navbar hiển thị số thông báo chưa đọc"
```

#### Demo Steps:
1. Mở trang `/tasks`
2. Chuyển đổi giữa List và Calendar view
3. Giải thích màu sắc và cảnh báo
4. Click "Hoàn thành" trên một task → Điền kết quả → Lưu
5. Kiểm tra interaction đã được tạo trong trang chi tiết khách hàng
6. Demo thông báo: Giao task mới cho nhân viên khác (nếu có 2 tài khoản)

---

### 5. Thông báo (Notifications)

#### Điểm nhấn:
- **Browser Notifications** - Thông báo ngay cả khi không mở tab
- **Dropdown danh sách** trên navbar
- **Đánh dấu đã đọc** dễ dàng

#### Cách trình bày:

```
"Hệ thống thông báo giúp nhân viên không bỏ lỡ công việc quan trọng.

**2 Kịch bản thông báo:**
1. **Task mới được giao**: Khi Admin/Manager giao task cho Sales
2. **Task sắp đến hạn**: Tự động nhắc nhở 30 phút trước deadline

**Browser Notifications:**
- Thông báo hiện ngay trên desktop, không cần mở tab
- Yêu cầu quyền một lần khi lần đầu sử dụng

**Quản lý thông báo:**
- Icon chuông trên navbar hiển thị số thông báo chưa đọc
- Click vào để xem danh sách
- Có thể đánh dấu từng thông báo hoặc tất cả cùng lúc"
```

#### Demo Steps:
1. Click icon chuông trên navbar
2. Xem danh sách thông báo
3. Click "Đánh dấu đã đọc" trên một thông báo
4. Click "Đánh dấu tất cả đã đọc"
5. (Nếu có thể) Demo browser notification bằng cách giao task mới

---

### 6. Quản lý Nhân viên (Chỉ Admin)

#### Điểm nhấn:
- **Quản lý tập trung** tất cả nhân viên
- **Reset mật khẩu** an toàn với password ngẫu nhiên
- **Phân quyền** rõ ràng (Admin/Manager/Sales)

#### Cách trình bày:

```
"Trang Quản lý Nhân viên cho phép Admin quản lý toàn bộ tài khoản.

**Danh sách Nhân viên:**
- Hiển thị đầy đủ thông tin: tên, email, vai trò, trạng thái
- Role badge dễ nhận biết: Admin (đỏ), Manager (vàng), Sales (xanh)
- Status badge: Hoạt động (xanh) / Đã khóa (đỏ)

**Tạo nhân viên mới:**
- Form đơn giản với validation
- Tự động tạo password hash an toàn
- Có thể chọn role ngay khi tạo

**Sửa thông tin:**
- Cập nhật tên, email, role, trạng thái
- Username không thể thay đổi (bảo mật)

**Reset mật khẩu:**
- Tạo password ngẫu nhiên 8-12 ký tự
- Bao gồm chữ hoa, chữ thường, số, ký tự đặc biệt
- Password chỉ hiển thị một lần, có nút copy
- Admin cần gửi password này cho nhân viên qua kênh an toàn

**Xem chi tiết:**
- Tất cả user đều có thể xem thông tin nhân viên
- Modal hiển thị đầy đủ thông tin"
```

#### Demo Steps:
1. Mở trang `/employees` (chỉ Admin)
2. Giải thích bảng danh sách
3. Click "Thêm nhân viên" → Điền form → Lưu
4. Click icon 3 chấm → "Sửa" → Cập nhật → Lưu
5. Click icon 3 chấm → "Reset mật khẩu" → Copy password
6. Click icon 3 chấm → "Xem" → Xem modal chi tiết

---

### 7. Phân quyền & Bảo mật

#### Điểm nhấn:
- **3 cấp độ quyền** rõ ràng
- **JWT Authentication** bảo mật cao
- **Phân quyền theo chức năng** linh hoạt

#### Cách trình bày:

```
"Hệ thống có 3 cấp độ quyền với quyền hạn rõ ràng:

**Admin:**
- Toàn quyền quản lý nhân viên (tạo, sửa, reset password)
- Xem tất cả khách hàng
- Gán khách hàng cho bất kỳ nhân viên nào
- Xem tất cả tasks

**Manager:**
- Xem tất cả khách hàng (giống Admin)
- Gán khách hàng cho nhân viên
- Xem tất cả tasks
- KHÔNG quản lý nhân viên

**Sales:**
- Chỉ xem khách hàng được gán cho mình
- Tự động gán khách hàng mới cho chính mình
- Chỉ xem và quản lý tasks của mình
- KHÔNG gán khách hàng cho người khác

**Bảo mật:**
- JWT Token với thời hạn 24 giờ
- Password được hash bằng bcrypt
- Soft delete đảm bảo dữ liệu không mất
- CORS và validation đầy đủ"
```

#### Demo Steps:
1. Đăng nhập với tài khoản Admin → Demo các chức năng Admin
2. Đăng nhập với tài khoản Sales → Giải thích giới hạn
3. Thử truy cập trang `/employees` với Sales → Thấy lỗi 403
4. Giải thích cách hệ thống tự động ẩn/hiện các nút theo quyền

---

## 🎭 Demo Script

### Script ngắn gọn (15 phút)

```
1. Mở Dashboard (2 phút)
   - Giải thích 4 stats cards
   - Hover vào biểu đồ
   - Thay đổi bộ lọc thời gian

2. Quản lý Khách hàng (5 phút)
   - Tìm kiếm một khách hàng
   - Lọc theo loại
   - Tạo khách hàng mới
   - Xem chi tiết và timeline

3. Quản lý Công việc (4 phút)
   - Xem danh sách tasks
   - Chuyển sang Calendar view
   - Hoàn thành một task
   - Kiểm tra interaction đã tạo

4. Thông báo (2 phút)
   - Xem thông báo trên navbar
   - Giải thích browser notifications

5. Phân quyền (2 phút)
   - Giải thích 3 roles
   - Demo giới hạn của Sales
```

### Script đầy đủ (30-45 phút)

Theo thứ tự trong phần [Cấu trúc Trình bày](#cấu-trúc-trình-bày)

---

## ❓ Câu hỏi Thường gặp (FAQ)

### Q1: Hệ thống có hỗ trợ mobile không?

**A:** Có, giao diện responsive, tối ưu cho mọi thiết bị. Đã được test trên màn hình 14 inch scale 150% và hoạt động tốt.

### Q2: Dữ liệu có được backup không?

**A:** 
- Soft delete: Dữ liệu khách hàng không bị xóa vĩnh viễn, chỉ đánh dấu `deleted_at`
- Database: Nên có backup định kỳ (PostgreSQL)
- Export Excel: Có thể xuất dữ liệu bất cứ lúc nào

### Q3: Có thể tích hợp với hệ thống khác không?

**A:** Có, hệ thống cung cấp RESTful API đầy đủ với Swagger documentation. Có thể tích hợp qua:
- API endpoints
- Webhook (có thể phát triển thêm)
- Export/Import Excel

### Q4: Làm sao để reset mật khẩu admin nếu quên?

**A:** Có script `reset-admin-password.js` để reset trực tiếp trong database:
```bash
cd crm-backend
npm run reset-admin
```

### Q5: Hệ thống có hỗ trợ đa ngôn ngữ không?

**A:** Hiện tại chỉ hỗ trợ tiếng Việt. Có thể mở rộng thêm ngôn ngữ khác trong tương lai.

### Q6: Có giới hạn số lượng khách hàng/nhân viên không?

**A:** Không có giới hạn cứng. Hệ thống sử dụng pagination để tối ưu hiệu suất. Đã test với hàng nghìn records.

### Q7: Thông báo có hoạt động khi đóng trình duyệt không?

**A:** Browser notifications chỉ hoạt động khi trình duyệt đang mở. Để thông báo khi đóng trình duyệt, cần tích hợp:
- Push notifications (Service Worker)
- Email notifications
- SMS notifications

### Q8: Có thể tùy chỉnh loại khách hàng không?

**A:** Có, hiện tại có 9 loại khách hàng chuẩn của MobiFone. Có thể thêm/sửa trong code hoặc tạo bảng cấu hình động.

---

## 💡 Tips Trình bày

### 1. Chuẩn bị trước

✅ **Dữ liệu mẫu:**
- Tạo ít nhất 10-20 khách hàng mẫu
- Tạo 3-5 nhân viên với các role khác nhau
- Tạo một số tasks và interactions
- Đảm bảo có tasks quá hạn, sắp đến hạn, và đã hoàn thành

✅ **Tài khoản demo:**
- Admin account
- Manager account  
- Sales account

✅ **Môi trường:**
- Đảm bảo server đang chạy
- Kiểm tra kết nối database
- Test các chức năng chính trước

### 2. Trong khi trình bày

✅ **Tốc độ:**
- Nói chậm rãi, rõ ràng
- Dừng lại để giải thích các điểm quan trọng
- Cho phép người xem đặt câu hỏi

✅ **Tương tác:**
- Hỏi người xem có muốn xem chi tiết phần nào không
- Mời người xem thử một số chức năng
- Giải thích khi có lỗi (nếu có)

✅ **Nhấn mạnh:**
- Điểm mạnh của hệ thống
- Tính năng độc đáo (ví dụ: tự động tạo interaction)
- So sánh với giải pháp khác (nếu có)

### 3. Xử lý câu hỏi khó

❓ **"Tính năng này có thể làm X không?"**
- Nếu có: Demo ngay
- Nếu chưa có: Ghi nhận và giải thích có thể phát triển

❓ **"Hệ thống có an toàn không?"**
- Giải thích: JWT, bcrypt, soft delete, CORS, validation
- Nhấn mạnh: Phân quyền rõ ràng, không có SQL injection

❓ **"Chi phí vận hành như thế nào?"**
- Giải thích: Open source stack, không có license fee
- Chỉ cần server và database

### 4. Kết thúc

✅ **Tóm tắt:**
- Nhắc lại các tính năng chính
- Nhấn mạnh giá trị cốt lõi
- Mời đặt câu hỏi

✅ **Follow-up:**
- Cung cấp tài liệu (FEATURES.md, API docs)
- Hẹn demo chi tiết hơn nếu cần
- Ghi nhận feedback

---

## 📞 Liên hệ & Hỗ trợ

### Tài liệu tham khảo:
- `FEATURES.md` - Danh sách đầy đủ tính năng
- `http://localhost:3000/api-docs` - Swagger API Documentation
- `README.md` - Hướng dẫn cài đặt và chạy

### Scripts hữu ích:
- `npm run reset-admin` - Reset mật khẩu admin
- `node run-migration.js <file.sql>` - Chạy migration

---

**Cập nhật lần cuối:** 2025-01-15  
**Phiên bản:** 1.0.0
