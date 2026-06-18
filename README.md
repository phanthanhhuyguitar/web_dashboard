# TNEX Partner Admin Dashboard

ReactJS + Vite dashboard project for TNEX Partner admin tools.

## Run locally

```bash
cd dashboard-tnex-partner
npm install
npm run dev
```

## Environment

Create a `.env` file from `.env.example` and update API values:

```env
VITE_API_BASE_URL=https://api-gw-ds.tnex.com.vn
VITE_LOGIN_ENDPOINT=/digital-sale/api/v1/users/admin-login
```

Login payload gửi lên API:

```json
{
  "phone": "Số điện thoại nhập trên form",
  "password": "Mật khẩu nhập trên form",
  "totp": "Mã OTP/TOTP nhập trên form"
}
```
