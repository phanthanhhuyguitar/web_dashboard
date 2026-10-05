# Inactive users theo số điện thoại

Script gọi thẳng API admin thật của TNEX (`PUT /digital-sale-admin/api/v1/admin/user/active`) để vô hiệu hóa (`isActive: false`) hàng loạt tài khoản theo số điện thoại. Không qua dashboard, không qua SQLite đồng bộ.

## Các bước chạy

1. Đăng nhập `partner-admin.tnex.com.vn` với tài khoản admin, mở DevTools > tab Network, bấm 1 request bất kỳ tới `api-gw-ds.tnex.com.vn`, copy phần sau `Bearer ` ở header `authorization`.
2. Mở `run.js`, dán token vào biến `TOKEN` ở đầu file.
3. Kiểm tra/cập nhật danh sách số điện thoại trong `phones.js` (mỗi dòng 1 số, giữ nguyên dạng chuỗi).
4. Chạy thử trước (mặc định `DRY_RUN = true` trong `run.js`) để xem danh sách sẽ xử lý — **chưa gọi API thật**:
   ```bash
   node scripts/inactive-users-by-phone/run.js
   ```
5. Khi đã kiểm tra ổn, mở `run.js`, đổi `DRY_RUN = false`, chạy lại lệnh trên để thực thi thật.

## Lưu ý

- Token JWT hết hạn sau vài giờ — nếu gặp lỗi `401`, dán token mới vào `run.js` rồi chạy lại (script sẽ tự dừng khi gặp `401`/`403` để tránh fail hàng loạt phần còn lại).
- Gọi tuần tự từng số, nghỉ `DELAY_MS` (mặc định 500ms) giữa 2 lần gọi để tránh spam API.
- Không commit token thật lên git — chỉ dán tạm để chạy rồi xóa khỏi file trước khi commit (nếu có commit file này).
- Đây là thao tác thật trên hệ thống production, không có undo tự động — kiểm tra kỹ danh sách số trong `phones.js` trước khi tắt `DRY_RUN`.
