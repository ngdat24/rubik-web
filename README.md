# Rubik Lab

Không gian luyện giải Rubik 3D ngay trên trình duyệt: xoay khối bằng bàn phím, chuột hoặc cảm ứng, bấm giờ và theo dõi lịch sử giải.

**[Mở Rubik Lab](https://rubik-web-ngdattttt.vercel.app)**

Dự án đang phát triển. Đã có mô phỏng 2×2 đến 10×10, tài khoản và đồng bộ lịch sử; Sandbox, Cross/F2L trainer và thi đấu trực tiếp là các bước tiếp theo.

## Tính năng hiện có

- Rubik 3D N=2..10, animation và điều khiển camera, chuột/cảm ứng.
- Phím theo góc nhìn mặc định; tùy chọn **Khóa xoay phím** dùng hệ trục cố định.
- Tùy chỉnh phím, nhiều hồ sơ, nhập/xuất cấu hình JSON.
- Scramble tái lập theo seed; inspection, +2/DNF và tự dừng khi khối được giải.
- Lịch sử và single/mo3/ao5/ao12 theo kích thước; chỉnh phạt cá nhân, xóa và khôi phục phạt gốc.
- Tự lưu IndexedDB, backup JSON, xuất CSV.
- Tài khoản email/mật khẩu, xác nhận email và khôi phục mật khẩu qua Supabase.
- Lịch sử tài khoản tách khỏi khách; đồng bộ giữa thiết bị, gửi lại khi mất mạng.
- Đồng bộ tăng dần các bản ghi mới/sửa/xóa; ngừng các đợt đồng bộ mới khi tab ẩn.
- Bảng thành tích **2×2 và 3×3**: hạng – tên – thời gian tốt nhất mỗi người.
- Chạy được local, server LAN hoặc Vercel + Supabase.

## Cách chơi

1. Chọn kích thước khối. Nhấn **Space** để chuẩn bị scramble.
2. Nhấn **Space** lần nữa để bắt đầu inspection; **Shift+Space** đổi scramble khi chưa chạy.
3. Nước xoay lớp đầu tiên bắt đầu tính giờ. Giải xong khối, đồng hồ tự dừng.
4. **Esc** mở xác nhận hủy lượt; đồng hồ vẫn chạy khi hộp thoại mở.

| Phím | Thao tác |
| --- | --- |
| U / R / F / D / L / B | Xoay mặt |
| Shift + phím mặt | Đảo chiều |
| Alt + phím mặt | Quay đôi |
| Giữ W + phím mặt | Wide move |
| Giữ số 1..9 hoặc 0 (=10) | Chọn lớp; kết hợp W để chọn độ rộng |
| X / Y / Z | Xoay toàn khối |
| M / E / S | Slice, chỉ trên 3×3 |

Kéo sticker để xoay lớp, kéo nền để đổi góc nhìn, cuộn hoặc pinch để thu phóng. Alt/Option có thể bị hệ điều hành giữ lại; có thể gán phím thường cho nước đôi trong Cài đặt phím.

## Chạy trên máy

Cần **Node.js 22.12+** và Git. Python dùng cho kiểm tra reference; Chrome dùng cho kiểm tra trình duyệt. Không cần Supabase/Vercel để chơi local.

```powershell
git clone https://github.com/ngdat24/rubik-web.git
cd rubik-web
npm.cmd ci
npm.cmd run dev
```

Mở địa chỉ Vite in trong terminal. Trên PowerShell, dùng `npm.cmd` nếu `npm.ps1` bị chặn. Trên macOS/Linux có thể dùng `npm`.

### Chơi cùng mạng LAN

Dừng dev server cũ rồi chạy:

```powershell
npm.cmd run lan
```

Mở địa chỉ IP được in ra trên các thiết bị cùng mạng; cho phép Node qua firewall mạng riêng nếu cần. Server phục vụ cả web và API, lưu dữ liệu chung trong `lan-data/room.json` (không commit Git). Máy chạy LAN phải bật. `npm.cmd run start:lan` chạy bản đã build.

Local dev Vite không tự chạy backend cloud. Tài khoản Vercel/Supabase và hồ sơ LAN là hai hệ riêng; không tự chuyển dữ liệu hay danh tính giữa chúng.

## Triển khai Vercel + Supabase

1. Tạo project Supabase riêng cho môi trường dự định dùng; áp dụng các migration trong [supabase/migrations](supabase/migrations) theo thứ tự. Không chạy lại migration đã có trong history.
2. Import repository trên Vercel với **Root Directory là gốc repo**, preset **Other**, Node22, install `npm ci`, build `npm run build`, output `apps/web/dist`. Xem [vercel.json](vercel.json).
3. Đặt biến môi trường theo [.env.example](.env.example), cho đúng Preview/Production:

| Biến | Mục đích |
| --- | --- |
| SUPABASE_URL | URL project cho backend |
| SUPABASE_ANON_KEY | Public/publishable key cho Auth |
| SUPABASE_SECRET_KEY | Secret key chỉ dành cho backend |
| VITE_SUPABASE_URL | URL project trong browser |
| VITE_SUPABASE_ANON_KEY | Public/publishable key trong browser |

Tên ANON_KEY được giữ để tương thích; giá trị có thể là key `sb_publishable_…`. **Không đặt secret key vào biến VITE_, mã nguồn hoặc Git.** Backend hỗ trợ service_role cũ như fallback, ưu tiên secret key hiện hành.

4. Trong Supabase Auth, cấu hình Site URL và Redirect URLs khớp địa chỉ web; giữ xác nhận email. Mở link PKCE trong trình duyệt đã yêu cầu. Kiểm tra cấu hình gửi email trước khi mở đăng ký rộng rãi.
5. Deploy lại sau khi đổi biến môi trường. Kiểm tra đăng ký/đăng nhập, lưu kết quả và đọc lịch sử trên thiết bị khác.

Vercel Authentication/Deployment Protection là lớp riêng với tài khoản Rubik Lab. Nếu khách phải đăng nhập Vercel trước khi thấy web, kiểm tra chính sách bảo vệ deployment. Không tắt bảo vệ chỉ để làm bài test qua.

Khi dùng bản cloud, tắt laptop không tắt Vercel hoặc Supabase. Hạn mức tài nguyên và chính sách gói miễn phí vẫn áp dụng; theo dõi Usage trên từng dịch vụ.

## Kiến trúc

```text
packages/engine       Trạng thái, parser, permutation, predicates, scramble và thống kê
packages/renderer     Three.js, geometry, camera, animation và preview kéo
packages/controller   Sở hữu Cube, nhận input, locks/gate và keymap
packages/timer        SolveTimer và SolveHistory thuần
apps/web              Vite + TypeScript, giao diện DOM và đồng bộ
api/                  Entry point Vercel Functions
server/               Auth, API, kiểm tra/replay Solve và cloud tests
supabase/             Migrations và kiểm tra quyền SQL
tools/lan/            Server và kiểm tra LAN
tools/reference/      Reference Python
```

Controller cập nhật engine ngay khi nhận input; renderer chỉ hiển thị snapshot. Timer dùng timestamp input, không dùng thời điểm animation kết thúc. Backend xác minh danh tính và replay kết quả bằng engine dùng chung.

## Kiểm tra

Chạy từ gốc repository; build các package trước khi chạy test tích hợp:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:lan
npm.cmd run test:cloud
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd run test:e2e
python -B tools/reference/check-engine.py
```

Cloud tests dùng Auth/database giả lập; kiểm tra SQL/RLS thật nằm ở [supabase/tests/accounts.sql](supabase/tests/accounts.sql), chạy trên môi trường kiểm tra sau migration và rollback dữ liệu thử. Test giả lập không thay thế nghiệm thu tài khoản/email thật.

## Giới hạn hiện tại

- Bảng xếp hạng dành cho giao lưu: replay xác nhận chuỗi giải hợp lệ, chưa chứng minh thời gian client trung thực hay chống solver ngoài.
- Chưa có challenge server cấp, Elo, phòng đấu trực tiếp, Google OAuth, solver/trainer hoặc AI coach.
- Chỉnh phạt cá nhân không làm nhẹ điểm gốc trên bảng. Backup nhập chỉ được gửi khi người dùng chọn riêng và không xếp hạng.
- Reload bắt đầu đồng bộ snapshot lại; cursor tăng dần chỉ giữ trong phiên để không vượt dữ liệu local chưa ghi thành công.
- Chưa có kết quả load test để cam kết số người dùng đồng thời.
- Lịch sử local phụ thuộc trình duyệt/origin; xóa dữ liệu trang có thể mất bản local. JSON backup vẫn hữu ích để dự phòng.

## Tài liệu

- [Đặc tả kỹ thuật](docs/spec/)
- [Nhật ký quyết định](docs/spec/decisions.md)
- [Bàn giao tài khoản, backend, triển khai và tối ưu đồng bộ](docs/phase-9-backend-deployment-handoff.md)

Các tài liệu cũ có thể ghi trạng thái tại thời điểm viết; đối chiếu quyết định mới, mã nguồn và lịch sử PR khi tiếp tục phát triển.
