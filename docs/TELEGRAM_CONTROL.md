# 🤖 Hướng dẫn cài đặt Telegram Control Bot (Cloudflare Worker)

Đây là hướng dẫn để tạo Bot Telegram giúp bạn điều khiển GitHub Actions từ xa (chạy bot, đổi lịch chạy) hoàn toàn miễn phí và không cần treo máy.

## ✅ Phần 1: Tạo Telegram Bot
1. Chat với **@BotFather** trên Telegram.
2. Gõ `/newbot` và đặt tên.
3. Nhận **API Token** (dạng `123456:ABC-DEF...`). → Lưu lại là **`TG_BOT_TOKEN`**.

## ✅ Phần 2: Lấy GitHub Token
1. Vào [GitHub Settings > Developer Settings > Personal Access Tokens (Tokens (classic))](https://github.com/settings/tokens).
2. Tạo token mới (Generate new token).
3. Tích chọn các quyền:
   - `repo` (để sửa file schedule).
   - `workflow` (để kích hoạt bot chạy).
4. Copy token. → Lưu lại là **`GH_TOKEN`**.

## ✅ Phần 3: Tạo Cloudflare Worker
1. Đăng ký/Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Vào **Workers & Pages** → **Create Application** → **Create Worker**.
3. Đặt tên (ví dụ: `ms-rewards-bot`) → **Deploy**.
4. Click **Edit code**.
5. Copy toàn bộ nội dung file [cloudflare/worker.js](../cloudflare/worker.js) và dán đè vào đó.
6. Bấm **Deploy**.

## ✅ Phần 4: Cấu hình Variables (Quan trọng)
Trong trang quản lý Worker của bạn:
1. Vào tab **Settings** → **Variables**.
2. Thêm các biến sau (Environment Variables):

| Variable Name | Giá trị (Value) | Mô tả |
|---------------|-----------------|-------|
| `TG_BOT_TOKEN` | `123456:ABC...` | Token của BotFather |
| `GH_TOKEN` | `ghp_...` | GitHub Personal Access Token |
| `GH_OWNER` | `Rai123qt` | Tên user GitHub của bạn |
| `GH_REPO` | `MS-RW` | Tên repository của bạn |
| `ALLOWED_USER_ID`| `123456789` | (Tùy chọn) ID Telegram của bạn để bảo mật |

> **Cách lấy ID Telegram của bạn**: Chat với bot `@userinfobot` để lấy ID.

## ✅ Phần 5: Kết nối Webhook
Bạn cần báo cho Telegram biết là phải gửi tin nhắn về Cloudflare Worker của bạn.

1. Lấy URL của Worker (ví dụ: `https://ms-rewards-bot.username.workers.dev`).
2. Mở trình duyệt, chạy link sau (thay thế token và url):
   ```
   https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook?url=<WORKER_URL>
   ```
3. Nếu thấy `{"ok":true, "result":true, "description":"Webhook was set"}` là thành công!

## 🚀 Sử dụng
Chat với bot của bạn:

- **/run**: Chạy bot ngay lập tức (default: chạy tất cả).
- **/run thomas**: Chỉ chạy account thomas.
- **/run all true**: Chạy tất cả và bỏ qua delay.
- **/schedule 16:00**: Đặt lịch chạy tự động lúc 4h chiều hàng ngày.
