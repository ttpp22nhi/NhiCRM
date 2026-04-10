# Triển khai NhiCRM trên aaPanel (Apache)

Hướng dẫn deploy **crm-backend** + **crm-frontend** khi server dùng **[aaPanel](https://www.aapanel.com/)** với **Apache** làm web server (reverse proxy). Tên menu có thể khác một chút theo ngôn ngữ/phiên bản panel (Tiếng Anh / Tiếng Trung).

**Nguyên tắc:** aaPanel đã quản **cổng 80/443** và file VirtualHost. Bạn **không** tạo thêm Nginx song song; **không** chỉnh trùng `Listen 80` ngoài panel. Toàn bộ proxy nằm trong **cấu hình site Apache** do panel tạo (hoặc chỉnh qua **Terminal** đúng file vhost của site đó).

Tham chiếu chung: **`DEPLOYMENT.md`** (mục 5 biến môi trường, mục 6 PM2, mục 7 luồng URL). File mẫu proxy: **`deploy/nhicrm-apache.conf`**.

---

## 1. Chuẩn bị trên aaPanel

1. **Web server:** Trong panel, đảm bảo đang dùng **Apache** (không dùng Nginx cho site này nếu muốn theo tài liệu Apache).  
   *Software / App Store* → cài **Apache** nếu chưa có.

2. **Cài thêm (App Store hoặc tương đương):**
   - **PostgreSQL** — chỉ cần trên **chính server aaPanel** nếu bạn **host DB tại đây**: tạo database + user cho CRM. Nếu DB nằm **máy chủ khác** (managed DB, VPS riêng, v.v.) thì **không** bắt buộc cài PostgreSQL trong panel; chỉ cần trong `crm-backend/.env` trỏ `DB_HOST` / `DB_PORT` / user / password đúng chỗ đó và mở firewall **từ IP server app → cổng PostgreSQL** (thường 5432) phía máy DB.
   - **Node.js** — phiên bản **20.x LTS** (khuyến nghị).
   - **PM2** / **Node project** — nếu panel có tiện ích quản lý process Node, dùng để chạy `server.js` và `npm start` (Next).

3. **Firewall / security:** Mở **80**, **443** (và **22** SSH). **Không** cần mở **3000**, **3001** ra internet — chỉ `127.0.0.1`.

4. **DNS:** Bản ghi **A** của domain CRM trỏ về IP server (ví dụ `crm.example.com`).

---

## 2. Thêm website (domain) trong aaPanel

1. **Website** → **Add site** (Thêm trang) → nhập **domain** (ví dụ `crm.example.com`), chọn **PHP** tùy ý hoặc **Static** nếu có — site chỉ làm “vỏ” để Apache có VirtualHost; thực tế toàn bộ request sẽ **proxy** sang Node.

2. Ghi nhớ **thư mục site** (thường dạng `/www/wwwroot/crm.example.com/`). Code có thể clone **vào đây** hoặc vào thư mục con (vd. `.../nhicrm/`).

3. **SSL:** Trong site vừa tạo → **SSL** → **Let’s Encrypt** → bật HTTPS cho domain (panel tự tạo chứng chỉ và chỉnh VirtualHost **443**).  
   Làm bước này **trước** hoặc **cùng lúc** với bước proxy — để có sẵn khối `<VirtualHost *:443>`.

---

## 3. Đưa mã nguồn lên server

Qua **Terminal** (aaPanel) hoặc SSH:

```bash
cd /www/wwwroot/crm.example.com   # đường dẫn đúng site của bạn
git clone <URL-repo> nhicrm
cd nhicrm/crm-backend && npm ci --omit=dev
cd ../crm-frontend && npm ci --omit=dev
```

Tạo **`crm-backend/.env`** và **`crm-frontend/.env.production`** theo **`DEPLOYMENT.md` §5** — đặc biệt:

- `NEXT_PUBLIC_API_URL=https://crm.example.com` (đúng domain, HTTPS).
- `BASE_URL`, `PUBLIC_API_BASE_URL` cùng URL public đó.

Chạy migration / SQL theo `crm-backend/migrations` và tài liệu DB.

Build và chạy PM2 (đường dẫn tuyệt đối tới thư mục clone):

```bash
cd /www/wwwroot/crm.example.com/nhicrm/crm-frontend
npm run build

cd ../crm-backend
pm2 start server.js --name nhicrm-api

cd ../crm-frontend
pm2 start npm --name nhicrm-web -- start

pm2 save
pm2 startup
```

Kiểm tra nội bộ (trên server):

```bash
curl -sS http://127.0.0.1:3000/api-docs | head
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
```

---

## 4. Bật module proxy cho Apache (bắt buộc)

Apache cần **`mod_proxy`**, **`mod_proxy_http`**, **`mod_ssl`**, **`mod_headers`**.

Trên **Terminal** (Ubuntu/Debian):

```bash
sudo a2enmod proxy proxy_http ssl headers
sudo systemctl restart apache2
```

*(Trên một số bản aaPanel cài Apache kiểu **httpd** (RHEL), dùng `httpd` thay `apache2`; module thường đã bật — nếu proxy lỗi 500, kiểm tra `apachectl -M | grep proxy`.)*

---

## 5. Gắn reverse proxy vào site (Apache)

Bạn cần chèn các chỉ thị **`ProxyPass` / `ProxyPassReverse`** vào **VirtualHost *:443** của **đúng domain** CRM (file cấu hình site do aaPanel sinh ra).

1. Vào **Website** → chọn domain → **Conf** / **Cấu hình** / **Apache config** (tên tùy giao diện) → mở file hoặc khung sửa **Apache**.

2. Tìm khối `<VirtualHost *:443>` có **`ServerName`** trùng domain CRM.

3. **Bên trong** khối đó (sau các dòng SSL do panel tạo), thêm — **giữ đúng thứ tự:** `/api/` **trước**, `/` **sau**:

```apache
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"

    LimitRequestBody 26214400

    ProxyPass        /api/ http://127.0.0.1:3000/api/
    ProxyPassReverse /api/ http://127.0.0.1:3000/api/

    ProxyPass        / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/
```

4. Nếu panel đã có **`DocumentRoot`** / **`Directory`** cho site, proxy thường **ưu tiên** đối với request khớp `ProxyPass` — nếu vẫn ra trang tĩnh PHP, kiểm tra xem có rule **RewriteRule** nào bắt trước proxy không; có thể cần tắt rewrite mặc định hoặc đặt các dòng `ProxyPass` ở vị trí panel khuyến nghị (một số bản có mục **Reverse proxy** riêng — điền URL upstream tương ứng: API base `http://127.0.0.1:3000`, web `http://127.0.0.1:3001`, path `/api` và `/`).

5. **Lưu** cấu hình → **Reload** Apache trong panel hoặc:

```bash
sudo apachectl configtest && sudo systemctl reload apache2
```

6. Khối **HTTP (port 80):** Nếu panel đã **redirect HTTP → HTTPS**, không cần thêm `ProxyPass` trên 80. Nếu chưa redirect, nên bật **Force HTTPS** trong mục SSL của site.

---

## 6. Không dùng certbot tay trùng với panel

Nếu SSL đã cấp bằng **Let’s Encrypt trong aaPanel**, **không** chạy thêm `certbot` dòng lệnh trùng domain (dễ trùng / lỗi renew). Gia hạn chứng chỉ qua **SSL** của site trên panel.

---

## 7. Kiểm tra

1. Trình duyệt: `https://crm.example.com` — load trang login.
2. **F12 → Network:** request API phải là `https://crm.example.com/api/...` (không có `:3000`).
3. Import file lớn: nếu **413** — tăng **`LimitRequestBody`** (ví dụ `52428800` cho ~50 MB).

---

## 8. Lỗi thường gặp

| Hiện tượng | Hướng xử lý |
|------------|-------------|
| 502 Bad Gateway | PM2 không chạy; sai port 3000/3001; `pm2 logs`. |
| 404 trên API | `ProxyPass /api/` chưa đứng trước `ProxyPass /`; hoặc chèn nhầm VirtualHost khác. |
| Vẫn ra trang PHP / index.html mặc định | Proxy chưa áp vào đúng site; hoặc rewrite của panel ghi đè — xem lại file conf site. |
| bind :80 (98) | Hai dịch vụ tranh 80 — chỉ dùng **một** stack (aaPanel Apache); tắt Nginx/thủ công trùng cổng. |

---

## English summary

Use **aaPanel** with **Apache** only: add a **site**, enable **Let’s Encrypt SSL** in the panel, install **Node 20 + PM2 + PostgreSQL**, clone the repo, set **`.env` / `.env.production`**, **`npm run build`**, run **backend on 3000** and **Next on 3001** via **PM2**, then add **`ProxyPass /api/`** then **`ProxyPass /`** inside the site’s **`<VirtualHost *:443>`** (see **`deploy/nhicrm-apache.conf`**). Enable **`mod_proxy`** / **`mod_proxy_http`**. Do not run a second web stack on port 80 or duplicate **certbot** if the panel already manages TLS.
