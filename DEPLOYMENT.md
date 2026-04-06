# Hướng dẫn triển khai NhiCRM lên server và gắn domain

Tài liệu mô tả cách deploy **crm-frontend** (Next.js) và **crm-backend** (Node/Express) cùng **PostgreSQL** (và tùy chọn **Redis**) lên Linux, gắn **domain + HTTPS**, và cấu hình biến môi trường phù hợp production.

---

## 1. Kiến trúc triển khai

| Thành phần | Công nghệ | Port nội bộ (mặc định) |
|------------|-----------|-------------------------|
| Frontend | Next.js 14 | `3001` |
| Backend API | Express 5 | `3000` |
| Database | PostgreSQL | `5432` |
| Cache (tùy chọn) | Redis | `6379` |

Trình duyệt chỉ nên truy cập **HTTPS qua domain**; Nginx (hoặc Caddy) làm **reverse proxy** tới hai process Node chạy nội bộ (`127.0.0.1`).

Hai hướng phổ biến:

- **Mô hình A — Một domain, cùng host:**  
  `https://crm.congty.com` → Next.js; `https://crm.congty.com/api/...` → Express.  
  Cần đặt `NEXT_PUBLIC_API_URL=https://crm.congty.com` (không thêm `:3000`).

- **Mô hình B — Hai subdomain:**  
  `https://crm.congty.com` → Next.js; `https://api.crm.congty.com` → Express.  
  Đặt `NEXT_PUBLIC_API_URL=https://api.crm.congty.com`.

> **Lưu ý:** Trong mã `crm-frontend/lib/api.ts`, nếu **không** có `NEXT_PUBLIC_API_URL`, trình duyệt sẽ gọi API tại `cùng hostname + cổng 3000`. Trên production đằng sau Nginx (thường chỉ mở 443), cách đó **không đúng**. Luôn set `NEXT_PUBLIC_API_URL` khi build/deploy production.

---

## 2. Yêu cầu server

