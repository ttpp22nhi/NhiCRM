# HƯỚNG DẪN SỬ DỤNG — NhiCRM

> Tài liệu dành cho người dùng **trong tenant**: Admin tenant, Giám đốc, Quản lý, Leader, Sales.
> (Vai trò _Super Admin_ thuộc phạm vi vận hành nền tảng — không đề cập trong tài liệu này.)

---

## 1. Tổng quan hệ thống

NhiCRM là hệ thống CRM đa chi nhánh (multi-tenant) dành cho đội kinh doanh B2B / B2C, gồm 6 module chính:

| Module | Chức năng |
|---|---|
| **Khách hàng** | Danh sách KH, thông tin liên hệ, lịch sử tương tác, phân loại NEW/EXISTING theo KPI |
| **Cơ hội (Deal)** | Pipeline bán hàng: Tiếp cận → Tư vấn → Báo giá → Thương thảo → Thành công |
| **Công việc (Task)** | Task gán cho nhân viên, liên kết KH / Deal, hạn chót, trạng thái hoàn thành |
| **KPI tháng** | Giao & theo dõi chỉ tiêu doanh thu (mới / hiện hữu) và tiếp cận theo kỳ |
| **Doanh thu CBS** | Đơn doanh thu kéo từ hệ thống CBS, đối soát người bán, đồng bộ KPI |
| **Tổ chức & Phân quyền** | Cơ cấu phòng ban, gán vai trò, ma trận quyền theo tenant |

---

## 2. Đăng nhập và giao diện chung

### 2.1. Đăng nhập

1. Vào URL do Admin cung cấp.
2. Nhập **username** và **mật khẩu** được cấp.
3. Lần đầu đăng nhập → vào **Hồ sơ** (avatar góc phải) → **Đổi mật khẩu**.

### 2.2. Navigation (Navbar)

Menu hiển thị theo vai trò. Các mục có thể thấy:

- **Dashboard** — thống kê nhanh.
- **Khách hàng** — CRUD + Import Excel + chuyển giao.
- **Cơ hội** — Kanban board deals.
- **Công việc** — danh sách & cấp task.
- **KPI tháng** — giao / theo dõi chỉ tiêu.
- **Doanh thu CBS** — đối soát doanh thu.
- **Chuyển giao** / **Duyệt chuyển giao** — luồng chuyển khách.
- **Quản trị** (submenu): Nhân viên, Cơ cấu tổ chức, Phân quyền, Thùng rác Deal, Lịch sử chuyển giao.

### 2.3. Bộ lọc chung

Mỗi trang danh sách đều có:
- Ô search (debounce 500ms, gọi API).
- Filter theo cột (client-side) hoặc dropdown.
- Pagination / sort.

### 2.4. Ký hiệu trạng thái

- Badge **xanh lá** — hoàn thành / đã duyệt / won.
- Badge **vàng** — chờ duyệt / pending.
- Badge **đỏ** — thất bại / quá hạn.
- Badge **xanh dương** — KH mới.
- Badge **xám** — KH hiện hữu.

---

## 3. Bảng tổng quan quyền

| Chức năng | Admin | Giám đốc | Quản lý | Leader | Sales |
|---|:---:|:---:|:---:|:---:|:---:|
| Xem toàn bộ KH tenant | ✅ | ✅ | ✅ | Theo phân cấp | KH mình phụ trách |
| Tạo / sửa KH | ✅ | ✅ | ✅ | ✅ | ✅ (KH mình) |
| Chuyển giao KH (bulk) | ✅ | ✅ | ✅ | ❌ | Chỉ gửi yêu cầu |
| Duyệt chuyển giao | ✅ | ✅ | ✅ | ❌ | ❌ |
| Tạo Deal | ✅ | ✅ | ✅ | ✅ | ✅ |
| Phê duyệt Deal > 500tr | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xem KPI toàn đội | ✅ | ✅ | ✅ | ❌ | Chỉ KPI mình |
| Giao chỉ tiêu KPI | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xem doanh thu CBS | ✅ | ✅ | ✅ | ✅ | Của mình |
| Đồng bộ CBS thủ công | ✅ | ✅ | ✅ | ❌ | ❌ |
| Gán người bán CBS | ✅ | ✅ | ✅ | ❌ | Chỉ tự claim |
| Cấu hình CBS (login) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tạo / sửa nhân viên | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cơ cấu tổ chức & ma trận quyền | ✅ | ❌ | ❌ | ❌ | ❌ |

