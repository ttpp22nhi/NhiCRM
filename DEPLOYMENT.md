# Hướng dẫn triển khai NhiCRM lên server và gắn domain

Tài liệu mô tả cách deploy **crm-frontend** (Next.js) và **crm-backend** (Node/Express) cùng **PostgreSQL** (và tùy chọn **Redis**) lên Linux, gắn **một domain + HTTPS** theo kiểu **cùng host**: trang web và API (`/api/...`) đi chung hostname; **Nginx** hoặc **Apache** làm reverse proxy tới hai process nội bộ (`127.0.0.1`). File mẫu: `deploy/nhicrm.conf` (Nginx), `deploy/nhicrm-apache.conf` (Apache 2.4). **aaPanel + Apache:** xem **`deploy/AAPANEL-APACHE.md`**.

---

## 1. Kiến trúc triển khai

| Thành phần | Công nghệ | Port nội bộ (mặc định) |
|------------|-----------|-------------------------|
| Frontend | Next.js 14 | `3001` |
| Backend API | Express 5 | `3000` |
| Database | PostgreSQL | `5432` |
| Cache (tùy chọn) | Redis | `6379` |

Trình duyệt chỉ nên truy cập **HTTPS qua một domain**; **Nginx hoặc Apache** làm **reverse proxy** tới hai process Node trên `127.0.0.1`:

- **Giao diện:** `https://crm.congty.com` → Next.js (cổng nội bộ `3001`).
- **API:** `https://crm.congty.com/api/...` → Express (cổng nội bộ `3000`).

Production **bắt buộc** set `NEXT_PUBLIC_API_URL=https://crm.congty.com` (đúng domain thật, **không** `:3000`, **không** thêm `/api` vào cuối biến — giải thích ở mục **5** và **7**). Trong `crm-frontend/lib/api.ts`, nếu **không** có biến này, trình duyệt sẽ gọi `cùng hostname:3000`; sau reverse proxy (chỉ mở 443) cách đó **sai**.

---

## 2. Yêu cầu server