- **OS:** Ubuntu 22.04 LTS (hoặc tương đương).
- **RAM:** tối thiểu ~2 GB (khuyến nghị 4 GB+ nếu nhiều user).
- **Node.js:** **20.x LTS** (khuyến nghị dùng [nvm](https://github.com/nvm-sh/nvm)).
- **PostgreSQL:** 14+.
- **Redis:** tùy chọn (bật/tắt bằng `REDIS_URL` ở backend).
- **Process manager:** PM2 (hoặc systemd).
- **Reverse proxy + TLS:** Nginx + Let’s Encrypt (certbot).

Mở firewall: **22** (SSH), **80** (HTTP challenge / redirect), **443** (HTTPS). **Không** cần mở 3000/3001 ra internet nếu chỉ proxy nội bộ.

---

## 3. Chuẩn bị máy chủ

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Node 20 (ví dụ qua NodeSource — hoặc dùng nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL, Nginx, Certbot
sudo apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx

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

### 5.1. Backend — `crm-backend/.env`

Sao chép từ `crm-backend/env_example.txt` và chỉnh production:

| Biến | Mô tả |
|------|--------|
| `DB_*` | Kết nối PostgreSQL |
| `JWT_SECRET` | Chuỗi bí mật dài, ngẫu nhiên |
| `PORT` | Mặc định `3000` (chỉ listen localhost) |
| `REDIS_URL` | Ví dụ `redis://127.0.0.1:6379` hoặc để trống |
| `FRONTEND_URL` | URL gốc frontend (HTTPS), ví dụ `https://crm.congty.com` — dùng cho CORS/log nếu code tham chiếu |
| `PUBLIC_API_BASE_URL` | URL public API (HTTPS) cho Swagger nếu cần |

Ví dụ:

```env
PORT=3000
DB_USER=crm_user
DB_HOST=127.0.0.1
DB_NAME=crm_core_system
DB_PASSWORD=your_strong_password
DB_PORT=5432
DB_SCHEMA=public
JWT_SECRET=thay_bang_chuoi_dai_ngau_nhien
REDIS_URL=
FRONTEND_URL=https://crm.congty.com
PUBLIC_API_BASE_URL=https://crm.congty.com
```

### 5.2. Frontend — build-time — `crm-frontend/.env.production`

Next.js nhúng `NEXT_PUBLIC_*` lúc **build**. Tạo file `.env.production` trước khi `npm run build`:

**Mô hình A (cùng domain, API dưới `/api`):**

```env
NEXT_PUBLIC_API_URL=https://crm.congty.com
```

**Mô hình B (subdomain API):**

```env
NEXT_PUBLIC_API_URL=https://api.crm.congty.com
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

## 7. Nginx + domain + HTTPS

Giả sử domain **crm.congty.com** trỏ **A record** về IP server.

### 7.1. Mô hình A — Một domain

- Trình duyệt: `https://crm.congty.com` → `http://127.0.0.1:3001`
- API: `https://crm.congty.com/api/` → `http://127.0.0.1:3000/api/`

`/etc/nginx/sites-available/nhicrm.conf` (rút gọn):

```nginx
server {
    listen 80;
    server_name crm.congty.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name crm.congty.com;

    ssl_certificate     /etc/letsencrypt/live/crm.congty.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.congty.com/privkey.pem;

    # Giới hạn upload (import Excel, file deal…)
    client_max_body_size 25M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Kích hoạt site và kiểm tra cấu hình:

```bash
sudo ln -s /etc/nginx/sites-available/nhicrm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Cấp chứng chỉ (lần đầu có thể dùng webroot hoặc nginx plugin):

```bash
sudo certbot --nginx -d crm.congty.com
```

### 7.2. Mô hình B — Subdomain API

- `crm.congty.com` → Next `3001`
- `api.crm.congty.com` → Express `3000` (toàn bộ host proxy vào 3000, backend vẫn phục vụ `/api/...`)

Ví dụ server block thứ hai chỉ `proxy_pass http://127.0.0.1:3000;`.  
Frontend `.env.production`: `NEXT_PUBLIC_API_URL=https://api.crm.congty.com`.

---

## 8. Multi-tenant và subdomain đăng nhập (nếu dùng)

Backend có logic **domain tenant** (subdomain) khi đăng nhập. Đảm bảo:

- DNS: wildcard hoặc từng subdomain tenant trỏ về cùng IP (ví dụ `tenant1.crm.congty.com`).
- Nginx: `server_name` có thể dùng `*.crm.congty.com` hoặc danh sách cụ thể, cùng `proxy_pass` như trên.

---

## 9. Kiểm tra sau deploy

1. Mở `https://crm.congty.com` — trang login/load OK.
2. Đăng nhập; tab Network: request API phải tới đúng **HTTPS** và **không** lỗi CORS/mixed content.
3. `https://crm.congty.com/api-docs` (nếu muốn mở Swagger trên production — có thể hạn chế IP hoặc tắt).
4. Import Excel / upload file: nếu lỗi 413 — tăng `client_max_body_size` trong Nginx.

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
| 413 Request Entity Too Large | Tăng `client_max_body_size` trong Nginx. |
| WebSocket / HMR | Production dùng `next start`; không cần HMR. |

---

## 12. English summary

1. Run **PostgreSQL** (and optional **Redis**); apply SQL migrations.
2. Configure **`crm-backend/.env`** (`PORT=3000`, DB, `JWT_SECRET`, etc.).
3. Create **`crm-frontend/.env.production`** with **`NEXT_PUBLIC_API_URL`** set to your public API URL (same host as the app for path `/api`, or `https://api.yourdomain.com` for a separate API subdomain). **Rebuild** the frontend after any change to `NEXT_PUBLIC_*`.
4. **`npm run build`** in `crm-frontend`; run **`node server.js`** (backend) and **`npm start`** (frontend) behind **Nginx** on **443** with **Let’s Encrypt**.
5. Point your **DNS A/AAAA** records to the server; use one domain with `/api` routed to the backend, or two subdomains for web and API.

---

*Tài liệu tham khảo kỹ thuật: `crm-backend/env_example.txt`, `crm-frontend/lib/api.ts`, `crm-backend/server.js` (PORT). Cập nhật khi cấu trúc repo thay đổi.*
