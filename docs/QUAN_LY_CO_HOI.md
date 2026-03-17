# Quản lý Cơ hội (Deals)

Tài liệu mô tả các tính năng trong module **Quản lý Cơ hội** của hệ thống CRM.

---

## 1. Tổng quan

Module Quản lý Cơ hội cho phép theo dõi và quản lý các deal bán hàng theo **giai đoạn** (stage) và **trạng thái** (status), với bảng Kanban kéo thả, bộ lọc, timeline (workflow) và tài liệu đính kèm.

---

## 2. Trạng thái và Giai đoạn

### 2.1 Trạng thái (Status)

- **Đang hoạt động** (`active`): Deal đang trong quá trình chốt, hiển thị trên bảng Kanban.
- **Đã chốt** (`won`): Deal thành công.
- **Đã hủy** (`cancelled`): Deal bị hủy (có nhập lý do).
- **Thất bại** (`lost`): Deal thất bại (có nhập lý do).

### 2.2 Giai đoạn (Stage) — áp dụng cho deal đang hoạt động

1. **Tiếp cận** (`tiep_can`)
2. **Tư vấn** (`tu_van`)
3. **Báo giá** (`bao_gia`)
4. **Thương thảo** (`thuong_thao`)
5. **Thành công** (`thanh_cong`)

---

## 3. Bộ lọc

- **Theo trạng thái:** Đang hoạt động | Đã chốt | Đã hủy / Thất bại.
- **Dự kiến đóng deal:** Từ ngày – Đến ngày (lọc theo `expected_closing_date`).
- **Ngày tạo:** Từ ngày – Đến ngày (lọc theo `created_at`).
- Có nút **Xóa** từng bộ lọc và **Xóa hết filter**.

---

## 4. Hiển thị theo trạng thái

### 4.1 Tab « Đang hoạt động »

- **Bảng Kanban** 5 cột tương ứng 5 giai đoạn.
- Mỗi card hiển thị: tiêu đề, giá trị (VND), khách hàng, ngày dự kiến đóng, ngày tạo; có thể có sản phẩm, số lượng, thông tin hóa đơn, ghi chú.
- Deal ≥ 100 triệu VND được nhấn mạnh (viền/ màu).
- **Kéo thả** card giữa các cột để chuyển giai đoạn (sau khi xác nhận và nhập lý do).

### 4.2 Tab « Đã chốt » và « Đã hủy / Thất bại »

- Hiển thị **danh sách** (không Kanban).
- Mỗi dòng: tiêu đề, giá trị, khách hàng, ngày tạo; với tab Đã hủy/Thất bại có thêm **lý do** (loss reason).
- Hành động: **Xem chi tiết deal**, **Sửa**, **Xóa** (chỉ khi có quyền).

---

## 5. Thao tác trên Deal

### 5.1 Tạo deal mới

- Nút **Tạo Deal mới** (chỉ hiện khi tab « Đang hoạt động »).
- Form: Tiêu đề, Giá trị (VND), Giai đoạn, Khách hàng, Ngày dự kiến đóng, Chi tiết khi thành công (sản phẩm, số lượng, thông tin hóa đơn, ghi chú).

### 5.2 Chỉnh sửa deal

- Mở form **Chỉnh sửa Deal** (từ nút Sửa trên card/danh sách hoặc từ **Chỉnh sửa** trong modal Chi tiết).
- Có thể sửa: tiêu đề, giá trị, giai đoạn, trạng thái, lý do hủy/thất bại (khi chọn Đã hủy/Thất bại), khách hàng, ngày dự kiến đóng, sản phẩm, số lượng, hóa đơn, ghi chú.
- Trong form chỉnh sửa có block **Timeline & Tài liệu** (ghi chú nhanh, đính kèm file, xem workflow và danh sách file).

### 5.3 Xem chi tiết deal

- Nút **Xem chi tiết deal** (icon mắt trên card Kanban hoặc link trong danh sách Đã chốt / Đã hủy – Thất bại).
- Modal **Chi tiết Deal** hiển thị:
  - Tiêu đề, trạng thái, giai đoạn.
  - Giá trị (VND), Khách hàng, Người phụ trách.
  - Ngày dự kiến đóng, Ngày tạo.
  - Lý do hủy/thất bại (nếu có).
  - Chi tiết khi thành công: sản phẩm, số lượng, thông tin hóa đơn, ghi chú.
  - **Workflow & Tài liệu:** Timeline (workflow) + danh sách file đính kèm (có thể thêm ghi chú, đính kèm, tải xuống, thay file, xóa file).
