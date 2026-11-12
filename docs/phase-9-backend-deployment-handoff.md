# Bàn giao sau Giai đoạn 6: tài khoản, backend, Vercel và tối ưu đồng bộ

Ngày: 13/11/2026 (Asia/Saigon). Repository: ngdat24/rubik-web.

## 1. Phạm vi và thay đổi ưu tiên

Sau khi khép Giai đoạn 6, người dùng quyết định hoãn Giai đoạn 7 (Sandbox/Cross/F2L) và Giai đoạn 8 (Time attack), ưu tiên Giai đoạn 9: tài khoản, backend và triển khai web online. Không coi hai giai đoạn bị hoãn là đã thực hiện. Không chuyển sang React, không sửa engine và không thêm solver/AI.

Chuỗi PR nền tảng: #21 lưu lịch sử local, #22 LAN, #23 khép Giai đoạn 6; phần sau đó gồm #24 tài khoản/Supabase/Vercel và #25 đồng bộ tăng dần. Các PR phụ thuộc nhau; cần merge theo thứ tự vào main, không chỉ merge vào nhánh cha rồi cho rằng main đã có toàn bộ.

## 2. Các ứng dụng và công cụ được sử dụng

| Công cụ | Vai trò thực tế |
| --- | --- |
| GitHub và GitHub Actions | Nhánh/PR, review, CI và lưu mã nguồn; kiểm tra chính xác head trước merge |
| Vercel | Phục vụ web Vite và Node Functions trong api/, tạo deployment từ GitHub |
| Supabase | PostgreSQL, Auth email/mật khẩu, Data API, kiểm tra schema/RLS và migrations |
| Supabase SDK 2.119.0 | Quản lý phiên, refresh token, đăng ký/đăng nhập và PKCE khôi phục mật khẩu |
| Supabase CLI 3.1.0 | Tạo file migration đúng quy ước; không thêm CLI vào dependency ứng dụng |
| Vitest, Playwright/Chrome, node:test | Logic thuần, tương tác trình duyệt, API và cloud giả lập |
| Supabase/Vercel kết nối trong Codex | Đọc project/log, chạy migration/SQL, cấu hình và kiểm tra deployment |

Không dùng Deno/Edge Functions, dịch vụ AI, nhà cung cấp SMTP riêng hoặc tên miền trả phí trong phần triển khai này. Người dùng kết nối tài khoản và tự nhập secret trực tiếp trên Vercel; không yêu cầu gửi khóa vào hội thoại.

## 3. Tài khoản người chơi

File chính: apps/web/src/account.ts và phần dialog trong apps/web/index.html.

- Đăng nhập, đăng ký bằng email/mật khẩu; giữ xác nhận email trước khi đồng bộ.
- Khôi phục mật khẩu qua email với PKCE; màn hình nhận liên kết recovery cho phép đặt mật khẩu mới.
- SDK quản lý token/refresh, không tự viết hệ mật khẩu hoặc tự tin payload JWT ở backend.
- Chơi không đăng nhập vẫn có timer và lịch sử khách trên thiết bị.
- Đổi tài khoản hoặc đăng xuất tải lại trang để tách luồng dữ liệu theo user ID.
- Có đăng xuất thiết bị hiện tại và xóa tài khoản. Xóa tài khoản yêu cầu nhập XÓA; backend lấy ID từ phiên đã xác minh, không tin ID do form gửi.
- Xóa tài khoản xóa dữ liệu server qua foreign key cascade; không tự xóa bản IndexedDB trên thiết bị. Token truy cập không nên được coi là lập tức vô hiệu chỉ vì đã xóa user: backend vẫn xác minh user qua Auth.
- Google OAuth chưa triển khai; không suy email/mật khẩu đồng nghĩa đã có đăng nhập Google.

## 4. Tách dữ liệu và đồng bộ lịch sử

Các file liên quan: history-storage.ts, history-controls.ts, timer-controls.ts, cloud-controls.ts và main.ts trong apps/web/src.

IndexedDB vẫn dùng database rubik-history-v1; khách dùng key backup, tài khoản dùng backup:<userId>. Không tự lấy lịch sử khách làm dữ liệu của người vừa đăng nhập. Mỗi tài khoản có namespace riêng cho outbox và revision trong localStorage.

