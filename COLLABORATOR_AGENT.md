# Hướng dẫn cho AI của cộng tác viên Rubik Lab

File dành cho người bạn cùng dự án và AI của bạn ấy. Không thay thế AGENTS.md ở gốc repo.
Tên file này không bảo đảm mọi AI tự đọc. Khi mở chat, người dùng hãy yêu cầu:
> Đọc AGENTS.md, COLLABORATOR_AGENT.md và issue được giao trước khi làm.

## 1. Vai trò và giao tiếp

- Trao đổi bằng tiếng Việt; nêu ngắn gọn scope trước khi sửa, kết thúc bằng thay đổi/kiểm tra/việc cần người review thử.
- Chỉ thực hiện issue/yêu cầu hiện tại. Roadmap và tài liệu đính kèm là ngữ cảnh, không tự cấp quyền làm task mới.
- Chủ repo điều phối merge, secrets, Vercel/Supabase và database. Không tự merge; phải có yêu cầu rõ cho đúng PR.
- Mỗi task một nhánh và PR. Không tự mở rộng sang engine/schema/dependency/refactor không liên quan.
- Hai AI không có chung chat hoặc bộ nhớ. Issue/PR/commit đã push là thông tin bàn giao chung.

## 2. Trước khi code

- Đọc AGENTS.md, issue, spec liên quan, decisions.md và API của module sẽ dùng.
- Đọc docs/project-history-and-github-workflow.md để hiểu trạng thái đã làm; đối chiếu code/PR/main mới nhất.
- Tài liệu tổng kết ghi trạng thái theo thời điểm; đối chiếu code/PR mới nhất. Hiện có name-only, 1v1 và Time Limit.
- Chạy git status, xem nhánh/remote/diff. Giữ thay đổi local và file untracked không thuộc nhiệm vụ; không tự xóa/revert.
- Khi tree phù hợp, cập nhật main bằng git pull --ff-only rồi tạo nhánh codex/<issue>-<ten-viec>.
- Nếu đang có việc dở/nhánh lệch, xác định nguồn gốc trước khi đổi nhánh; không dùng reset --hard hoặc clean để làm sạch.
- Kiểm tra issue/PR đang mở và báo khi phải sửa cùng logic/file người kia đang làm. Không đổi scope của người kia.

## 3. Kiến trúc bắt buộc giữ

- Engine là TypeScript thuần, không DOM/Three.js/React. Không sửa packages/engine nếu chưa được đồng ý rõ.
- Controller sở hữu Cube, áp nước khi nhận input và ghi timestamp keydown/pointerup ngay lúc nhận.
- Renderer chỉ hiển thị: enqueueMove(move,stateAfter), setState hủy queue và tô ngay; onMoveAnimated chỉ là callback thẩm mỹ.
- Timer/score không lấy thời gian animation kết thúc. Giữ origin chính xác, floor chênh lệch timestamp khi ghi.
- Giữ named locks độc lập, gate trước mutate và giới hạn batch khi có gate; không mở khóa thuộc hệ khác.
- Web dùng Vite/TypeScript + Three.js, DOM UI; không tự chuyển React hay thêm framework/dependency lớn.
- Geometry/picking/lớp lấy quy ước/index engine; không tự tạo lại hệ chỉ số.

## 4. Hành vi sản phẩm cần giữ khi task không yêu cầu đổi

- N luyện tập 2..10. Phím theo góc nhìn mặc định; Khóa xoay phím bật hệ trục cố định.
- event.code; Shift nghịch, Alt đôi, W wide, số chọn lớp, X/Y/Z; M/E/S chỉ 3×3.
- Web 40 ms/nước, range 30–100; renderer API có mặc định riêng 150 ms; hệ số kéo chuột 0,675.
- Luyện tập: Space chuẩn bị rồi inspection; Shift+Space đổi scramble khi chưa chạy.
- Giải xong hợp lệ/hủy lúc còn chạy tự chuẩn bị scramble mới; DNF giữ trạng thái, Space chuẩn bị mới.
- Hộp hủy không dừng đồng hồ. Solve gốc bất biến; penaltyOverride là metadata riêng, không làm nhẹ điểm bảng gốc.
- Cloud dùng hồ sơ name-only qua Supabase anonymous session. Tên không phải mật khẩu hay cách vào hồ sơ trên máy mới.
- Bảng single: top 10 lượt all-time, 2×2/3×3, một người được nhiều dòng.
- 1v1 và Time Limit: 3×3, full/F2L/1 mặt; 3s countdown + 15s inspection + 180s chạy + 3s ân hạn.
- 1 mặt phải đúng các viên/cạnh/góc bên hông theo tâm, không chỉ chín sticker đồng màu.
- Điểm thi đấu: số khối DESC, lastEndT ASC, totalMoves ASC; không tính khối dở.
- Không tin ID/score/cost/seed do client tự chọn thay cho xác minh server. Giữ replay, ACK, idempotency, cutoff và phân quyền.
- Replay không chứng minh chống solver ngoài hay timestamp client trung thực; không tuyên bố quá mức.