- Nút **Chỉnh sửa** trong modal đóng modal và mở form Chỉnh sửa Deal.

### 5.4 Chuyển giai đoạn (Kanban)

- **Kéo thả** card sang cột giai đoạn khác.
- Sau khi thả, hiện **modal « Chuyển giai đoạn deal »**:
  - Hiển thị tên deal và **từ giai đoạn → sang giai đoạn**.
  - Trường **Nội dung hiển thị trong workflow (lý do chuyển)** (tùy chọn).
- **Xác nhận:** Lưu giai đoạn mới và (nếu có) ghi nội dung vào **một** bản ghi workflow: dòng « Chuyển từ [X] sang [Y] » + nội dung.
- **Hủy:** Không đổi giai đoạn, đóng modal.

### 5.5 Hủy deal / Đánh dấu thất bại

- Trên card (deal đang hoạt động):
  - Icon **Hủy deal** (trạng thái Đã hủy).
  - Icon **Đánh dấu thất bại** (trạng thái Thất bại).
- Mở **CancelDealModal:** chọn/ nhập **lý do** (danh sách có sẵn hoặc « Khác »), xác nhận để cập nhật trạng thái và `loss_reason`.

### 5.6 Xóa deal (chuyển vào thùng rác)

- Nút **Xóa** (chỉ khi có quyền: admin/super_admin hoặc người được gán deal).
- Xác nhận: deal chuyển vào **Thùng rác**, có thể khôi phục từ **Cài đặt > Thùng rác** (Admin).

---

## 6. Workflow (Timeline)

- Mỗi deal có **timeline** gồm các hoạt động:
  - **Chuyển giai đoạn:** Một dòng thống nhất « Chuyển từ [A] sang [B] » + nội dung (lý do) nếu có khi kéo thả/ chuyển giai đoạn.
  - **Ghi chú:** Do người dùng thêm (thêm ghi chú nhanh trong form/modal).
- Hiển thị: thời gian, nội dung, người tạo (nếu có).
- Trong **Chỉnh sửa Deal** và **Chi tiết Deal** đều có block **Timeline & Tài liệu** với:
  - Ô thêm ghi chú + nút Gửi.
  - Nút **Đính kèm tài liệu** (xem mục 7).

---

## 7. Tài liệu đính kèm

- **Định dạng:** .jpg, .jpeg, .png, .pdf, .docx, .xlsx (tối đa 10MB).
- **Thao tác:**
  - **Đính kèm:** Chọn file, upload (field `file`, multipart).
  - **Tải xuống:** Theo từng file.
  - **Thay file:** Nút thay file trên từng tài liệu, chọn file mới rồi PATCH (replace).
  - **Xóa:** Nút xóa trên từng tài liệu (có xác nhận), xóa bản ghi và file trên đĩa.
- Danh sách file hiển thị tên, icon theo loại, giai đoạn (nếu có), và các nút thao tác.

---

## 8. Thùng rác (Admin)

- Link **Thùng rác** trên trang Deals (chỉ Admin).
- Xem deal đã xóa, **Khôi phục** nếu cần.

---

## 9. Phân quyền

- **Xóa deal:** Chỉ admin/super_admin hoặc nhân viên được gán deal (`assigned_to`).
- **Cập nhật deal:** Theo quyền (sales chỉ sửa deal được gán).
- **Đính kèm / Timeline:** Theo quyền truy cập deal (cùng tenant, scope đọc/ghi).

---

## 10. Tóm tắt luồng chính

| Hành động              | Mô tả ngắn |
|------------------------|------------|
| Tạo deal               | Form tạo mới, chọn khách hàng, giai đoạn, ngày dự kiến, chi tiết. |
| Xem danh sách          | Lọc theo trạng thái + ngày; Kanban (active) hoặc danh sách (won / cancelled_lost). |
| Chuyển giai đoạn       | Kéo thả card → Modal nhập lý do → Lưu một bảnghi  workflow « từ → sang » + nội dung. |
| Xem chi tiết           | Modal: thông tin deal + Workflow & Tài liệu (timeline + file). |
| Chỉnh sửa              | Form đầy đủ + Timeline & Tài liệu (ghi chú, đính kèm). |
| Hủy / Thất bại         | Modal chọn lý do → Cập nhật status + loss_reason. |
| Xóa (thùng rác)        | Chỉ người có quyền; deal chuyển vào thùng rác, Admin có thể khôi phục. |

---

*Tài liệu mô tả theo phiên bản hiện tại của module Quản lý Cơ hội.*
