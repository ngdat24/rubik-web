# Rubik Lab

Không gian luyện giải Rubik 3D ngay trên trình duyệt: xoay khối bằng bàn phím, chuột hoặc cảm ứng, bấm giờ và theo dõi lịch sử giải.

**[Mở Rubik Lab](https://rubik-web-rho.vercel.app)**

Dự án đang phát triển. Đã có mô phỏng 2×2 đến 10×10, hồ sơ chỉ đặt tên, lưu lịch sử, phòng mời 1v1 và Time Limit solo. Sandbox và Cross/F2L trainer chưa triển khai.

## Tính năng hiện có

- Rubik 3D N=2..10, animation và điều khiển camera, chuột/cảm ứng.
- Phím theo góc nhìn mặc định; tùy chọn **Khóa xoay phím** dùng hệ trục cố định.
- Tùy chỉnh phím, nhiều hồ sơ, nhập/xuất cấu hình JSON.
- Scramble tái lập theo seed; inspection, +2/DNF và tự dừng khi khối được giải.
- Lịch sử và single/mo3/ao5/ao12 theo kích thước; chỉnh phạt cá nhân, xóa và khôi phục phạt gốc.
- Tự lưu IndexedDB, backup JSON, xuất CSV.
- Hồ sơ chỉ đặt tên qua Supabase Anonymous Sign-Ins; tên phải chưa được dùng, không cần email/mật khẩu.
- Lịch sử tách theo phiên hồ sơ; đồng bộ server và gửi lại khi mất mạng. Tên không phải cách đăng nhập hồ sơ cũ trên thiết bị khác.
- Đồng bộ tăng dần các bản ghi mới/sửa/xóa; ngừng các đợt đồng bộ mới khi tab ẩn.
- Bảng thành tích **2×2 và 3×3**: bảng nhỏ Top 10 và trang BXH Toàn Cầu tối đa 1.000 lượt all-time; một người có thể có nhiều dòng.
- Phòng mời **1v1**: Rubik của mình bên trái, đối thủ bên phải; full/F2L/1 mặt, mỗi lượt chạy 3 phút.
- **Time Limit** solo: ba mục tiêu cùng luật thi đấu và bảng Top 10 riêng; nhiều khối hơn, rồi mốc hoàn thành cuối sớm hơn, rồi ít nước hơn.
- Ví CB/ZN, nhiệm vụ ngày/online 10 phút, thưởng PB, vé Time Limit Full 3×3, bảng tuần và cược 1v1.
- Cửa hàng skin, hòm, tiện ích và vòng quay mùa; kho chia Skin 2×2 / Skin 3×3.
- Champion Huyền thoại được cấp riêng theo kích thước, chỉ không viền; xem thử/trang bị/đặt tên ngay trong kho, đổi tên sau khi nhận tốn 500 CB.
- Giao diện tiếng Việt/tiếng Anh.
- Chạy được local, server LAN hoặc Vercel + Supabase.

## Cách chơi

1. Trong luyện tập, chọn kích thước khối. Nhấn **Space** để chuẩn bị scramble.
2. Nhấn **Space** lần nữa để bắt đầu inspection; **Shift+Space** đổi scramble khi chưa chạy.
3. Nước xoay lớp đầu tiên bắt đầu tính giờ. Giải xong khối, đồng hồ tự dừng.
4. **Esc** mở xác nhận hủy lượt; đồng hồ vẫn chạy khi hộp thoại mở.

Giải xong hợp lệ hoặc xác nhận hủy lượt đang chạy sẽ tự chuẩn bị scramble mới; Space bắt đầu inspection. DNF giữ trạng thái, Space mới chuẩn bị scramble. 1v1/Time Limit dùng đồng hồ server: đếm ngược 3 giây, inspection 15 giây, chạy 180 giây và ân hạn nhận kết quả 3 giây; khối dở không tính. Mục tiêu 1 mặt yêu cầu đúng các viên của lớp mặt và màu bên hông khớp tâm, không chỉ chín ô đồng màu.

| Phím | Thao tác |
| --- | --- |
| U / R / F / D / L / B | Xoay mặt |
| Shift + phím mặt | Đảo chiều |
| Alt + phím mặt | Quay đôi |
| Giữ W + phím mặt | Wide move |
| Giữ số 1..9 hoặc 0 (=10) | Chọn lớp; kết hợp W để chọn độ rộng |
| X / Y / Z | Xoay toàn khối |
| M / E / S | Slice, chỉ trên 3×3 |

Chuột trái kéo lớp (kể cả viền/khe), chuột phải xoay góc nhìn giữ hướng đứng. Kéo chuột từng ra khỏi vùng canvas sẽ bị hủy. Cảm ứng giữ thao tác kéo lớp/kéo nền và pinch zoom; cuộn chuột để thu phóng. Alt/Option có thể bị hệ điều hành giữ lại; có thể gán phím thường cho nước đôi trong Cài đặt phím.

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
| CRON_SECRET | Secret backend xác thực economy maintenance, không đưa vào VITE_ |

Tên ANON_KEY được giữ để tương thích; giá trị có thể là key `sb_publishable_…`. **Không đặt secret key vào biến VITE_, mã nguồn hoặc Git.** Backend hỗ trợ service_role cũ như fallback, ưu tiên secret key hiện hành.

4. Trong Supabase Authentication → Sign In / Providers, bật Anonymous Sign-Ins cho mô hình hồ sơ chỉ đặt tên hiện tại. Không cần thêm UI đăng ký email/mật khẩu hoặc phục hồi mật khẩu.
5. Deploy lại sau khi đổi biến môi trường. Kiểm tra tạo phiên, đặt tên duy nhất, lưu/reload lịch sử, bảng xếp hạng và API thi đấu. `vercel.json` đặt API tại Seoul (`icn1`) gần database hiện tại; nếu dựng database vùng khác cần review lại vùng API.

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
npm.cmd run test:race
npm.cmd run test:time-limit
$env:PLAYWRIGHT_CHANNEL='chrome'
npm.cmd run test:e2e
python -B tools/reference/check-engine.py
```

Cloud tests dùng Auth/database giả lập; kiểm tra SQL/RLS nằm ở [supabase/tests](supabase/tests/), gồm quyền hồ sơ và Time Limit. Chạy trên môi trường kiểm tra phù hợp sau migration, đọc script và cơ chế rollback trước khi chạy. Test giả lập không thay thế nghiệm thu online thực tế; không tự ghi/xóa dữ liệu thật trên Supabase chung để thử.

## Giới hạn hiện tại

- Bảng xếp hạng dành cho giao lưu: replay xác nhận chuỗi giải hợp lệ, chưa chứng minh thời gian client trung thực hay chống solver ngoài.
- 1v1/Time Limit đã có challenge server cấp và replay; chưa có matchmaking/Elo, ghost race, One for all, solver/trainer hoặc AI coach.
- Hồ sơ name-only gắn với phiên trình duyệt; nhập tên cũ trên máy mới không cấp quyền truy cập. Chưa có luồng phục hồi/chuyển hồ sơ qua tên.
- Chỉnh phạt cá nhân không làm nhẹ điểm gốc trên bảng. Backup nhập chỉ được gửi khi người dùng chọn riêng và không xếp hạng.
- Reload bắt đầu đồng bộ snapshot lại; cursor tăng dần chỉ giữ trong phiên để không vượt dữ liệu local chưa ghi thành công.
- Chưa có kết quả load test để cam kết số người dùng đồng thời.
- Lịch sử local phụ thuộc trình duyệt/origin; xóa dữ liệu trang có thể mất bản local. JSON backup vẫn hữu ích để dự phòng.

## Tài liệu

- [Tổng quan hiện hành đến PR #65](docs/tong-quan-rubik-lab-va-lo-trinh-phat-trien.md)

- [Đặc tả kỹ thuật](docs/spec/)
- [Nhật ký quyết định](docs/spec/decisions.md)
- [Tổng kết triển khai và workflow GitHub hai người](docs/project-history-and-github-workflow.md)
- [Workflow cho Sang và AI](docs/workflow-sang-va-ai.md)
- [Hướng dẫn AI cộng tác viên](COLLABORATOR_AGENT.md)

Đối chiếu quyết định mới, mã nguồn và lịch sử PR khi tiếp tục phát triển. Preview hiện dùng chung database production; thay đổi database/secrets do chủ repo điều phối.
