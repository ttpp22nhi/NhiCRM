# MÔ TẢ SÁNG KIẾN — TNiCRM (nội dung điền vào mẫu)

> **File Word đã tạo:** `docs/sang-kien/Mau_don_SK_TNiCRM_da_dien.docx`  
> **Mẫu gốc:** `docs/sang-kien/Mau_don_SK.docx` — copy nội dung dưới đây hoặc chạy `python docs/sang-kien/generate_mo_ta_sang_kien.py`.

**Tên sáng kiến (đề xuất):** *Hệ thống quản lý quan hệ khách hàng và KPI bán hàng tích hợp CBS — TNiCRM*

---

## MỤC TIÊU

Xây dựng và triển khai **TNiCRM** — CRM đa chi nhánh (multi-tenant) cho đội kinh doanh B2B/B2C, tập trung hóa **khách hàng – cơ hội – công việc – KPI tháng – doanh thu CBS**; tự động đối soát thực hiện KPI và báo cáo, giảm phụ thuộc Excel và thao tác thủ công giữa nhiều hệ thống.

---

## LÝ DO ĐỀ XUẤT GIẢI PHÁP

| Vấn đề trước đây | Hệ quả |
|------------------|--------|
| Dữ liệu KH, deal, KPI rải rác Excel/email/CBS | Đối soát chậm, sai lệch cuối kỳ |
| Giao KPI thủ công | Khó theo dõi % đạt theo thời gian thực |
| Chuyển khách không có luồng duyệt | Tranh chấp phụ trách, mất audit |
| Lãnh đạo thiếu dashboard theo tổ chức | Quyết định chậm, thiếu số liệu thống nhất |

**Giải pháp:** Web app nội bộ (Node.js + PostgreSQL + Next.js), một luồng dữ liệu khép kín, tích hợp API CBS, RBAC 6 vai trò.

---

## MỤC TIÊU CỦA GIẢI PHÁP

- **Kinh tế:** Giảm giờ công báo cáo/đối soát; tăng độ chính xác KPI → giao kế hoạch kỳ sau đúng hơn.
- **Kỹ thuật:** Nền tảng tập trung, API Swagger, đa tenant, ma trận quyền cấu hình.
- **Tổ chức:** Minh bạch chuyển giao KH, phê duyệt deal lớn, chốt kỳ KPI (hết ngày 5 tháng kế tiếp — giờ VN).
- **Mở rộng:** Nhân bản cho đơn vị khác trong TCT qua tenant + Super Admin.

---

## NỘI DUNG (tính mới — mô tả chi tiết)

### A. Kiến trúc

- **Backend:** Express, PostgreSQL, JWT, middleware tenant + subscription.
- **Frontend:** Next.js App Router, React.
- **Đa tenant:** `tenant_id` trên dữ liệu nghiệp vụ; login theo domain/subdomain.
- **Tài liệu API:** `/api-docs` (Swagger).

`[Hình ảnh — Sơ đồ kiến trúc: Next.js ↔ API ↔ PostgreSQL + nhánh CBS — Phụ lục 1, vẽ draw.io]`

### B. Module đã triển khai

| STT | Module | Đường dẫn | Chức năng chính |
|-----|--------|-----------|-----------------|
| 1 | Khách hàng | `/customers` | CRUD, import Excel, tìm tên/công ty/SĐT/MST, lọc bảng, trạng thái active, NEW/EXISTING, timeline tương tác |
| 2 | Cơ hội | `/deals` | Kanban pipeline, MASS/Dự án, phê duyệt >500tr, thùng rác |
| 3 | Công việc | `/tasks` | Gán task, hạn, liên KH/Deal, hoàn thành → interaction |
| 4 | KPI tháng | `/kpi` | Giao **kế hoạch** (DT mới, DT HH, HĐ, tiếp cận); TH tự sync; STT; xuất Excel; cấu hình cột tenant |
| 5 | Doanh thu CBS | `/cbs-revenue` | Sync CBS, **gom theo hợp đồng**, gán seller, duyệt, thẻ lọc dashboard |
| 6 | Dashboard | `/dashboard` | Thống kê, tiến độ KPI, leaderboard, biểu đồ |
| 7 | Tổ chức | `/organization-structure` | Cây phòng/tổ/nhóm |
| 8 | Nhân viên | `/employees` | CRUD, import Excel, reset mật khẩu |
| 9 | Phân quyền | `/permissions` | Ma trận quyền theo role |
| 10 | Chuyển giao | `/transfers`, `/transfer-approvals`, `/transfer-logs` | Yêu cầu, duyệt, audit |

### C. Điểm mới so với CRM thông thường

1. **Hai nguồn TH KPI:** Deal thắng + CBS đã duyệt (1 KPI / hợp đồng khi gom `contract_no`).
2. **Tiếp cận KPI:** Deal trong kỳ + KH CBS đã duyệt (khử trùng).
3. **Chốt kỳ KPI:** Sau ngày 5 (VN) tháng kế tiếp — chỉ Admin sửa kế hoạch; TH không còn sync ngược.
4. **Cấu hình cột KPI** lưu server theo tenant.
5. **Luồng chuyển giao KH** có phê duyệt.

### D. Gợi ý hình ảnh chèn vào mục Nội dung