- **OS:** Ubuntu 22.04 LTS (hoặc tương đương).
- **RAM:** tối thiểu ~2 GB (khuyến nghị 4 GB+ nếu nhiều user).
- **Node.js:** **20.x LTS** (khuyến nghị dùng [nvm](https://github.com/nvm-sh/nvm)).
- **PostgreSQL:** 14+.
- **Redis:** tùy chọn (bật/tắt bằng `REDIS_URL` ở backend).
- **Process manager:** PM2 (hoặc systemd).
- **Reverse proxy + TLS:** **Nginx** hoặc **Apache 2.4** + Let’s Encrypt (certbot plugin tương ứng). Chỉ cần **một** web server làm listener cổng 80/443.

Mở firewall: **22** (SSH), **80** (HTTP challenge / redirect), **443** (HTTPS). **Không** cần mở 3000/3001 ra internet nếu chỉ proxy nội bộ.

---

## 3. Chuẩn bị máy chủ

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Node 20 (ví dụ qua NodeSource — hoặc dùng nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Reverse proxy — chọn MỘT trong hai (không cài song song Nginx + Apache cùng chiếm 80):
# sudo apt install -y nginx certbot python3-certbot-nginx
# sudo apt install -y apache2 certbot python3-certbot-apache

node -v   # v20.x
npm -v
sudo npm i -g pm2
```

Tạo database và user PostgreSQL (ví dụ):

```bash
sudo -u postgres psql -c "CREATE USER crm_user WITH PASSWORD 'your_strong_password';"
sudo -u postgres psql -c "CREATE DATABASE crm_core_system OWNER crm_user;"
```

Áp dụng migration / schema theo thư mục `crm-backend/migrations` và `crm-backend/database` (chạy lần lượt file SQL phù hợp môi trường — tham khảo tài liệu nội bộ hoặc script migrate nếu có).

---

## 4. Clone và cài dependencies

```bash
# Ví dụ clone vào /var/www/nhicrm
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone <URL-repo> nhicrm
cd nhicrm

# Backend
cd crm-backend
npm ci --omit=dev   # hoặc npm install

# Frontend
cd ../crm-frontend
npm ci --omit=dev
```

---

## 5. Biến môi trường

Mẫu đầy đủ: `crm-backend/env_example.txt`. **Quan trọng:** `NEXT_PUBLIC_*` chỉ có hiệu lực khi khai báo trong **`crm-frontend`** (Next.js đọc khi dev/build), **không** thay được bằng việc chỉ thêm vào `crm-backend/.env`.

### 5.1. Backend — `crm-backend/.env`

Các biến **backend thực sự đọc** trong code hiện tại:

| Biến | Bắt buộc | Mô tả |
|------|-----------|--------|
| `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD` | Có | Kết nối PostgreSQL (`database.js`) |
| `DB_PORT` | Không (mặc định `5432`) | Cổng PostgreSQL |
| `DB_SCHEMA` | Không (mặc định `public`) | `search_path` — xem `config/schema.js`, migration |
| `JWT_SECRET` | Rất nên | Ký / xác minh JWT (`auth`, deal preview token) |
| `PORT` | Không (mặc định `3000`) | Cổng Express nội bộ |
| `NODE_ENV` | Không | Đặt `production` trên server: bật SSL client DB (mảng `rejectUnauthorized` trong `database.js`), ẩn chi tiết lỗi một số API |
| `REDIS_URL` | Không | Ví dụ `redis://127.0.0.1:6379`; để trống thì không dùng cache Redis |
| `PUBLIC_API_BASE_URL` | Không | Thêm mục **IP / Domain** trong Swagger (`swagger.js`). Dùng URL mà người dùng **thực sự** gọi API (HTTPS domain, hoặc `http://IP:3000` nếu chưa có reverse proxy) |
| `SWAGGER_SERVER_URL` | Không | Cùng mục đích với `PUBLIC_API_BASE_URL`; nếu cả hai đều có, code dùng `PUBLIC_API_BASE_URL` trước |
| `BASE_URL` | Không | Một số link (vd. xem nhanh file deal) dùng URL nền; nếu để trống sẽ lấy từ request (`dealActivitiesController`). **Nên** set `https://crm.congty.com` k/production sau reverse proxy để link luôn đúng HTTPS |

CORS trong `server.js` đang dùng `origin: true`; **`FRONTEND_URL` hiện không được backend import** — có thể ghi trong `.env` để thống nhất tài liệu / dùng sau, nhưng **không** thay cấu hình CORS.

Ví dụ production (một domain, cùng host):

```env
NODE_ENV=production
PORT=3000
DB_USER=crm_user
DB_HOST=127.0.0.1
DB_NAME=crm_core_system
DB_PASSWORD=your_strong_password
DB_PORT=5432
DB_SCHEMA=public
JWT_SECRET=thay_bang_chuoi_dai_ngau_nhien
REDIS_URL=
BASE_URL=https://crm.congty.com
PUBLIC_API_BASE_URL=https://crm.congty.com
FRONTEND_URL=https://crm.congty.com
```

### 5.2. Frontend — `crm-frontend/.env.production` (và `.env.local` khi dev)

Next.js nhúng `NEXT_PUBLIC_*` lúc **build** (production) hoặc khi chạy dev. **Không** đặt các biến này trong `crm-backend/.env` nếu mục tiêu là chạy giao diện.

| Biến | Mô tả |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `baseURL` của `axios` trong `crm-frontend/lib/api.ts`. Production: `https://crm.congty.com` (**không** `:3000`, **không** thêm `/api` — mọi path trong code đã là `/api/...`). Nếu **không** set, trên trình duyệt app sẽ gọi `cùng hostname:3000` → sau proxy (chỉ 443) sẽ **sai**. |

Tạo/sửa **trước** `npm run build` trên server:

```env
NEXT_PUBLIC_API_URL=https://crm.congty.com
```

Không commit file chứa secret thật; chỉ dùng trên server hoặc CI.

---

## 6. Build frontend và chạy bằng PM2

```bash
cd /var/www/nhicrm/crm-frontend
npm run build
```

Chạy backend (đảm bảo đã có `.env`):

```bash
cd /var/www/nhicrm/crm-backend
pm2 start server.js --name nhicrm-api
```

Chạy frontend Next:

```bash
cd /var/www/nhicrm/crm-frontend
pm2 start npm --name nhicrm-web -- start
# (script "start" = next start -p 3001)
```

Lưu process khi reboot:

```bash
pm2 save
pm2 startup
```

Kiểm tra:

```bash
curl -sS http://127.0.0.1:3000/api-docs | head
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
```

---

## 7. Reverse proxy + domain + HTTPS (một domain, cùng host)

Giả sử domain **crm.congty.com** trỏ **A record** về IP server. Giao diện và API dùng **cùng hostname**; chỉ khác đường dẫn: mọi URL bắt đầu bằng `/api/` do reverse proxy chuyển sang backend.

### Luồng truy cập (Nginx hoặc Apache giống nhau về mặt URL)

| Người dùng mở | Proxy chuyển tới | Ghi chú |
|---------------|------------------|---------|
| `https://crm.congty.com/...` (trang, asset Next) | `http://127.0.0.1:3001` | Frontend PM2 (`next start`) |
| `https://crm.congty.com/api/...` | `http://127.0.0.1:3000/api/...` | Backend Express (`PORT=3000`) |

Trình duyệt **không** gọi trực tiếp 3000/3001 ra internet; chỉ **một** web server (Nginx **hoặc** Apache) lắng nghe 80/443.

### Khớp biến môi trường (giống cho cả Nginx và Apache)

- **Frontend** (`crm-frontend/.env.production`): `NEXT_PUBLIC_API_URL=https://crm.congty.com` (mục **5.2**).
- **Backend** (`crm-backend/.env`): `PUBLIC_API_BASE_URL` và (khuyến nghị) `BASE_URL` = `https://crm.congty.com`; `NODE_ENV=production` khi deploy thật.
- `FRONTEND_URL` tùy chọn (xem **5.1**).

### 7.1. Nginx

- File mẫu trong repo: **`deploy/nhicrm.conf`**. Trên server (Ubuntu/Debian): copy nội dung đã chỉnh vào **`/etc/nginx/sites-available/nhicrm.conf`**, symlink `sites-enabled`, **`sudo nginx -t && sudo systemctl reload nginx`**.
- SSL: **`sudo certbot --nginx -d crm.congty.com`** (hoặc chỉ khối `listen 80` trước khi có cert — xem comment đầu file mẫu).
- **aaPanel / đã có Nginx quản lý 80:** không tạo thêm listener trùng — thêm `location /api/` và `location /` trong **site** do panel quản, hoặc dùng UI reverse proxy.

### 7.2. Apache 2.4

- Bật module: **`sudo a2enmod proxy proxy_http ssl headers`**, **`sudo systemctl restart apache2`** (tên dịch vụ có thể là `httpd` trên RHEL/CentOS).
- File mẫu trong repo: **`deploy/nhicrm-apache.conf`**. Trên server: copy vào **`/etc/apache2/sites-available/nhicrm.conf`**, **`sudo a2ensite nhicrm.conf`**, **`sudo apachectl configtest && sudo systemctl reload apache2`**. (RHEL: thường đặt file trong `/etc/httpd/conf.d/`.)
- **Thứ tự bắt buộc:** khai báo **`ProxyPass /api/`** trước **`ProxyPass /`** (Apache áp rule theo thứ tự).
- SSL: **`sudo certbot --apache -d crm.congty.com`** hoặc SSL trong panel (aaPanel, v.v.).
- Upload body: **`LimitRequestBody`** trong file mẫu (tương đương `client_max_body_size` của Nginx).
- **Đã dùng Apache (httpd) cho port 80:** không cài thêm Nginx cùng cổng — chỉnh VirtualHost / site hiện có theo mẫu.
- **aaPanel + Apache (từng bước trong panel):** **`deploy/AAPANEL-APACHE.md`**.

### Lỗi thường gặp (proxy)

- **Trình duyệt gọi `https://...:3000`** — Thiếu/sai `NEXT_PUBLIC_API_URL`; **build lại** frontend.
- **404 / HTML trang chủ khi gọi API** — Nginx: sai `location` / `proxy_pass`. Apache: thiếu `ProxyPass /api/` trước `/` hoặc sai URL đích.
- **502** — PM2 không chạy hoặc sai port so với cấu hình proxy.
- **bind :80 (98)** — Hai dịch vụ cùng chiếm 80 (vd. Nginx + Apache); chỉ giữ **một** reverse proxy hoặc gỡ site trùng.

---

## 8. Multi-tenant và subdomain tenant (nếu dùng)

Backend có logic **domain tenant** (subdomain) khi đăng nhập. Đây **không** phải tách API sang host khác: vẫn một site + `/api/` như mục **7**, chỉ bổ sung hostname cho từng tenant.

- **DNS:** wildcard hoặc từng subdomain tenant trỏ về cùng IP (ví dụ `tenant1.crm.congty.com`).
- **Reverse proxy:** Nginx `server_name` hoặc Apache `ServerName` / `ServerAlias` có thể dùng `*.crm.congty.com` hoặc danh sách cụ thể, **cùng** quy tắc proxy `/api/` và `/` như mẫu `deploy/nhicrm.conf` / `deploy/nhicrm-apache.conf`.

---

## 9. Kiểm tra sau deploy

1. Mở `https://crm.congty.com` — trang login/load OK.
2. Đăng nhập; tab Network: request API phải tới đúng **HTTPS** và **không** lỗi CORS/mixed content.
3. `https://crm.congty.com/api-docs` (nếu muốn mở Swagger trên production — có thể hạn chế IP hoặc tắt).
4. Import Excel / upload file: nếu lỗi 413 — tăng `client_max_body_size` (Nginx) hoặc `LimitRequestBody` (Apache).

---

## 10. Sao lưu và cập nhật

- **Backup:** định kỳ `pg_dump` database + backup file upload (nếu lưu trên disk).
- **Cập nhật code:**
  ```bash
  cd /var/www/nhicrm && git pull
  cd crm-backend && npm ci --omit=dev && pm2 restart nhicrm-api
  cd ../crm-frontend && npm ci --omit=dev && npm run build && pm2 restart nhicrm-web
  ```

---

## 11. Troubleshooting

| Hiện tượng | Hướng xử lý |
|------------|-------------|
| Frontend gọi `hostname:3000` | Thiếu `NEXT_PUBLIC_API_URL` — build lại frontend sau khi thêm `.env.production`. |
| 502 Bad Gateway | PM2 không chạy hoặc sai port; xem `pm2 logs`. |
| CORS | Backend đang `origin: true`; kiểm tra URL API và cookie/HTTPS. |
| 413 Request Entity Too Large | Tăng `client_max_body_size` (Nginx) hoặc `LimitRequestBody` (Apache). |
| WebSocket / HMR | Production dùng `next start`; không cần HMR. |
| Certbot / reload web server: `bind() to 0.0.0.0:80 failed (98)` | Cổng **80** bị chiếm (**EADDRINUSE**): hai web server cùng bật, hoặc Docker/ứng dụng khác. `sudo ss -tlnp` hoặc `sudo lsof -i :80` → tắt dịch vụ thừa; chỉ **một** listener 80 cho HTTPS/HTTP. Certbot: `certbot --nginx` hoặc `certbot --apache` tùy stack đang dùng. |

**Chi tiết lỗi 98 (port 80 busy):** Certbot cần reload web server; nếu 80 đã bị giữ hoặc hai cấu hình trùng `listen`/`VirtualHost`, restart sẽ fail. Xác định process trên `:80` trước; với **aaPanel** thường dùng SSL trong panel thay vì certbot tay trùng cấu hình.

---

## 12. English summary

1. Run **PostgreSQL** (and optional **Redis**); apply SQL migrations.
2. Configure **`crm-backend/.env`** (DB, `JWT_SECRET`, `NODE_ENV=production`, `BASE_URL` / `PUBLIC_API_BASE_URL` as your public HTTPS URL; see **§5**).
3. Create **`crm-frontend/.env.production`** with **`NEXT_PUBLIC_API_URL=https://your-domain.com`** (same host as the web app; API paths are `/api/...`). **Rebuild** the frontend after any change to `NEXT_PUBLIC_*`.
4. **`npm run build`** in `crm-frontend`; run backend and **`npm start`** (frontend) via PM2; put **Nginx or Apache** on **80/443** with **Let’s Encrypt** (see **`deploy/nhicrm.conf`** or **`deploy/nhicrm-apache.conf`**), proxy `/` → Next and `/api/` → Express.
5. Point **DNS** to the server; only **80/443** need to be public for HTTPS traffic (app ports stay on localhost).

---

*Tài liệu tham khảo kỹ thuật: `crm-backend/env_example.txt`, `crm-frontend/lib/api.ts`, `crm-backend/database.js`, `crm-backend/swagger.js`, `crm-backend/server.js`, `deploy/nhicrm.conf`, `deploy/nhicrm-apache.conf`, `deploy/AAPANEL-APACHE.md`.*