Lượt giải mới của tài khoản tự vào hàng đợi trước khi gửi. Khi mất mạng, hàng đợi ở thiết bị và được thử lại khi online, sau reload hoặc đợt đồng bộ tiếp theo. Khi bộ nhớ trình duyệt bị chặn/đầy, vẫn có cảnh báo và dữ liệu trong phiên; không hứa lưu bền vững khi trình duyệt từ chối ghi.

Solve gốc bất biến. Chỉnh phạt và xóa là metadata riêng; server có revision và tombstone deleted. CAS phát hiện thay đổi từ thiết bị khác, báo xung đột thay vì âm thầm ghi đè. Nút dùng bản server bỏ các thay đổi local đang xung đột và tải lại bản server. Việc chỉnh tiếp trong lúc request đang gửi được phân biệt bằng nonce để không mất thao tác mới.

Backup nhập không tự lên bảng xếp hạng. Có nút riêng gửi lịch sử đã nhập vào tài khoản, không xếp hạng; bản ghi vẫn phải qua kiểm tra. JSON dùng khôi phục/chuyển dữ liệu, CSV chỉ phục vụ xem thống kê. Không tự đồng bộ keymap/settings lên cloud trong phần này.

## 5. Backend và kiểm tra kết quả

Các endpoint tại api/: player.mjs, solves.mjs, leaderboard.mjs, account.mjs; logic chung server/cloud.mjs và server/verify-solve.mjs.

- Xác minh access token bằng Supabase Auth /auth/v1/user; yêu cầu email đã xác nhận.
- User ID do Auth trả về quyết định quyền sở hữu, không dùng user_metadata hoặc user_id từ request làm căn cứ phân quyền.
- Payload tối đa 300 KB; giới hạn theo tài khoản/phút: 120 thao tác ghi, 600 thao tác đọc.
- Kiểm schema, phiên bản engine, inspection, penalty, thứ tự timestamp và ký hiệu bằng các hàm có sẵn.
- Sinh lại scramble, áp preEvents/events trên engine; phải giải xong đúng nước cuối, không được có nước tiếp sau khi đã giải xong.
- Retry cùng ID/cùng dữ liệu là idempotent; ID khác chủ hoặc thay Solve gốc bị từ chối.
- Lịch sử tài khoản nhận N=2..10; bảng xếp hạng chỉ 2×2 và 3×3.
- Bảng hiển thị hạng – tên – thời gian, một personal best/người; +2 cộng 2000 ms, DNF không xếp hạng. Override cá nhân không làm nhẹ phạt gốc để lấy thứ hạng.
- Xóa mềm kết quả loại nó khỏi bảng. Profile chưa đặt tên chưa có dòng trên bảng.

Giới hạn quan trọng: replay chứng minh chuỗi/trạng thái hợp lệ, không chứng minh người chơi không dùng solver ngoài hoặc thời gian client trung thực. Chưa có challenge server cấp, matchmaking, Elo, luật thi đấu hay anti-cheat của Giai đoạn 10/11.

## 6. Schema và quyền truy cập trên Supabase thật

Project đã xác định: dfknbaritcibkzvavmta, region ap-northeast-2, PostgreSQL 17.11.

Migration 20261112192305_rubik_accounts tạo profiles, solves, api_usage, các index và RPC consume_quota/save_solve/leaderboard. RLS cho phép authenticated đọc hồ sơ/lượt giải của chính mình; không cấp quyền ghi trực tiếp cho client. Anonymous không đọc lịch sử riêng. RPC chỉ có EXECUTE cho service_role, dùng SECURITY INVOKER và search_path cố định; không thêm SECURITY DEFINER để lách RLS.

Migration 20261112202317_incremental_history_sync bổ sung sequence, sync_version, index (user_id,sync_version) và trigger private.stamp_solve_sync. Trigger khóa theo tài khoản đến commit rồi cấp phiên bản. Dữ liệu cùng tài khoản không thể có cursor mới đã thấy nhưng thay đổi cũ chưa commit bị bỏ qua. Retry no-op không cấp phiên bản mới.

supabase/tests/accounts.sql chạy trong transaction rồi rollback: kiểm ownership, quyền đọc, cấm ghi trực tiếp/RPC từ client, revision conflict, giữ điểm gốc khi chỉnh phạt, cascade, cursor và tombstone. Đã chạy trên Supabase thật, không giữ user/dữ liệu kiểm thử sau rollback.