> Ghi chú: "Theo phân cấp" = chỉ thấy dữ liệu trong nhánh tổ chức mình phụ trách (cấu hình ở **Cơ cấu tổ chức**).

---

## 4. Hướng dẫn theo vai trò

### 4.1. Admin tenant

**Mục tiêu**: Khởi tạo và duy trì toàn bộ cấu hình của chi nhánh.

#### Việc ban đầu cần làm

1. **Cấu hình tổ chức** (`/organization-structure`)
   - Tạo cấu trúc phòng ban (Công ty → Phòng → Tổ → Nhóm).
   - Gán Leader / Manager vào các cấp.
2. **Tạo nhân viên** (`/employees` → "Thêm nhân viên" hoặc "Import Excel")
   - Gán vai trò, phòng ban, territory (khu vực).
   - Đặt mật khẩu tạm.
3. **Cấu hình CBS** (`/cbs-revenue` → "Cấu hình CBS")
   - Nhập `username`, `password`, đơn vị CBS (unit_id).
   - Kiểm tra **Đồng bộ ngay** để test kết nối.
4. **Ma trận phân quyền** (`/permissions`)
   - Tùy chỉnh quyền chi tiết cho từng vai trò (bật/tắt từng permission).
5. **Giao KPI tháng đầu** (`/kpi`)
   - Nhập chỉ tiêu doanh thu mới / hiện hữu và số lần tiếp cận cho mỗi Sales.

#### Việc duy trì định kỳ

- **Thêm nhân viên mới** khi onboard.
- **Khoá tài khoản** nhân viên nghỉ việc: `/employees` → sửa → tắt "Hoạt động".
- **Reset mật khẩu**: `/employees` → sửa → "Đặt lại mật khẩu".
- **Thùng rác Deal** (`/deals/trash`): khôi phục hoặc xoá vĩnh viễn các deal đã xoá mềm.
- **Lịch sử chuyển giao** (`/transfer-logs`): audit mọi lượt chuyển KH.
- **Theo dõi KPI** cuối tháng, đóng kỳ (kỳ quá khứ tự động khoá, chỉ Admin mới sửa được).

---

### 4.2. Giám đốc (Director) / Quản lý (Manager)

**Mục tiêu**: Điều hành đội Sales, giao chỉ tiêu, duyệt giao dịch lớn, đối soát doanh thu.

Giám đốc và Quản lý có quyền gần giống nhau, khác biệt chủ yếu ở phạm vi phân cấp tổ chức.

#### Giao chỉ tiêu KPI — đầu mỗi tháng

1. Vào **KPI tháng** (`/kpi`).
2. Chọn kỳ (tháng).
3. Nhập chỉ tiêu cho từng Sales:
   - **Tập phát triển mới** (VNĐ) — doanh thu từ KH mới.
   - **Tập hiện hữu** (VNĐ) — doanh thu từ KH đã có trong CRM/CBS.
   - **Tiếp cận** (số lần) — mục tiêu số cơ hội tạo mới trong tháng.
4. Bấm **Lưu chỉ tiêu**.

Bảng hiển thị **Thực hiện** bên phải tự đồng bộ theo Deal thắng + CBS approved. Chuyển giữa chế độ **Số** (VNĐ) và **%** để xem tỉ lệ đạt.

#### Phê duyệt Deal lớn

- Sale tạo deal > 500 triệu → trạng thái `pending_approval`.
- Cột thông báo sẽ báo; bạn vào `/deals`, chọn deal → nút **Phê duyệt**.
- Deal từ đó được đưa vào Pipeline công khai.

#### Đối soát doanh thu CBS

1. Vào **Doanh thu CBS** (`/cbs-revenue`).
2. Chọn kỳ, xem các đơn CBS được tự động kéo từ hệ thống CBS.
3. Các đơn **Chưa có người bán** hoặc **Chờ duyệt**:
   - Click dropdown "Người bán" → chọn Sales tương ứng (tự động duyệt luôn).
   - Hoặc xác nhận các yêu cầu Sales tự claim bằng nút **Duyệt**.
