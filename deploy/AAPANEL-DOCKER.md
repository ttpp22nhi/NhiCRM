# Triển khai NhiCRM bằng Docker trên aaPanel (Apache)

Hướng dẫn này dành cho server dùng **aaPanel + Apache** (port 80/443 do panel quản) và chạy app trong Docker containers.

Mục tiêu:
- `nhicrm-backend` chạy nội bộ cổng `3000`
- `nhicrm-frontend` chạy nội bộ cổng `3001`
- Apache site của aaPanel reverse proxy:
  - `/api/` -> `http://127.0.0.1:3000/api/`
  - `/` -> `http://127.0.0.1:3001/`

---

## 1) Chuẩn bị

1. aaPanel đã có **Apache** và domain site (SSL bật trong panel).
2. Cài Docker + Compose plugin trên server:

```bash
docker -v
docker compose version
```

3. Clone project:

```bash
cd /www/wwwroot/crm.congty.vn
git clone <URL-repo> NhiCRM
cd /www/wwwroot/crm.congty.vn/NhiCRM
```

---

## 2) Tạo file env cho Docker

```bash
cp deploy/docker.aapanel.env.example deploy/docker.aapanel.env
```

Sửa `deploy/docker.aapanel.env` theo môi trường thật:
- `NEXT_PUBLIC_API_URL=https://<domain-thật>`
- DB params (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, ...)
- `JWT_SECRET`
- `BASE_URL`, `PUBLIC_API_BASE_URL` dùng HTTPS domain

Luu y:
- Neu DB nam may khac: dat `DB_HOST` = IP/hostname DB do.
- Neu muon dung PostgreSQL container local, xem buoc 4 (profile `with-db`).

---

## 3) Build + run containers

Tu thu muc project (`.../NhiCRM`):

```bash
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env up -d --build
```

Kiem tra:

```bash
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env ps
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env logs -f backend
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env logs -f frontend
```

---

## 4) Tuy chon: chay PostgreSQL container local

Neu khong dung DB ben ngoai:

1. Dat trong `deploy/docker.aapanel.env`:
   - `DB_HOST=postgres`
   - `DB_PORT=5432`
2. Chay compose voi profile:

```bash
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env --profile with-db up -d --build
```

Du lieu DB duoc luu trong volume `nhicrm_postgres_data`.

---

## 5) Cấu hình Apache trong aaPanel

Trong site Apache (domain CRM), chèn proxy rules theo `deploy/nhicrm-apache.conf`:

```apache
ProxyPass        /api/ http://127.0.0.1:3000/api/
ProxyPassReverse /api/ http://127.0.0.1:3000/api/

ProxyPass        / http://127.0.0.1:3001/
ProxyPassReverse / http://127.0.0.1:3001/
```

Quan trọng:
- `ProxyPass /api/` phải đứng **trước** `ProxyPass /`
- Khong mo cong 3000/3001 ra Internet (chi localhost)

---

## 6) Cập nhật phiên bản mới

```bash
cd /www/wwwroot/crm.congty.vn/NhiCRM
git pull
docker compose -f deploy/docker-compose.aapanel.yml --env-file deploy/docker.aapanel.env up -d --build
```

---

## 7) Lỗi thường gặp

- Frontend goi `:3000`: sai/thiếu `NEXT_PUBLIC_API_URL`, can build lai frontend image.
- 502 tu Apache: container backend/frontend chua running hoac port map sai.
- 404 API: thu tu `ProxyPass` sai (`/` dang dung truoc `/api/`).
- DB connect fail: sai `DB_HOST`/firewall khi dung DB ben ngoai.

