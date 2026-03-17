# 📜 CRM BUSINESS LOGIC MANIFEST (FULL 100%)

## 1. KIẾN TRÚC ĐA THỰC THỂ (TENANCY & HIERARCHY)

* **Multi-tenancy:** Mọi Query phải có `tenant_id = current_user.tenant_id`.
* **Búp bê Nga (Path Hierarchy):** * `Director`: Path `/` (Thấy hết).
* `Manager`: Path `/Dept/` (Thấy phòng).
* `Leader`: Path `/Dept/Team/` (Thấy nhóm).
* `Sales`: Thấy bản ghi `assigned_to` cho chính mình.



## 2. QUY TRÌNH DỰ ÁN (PROJECT PIPELINE STAGES)

1. **Sàng lọc (Qualifying - 10%):** Xác định ngân sách và nhu cầu.
2. **Khảo sát (Survey - 20%):** Lấy yêu cầu kỹ thuật thực tế.
3. **Giải pháp (Solution - 40%):** Thiết kế phương án và BOQ.
4. **POC/Demo (60%):** Chạy thử nghiệm cho khách hàng.
5. **Đấu thầu (Tendering - 70%):** Nộp hồ sơ thầu chính thức.
6. **Thương thảo (Negotiation - 90%):** Chốt điều khoản hợp đồng.
7. **Ký kết (Closed Won - 100%):** Hoàn tất thủ tục.

## 3. CHỈ SỐ SỨC KHỎE & DỰ BÁO (CONFIDENCE & FORECAST)

* **Traffic Light System:** * 🟢 **High:** Tin cậy tuyệt đối.
* 🟡 **Medium:** 50/50.
* 🔴 **Low:** Rủi ro cao (Bắt buộc nhập `confidence_note`).


* **Công thức Doanh thu Kỳ vọng:** $WeightedValue = Value \times Stage\% \times ConfidenceFactor$
*(Hệ số Confidence: High=1.0, Medium=0.5, Low=0.2)*

## 4. QUY TẮC ĐÓNG DEAL & LÝ DO THẤT BẠI (LOSS REASONS)

Khi Deal chuyển sang trạng thái **Closed Loss**, người dùng **BẮT BUỘC** chọn lý do:

* `PRICE`: Giá cao hơn đối thủ.
* `TECH`: Không đáp ứng yêu cầu kỹ thuật.
* `RELATIONSHIP`: Quan hệ đối thủ tốt hơn.
* `CANCEL`: Khách hàng hủy dự án.
* **Hành động phụ:** Khi Deal Đóng (Won/Loss), tất cả các Task `Pending` liên quan phải tự động chuyển sang `Cancelled` kèm ghi chú hệ thống.

## 5. CƠ CHẾ GIAO VIỆC (DELEGATION LOGIC)

* **Quyền giao:** Cấp trên giao cho cấp dưới trực thuộc `path`. Cấp dưới không thấy cấp trên trong danh sách `Assigned To`.
* **Người tạo vs Người làm:** Lưu cả `created_by` và `assigned_to`.
* **Thông báo:** Trigger thông báo ngay khi `assigned_to` thay đổi.

## 6. QUY TẮC DỮ LIỆU & BẢO MẬT (SECURITY & STORAGE)

* **Soft Delete:** Không xóa vật lý. Dùng `deleted_at`.
* **Storage Path:** `/storage/{tenant_id}/{entity}/{id}/`.
* **Audit Trail:** Mọi thay đổi về `Stage`, `Value`, `Assigned_to` phải ghi vào bảng `audit_logs`.
* **Display Code:** `[PREFIX]-[YYMM]-[SERIAL]` (Ví dụ: `DEAL-2603-001`). Duy nhất trong mỗi Tenant.

## 7. HỆ THỐNG SỰ KIỆN (EVENT BUS)

Cursor cần xử lý các Hook sau:

* `ON_DEAL_STAGE_CHANGE`: Nếu chuyển sang 'Khảo sát', tạo Task 'Khảo sát hiện trạng' cho Pre-sales.
* `ON_TASK_COMPLETED`: Cập nhật `% Progress` vào trường `metadata` của Deal mẹ.
* `ON_USER_DELETE`: Chặn xóa nếu User còn Deal đang mở. Yêu cầu bàn giao (Transfer) dữ liệu trước.

---

### Cách kiểm tra 100% với Cursor:

Sau khi lưu file này, bạn hãy copy lệnh này dán vào Cursor Chat:

> "Dựa trên `@crm-logic-manifest.md`, hãy thực hiện các việc sau:
> 1. Kiểm tra logic tính $WeightedValue$ trong API Dashboard xem đã nhân với hệ số Confidence chưa.
> 2. Đảm bảo form Đóng Deal (Loss) đã bắt buộc nhập `loss_reason`.
> 3. Quét toàn bộ Code để đảm bảo khi tạo Task/Deal, hệ thống tự động sinh `display_code` đúng định dạng và không trùng lặp trong cùng Tenant.
> 4. Kiểm tra xem Manager có đang xem được Deal của Manager phòng khác không (Lỗi Path Hierarchy)."
> 
> 
## 9. QUY TẮC XUẤT FILE EXCEL (EXCEL EXPORT RULES)
* **Branding:** Mọi file xuất ra phải có Header chứa thông tin Tenant và thời gian xuất.
* **Data Privacy:** - Sales chỉ được xuất báo cáo dữ liệu của chính mình.
    - Leader/Manager chỉ được xuất dữ liệu trong `path` quản lý.
    - Director được phép xuất toàn bộ.
* **Format:** Sử dụng định dạng Table trong Excel để người dùng dễ dàng Filter/Sort sau khi tải về.
* **Audit:** Lưu lại lịch sử mỗi lần xuất file (Ai xuất, Xuất báo cáo gì, Thời gian nào) để phòng ngừa rò rỉ dữ liệu lớn.

---