4. Sau mỗi lần gán/duyệt, hệ thống tự:
   - Gán/match khách hàng CRM cho đơn CBS.
   - Auto-promote Deal liên quan sang "Thành công" nếu match được.
   - Cộng doanh thu vào KPI tháng của Sales.

#### Duyệt yêu cầu chuyển giao

- Sales gửi **Yêu cầu chuyển giao** → bạn vào `/transfer-approvals`.
- Xem lý do, chấp nhận hoặc từ chối.
- Việc chuyển giao hàng loạt chủ động: `/customers` → chọn nhiều KH → **Chuyển giao người phụ trách**.

#### Quản lý nhân viên

- `/employees`: xem cơ cấu, thêm/sửa/xoá nhân viên.
- Chỉ được tạo các vai trò cấp dưới: Leader, Sales (không tạo được Admin).
- Gán territory (khu vực) để KPI có thể phân bổ theo địa bàn.

---

### 4.3. Leader

**Mục tiêu**: Giám sát nhóm nhỏ, hỗ trợ Sales hoàn thành KPI.

#### Những gì Leader có thể làm

- Xem danh sách KH / Deal / Task trong **nhánh tổ chức** mình phụ trách (theo cơ cấu Giám đốc/Quản lý thiết lập).
- Tạo/sửa Deal, Task cho nhân viên trong nhóm.
- Xem Doanh thu CBS của đội.
- Xem KPI nhóm (không giao được chỉ tiêu).

#### Việc cần làm hàng ngày

1. **Check Dashboard** đầu ngày — xem task quá hạn / deal sắp đóng.
2. **Hỗ trợ xử lý deal** ở giai đoạn Tư vấn / Báo giá.
3. **Theo sát KPI nhóm**: nhắc Sales chưa đạt tiếp cận / doanh thu.
4. **Quản lý task**: giao task hỗ trợ (khảo sát kỹ thuật, gọi lại khách), theo dõi tiến độ.

#### Hạn chế

- **Không** duyệt được chuyển giao KH.
- **Không** phê duyệt được Deal lớn.
- **Không** cấu hình CBS / tạo nhân viên.

---

### 4.4. Sales

**Mục tiêu**: Theo đuổi cơ hội, chốt deal, đạt KPI tháng.

#### Quy trình công việc điển hình

##### Bước 1 — Tạo / Tiếp nhận khách hàng

- Tự tạo KH: `/customers` → **Thêm khách hàng**.
- Hoặc nhận KH được bàn giao từ Leader / Manager.
- Đảm bảo điền đủ:
  - Tên / SĐT / Mã số thuế (để match CBS sau này).
  - **Phân loại KPI**: NEW (mới) / EXISTING (hiện hữu) — nếu đã có lịch sử mua.

##### Bước 2 — Tạo Cơ hội (Deal)

- Từ KH → nút **Tạo Deal mới** (hoặc từ `/customers` chọn KH → **+ Deal**).
- Điền:
  - **Loại**: MASS (bán lẻ/thông thường) hoặc PROJECT (dự án).
  - **Giá trị dự kiến** (VNĐ).
  - **Ngày dự kiến đóng** — dùng để phân kỳ doanh thu vào KPI tháng đó.
  - **Ngày tiếp cận lần đầu**, **Mã dịch vụ chính**.
  - **Mức độ tự tin** (xanh / vàng / đỏ).
- Deal khi tạo sẽ ở stage **Tiếp cận** → **KPI "Tiếp cận thực hiện"** tháng tạo deal tự tăng +1.

##### Bước 3 — Di chuyển stage

- Trên Kanban `/deals`: kéo deal qua các cột hoặc bấm "Đổi giai đoạn".
- Các stage:
  - **Tiếp cận** → **Tư vấn** → **Báo giá** → **Thương thảo** → **Thành công**
  - (PROJECT thêm giai đoạn **Khảo sát kỹ thuật** trước Báo giá)
- Hệ thống tự sinh task khi chuyển:
  - MASS → Báo giá: task "Gọi điện xác nhận báo giá".
  - PROJECT → Khảo sát: task giao bộ phận Kỹ thuật (nếu đã cấu hình).

> Deal giá trị **> 500 triệu** khi Sales tạo sẽ ở trạng thái **Chờ phê duyệt**, cần Leader/Manager duyệt trước khi vào Pipeline.

