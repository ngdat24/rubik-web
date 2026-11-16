# Rubik Lab — Những gì đã làm và workflow GitHub cho hai người

Đối chiếu ngày 16/11/2026. Repository: [ngdat24/rubik-web](https://github.com/ngdat24/rubik-web).

Đây là bản tổng kết triển khai, không phải cam kết tính năng tương lai. Mốc đối chiếu khi dọn tài liệu: `main` tại `87b54f5`, đã có PR #34 Time Limit, #35 sửa độ trễ, #36 tổng kết/workflow và #38 hướng dẫn cộng tác viên.

## A. Cách đọc trạng thái dự án

- **Đã merge:** code đã có trên `main`; phải kiểm tra deployment tương ứng nếu muốn xác nhận bản đang phục vụ người dùng.
- **Có trên PR:** có thể thử Preview của PR đó; chưa được coi là đã phát hành trên production.
- **Chưa triển khai:** không suy từ roadmap, tên mode hoặc một hàm engine rằng đã có trọn tính năng.
- Các kế hoạch/trạng thái/handoff cũ trùng lặp đã được dọn; dùng bản tổng kết này và spec để tra cứu, rồi đối chiếu code/PR mới nhất. Lịch sử các file từng commit vẫn có trong Git.

Web production: <https://rubik-web-ngdattttt.vercel.app>.

## B. Tổng kết theo các chặng thực tế

### 1. Đặc tả và engine thuần TypeScript — Giai đoạn 1–2

- Chốt spec 01–09, bảng predicates, vectors, reference Python và nhật ký quyết định.
- Hệ tọa độ, geometry/index sticker, hoán vị nước và trạng thái NxN cho N=2..10.
- Parser ký hiệu mặt, lớp, wide, xoay toàn khối; M/E/S giới hạn 3×3 theo quy ước dự án.
- Metrics, predicates solved/cross/F2L, PRNG, scramble tái lập theo seed và các hàm thống kê/scoring.
- Chốt thứ tự ứng viên và quy trình chọn nước scramble genVersion 1 để các bên tái lập giống nhau.
- Chốt single không có lượt hợp lệ hiển thị `-`; trung bình có kết quả DNF hiển thị `DNF`.
- Predicates theo vị trí/tâm hiện tại sau x/y/z, có vector xoay toàn khối để đối chiếu.
- Có unit tests, đối chiếu Python và ranh giới engine không phụ thuộc DOM/Three.js.

Có hàm kiểm tra F2L hoặc tính điểm không đồng nghĩa đã có solver/trainer F2L.

### 2. Rubik 3D và animation — Giai đoạn 3, R0–R6

- Vite + TypeScript, Three.js, hình học tĩnh và tô màu trạng thái N=2..10.
- Geometry renderer lấy vị trí/pháp tuyến/index từ engine; không tạo hệ chỉ số riêng.
- Animation xoay lớp, hàng đợi snapshot và cơ chế hiển thị bắt kịp input.
- Camera, OrbitControls, preset/góc nhìn, zoom và hỗ trợ cảm ứng.
- InstancedMesh cho khối lớn; xử lý mất/khôi phục WebGL context và giải phóng tài nguyên.
- Playwright/Chrome kiểm tra giao diện, WebGL và vòng đời renderer; CI chạy tự động.

Ranh giới giữ nguyên: **controller sở hữu Cube → engine áp nước → renderer nhận snapshot để hiển thị**. Renderer không tự áp engine; `onMoveAnimated` không phải nguồn thời gian.

### 3. Điều khiển bàn phím, chuột và cảm ứng — Giai đoạn 4, I0–I6

- Controller là cửa vào chung cho thao tác; timestamp lấy lúc input, không đợi animation.
- Bàn phím dùng `event.code`: U/R/F/D/L/B; Shift nghịch; Alt đôi; W wide; giữ số chọn lớp; X/Y/Z và M/E/S theo giới hạn engine.
- Tùy chỉnh phím, phát hiện xung đột, nhiều hồ sơ, lưu local và nhập/xuất JSON có validation.
- Chọn sticker, kéo lớp bằng chuột/cảm ứng, tách thao tác xoay camera và pinch zoom.
- Named locks/gate chặn thao tác trước khi mutate, xử lý blur/modal/context và tránh engine lệch hiển thị khi enqueue bị từ chối.
- Nhập JSON sai giữ cấu hình cũ; giới hạn kích thước và kiểm tra dữ liệu trước khi thay.

Alt/Option có thể bị hệ điều hành/trình duyệt giữ lại; cấu hình phím là phương án thay thế khi cần.

### 4. Luyện tập, timer và chỉnh UX — Giai đoạn 5 cùng các chỉnh sửa sau đó

- Timer thuần, inspection, +2/DNF, bản ghi Solve và thống kê single/mo3/ao5/ao12 theo kích thước.
- Giữ origin chính xác; floor chênh lệch timestamp khi ghi. Bàn phím dùng keydown, kéo lớp dùng pointerup.
- Solve gốc bất biến; chỉnh phạt cá nhân là metadata riêng, có khôi phục phạt gốc.
- Khóa thao tác lớp ngoài giai đoạn phù hợp; hộp xác nhận hủy không dừng đồng hồ.
- Bố cục ưu tiên Rubik lớn, scramble rõ ở giữa phía trên, thời gian nhỏ hơn, lịch sử/thành tích ở bên.
- Phím theo góc nhìn bật mặc định; bật **Khóa xoay phím** để dùng hệ trục cố định.
- Web mặc định 40 ms/nước đơn, thanh 30–100 ms; API renderer vẫn có mặc định riêng 150 ms. Nước đôi có hệ số thời lượng riêng.
- Độ nhạy chuột kéo sticker đã giảm, hệ số hiện hành 0,675; camera và touch có xử lý riêng.
- Bỏ các nút demo không còn cần; sắp lại nút scramble/inspection và thanh thao tác cài đặt phím.

Luồng luyện tập hiện tại:

| Trạng thái/thao tác | Hành vi |
| --- | --- |
| Chưa có scramble, bấm Space | Chuẩn bị scramble; chưa inspection |
| Scramble sẵn sàng, bấm Space | Bắt đầu inspection |
| Shift+Space khi chưa chạy | Đổi scramble |
| Nước lớp đầu trong inspection | Bắt đầu solve theo timestamp input |
| Giải xong hợp lệ | Lưu kết quả, tự chuẩn bị scramble mới; chờ Space để inspection |
| Xác nhận hủy lúc lượt còn chạy | Bỏ lượt, tự chuẩn bị scramble mới |
| DNF | Giữ trạng thái để xem; Space tiếp theo chuẩn bị scramble mới |

Ngưỡng inspection luyện tập: đến 15.000 ms không phạt; 15.001..17.000 ms +2; quá 17.000 ms DNF. Không áp luật này sang đồng hồ thi đấu một cách máy móc.

### 5. Lưu local, backup và LAN — Giai đoạn 6

- IndexedDB tự lưu lịch sử; reload vẫn còn nếu ghi thành công và dữ liệu trình duyệt còn giữ.
- Backup JSON có validation/dedup, xuất CSV, xử lý lỗi lưu/quota và lịch sử theo thứ tự.
- Server Node LAN phục vụ web/API cùng nguồn, hồ sơ và kết quả chung trong `lan-data/room.json`.
- Bảng 2×2/3×3, gửi lại khi mất mạng, kiểm tra/replay kết quả và idempotency.
- Backup nhập không mặc nhiên trở thành thành tích mới hợp lệ trên bảng.
- Có kiểm tra API/Chrome LAN và các edge case controller/timer/history.

Máy chạy LAN phải bật; Vercel/Supabase không phụ thuộc laptop của chủ dự án. Danh tính LAN và cloud là hai hệ riêng.

### 6. Backend online, hosting và đồng bộ — Giai đoạn 9 được ưu tiên trước 7–8

- Triển khai Vercel cho web và API Node; Supabase cho Auth/Postgres, schema/migrations trong repo.
- Sửa cấu hình monorepo: build từ gốc repo, build các package trước web, output `apps/web/dist`.
- Phân biệt biến public `VITE_...` với secret backend; không đưa secret vào frontend/Git.
- Backend kiểm tra danh tính, quyền dữ liệu, payload/quota, replay Solve và lưu kết quả.
- Đồng bộ tăng dần, cursor/revision, hàng đợi gửi lại, sửa/xóa và xử lý xung đột; dừng các đợt đồng bộ lịch sử mới khi tab ẩn.
- RLS/quyền SQL, xóa hồ sơ/dữ liệu và các bài kiểm tra API/trình duyệt/database.
- Đã từng có email/mật khẩu/xác nhận email/khôi phục mật khẩu; sau đó chủ dự án yêu cầu bỏ giao diện này.

**Danh tính hiện tại là hồ sơ chỉ đặt tên:** Supabase Anonymous Sign-Ins tạo phiên riêng của trình duyệt; tên phải chưa được dùng. Tên chỉ là nhãn, không phải thông tin đăng nhập. Gõ tên cũ trên thiết bị khác không cấp quyền vào hồ sơ cũ. Không còn luồng đăng nhập đa thiết bị bằng email/mật khẩu trên UI hiện hành; mất phiên/xóa dữ liệu trình duyệt có thể mất cách truy cập hồ sơ đó. Backend vẫn phân quyền bằng phiên, không tin tên hay user ID do body tự chọn.

### 7. Bảng xếp hạng all-time và xác minh — một phần mục tiêu Giai đoạn 10

- PR #26: bảng luyện tập lấy **10 lượt giải tốt nhất mọi thời điểm**, không phải 10 người và không phải chỉ hôm nay.
- Một người có thể xuất hiện nhiều dòng; danh mục 2×2 và 3×3.
- Xếp theo thời gian kết quả gốc hợp lệ; +2 được tính, DNF không thành thành tích nhanh hợp lệ.
- Chỉnh phạt local không làm nhẹ thành tích gốc trên bảng; nguồn dữ liệu và luồng nhập có chính sách riêng.
- Replay xác nhận chuỗi nước/trạng thái và các ràng buộc timestamp; không chứng minh người chơi không dùng solver ngoài hoặc timestamp client hoàn toàn trung thực.

Không tuyên bố đã có hệ thống chống gian lận hoàn chỉnh, Elo hoặc bảng average thi đấu.

### 8. Phòng mời 1v1 — mục 11b

- PR #27: tạo phòng, vào bằng mã/link, sẵn sàng, đồng hồ chung server, xác nhận từng khối và kết quả cuối.
- PR #28: chuyển sang hồ sơ chỉ đặt tên.
- PR #29: ổn định clock/polling trong kiểm tra 1v1.
- PR #30: hai Rubik, **mình bên trái — đối thủ bên phải**, hiển thị trạng thái đối thủ do server replay.
- PR #31: giữ thao tác Sẵn sàng/Bỏ cuộc nếu polling đang bận, tránh nuốt click.
- PR #32: thêm Một mặt bất kỳ; cả ba mode thống nhất **3 phút**.
- Countdown 3 giây → inspection 15 giây đủ thời lượng → running 180 giây → chốt sau ân hạn 3 giây.
- Inspection chỉ cho x/y/z; không bắt đầu sớm bằng nước lớp như luyện tập.
- Server giữ seed, chỉ mở lô scramble theo giai đoạn; không trả seed cho client.
- Khối sau chuyển ngay theo logic input, không chờ animation; khối đang dở hết giờ không tính.
- Điểm: số khối hoàn thành nhiều hơn → mốc hoàn thành khối cuối sớm hơn → tổng số nước tính điểm thấp hơn; bằng hết thì hòa.
- Có retry/ACK/idempotency, cutoff, bỏ cuộc và phục hồi tiến độ local trong giới hạn phiên/phòng.
- Phòng 1v1 có thời hạn 1 giờ; hết hạn có thể không vào/gửi lại được.

Ba mục tiêu dùng chung:

| Mục tiêu | Điều kiện |
| --- | --- |
| full | Giải cả khối 3×3 |
| F2L | Predicate F2L ở một hướng hợp lệ, theo tâm hiện tại |
| 1 mặt | Đủ 9 viên của lớp mặt đúng vị trí; màu cạnh/góc bên hông khớp tâm, không chỉ một mặt đồng màu |

Tiến độ đối thủ là snapshot polling, không phải animation từng nước liên tục. Kết quả 1v1 tách khỏi bảng single luyện tập.

### 9. Tự scramble sau lượt luyện tập

PR #33 cập nhật luyện tập: tự chuẩn bị scramble mới sau hủy hoặc giải xong hợp lệ, giữ trạng thái khi DNF. Bảng thao tác ở mục 4 mô tả hành vi hiện hành, thay các đoạn cũ yêu cầu tự chuẩn bị sau mọi lượt.

### 10. Time Limit — solo theo luật 1v1

PR #34 đã merge, mốc `81c5d0d`:

- Trang `/time-limit.html`, một người chơi, Rubik chính ở giữa và bảng bên phải.
- Ba danh mục **1 mặt / F2L / full**, hiện dùng 3×3.
- Countdown/inspection/running/cutoff/ACK/replay và ân hạn theo 1v1; Space bắt đầu lượt mới khi hợp lệ.
- Server cấp challenge; xác nhận từng khối, lưu phiên riêng; hủy lượt không xếp hạng.
- Bảng riêng cho từng danh mục, Top 10 lượt all-time, có thể lặp người chơi.
- Xếp số khối giảm dần → mốc hoàn thành cuối tăng dần → số nước tăng dần; có khóa phụ ổn định khi bằng hết.
- Chỉ phiên đã hết ân hạn, không bị hủy mới vào bảng; phiên không hoàn thành khối nào vẫn có thể là lượt 0 điểm nếu chạy hết thời gian.
- Bảng/session Time Limit tách lịch sử single và phòng 1v1; migration riêng, quyền backend-only.
- Local draft giúp retry/reload; tab đóng/mất mạng không dừng đồng hồ server.

Đây là phần solo time attack thực tế đã làm; không giữ các thời lượng theo Elo/45 giây trong roadmap cũ làm mô tả sản phẩm hiện tại.

### 11. Sửa độ trễ — PR #35 đã merge

Nhánh `codex/online-latency`: phần sửa chính `487a487`, bổ sung chờ khởi động test CI `2991fc3`; merge vào main tại `871408f`:

- Cấu hình Vercel Functions `icn1` Seoul, cùng vùng Supabase, thay đường API qua Mỹ.
- Chủ động lấy scramble khi hết đếm ngược, không chỉ đợi chu kỳ polling phản hồi rồi chờ thêm 1 giây.
- Phản hồi nút ngay, chống bấm lặp và khôi phục trạng thái khi lỗi; giữ hàng đợi Sẵn sàng/Bỏ cuộc.
- Dựng Rubik trước khi chờ tải hồ sơ.
- Đo cùng thiết bị với API leaderboard không cache: production Mỹ 897–1.108 ms; Preview Seoul 360–423 ms, mỗi bên 3 request. Đây không phải load test hay phép đo mọi thao tác bằng phiên người dùng.
- Local: lint/typecheck/build, 317 unit tests, 2 Time Limit và 11 race tests đạt, gồm kiểm tra Chrome.

Sau merge đã xác nhận production chạy API Seoul và trả 200 cho các trang/API được kiểm tra; CI main `b70d765` đạt sau khi merge cả #35/#36. Đây là kết quả tại thời điểm kiểm tra, không phải cam kết uptime hay độ trễ mọi thao tác.

### 12. Những phần chưa được coi là đã triển khai

Sandbox với undo/redo/cây nhánh đầy đủ; Cross/F2L solver và trainer chuyên dụng; ghost race; matchmaking/Elo; One for all; AI coach. Không có cam kết lịch làm trong tài liệu này.

Chưa có load test để cam kết số người đồng thời, hệ thống phục hồi hồ sơ bằng tên trên máy mới hoặc bộ số đo FPS/latency đầy đủ. Người dùng đã thử nhiều máy/điện thoại và đánh giá xoay 10×10 ổn; không biến đánh giá đó thành benchmark có số liệu.

## C. Kiến trúc và công cụ cần biết khi tham gia

| Đường dẫn | Vai trò |
| --- | --- |
| `packages/engine` | Logic Rubik, parser, geometry, predicates, scramble, statistics/scoring |
| `packages/controller` | Sở hữu Cube, input timestamp, locks/gate và keymap |
| `packages/renderer` | Three.js, camera, animation, snapshot hiển thị |
| `packages/timer` | Timer/history/backup thuần |
| `apps/web` | Vite/TypeScript, DOM UI; không dùng React |
| `shared/race-rules.mjs` | Luật mục tiêu/challenge dùng chung |
| `api` / `server` | Entry Vercel / API, xác minh và test cloud/race/solo |
| `supabase/migrations` / `supabase/tests` | Schema đã version hóa / kiểm tra SQL |
| `tools/lan` / `tools/reference` | Server LAN / reference Python |

Node.js 22.12+ phù hợp yêu cầu Vite hiện hành; CI dùng Node 22. Git để đồng bộ, Chrome cho browser tests, Python cho reference. Không bắt buộc Deno, Docker hoặc tài khoản Vercel/Supabase riêng chỉ để sửa UI/chơi local. Tích hợp database local là công việc thiết lập riêng nếu được giao.

## D. Workflow GitHub cho hai người mới

### 1. Vai trò

- **Chủ repo:** mời collaborator, chốt scope, điều phối file có thể đụng nhau, review/merge và quản lý production/secrets/database.
- **Người nhận việc:** làm trên máy/nhánh riêng, kiểm tra, mở PR, sửa theo review; không tự merge.
- **AI của mỗi người:** chỉ xử lý task được giao; không tự biết chat hoặc file chưa push của AI bên kia. Link issue/PR và commit là thông tin bàn giao chung.
- Ban đầu thống nhất chỉ chủ repo merge. Đây là quy trình làm việc, không mặc nhiên là GitHub đã chặn quyền merge của collaborator bằng ruleset.

### 2. Thiết lập một lần

Chủ repo vào Settings → Collaborators → Add people; bạn chấp nhận lời mời bằng tài khoản GitHub riêng. Không cần fork cho workflow cùng repo này.

Bạn cài Git, Node.js, editor và AI riêng. Mở PowerShell ở thư mục muốn đặt dự án:

```powershell
git clone https://github.com/ngdat24/rubik-web.git
cd rubik-web
git config user.name "Tên của bạn"
git config user.email "Email đã xác minh hoặc noreply lấy từ GitHub Settings/Emails"
npm.cmd ci
npm.cmd run dev
```

Thay nội dung tên/email trước khi chạy. Đăng nhập GitHub khi Git Credential Manager yêu cầu; không dán token/mật khẩu cho AI. Mở URL Vite in trong terminal. `npm.cmd` tránh lỗi Execution Policy của `npm.ps1`; macOS/Linux dùng `npm`.

`npm run dev` không tự chạy API cloud; không coi lỗi `/api/...` trên Vite chưa cấu hình là production hỏng. Có thể làm UI/local trước, kiểm tra online qua Preview được chủ repo cho phép. `npm.cmd run lan` là server LAN riêng, không thay thế 1v1/Time Limit cloud.

### 3. Mỗi việc bắt đầu bằng một Issue

GitHub → Issues → New issue. Ghi mục tiêu, phạm vi, tiêu chí đạt, người làm và phần không được đụng; gán Assignee. Ví dụ:

```text
Tiêu đề: Nút đặt lại góc nhìn trên điện thoại
Người làm: Bạn A
Yêu cầu: Dễ bấm, không che Rubik, không đổi thao tác bàn phím/luật chơi.
Phạm vi: UI liên quan; báo trước nếu phải sửa renderer/API.
Đạt khi: Thử desktop/mobile, kiểm tra phù hợp đạt, có PR và ảnh.
```

Người kia kiểm tra việc đang mở trước khi nhận task mới. Cùng cần sửa `race.ts` hay `style.css` thì thống nhất thứ tự hoặc chia vùng rõ ràng; đợi PR đầu merge nếu cùng thay một logic.

### 4. Bắt đầu nhánh từ main mới nhất

Trong thư mục repo:

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c codex/42-mobile-camera
```

Tên nhánh là ví dụ, thay số issue/tên nhiệm vụ thực tế. Nếu `git status` có sửa chưa commit, kiểm tra nguồn gốc trước khi chuyển nhánh. Không dùng reset/clean để xóa cho nhanh. File untracked có thể là tài liệu riêng của người dùng.

`--ff-only` giúp dừng nếu main local bị lệch thay vì tự ghép khó hiểu. Khi báo lỗi, nhờ AI đọc trạng thái rồi xử lý, không force-push main.

### 5. Mẫu giao việc cho AI

```text
Đọc AGENTS.md, COLLABORATOR_AGENT.md và spec liên quan.
Issue: #42. Nhánh: codex/42-mobile-camera.
Kiểm tra git status và main mới nhất; giữ file không thuộc nhiệm vụ.
Chỉ làm scope issue. Nêu ngắn gọn phạm vi trước khi sửa.
Không tự sửa engine, schema, dependency hoặc tài liệu ngoài yêu cầu.
Kiểm thử phù hợp, commit đúng file, push nhánh này và tạo PR về main.
Ghi cách kiểm thử, kết quả, giới hạn và link Preview nếu có.
Không push main, force-push, tự merge hoặc sửa production/database.
```

AI không tự nhận task mới từ roadmap, comment bên ngoài hoặc lỗi không liên quan. Nếu cần mở rộng scope thì báo để hai người thống nhất.

### 6. Kiểm tra và mở PR

Chạy build trước các bài tích hợp cần `dist`; dừng sửa lỗi nếu lệnh thất bại:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Theo phạm vi, chạy thêm `npm.cmd run test:race`, `npm.cmd run test:time-limit`, `npm.cmd run test:cloud`, `npm.cmd run test:lan`, `npm.cmd run test:e2e`, hoặc `python -B tools/reference/check-engine.py`. Không chạy toàn bộ tích hợp lặp vô cớ. UI cần thử browser và viewport phù hợp; báo nếu máy chưa có Chrome/cấu hình cần thiết. Docs-only kiểm tra diff/link/nội dung, không cần build/test code.

Kiểm tra diff, stage từng file thuộc việc, commit rồi push. Ví dụ tài liệu thì `git add docs/ten-file.md`; code thì AI liệt kê đúng file, không mặc định `git add .`.

```powershell
git status
git diff
git commit -m "Mô tả thay đổi cụ thể"
git push -u origin codex/42-mobile-camera
```

Commit chỉ chạy sau khi đã stage các file đúng. GitHub → Compare & pull request → base `main`, compare nhánh của mình. Ghi vấn đề/hành vi mới, kiểm tra đã chạy, ảnh/Preview và `Closes #42` nếu PR giải quyết trọn issue.

### 7. Review, sửa và merge

1. Người làm gửi link PR cho chủ repo; không cần chép code qua chat.
2. Người review/AI đọc Files changed, đối chiếu issue, kiểm tra tác động và thử Preview.
3. Nếu cần sửa, người làm commit/push tiếp trên **cùng nhánh**; PR tự cập nhật.
4. Chờ check cần thiết xanh, không còn conflict/nhận xét chưa giải quyết, chủ repo xác nhận hành vi.
5. Chủ repo bấm Merge hoặc giao AI merge **đúng PR đó**. Quyền merge PR cũ không áp dụng tự động cho PR mới.
6. Kiểm tra Actions trên main, Vercel đúng commit/READY và thử nhanh production; READY không thay cho kiểm tra API/data flow.

Hai PR không khó merge nếu phạm vi tách biệt. Merge A trước, cập nhật B từ main mới và kiểm tra B lại; không merge cả hai chỉ vì từng PR từng xanh trên main cũ.

### 8. Cập nhật nhánh đang làm khi main đổi

Commit công việc hiện tại trên nhánh mình trước; nếu chưa rõ file nào thuộc ai, hỏi/kiểm tra trước. Sau đó:

```powershell
git fetch origin
git switch codex/42-mobile-camera
git merge origin/main
```

Không conflict: kiểm tra lại phần liên quan, push lên cùng PR. Có conflict: nhờ AI đọc cả hai mục đích, ghép từng phần, kiểm tra dấu conflict và chạy kiểm tra rồi mới stage/commit/push. Không chọn toàn bộ ours/theirs để cho qua.

Nếu merge đang dở và chưa biết cách xử lý, có thể yêu cầu AI kiểm tra rồi `git merge --abort` để quay về trước lần merge đó; không chạy mù khi chưa rõ trạng thái. Không force-push để giải quyết conflict thông thường.

Không conflict văn bản vẫn có thể lỗi logic, ví dụ một PR đổi API còn PR kia gọi tên cũ. Git không tự hiểu hợp đồng tính năng.

### 9. Sau merge và bàn giao cuối buổi

Khi không còn sửa chưa lưu, cả hai về main và cập nhật:

```powershell
git status
git switch main
git pull --ff-only origin main
```

Dependency/lockfile đổi thì chạy `npm.cmd ci`. Tạo nhánh mới cho task mới, không tiếp tục nhánh đã merge. Khi xóa nhánh, dùng thao tác an toàn và chỉ xóa nhánh đã xác nhận không còn việc; không cần ép xóa chỉ để dọn.

Cuối buổi ghi trong issue/PR: nhánh, commit đã push, đã làm gì, kiểm tra nào đạt/chưa chạy, việc còn lại và file có thể ảnh hưởng người kia. Không cần tự tạo Markdown cho mọi cập nhật.

### 10. Secrets, database và Preview

- Không commit `.env`, secret/service-role key, token, `lan-data`, node_modules, dist hay log/test-results. Dùng `.env.example` làm danh sách tên biến, không chép giá trị thật vào PR.
- Public/publishable key có thể dùng trong frontend theo thiết kế; secret backend tuyệt đối không prefix `VITE_`.
- Không tự chạy migration trên Supabase chung; migration tạo mới/review/test/applied version phải do chủ repo điều phối. Rollback code không tự rollback schema/data.
- Preview hiện dùng chung Supabase với production: không mặc định an toàn để xóa tài khoản, đổi schema, tạo điểm giả hoặc sửa dữ liệu thật. Kiểm tra dữ liệu dùng fixture rollback/môi trường riêng khi được giao.
- Profile dựa trên phiên/origin; Preview có thể cần tên khác. Không xóa dữ liệu trình duyệt production chỉ để thử đăng ký lại.
- Preview có thể bị Vercel Authentication bảo vệ; dùng tài khoản/link chia sẻ tạm được chủ repo cấp, không tự tắt bảo vệ toàn project.
- Vercel có điều kiện triển khai theo repo/tác giả/quyền. Public repo có hỗ trợ cộng tác miễn phí; Hobby hạn chế cộng tác private. Kiểm tra deployment đầu tiên của bạn và thông báo thực tế; không giả tác giả commit thành chủ repo. [Tài liệu Vercel](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).

### 11. Bước khởi động cho hai người

Chủ repo mời collaborator và chọn một issue UI nhỏ. Bạn clone, chạy local, nhận task, mở PR. Chủ repo review, bạn sửa, rồi chủ repo merge và kiểm tra web. Hoàn thành một vòng trước khi chia nhiều task song song. File [COLLABORATOR_AGENT.md](../COLLABORATOR_AGENT.md) là hướng dẫn đưa cho AI của người bạn.

## E. Chỉ mục bàn giao

- Quy ước áp dụng trong repo: [AGENTS.md](../AGENTS.md).
- Spec: [docs/spec](spec/), đặc biệt timer/input/data contract; nhật ký [decisions.md](spec/decisions.md).
- Hướng dẫn người mới: [collaborator-getting-started.md](collaborator-getting-started.md).
- PR quan trọng: [#26](https://github.com/ngdat24/rubik-web/pull/26), [#27](https://github.com/ngdat24/rubik-web/pull/27), [#28](https://github.com/ngdat24/rubik-web/pull/28), [#30](https://github.com/ngdat24/rubik-web/pull/30), [#31](https://github.com/ngdat24/rubik-web/pull/31), [#32](https://github.com/ngdat24/rubik-web/pull/32), [#33](https://github.com/ngdat24/rubik-web/pull/33), [#34](https://github.com/ngdat24/rubik-web/pull/34), [#35](https://github.com/ngdat24/rubik-web/pull/35), [#36](https://github.com/ngdat24/rubik-web/pull/36), [#38](https://github.com/ngdat24/rubik-web/pull/38).
- GitHub giải thích conflict: [Merge conflicts](https://docs.github.com/en/pull-requests/reference/merge-conflicts).

Nếu đọc sau ngày đối chiếu, fetch và xem PR/main/deployment hiện hành trước khi coi các số commit, trạng thái PR hoặc số test là còn mới.
