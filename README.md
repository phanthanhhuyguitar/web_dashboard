# TNEX Partner Admin Dashboard

Du an dashboard React + Vite, kem Node server noi bo de dong bo du lieu user, loan tu API TNEX va luu vao SQLite (`output/db/tnex-sync.db`). Toan bo man hinh (dashboard, segment, data quality, tro ly AI...) doc du lieu tu SQLite - khong con doc truc tiep tu file `.txt`/`.json` trong `output/`.

## Yeu cau moi truong

- Node.js 18 tro len
- npm 9 tro len
- Git
- Tai khoan/API token hop le de dang nhap va dong bo du lieu TNEX Partner

## Cach chay sau khi clone code

1. Clone repository va di vao thu muc project:

```bash
git clone <repository-url>
cd dashboard-tnex-partner
```

2. Cai dependencies:

```bash
npm ci
```

Neu khong co `package-lock.json` hoac can cai lai linh hoat, dung:

```bash
npm install
```

3. Tao file cau hinh moi truong:

```bash
cp .env.example .env
```

Tren Windows PowerShell co the dung:

```powershell
Copy-Item .env.example .env
```

4. Kiem tra/cap nhat cac bien trong `.env` - xem day du danh sach va ghi chu tung bien tai `.env.example` (endpoint API TNEX, timeout, va cac bien tuy chon cho server local nhu `USE_SQLITE_STORE`, `GEMINI_API_KEY`).

5. Chay dev server:

```bash
npm run dev
```

Mac dinh Vite se mo tai:

```txt
http://localhost:5173
```

Khi chay `npm run dev`, Vite config se tu dong start sync users server tai `http://localhost:4174` neu port nay chua co service nao dang chay.

## Chay sync users server rieng

Thong thuong khong can chay lenh nay vi `npm run dev` da tu start. Neu can debug rieng Node server:

```bash
npm run sync-users-server
```

Server mac dinh chay tai:

```txt
http://localhost:4174
```

Co the doi target/port bang bien moi truong:

```env
SYNC_USERS_API_TARGET=http://localhost:4174
SYNC_USERS_PORT=4174
```

## Build production

```bash
npm run build
```

Lenh build se chay kiem tra encoding truoc, sau do build Vite vao thu muc `dist/`.

## Preview ban build

```bash
npm run preview
```

## Cac script hay dung

```bash
npm run dev                 # Chay ung dung local
npm run sync-users-server   # Chay Node sync server rieng
npm run check:encoding      # Kiem tra encoding file source
npm run build               # Build production
npm run preview             # Preview dist sau build
```

## Du lieu output

Nguon du lieu chinh cua toan bo ung dung la SQLite tai `output/db/tnex-sync.db` - tu tao khi chay dong bo lan dau, khong commit len git (xem `.gitignore`).

Thu muc `output/loans/` va `output/users/` van duoc cac job dong bo ghi kem file `.txt` (log, snapshot, danh sach loi...) de phuc vu debug/audit, nhung **ung dung khong doc lai cac file nay** - moi man hinh deu lay du lieu qua SQLite. Cac file nay cung khong commit len git vi chua du lieu that (SDT, ten, so tien vay...) cua khach hang - chi ton tai o may dang chay sync.

Sau khi clone repo moi, thu muc `output/` se rong (chi con `.gitkeep`) - can dang nhap va chay cac chuc nang dong bo tren giao dien (hoac `npm run sync-users-server` de debug rieng) truoc khi xem cac man hinh phu thuoc du lieu.

Bien `USE_SQLITE_STORE` trong `.env.local` (mac dinh tat, khong bat buoc) chi dieu khien viec co ghi kem vao 2 bang SQLite cu (`users`, `loans` - giu de rollback) hay khong; khong anh huong den luong doc du lieu chinh cua ung dung.

## Ghi chu dang nhap

Form dang nhap goi API login voi payload gom:

```json
{
  "phone": "so dien thoai",
  "password": "mat khau",
  "totp": "ma OTP/TOTP"
}
```

Token dang nhap duoc luu trong browser storage de cac request tiep theo goi API TNEX Partner.