##### Bước 4 — Chốt deal

- Kéo deal sang **Thành công** → cập nhật `status = won`.
- Doanh thu được cộng vào KPI tháng theo `expected_closing_date`.
- Nếu KH là NEW → cộng vào **Tập phát triển mới**; EXISTING → **Tập hiện hữu**.

##### Bước 5 — Đối soát CBS

- Khi có hoá đơn CBS về (tự động đồng bộ 2 lần/ngày 06:00 & 18:00):
  - Đơn của mình sẽ được **tự claim** (nếu match được người bán).
  - Đơn chưa match → vào `/cbs-revenue` → tab **Chưa có người bán** → bấm **Tích là của tôi** để gửi yêu cầu.
  - Đợi Leader/Manager duyệt.

- Nếu đơn CBS match được với Deal đang active của bạn → hệ thống **tự động chuyển Deal sang "Thành công"** và gửi notification. Kiểm tra lại thông tin deal.

##### Bước 6 — Theo dõi KPI cá nhân

- Vào `/kpi` xem tháng hiện tại:
  - **Tiếp cận thực hiện**: số deal tạo trong tháng.
  - **Thực hiện mới / hiện hữu**: doanh thu tích luỹ (Deal won + CBS approved).
  - **%** đạt chỉ tiêu: đổi sang mode "%" để xem.

#### Công cụ hỗ trợ

- **Task** (`/tasks`): xem công việc được giao, đánh dấu hoàn thành.
- **Chuyển giao** (`/transfers`): gửi yêu cầu chuyển KH sang đồng nghiệp (ví dụ khi nghỉ phép dài). Chờ Manager duyệt.
- **Hồ sơ** (`/profile`): đổi mật khẩu, cập nhật ảnh đại diện, email.

---

## 5. Quy trình nghiệp vụ xuyên module

### 5.1. Khách hàng → Cơ hội → KPI

```
Tạo KH → Tạo Deal (stage Tiep_can) → KPI "Tiếp cận +1"
                    ↓
             Tư vấn → Báo giá → Thương thảo
                    ↓
               Thành công (won)
                    ↓
   KPI "Thực hiện doanh thu +amount" (theo kỳ expected_closing)
```

### 5.2. CBS → Deal → KPI (luồng tự động)

```
CBS duyệt (manager/admin)
    ↓
[Auto-match Customer CRM] — theo mã số thuế / SĐT (9 số cuối)
    ↓ (nếu không tìm thấy → tạo customer mới)
[Auto-match Deal] — 3 tầng:
    1. Deal won cùng kỳ, amount ±5%  → chỉ link
    2. Deal active, amount ±20%     → link + auto-promote sang "Thành công"
    3. Deal active gần nhất          → link + auto-promote
    ↓
[Snapshot KPI kind] — NEW/EXISTING tại thời điểm duyệt
    ↓
[Log deal_activities] + [Gửi notification] cho Sale phụ trách
    ↓
[Recompute KPI] cho:
  • Người claim CBS (claimed_by)
  • Người phụ trách Deal (assigned_to) — có thể khác
```

### 5.3. Tránh double-count

- Deal `status = won` → cộng doanh thu qua `deals.amount`.
- CBS `claim_status = approved` **có** `deal_id` → **không** cộng (tránh đếm 2 lần).
- CBS `claim_status = approved` **không** có `deal_id` → cộng trực tiếp vào KPI theo `kpi_kind_at_approve`.

### 5.4. Phân loại NEW / EXISTING

- Mặc định KH mới tạo trong CRM = **NEW**.
- Tự động nâng cấp sang **EXISTING** khi:
  - Có ít nhất 1 Deal `won` hoặc
  - Có ít nhất 1 CBS order approved.
- Sales có thể chỉnh tay trong form sửa KH.
- Filter tại `/customers` theo nhãn này: **Tất cả / KH Mới / KH Hiện hữu**.

---

## 6. Câu hỏi thường gặp (FAQ)

### Q1. Tôi tạo deal mà KPI "Tiếp cận thực hiện" không tăng?

