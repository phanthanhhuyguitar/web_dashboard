# TNEX Partner Admin Dashboard

Du an dashboard React + Vite cho TNEX Partner, kem mot Node server noi bo (`server/*.cjs`, chi phuc vu may dang dev, khong deploy production) de dong bo du lieu user/loan tu API TNEX.

Nguon du lieu mac dinh cua server local la cac file `.txt`/`.json` trong `output/`. SQLite (`output/db/tnex-sync.db`) la **tuy chon**, chi duoc dung khi bat bien `USE_SQLITE_STORE=true` trong `.env.local` - mac dinh tat, khong anh huong luong doc/ghi chinh.

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

4. Kiem tra/cap nhat cac bien trong `.env` - xem day du danh sach va ghi chu tung bien tai `.env.example` (endpoint API TNEX, timeout). Cac bien danh cho server local (`USE_SQLITE_STORE`, `GEMINI_API_KEY`...) nen dat trong `.env.local` (khong commit len git) theo huong dan trong `.env.example`.

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

Lenh build se chay kiem tra encoding truoc, sau do build Vite vao thu muc `dist/`. Production la mot SPA tinh (khong co Node runtime o server production) - `server/*.cjs` chi phuc vu dev local.

## Preview ban build

```bash
npm run preview
```

## Kiem tra chat luong code

```bash
npm run lint          # Kiem tra eslint
npm run lint:fix      # Tu sua loi eslint co the sua duoc
npm run format        # Format code voi prettier
npm run format:check  # Kiem tra format, khong sua
npm run test          # Chay test voi vitest
```

## Cac script hay dung

```bash
npm run dev                 # Chay ung dung local
npm run sync-users-server   # Chay Node sync server rieng
npm run check:encoding      # Kiem tra encoding file source
npm run migrate-to-sqlite   # Migrate du lieu tu file .txt/.json sang SQLite (chi can khi dung USE_SQLITE_STORE)
npm run build               # Build production
npm run preview             # Preview dist sau build
```

## Du lieu output

Nguon du lieu mac dinh cua server local la cac file `.txt`/`.json` trong `output/loans/` va `output/users/` (ghi boi cac job dong bo khi dang nhap/chay sync tren giao dien). Sau khi clone repo moi, thu muc `output/` se rong (chi con `.gitkeep`) - can dang nhap va chay cac chuc nang dong bo tren giao dien (hoac `npm run sync-users-server` de debug rieng) truoc khi xem cac man hinh phu thuoc du lieu. Thu muc nay khong commit len git vi chua du lieu that (SDT, ten, so tien vay...) cua khach hang - chi ton tai o may dang chay sync.

Bien `USE_SQLITE_STORE=true` trong `.env.local` (mac dinh tat, khong bat buoc) chuyen server local sang doc/ghi qua SQLite (`output/db/tnex-sync.db`) thay vi file `.txt`/`.json`. Dung `npm run migrate-to-sqlite` de chuyen du lieu da co sang SQLite khi can.

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

## Scripts tien ich goi API thuc (thu muc `scripts/`)

Ngoai ung dung chinh, thu muc `scripts/` chua cac script Node doc lap (chay bang `node scripts/<ten-script>/run.js`), dung de tra cuu/doi soat/xuat file mot lan ma khong can mo giao dien - vi du `export-reconciliation-file` (xuat file doi soat .xlsx cho 1 CTV), `export-teamlead-reconciliation-file` (xuat file doi soat cho Team Lead gom ca doanh so ca nhan va team), `find-ctv-by-name`, `find-teamlead-both-revenue`, `sale-code-lookup`, `change-result-userids`...

Cac script nay goi thang API TNEX Partner thuc (khong qua server local), nen can:

1. Mo file `run.js` tuong ung, dan Bearer token (lay tu DevTools cua trang partner-admin da dang nhap, F12 -> Network -> copy header `Authorization`, bo chu `Bearer `) vao bien `TOKEN` o dau file.
2. Chinh cac bien cau hinh khac ngay duoi `TOKEN` (ma sale, thang/nam...) theo nhu cau.
3. Chay: `node scripts/<ten-script>/run.js`

**Luu y quan trong:** token dang nhap het han sau vai gio, va **tuyet doi khong commit file `run.js` da dan token thuc len git** - cac script nay chi doc du lieu (khong ghi gi len he thong thuc), nhung token la thong tin dang nhap nhay cam.

tnex xin 1 tuần để 
nhờ anh minh ngòi lại với tnex để xem mipcap đã ok chưa