Advisors không báo ERROR/WARN tại lượt kiểm tra. Có INFO api_usage bật RLS mà không có policy vì chủ đích chỉ service_role truy cập; index chưa dùng trên DB mới là thông tin, không phải bằng chứng cần xóa index. Link giải thích: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

## 7. Vercel: lỗi ban đầu và cấu hình đã sửa

Lỗi TS2307 Cannot find module @rubik/* xuất hiện vì project ban đầu chọn Root Directory apps/web. Lệnh build chỉ chạy workspace web trước khi engine/renderer/controller/timer có dist. Những lỗi unknown/any theo sau là lỗi dây chuyền; không sửa bằng cách tắt strict TypeScript.

Đã đổi Root Directory về gốc repository, preset Other/framework null, Node22, npm ci, npm run build và output apps/web/dist. vercel.json ghim cấu hình, các Function tối đa 30 giây và bao gồm engine/timer đã build. Thêm header nosniff, chống nhúng iframe và referrer policy.

Project Vercel: rubik-web thuộc team ngdattttt. Địa chỉ ổn định đang dùng: https://rubik-web-ngdattttt.vercel.app . Các deployment đã kiểm tra dùng target staging/Preview; việc web chạy không tự có nghĩa PR đã merge hoặc đã có release Production chính thức.

## 8. Biến môi trường và email redirect

| Biến | Nơi dùng |
| --- | --- |
| SUPABASE_URL | Backend |
| SUPABASE_ANON_KEY | Backend gọi Auth với public/publishable key |
| SUPABASE_SECRET_KEY | Backend đặc quyền, Secret/Sensitive, tuyệt đối không VITE_ |
| VITE_SUPABASE_URL | Browser |
| VITE_SUPABASE_ANON_KEY | Browser, giá trị public/publishable key |

Tên ANON_KEY được giữ tương thích nhưng giá trị có thể là sb_publishable_. Backend hỗ trợ sb_secret_ qua header apikey, không giả nó là JWT; service_role cũ chỉ là fallback. .env.example chỉ có placeholder; .env*, .vercel/ và Supabase CLI cache được gitignore.

Người dùng ban đầu lưu secret cho Production; sau đó phạm vi được bổ sung Preview và redeploy, không đọc/hiển thị giá trị secret. Đã kiểm tra API bảng 2×2/3×3 trả 200 qua Vercel → Supabase thật.

Người dùng đã xác nhận lưu Site URL và Redirect URLs về địa chỉ web. Liên kết PKCE nên mở trong trình duyệt đã yêu cầu. Chưa cấu hình SMTP riêng, chưa đo khả năng gửi email số lượng lớn hoặc xác nhận toàn bộ tình huống recovery trên mọi thiết bị.

## 9. Lớp bảo vệ Vercel khác với tài khoản Rubik

Đã kiểm tra project từng bật Vercel Authentication all_except_custom_domains; tab ẩn danh yêu cầu tài khoản Vercel trước khi tới Rubik Lab. Đây là lớp triển khai, không phải lỗi Supabase. Không tự tắt bảo vệ để vượt bài kiểm tra; các request xác minh có thể dùng quyền Vercel sẵn có. Trạng thái mở công khai cho khách cần đối chiếu lại trong dashboard, không suy từ việc chủ project mở được trang.

## 10. Phân tích quota và lý do đổi đồng bộ

Đã đối chiếu tài liệu gói miễn phí: Vercel Hobby có 100 GB truyền dữ liệu, 1 triệu Function invocations và 4 giờ Active CPU; Supabase Free có database 500 MB, 5 GB egress, 50.000 MAU và có thể pause khi ít hoạt động khoảng một tuần. Hạn mức có thể đổi; dashboard Usage và tài liệu nhà cung cấp là nguồn hiện hành.

Không đồng nhất 50.000 MAU với số người đồng thời hay một cam kết tải. Xoay Rubik chủ yếu chạy trên thiết bị; tải server gồm Auth, đồng bộ, truy vấn và replay khi lưu kết quả. Tắt laptop không tắt Vercel/Supabase, chỉ tắt localhost/LAN chạy trên laptop.

Code đầu tiên tải toàn bộ lịch sử mỗi 30 giây, khoảng 4 API/chu kỳ với lịch sử dưới 500 bản ghi, chưa tính lưu kết quả. Với 20 người chơi 20 phút/ngày, có khoảng 200 giờ-người/tháng và 24.000 lượt đồng bộ. Ví dụ 200 KB/lượt tương đương 4,8 GB/tháng chỉ riêng lịch sử; đây là mô hình giả định, không phải số băng thông thực đã đo hoặc kết quả load test.

Đã sửa: lần đầu mở trang tải snapshot, sau đó GET solves?since=<cursor> trả tối đa 500 thay đổi/trang; mốc tăng dần nhận cả sửa/xóa. Không có thay đổi thì không tải lại events cũ. Chu kỳ chỉ đọc bảng một lần thay vì hai. Tab ẩn không khởi tạo sync mới, mở lại tiếp tục; request đã gửi có thể hoàn tất. SDK vẫn quản lý phiên Auth riêng.

Cursor chỉ nằm trong phiên: reload bắt đầu lại từ 0 để tránh cursor vượt dữ liệu IndexedDB chưa ghi thành công. Nút dùng bản server reset cursor khi bỏ xung đột. Endpoint offset cũ giữ tương thích rollout. Chưa có delta-only qua mọi lần reload, chưa dùng Realtime và chưa cache toàn bộ bảng theo mùa.

## 11. Kiểm thử và giới hạn bằng chứng

Local đã đạt build/lint/typecheck, 317 unit test, 21 Chrome E2E, 2 LAN tests tại mốc tài khoản và 2 cloud tests được mở rộng cho delta. Cloud dùng Auth/database giả lập để kiểm đăng ký, login, recovery PKCE, offline/reload, hai thiết bị, tách tài khoản, sửa/xóa, phân trang 501 records, delta rỗng và tab ẩn. SQL/RLS thật đã kiểm riêng như mục 6.

Người dùng báo web hoạt động ổn trên nhiều thiết bị. Chưa có load test, số người đồng thời tối đa, số FPS/latency hoặc mức tiết kiệm băng thông đo thực tế. Không tuyên bố mọi ranh giới browser → Auth → API → DB đã được kiểm bằng tài khoản thật chỉ vì mock hoặc API bảng trả 200.

Khi chuẩn bị merge, phát hiện CI cloud-browser còn lỗi trong luồng login trên Linux dù local đạt. Việc sửa fixture/CI và kết quả kiểm tra cuối phải được ghi nhận ở PR/Actions; không merge nhánh có CI verify đang đỏ. JWT giả lập được chuẩn hóa encoding chữ ký và bổ sung iat, không nới quyền hệ thống thật.

## 12. Các file quan trọng để review

- apps/web/src/account.ts: phiên, UI auth và recovery.
- apps/web/src/cloud-controls.ts: outbox, CAS, delta cursor, visibility và bảng.
- apps/web/src/history-storage.ts, history-controls.ts, timer-controls.ts, main.ts: scope/tích hợp.
- server/cloud.mjs, verify-solve.mjs: API, Auth, quota và replay.
- api/*.mjs: entry point Vercel.
- supabase/migrations/*.sql và supabase/tests/accounts.sql: schema, quyền và kiểm chứng.
- vercel.json, .env.example, .github/workflows/ci.yml: build/config/CI, không chứa secret thật.
- server/cloud.test.mjs, cloud-browser.test.mjs, test-support.mjs: kiểm tra và dịch vụ giả lập.

## 13. Phần chưa làm và bước tiếp

Sandbox/undo/Cross/F2L, Time attack, Google OAuth, đồng bộ keymap/settings, challenge/anti-cheat, realtime room, Elo và coach chưa triển khai. Không coi Giai đoạn 9 trong roadmap lớn hoàn thành mọi mục chỉ vì nền Auth/history đã chạy.

Sau merge: kiểm tra CI trên main và deployment gắn đúng commit; người dùng thử tài khoản thật, kết quả hiện trên máy khác, sửa/xóa đúng, và khách ẩn danh có quyền vào web theo chính sách mong muốn. Theo dõi Usage vài tuần trước khi quyết định nâng gói. Không nâng cấp trả phí, tạo branch Supabase tính phí hoặc tự gửi email cho người khác trong công việc này.
