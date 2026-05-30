# CẨM NANG SỬ DỤNG TNiCRM
### Dành cho người dùng cuối — viết thật đơn giản, dễ làm theo

---

Chào bạn!

Nếu bạn vừa được cấp tài khoản TNiCRM và chưa biết bắt đầu từ đâu, tài liệu này sẽ dắt bạn đi từng bước — giống như một người đồng nghiệp ngồi bên cạnh chỉ cho bạn vậy.

Bạn không cần biết gì về công nghệ. Chỉ cần đọc phần **vai trò của bạn** là đủ.

---

## Mục lục nhanh

- [Bạn là ai trong hệ thống?](#bạn-là-ai-trong-hệ-thống) — chọn vai trò của mình
- [Lần đầu đăng nhập](#lần-đầu-đăng-nhập) — 3 phút làm quen
- [Một ngày làm việc của bạn](#một-ngày-làm-việc-của-bạn) — theo từng vai trò
- [Những thắc mắc hay gặp](#những-thắc-mắc-hay-gặp)

---

## Bạn là ai trong hệ thống?

TNiCRM có 5 nhóm người dùng. Hãy chọn đúng vai trò của bạn để đọc phần hướng dẫn phù hợp:

| Vai trò | Bạn là ai? | Đọc phần |
|---|---|---|
| **Admin công ty** | Người quản trị hệ thống cho công ty (IT / trưởng phòng kinh doanh kiêm nhiệm) | [Phần A](#phần-a--dành-cho-admin-công-ty) |
| **Giám đốc** | Giám đốc kinh doanh, giám đốc chi nhánh | [Phần B](#phần-b--dành-cho-giám-đốc--quản-lý) |
| **Quản lý** | Trưởng phòng kinh doanh, trưởng khu vực | [Phần B](#phần-b--dành-cho-giám-đốc--quản-lý) |
| **Leader** | Tổ trưởng, trưởng nhóm sales | [Phần C](#phần-c--dành-cho-leader) |
| **Sales** | Nhân viên kinh doanh, nhân viên chăm sóc khách hàng | [Phần D](#phần-d--dành-cho-sales) |

> Không chắc mình là ai? Hỏi người cấp tài khoản cho bạn nhé.

---

## Lần đầu đăng nhập

### Bước 1 — Mở hệ thống

Nhập địa chỉ web được cấp (ví dụ: `crm.congty.com`).

### Bước 2 — Đăng nhập

- Nhập **tên tài khoản** và **mật khẩu** mà Admin đã gửi cho bạn.
- Bấm **Đăng nhập**.

### Bước 3 — Đổi mật khẩu (quan trọng!)

Bấm vào **ảnh đại diện** góc trên bên phải → **Hồ sơ** → **Đổi mật khẩu**.

> Mẹo: đặt mật khẩu có ít nhất 8 ký tự, pha trộn chữ và số. Ví dụ: `Kinhdoanh2026`.

### Bước 4 — Tham quan 1 vòng

Nhìn sang trái hoặc trên cùng màn hình, bạn sẽ thấy các menu:

- **Dashboard** — trang tổng quan.
- **Khách hàng** — danh sách khách hàng.
- **Cơ hội** — danh sách các thương vụ (deal) bạn đang theo đuổi.
- **Công việc** — việc cần làm.
- **KPI tháng** — chỉ tiêu và kết quả của bạn.
- **Doanh thu CBS** — hoá đơn thực tế từ hệ thống bán hàng.

Menu bạn thấy sẽ khác nhau tuỳ vai trò. Không sao cả, đó là bình thường.

---

## Một ngày làm việc của bạn

# Phần A — Dành cho Admin công ty

> Bạn giống như "người giữ chìa khoá" của hệ thống. Việc của bạn là dựng nhà, lắp cửa, giao chìa khoá cho đúng người, rồi thỉnh thoảng bảo trì.

### Tuần đầu tiên — 5 việc cần làm

**1. Vẽ sơ đồ công ty**

Vào menu **Quản trị → Cơ cấu tổ chức**.

Tạo các phòng/ban theo đúng cơ cấu công ty. Ví dụ:

```
Công ty ABC
├─ Phòng Kinh doanh Miền Bắc
│   ├─ Tổ Hà Nội
│   └─ Tổ Hải Phòng
└─ Phòng Kinh doanh Miền Nam
    └─ Tổ TP.HCM
```

Mỗi phòng/tổ gán 1 người làm Trưởng (sẽ cấp tài khoản ở bước 2).

**2. Cấp tài khoản nhân viên**

Vào **Quản trị → Nhân viên** → bấm **Thêm nhân viên**.

Điền:
- Họ tên, email, số điện thoại.
- **Vai trò** (Giám đốc / Quản lý / Leader / Sales).
- **Phòng ban** (chọn từ sơ đồ bạn vừa vẽ).
- **Khu vực** (Hà Nội / TP.HCM / ...).
- Mật khẩu tạm (nhân viên sẽ đổi sau).

Nếu có danh sách Excel → bấm **Import Excel** để tải lên hàng loạt.

**3. Kết nối hệ thống bán hàng CBS**

Công ty có hệ thống CBS để ghi nhận doanh thu? Hãy nối CBS vào CRM:

- Vào **Doanh thu CBS** → **Cấu hình CBS**.
- Nhập tài khoản CBS mà công ty cấp (hỏi kế toán nếu không biết).
- Bấm **Đồng bộ ngay** để thử kết nối.

Nếu thấy đơn hàng chảy về = thành công!

**4. Giao chỉ tiêu KPI tháng đầu**

Vào **KPI tháng**. Chọn tháng hiện tại.

Với mỗi Sales, điền 3 con số:
- **Doanh thu khách mới** (ví dụ: 200 triệu)
- **Doanh thu khách hiện hữu** (ví dụ: 500 triệu)
- **Số lần tiếp cận mới** (ví dụ: 30 cơ hội)

Bấm **Lưu**. Vậy là đội Sales đã có mục tiêu để chạy.

**5. Thiết lập phân quyền chi tiết (nếu cần)**

Vào **Quản trị → Phân quyền**. Mặc định đã có sẵn quyền chuẩn cho mỗi vai trò. Chỉ can thiệp nếu công ty có chính sách riêng (ví dụ: Sales được thấy KH cả phòng).

### Việc định kỳ — mỗi tháng/quý

- **Có nhân viên mới** → vào **Nhân viên** → **Thêm nhân viên**.
- **Có nhân viên nghỉ** → vào hồ sơ → tắt "Hoạt động" (không xoá, để còn audit).
- **Nhân viên quên mật khẩu** → vào hồ sơ → **Đặt lại mật khẩu** → gửi mật khẩu mới.
- **Cuối tháng** → kiểm tra KPI toàn đội, in báo cáo.
- **Thỉnh thoảng** vào **Thùng rác Deal** khôi phục các deal bị xoá nhầm.

### Bạn sẽ được hỏi gì nhiều nhất?

> "Anh/chị ơi em quên mật khẩu" → 5 giây reset trong mục Nhân viên.
>
> "Sao em không thấy khách hàng của sếp?" → Do phân quyền theo phòng ban, kiểm tra lại Cơ cấu tổ chức.
>
> "Doanh thu CBS không về?" → Vào Doanh thu CBS bấm Đồng bộ ngay, nếu lỗi → kiểm tra lại tài khoản CBS.

---

# Phần B — Dành cho Giám đốc / Quản lý

> Bạn là người cầm lái. Việc của bạn là giao mục tiêu, theo dõi tiến độ, phê duyệt các quyết định lớn, và đối soát doanh thu.

### Đầu mỗi tháng — 15 phút

**Giao KPI cho đội**

1. Vào menu **KPI tháng**.
2. Chọn tháng.
3. Với mỗi Sales trong danh sách, điền 3 mục tiêu:
   - Doanh thu khách **mới**
   - Doanh thu khách **hiện hữu**
   - Số **cơ hội tiếp cận**
4. Bấm **Lưu**.

Xong rồi! Từ giờ, bất cứ deal nào Sales chốt, bất cứ hoá đơn CBS nào về, hệ thống sẽ tự cộng vào ô **Thực hiện** bên cạnh. Bạn chỉ cần ngắm.

### Hàng ngày — 5 phút buổi sáng

**Mở Dashboard**, nhìn nhanh 3 thứ:

1. **Deal sắp đóng trong 7 ngày** — có ai cần hỗ trợ không?
2. **Deal lớn chờ phê duyệt** — Sales tạo deal > 500 triệu sẽ chờ bạn duyệt. Vào **Cơ hội**, bấm nút **Phê duyệt**.
3. **Yêu cầu chuyển giao khách** — có Sales nào xin chuyển khách? Vào **Duyệt chuyển giao**, đọc lý do → đồng ý hoặc từ chối.

### Hàng tuần — 15 phút

**Đối soát doanh thu CBS**

Vào **Doanh thu CBS**. Bạn sẽ thấy các hoá đơn đã về:

- Các hoá đơn **đã có người bán** → hệ thống tự xử lý, không cần làm gì.
- Các hoá đơn **chưa có người bán**:
   - Nhìn vào mã khách hàng / mã hợp đồng để đoán đây là khách của ai.
   - Bấm vào dropdown "Người bán" → chọn tên Sales → xong.
- Các hoá đơn **có Sales tự nhận** (claim):
   - Bấm **Duyệt** nếu đúng, **Từ chối** nếu sai.

Khi bạn duyệt xong 1 đơn, hệ thống tự động:
- Cộng doanh thu vào KPI của Sales đó.
- Nếu Sales đang có deal tương ứng → tự chuyển deal sang "Thành công".
- Nếu khách chưa có trong CRM → tự tạo khách mới.

> Bạn không cần làm thủ công gì thêm. Chỉ cần duyệt.

### Cuối tháng — 30 phút

1. Vào **KPI tháng** → xem ai đạt, ai không đạt.
2. Chuyển sang chế độ **%** để xem tỉ lệ đạt nhanh hơn.
3. Bấm header cột "Thực hiện" để sort → tìm ra top performer và người cần kèm cặp.
4. Xuất báo cáo (nếu có) để họp review.

### Các quyết định lớn

| Tình huống | Bạn làm gì |
|---|---|
| Sales tạo deal > 500 triệu | Vào Cơ hội → Phê duyệt |
| Sales xin chuyển khách sang đồng nghiệp | Vào Duyệt chuyển giao → Đồng ý/Từ chối |
| Cần chuyển hàng loạt khách (Sales nghỉ việc) | Vào Khách hàng → chọn nhiều KH → Chuyển giao hàng loạt |
| Thêm Sales mới | Vào Nhân viên → Thêm nhân viên (không cần qua Admin) |

---

# Phần C — Dành cho Leader

> Bạn là "anh cả/chị cả" của một nhóm nhỏ. Việc của bạn là đồng hành cùng các bạn Sales — chứ không phải làm thay.

### Buổi sáng — 10 phút

**Mở Dashboard**. Nhìn:
- Bạn có task nào hôm nay không?
- Nhóm mình có deal nào sắp đóng không?
- Có task nào của nhóm đang quá hạn không? → Nhắc bạn Sales đó.

### Trong ngày

**Hỗ trợ các bạn Sales:**

- Vào **Cơ hội** → xem các deal của nhóm đang ở giai đoạn **Tư vấn** hoặc **Báo giá** → đây là lúc khách dễ dao động, cần bạn hỗ trợ kỹ thuật hoặc đàm phán giá.
- Giao thêm task cho các bạn khi cần (ví dụ: "Gọi lại khách X vào chiều mai"): vào **Công việc** → **Thêm task** → chọn người thực hiện.

**Theo dõi KPI nhóm:**

- Vào **KPI tháng** → xem tiến độ của từng bạn.
- Đầu tuần chưa ai đạt 25%? → Họp nhóm 15 phút xem vướng ở đâu.

### Những việc bạn KHÔNG làm được (bình thường)

- Không phê duyệt được deal > 500 triệu (để Giám đốc/Quản lý duyệt).
- Không duyệt được yêu cầu chuyển giao khách.
- Không cấu hình hệ thống CBS.
- Không giao KPI.

> Nếu thấy cần quyền này → đề xuất với Giám đốc/Quản lý để họ hỗ trợ.

---

# Phần D — Dành cho Sales

> Đây là phần dài nhất — vì bạn là người "làm ra tiền". Hệ thống tồn tại là để phục vụ bạn.

## Một ngày làm việc điển hình của Sales

### Buổi sáng — Chuẩn bị (10 phút)

1. **Đăng nhập** vào CRM.
2. Mở **Dashboard** — xem có thông báo gì mới không (khách mới được giao, task quá hạn...).
3. Mở **Công việc** — xem hôm nay cần làm gì.
4. Mở **KPI tháng** — nhìn tiến độ: còn bao nhiêu % nữa?

### Trong ngày — 4 việc lặp đi lặp lại

---

### Việc 1: Tạo khách hàng mới

**Khi nào?** Khi bạn gặp khách mới (hội chợ, bạn bè giới thiệu, tự tìm...).

**Làm thế nào?**

1. Vào **Khách hàng** → **Thêm khách hàng**.
2. Điền thông tin:
   - **Tên khách** (tên công ty hoặc tên người)
   - **Số điện thoại**
   - **Mã số thuế** (quan trọng! Đây là "chìa khoá" để hệ thống tự nhận diện sau này)
   - **Địa chỉ**, email, ghi chú...
3. **Phân loại**:
   - Nếu khách chưa từng mua gì → chọn **Khách mới (NEW)**
   - Nếu khách đã mua ở hệ thống khác của công ty → chọn **Khách hiện hữu (EXISTING)**
4. Bấm **Lưu**.

> **Lời khuyên**: Luôn nhập Mã số thuế nếu là công ty, hoặc SĐT chuẩn nếu là cá nhân. Sau này khi có hoá đơn CBS, hệ thống sẽ tự match đúng khách → bạn không cần làm gì thêm.

---

### Việc 2: Tạo cơ hội (Deal)

**Khi nào?** Khi khách tỏ ý quan tâm, hỏi giá, hỏi thông tin sản phẩm.

**Làm thế nào?**

1. Mở trang **Khách hàng** → tìm khách → bấm vào tên → **+ Cơ hội mới**.
2. Điền:
   - **Tên cơ hội** (ví dụ: "Bán 100 bình sơn cho Công ty X")
   - **Loại**:
      - **MASS** = bán lẻ/thông thường
      - **PROJECT** = dự án lớn có khảo sát kỹ thuật
   - **Giá trị dự kiến** (ví dụ: 50 triệu)
   - **Ngày dự kiến chốt** (quan trọng! Hệ thống sẽ cộng doanh thu vào KPI **tháng đó**)
   - **Ngày tiếp cận lần đầu** (hôm nay hay hôm qua...)
   - **Mức độ tự tin** (xanh = chắc chắn, vàng = có khả năng, đỏ = khó)
3. Bấm **Lưu**.

**Điều kỳ diệu xảy ra:**
- KPI "Tiếp cận thực hiện" của bạn vừa tăng +1 — bạn vừa ghi điểm!

> **Deal > 500 triệu**? Sau khi lưu, deal sẽ ở trạng thái "Chờ phê duyệt". Nhắn sếp duyệt giúp.

---

### Việc 3: Đẩy deal qua các giai đoạn

Deal của bạn đi qua 5 bước (giống như leo thang):

```
Tiếp cận → Tư vấn → Báo giá → Thương thảo → THÀNH CÔNG
```

**Cách đẩy:**

1. Vào **Cơ hội** — bạn sẽ thấy **Kanban board** (như Trello).
2. **Kéo-thả** deal từ cột này sang cột khác theo tiến độ thực tế.
3. Hoặc: click vào deal → chọn "Đổi giai đoạn".

**Hệ thống sẽ thông minh thay bạn:**

| Khi bạn đẩy deal sang... | Hệ thống tự tạo task giúp |
|---|---|
| **Báo giá** (MASS) | Task "Gọi điện xác nhận báo giá" giao lại cho bạn |
| **Khảo sát kỹ thuật** (PROJECT) | Task giao cho bộ phận Kỹ thuật hỗ trợ |
| **Thành công** | Cộng luôn doanh thu vào KPI |

---

### Việc 4: Theo dõi doanh thu CBS

CBS là hệ thống ghi nhận hoá đơn thực tế của công ty. TNiCRM tự động đồng bộ 2 lần/ngày (sáng 6h, chiều 6h).

**Kịch bản 1 — Đơn của bạn tự chảy về**

Khi khách thanh toán, CBS ghi nhận → TNiCRM kéo về → tự nhận ra "đây là khách của bạn" → tự cộng vào KPI. **Bạn không cần làm gì.**

**Kịch bản 2 — Có đơn chưa có người bán**

Thỉnh thoảng CBS về đơn mà hệ thống chưa biết của ai. Bạn nhận ra đó là khách mình? → Làm như sau:

1. Vào **Doanh thu CBS**.
2. Bộ lọc → chọn **Chưa có người bán**.
3. Tìm đơn của mình → bấm **Tích là của tôi**.
4. Chờ sếp duyệt (thường trong ngày) → xong, doanh thu vào KPI.

**Kịch bản 3 — Đơn CBS gắn với deal của bạn**

Nếu bạn đang có 1 deal "Bán 100 bình sơn cho Công ty X — 50 triệu" ở giai đoạn **Thương thảo**, và CBS về đúng hoá đơn đó → hệ thống **tự động chuyển deal sang Thành công** và gửi thông báo cho bạn.

Bạn chỉ cần mở deal, kiểm tra xem thông tin có đúng không.

---

### Cuối ngày — 5 phút

1. Mở **Công việc** → đánh dấu hoàn thành các task đã làm.
2. Cập nhật ghi chú vào các deal đã tiến triển.
3. Liếc **KPI tháng** — hôm nay đã ghi thêm điểm chưa?

---

## Những mẹo nhỏ giúp Sales đỡ mệt

**1. Ghi chú ngay khi vừa gọi điện cho khách**

Vào deal → phần bình luận → ghi 1 dòng. Tháng sau đọc lại sẽ nhớ được câu chuyện.

**2. Đặt hạn đóng deal thật tế**

Nếu khách nói "tháng sau em ký" → đặt ngày đóng là tháng sau. Đừng đặt hôm nay rồi kéo dài mãi → KPI bị loạn.

**3. Chuyển khách khi nghỉ phép**

Đi phép dài? Vào **Chuyển giao** → chọn đồng nghiệp nhận giúp → sếp duyệt → khách có người chăm hộ khi bạn vắng.

**4. Dùng filter tìm nhanh**

Trang **Khách hàng**: lọc **Khách mới** / **Khách hiện hữu** để tập trung chăm nhóm cần thiết.

Trang **Doanh thu CBS**: lọc theo tên khách, mã hợp đồng, khoảng giá — nhanh hơn cuộn tìm.

**5. Đừng sợ tạo deal "nhỏ"**

Cứ khách nào có ý định mua là tạo deal. Sau này dù khách không mua, hệ thống vẫn ghi nhận bạn đã "tiếp cận" = KPI tiếp cận +1.

---

## Những thắc mắc hay gặp

### "Em tạo deal rồi mà KPI không tăng?"

- Bấm F5 hoặc vào lại trang **KPI tháng**.
- Chắc chắn deal đã được gán người phụ trách là bạn.
- Nếu vẫn không thấy → báo Admin.

### "Khách em mua rồi mà doanh thu chưa vào?"

- Kiểm tra ở **Doanh thu CBS**. Đơn phải có nhãn **Đã duyệt** (màu xanh).
- Nếu đang **Chờ duyệt** → nhờ sếp duyệt giùm.
- Nếu không thấy đơn đâu → có thể CBS chưa xuất hoá đơn. Hỏi kế toán.

### "Em quên mật khẩu rồi!"

Nhắn Admin công ty. Họ reset trong 5 giây.

### "Sao em không thấy khách của đồng nghiệp?"

Đúng rồi — mặc định bạn chỉ thấy khách mình phụ trách. Muốn thấy hết phải được sếp cấp quyền đặc biệt.

### "Em muốn chuyển khách cho bạn khác thì làm sao?"

Vào khách đó → **Yêu cầu chuyển giao** → chọn người nhận → viết lý do → gửi. Đợi sếp duyệt.

### "Em chốt deal 1 tỷ, sao phải chờ duyệt?"

Deal trên 500 triệu phải qua sếp duyệt để bảo đảm chất lượng dữ liệu. Duyệt xong deal sẽ vào pipeline bình thường.

### "Khách em đã mua bên CBS rồi, giờ chạy deal tiếp có bị đếm 2 lần không?"

Không. Hệ thống đủ thông minh để phát hiện và **chỉ đếm 1 lần** — yên tâm.

### "Em có cần đọc nhiều như tài liệu này mới biết dùng không?"

Không. Thực ra bạn chỉ cần nhớ 3 thao tác:
1. **Tạo khách mới** khi có khách.
2. **Tạo deal + kéo-thả** qua các giai đoạn.
3. **Đánh dấu task hoàn thành** cuối ngày.

Còn lại hệ thống lo hết.

---

## Liên hệ khi cần trợ giúp

| Vấn đề | Hỏi ai |
|---|---|
| Quên mật khẩu / không đăng nhập được | Admin công ty |
| Không thấy khách / deal mà đáng ra phải thấy | Sếp trực tiếp (Leader / Quản lý) |
| Doanh thu CBS không về | Admin công ty |
| Đề xuất tính năng / góp ý | Quản lý hoặc Giám đốc |
| Hệ thống lỗi, báo đỏ lung tung | Admin công ty |

---

## Lời nhắn cuối

TNiCRM được xây để giúp bạn làm việc **nhàn hơn**, không phải để làm bạn bận thêm.

- Nếu thấy thao tác nào lặp đi lặp lại nhiều lần → có thể hệ thống đã có cách tự động. Hãy hỏi sếp.
- Nếu thấy một tính năng nào đó "chỉ giá như có..." → góp ý với Quản lý, có thể bản cập nhật sau sẽ thêm.

Chúc bạn bán hàng thuận lợi và đạt KPI đều đặn mỗi tháng!

---

_Cẩm nang này là bản "thân thiện". Nếu cần tài liệu kỹ thuật chi tiết hơn (API, logic tính toán, quy trình tự động...) → xem file [HUONG_DAN_SU_DUNG.md](./HUONG_DAN_SU_DUNG.md)._