```
[Hình ảnh trang /login — Đăng nhập]
[Hình ảnh trang /dashboard — Tổng quan + KPI progress]
[Hình ảnh trang /customers — Bảng KH + tìm kiếm + lọc]
[Hình ảnh trang /customers/[id] — Chi tiết KH + lịch sử]
[Hình ảnh trang /deals — Kanban pipeline]
[Hình ảnh trang /kpi — Bảng KPI: STT | NV | Địa bàn | HĐ | DT Tổng | DT mới | DT HH | Tiếp cận]
[Hình ảnh trang /kpi — Popup Cấu hình cột (Admin)]
[Hình ảnh trang /cbs-revenue — Thẻ thống kê + bảng gom HĐ]
[Hình ảnh trang /organization-structure — Cây tổ chức]
[Hình ảnh trang /permissions — Ma trận quyền]
[Hình ảnh chức năng — Xuất Excel KPI: Bao_cao_KPI_thang_*.xlsx]
[Hình ảnh trang /api-docs — Swagger (tùy chọn)]
```

---

## TÍNH MỚI CỦA SÁNG KIẾN (cam đoan)

- Tự phát triển cho nghiệp vụ đơn vị; không copy nguyên sản phẩm CRM thương mại.
- Tích hợp **KPI ↔ Deal ↔ CBS** trong một luồng là đặc thù triển khai, chưa có quy trình bắt buộc tương đương nội bộ.
- Mã nguồn thuộc kiểm soát đơn vị; mở rộng tenant không phụ thuộc license bên thứ ba.
- *(Điền)* Ngày đưa vào vận hành / phạm vi công bố nội bộ.

---

## ĐÃ ĐƯỢC ÁP DỤNG / ÁP DỤNG THỬ

Đã triển khai đủ module lõi trên môi trường vận hành/dev: đăng nhập tenant, KH, deal, task, KPI (kế hoạch + TH + export), CBS sync, dashboard, RBAC, chuyển giao.

*(Điền: tên đơn vị, ngày pilot, số user, số KH/deal/đơn CBS thực tế.)*

---

## KẾT QUẢ ÁP DỤNG

### Trước khi áp dụng

- Tổng hợp KPI cuối tháng: Excel nhiều file, ước **… giờ/người** *(điền số)*.
- Đối soát CBS: thủ công, dễ thiếu người bán.
- Chuyển KH: không có nhật ký tập trung.

### Sau khi áp dụng

- Một cổng `/kpi` + xuất Excel; TH cập nhật từ deal + CBS.
- `/cbs-revenue`: lọc nhanh theo trạng thái, gom HĐ.
- Dashboard cho lãnh đạo theo kỳ và phạm vi.

`[Hình ảnh / Bảng — So sánh thời gian báo cáo trước/sau]`

`[Hình ảnh — Màn hình KPI sau chốt kỳ / banner “Kỳ đã chốt”]`

`[Email / Biên bản — Xác nhận của lãnh đạo đơn vị — người nộp điền]`

---

## CÁC ĐIỀU KIỆN CẦN THIẾT ĐỂ ÁP DỤNG

- Server: Node.js + PostgreSQL; HTTPS/VPN nội bộ.
- Tài khoản CBS (Admin cấu hình tại `/cbs-revenue`).
- Đào tạo theo vai trò; tài liệu `docs/HUONG_DAN_SU_DUNG.md`.
- Quy ước: lịch giao KPI, duyệt deal lớn, quy trình chuyển giao.
- Sao lưu DB định kỳ.

---

## ĐÁNH GIÁ LỢI ÍCH THU ĐƯỢC

### Về kinh tế

- Giảm chi phí nhập liệu trùng và báo cáo thủ công.
- Tránh bỏ sót doanh thu CBS không gán seller.
- *(Điền phương pháp tính)*: Δ giờ × số NV × đơn giá giờ công = **… VNĐ/năm**.

### Về thời gian

- Tổng hợp KPI: nhiều nguồn → một màn `/kpi` hoặc một file Excel.
- Tìm KH: search đa trường thay vì lật sheet.

### Về nhân lực

- Giảm nhu cầu nhân sự chuyên tổng hợp Excel; quản lý giám sát trên dashboard.
- Sales tự xem % đạt kế hoạch (chế độ Số / %).

---

## KHẢ NĂNG ÁP DỤNG

- **Cấp đơn vị:** Toàn bộ phòng KD dùng CBS + quản lý KH.
- **Cấp TCT:** Multi-tenant — mỗi chi nhánh một tenant; Super Admin tại `/system/tenants`.
- **Điều kiện:** Có pipeline bán hàng và nguồn doanh thu tích hợp được (CBS hoặc API tương đương).
- **Không thay CBS** — CRM là lớp quản trị KH, KPI, người bán.

---

## PHỤ LỤC — Checklist chụp màn hình

| # | Chụp màn hình | URL / ghi chú |
|---|---------------|---------------|
| 1 | Kiến trúc (vẽ) | draw.io |
| 2 | Login | `/login` |
| 3 | Dashboard | `/dashboard` |
| 4 | Danh sách KH | `/customers` |
| 5 | Chi tiết KH | `/customers/{id}` |
| 6 | Deal Kanban | `/deals` |
| 7 | KPI đầy đủ cột | `/kpi` |
| 8 | Cấu hình cột KPI | `/kpi` → Cấu hình cột |
| 9 | CBS + thẻ lọc | `/cbs-revenue` |
| 10 | Tổ chức | `/organization-structure` |
| 11 | Phân quyền | `/permissions` |
| 12 | Chuyển giao | `/transfers` |
| 13 | File Excel KPI | Tải từ nút Xuất BC |
| 14 | Swagger | `{backend}/api-docs` |

**Lưu ý:** Che/bôi mờ SĐT, MST, doanh thu chi tiết nếu mẫu công khai.

---

*Tạo tự động từ mã nguồn và tài liệu TNiCRM — điền số liệu in đậm *(…)* trước khi nộp.*