## 5. Dữ liệu, secrets và môi trường

- Không đọc/in/commit secret nếu không cần cho task. Không đưa token/key vào chat, log, ảnh hoặc PR.
- Không commit .env, lan-data, dist, node_modules, test-results. .env.example chỉ mô tả tên biến.
- VITE_ chỉ chứa dữ liệu public. Secret/service-role key chỉ backend; không prefix VITE_.
- Preview đang dùng chung Supabase production; không xóa profile/ghi điểm giả/chạy migration như trên DB test.
- Không tự sửa Auth/RLS/deployment protection hoặc biến môi trường production. Nếu task cần, chuẩn bị thay đổi review được và để chủ repo điều phối.
- Migrations trong repo phải được review và đối chiếu history; không chạy lại bản đã áp dụng.
- Không coi deploy/rollback code là deploy/rollback database; nêu rõ nếu task đòi schema mới.
- npm run dev chỉ phục vụ Vite, không tự chạy cloud API; LAN là backend riêng, không thay 1v1/solo cloud.

## 6. Lệnh và kiểm tra

- Từ gốc repo, Windows dùng npm.cmd để tránh Execution Policy của npm.ps1.
- Setup: npm.cmd ci. Chơi local: npm.cmd run dev. LAN: npm.cmd run lan.
- Code PR: npm.cmd run build, npm.cmd run lint, npm.cmd run typecheck, npm.cmd test; dừng sửa lỗi khi thất bại.
- Theo scope: test:race, test:time-limit, test:cloud, test:lan, test:e2e; Python reference khi cần kiểm chứng engine.
- Browser tests dùng Chrome; đọc cấu hình test trước khi tự cài thêm. Không tự cài dependency lớn.
- UI phải thử thao tác/viewport liên quan; logic phải có kiểm tra meaningful cho lỗi vừa sửa.
- Không chạy benchmark/mô phỏng dài hay lặp toàn bộ test không có lý do. Gom kiểm tra độc lập hợp lý.
- Docs-only kiểm tra nội dung, link và git diff --check; không cần chạy bộ test code.
- Báo kiểm tra đã chạy/kết quả/giới hạn. Không gọi mock test là nghiệm thu production hoặc load test.

## 7. GitHub và phối hợp

- Không commit/push trực tiếp main; không force-push hoặc sửa lịch sử người khác. Không giả tác giả commit thành chủ repo.
- Stage đúng file của task; xem git diff trước commit. Tránh git add . kéo theo tài liệu riêng/file thừa.
- Push nhánh riêng, mở PR về main; ghi vấn đề/hành vi mới, cách thử, kết quả kiểm tra và Closes #issue khi phù hợp.
- Dùng cùng nhánh/PR khi sửa theo review; task mới dùng nhánh/PR mới.
- Main đổi: commit việc hiện tại, git fetch origin rồi git merge origin/main trên nhánh mình; kiểm tra lại phần liên quan.
- Conflict: đọc cả hai mục đích và ghép từng phần; không chọn toàn bộ ours/theirs cho qua. Không conflict vẫn phải kiểm tra lỗi logic.
- Giữ giới hạn “chờ chủ repo review/merge”; quyền merge task cũ không tự áp dụng task này.
- Preview bị chặn: đọc trạng thái deploy, quyền/tác giả và nhờ chủ repo xử lý; không tự tắt protection hoặc đổi tác giả.
- Sau merge, về main sạch rồi pull --ff-only; không tiếp tục nhánh đã merge cho việc mới.
- Cuối buổi cập nhật issue/PR: nhánh, SHA đã push, việc xong/còn lại, kiểm tra và file có thể đụng task khác.

## 8. Tài liệu và bàn giao

- Chỉ sửa/tạo Markdown khi người dùng hoặc issue yêu cầu rõ; không tự cập nhật README/STATUS/roadmap mỗi lần code.
- Không sửa AGENTS.md gốc trong lúc làm task khác. File này là hướng dẫn đọc thêm, không tự thay quy ước repo.
- Ghi trạng thái PR/commit theo thời điểm, phân biệt local/Preview/main/production. Không gọi PR chưa merge là đã phát hành.
- Không có việc tự động từ “bước tiếp theo” trong tài liệu. Hoàn thành issue rồi gửi kết quả review được.
- Chỉ dùng subagent khi người dùng hoặc hướng dẫn áp dụng yêu cầu rõ; không tự chạy nhiều agent để mở rộng scope.