- Hiện tại hệ thống recompute KPI cho **cả kỳ tạo deal** (`created_at`) và **kỳ dự kiến đóng** (`expected_closing_date`). F5 lại trang KPI là thấy.
- Nếu deal chưa được gán **assigned_to** (trường hợp rất hiếm) thì KPI không thay đổi — hãy mở deal, gán người phụ trách.

### Q2. Doanh thu CBS của tôi chưa vào KPI?

- Check `/cbs-revenue`: đơn phải ở trạng thái **Đã duyệt** (green badge).
- Nếu đơn vẫn **Chờ duyệt** → chờ Manager bấm "Duyệt" hoặc gán người bán trực tiếp.
- Đơn của tháng nào → cộng vào KPI tháng đó (theo `period_ym`).

### Q3. Deal đã chốt nhưng thấy doanh thu nhỏ hơn trong CBS?

- Khi CBS về, hệ thống có thể **tự động đồng bộ giá trị** deal theo CBS (nếu chênh lệch > 5%).
- Xem dòng log `[CBS] Auto-promote từ HĐ xxx: ...` trong timeline của deal để biết đã điều chỉnh gì.

### Q4. Làm sao chuyển KH cho đồng nghiệp?

- **Sales**: `/customers` → chọn KH → **Yêu cầu chuyển giao** → chọn người nhận + lý do → gửi. Chờ Manager duyệt.
- **Manager/Director/Admin**: có thể chuyển trực tiếp (không cần duyệt).

### Q5. Tôi quên mật khẩu?

- Liên hệ Admin tenant → Admin vào `/employees` → sửa tài khoản → **Đặt lại mật khẩu** → gửi mật khẩu mới cho bạn.

### Q6. Kỳ KPI quá khứ sao không sửa được?

- Kỳ đã kết thúc tự động khoá. **Chỉ Admin tenant** mới mở khoá được để đảm bảo toàn vẹn báo cáo.

### Q7. Sao tôi không thấy tất cả KH của công ty?

- Sales: chỉ thấy KH `assigned_to = mình` hoặc được cấu hình trong **nhánh tổ chức**.
- Leader: thấy KH trong nhánh mình quản lý.
- Điều này do cấu hình **Cơ cấu tổ chức** + **Ma trận phân quyền** (`/permissions`). Liên hệ Admin nếu cần mở rộng.

### Q8. Filter KH "Hiện hữu" không ra đúng người?

- Nhãn EXISTING cập nhật sau lần chạy `customerKindRefreshService` (khi sync CBS) hoặc khi bạn bấm **Tính lại KPI** tại `/cbs-revenue`.
- Nếu vẫn sai, mở hồ sơ KH → đổi "Phân loại KPI" trong form sửa.

### Q9. Task tự sinh khi chuyển stage deal là gì?

- **MASS → Báo giá**: hệ thống tạo task "Gọi điện xác nhận báo giá" giao cho chính Sale → nhắc nhở followup.
- **PROJECT → Khảo sát**: tạo task "Khảo sát kỹ thuật / giải pháp" giao cho bộ phận Kỹ thuật (nếu đã cấu hình trong `/organization-structure`).

---

## 7. Mẹo sử dụng

- **Ctrl+K** (nếu có) để mở command palette / tìm nhanh.
- Trong bảng CBS: hàng **lọc theo cột** ngay dưới header — nhập nhanh theo khách hàng, hợp đồng, NV CBS, khoảng giá, trạng thái người bán.
- Trong bảng KPI: **click header** để sort theo doanh thu / tỉ lệ đạt — xem ai bứt phá, ai cần hỗ trợ.
- Kanban Deal: kéo-thả giữa các cột — hệ thống tự log stage change.
- Dashboard có widget "Sắp đóng trong 7 ngày" — ưu tiên các deal này.

---

## 8. Liên hệ hỗ trợ

- **Vấn đề tài khoản / quyền**: Admin tenant của công ty bạn.
- **Cấu hình CBS không kết nối**: Admin tenant kiểm tra lại username/password tại `/cbs-revenue` → **Cấu hình CBS**.
- **Lỗi hệ thống nghiêm trọng**: Admin liên hệ đội vận hành NhiCRM.

---

_Phiên bản tài liệu: 2026-04. Cập nhật theo các tính năng đã triển khai: auto-link CBS↔Deal, phân loại KPI NEW/EXISTING, filter nhân viên searchable, filter cột trong CBS, sort KPI._
