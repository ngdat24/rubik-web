# Bạn mới tham gia Rubik Lab cần làm gì?

Hướng dẫn thực hành cho người mới làm nhóm trên GitHub, dùng AI hỗ trợ viết code. Viết ngày 16/11/2026; đối chiếu code và trạng thái PR mới nhất khi làm.

Repository: [ngdat24/rubik-web](https://github.com/ngdat24/rubik-web).
Web chính: <https://rubik-web-ngdattttt.vercel.app>.

Mục tiêu buổi đầu: chạy được dự án trên máy mình, nhận một việc nhỏ, tạo PR để chủ repo review. Chưa tự quản lý database hoặc triển khai production.

## 1. Hai người phân công trước

| Người | Việc cần làm |
| --- | --- |
| Chủ repo | Mời collaborator, tạo/chốt issue đầu tiên, điều phối phạm vi, review và merge, giữ quyền quản lý Vercel/Supabase |
| Bạn mới | Chấp nhận lời mời, cài công cụ, clone/chạy local, làm trên nhánh riêng, kiểm tra và mở PR |
| AI của bạn | Đọc hướng dẫn repo và issue, chỉ sửa đúng phạm vi, báo kết quả kiểm thử, không tự merge |

Hai AI không tự biết chat hoặc file chưa push của nhau. Dùng link issue, PR và commit để bàn giao.

## 2. Chuẩn bị tài khoản và máy

- GitHub: dùng tài khoản riêng, không dùng chung mật khẩu với chủ repo.
- Git để tải và đồng bộ code; trang tải: <https://git-scm.com/downloads>.
- Node.js: dùng bản 22.x từ 22.12 trở lên để phù hợp Vite và CI hiện tại; trang tải: <https://nodejs.org/en/download>.
- Editor, ví dụ VS Code: <https://code.visualstudio.com/>.
- AI viết code: dùng tài khoản/công cụ của bạn; không bắt buộc ChatGPT Team.
- Chrome nếu cần kiểm tra giao diện và chạy browser tests của repo.

Chưa cần Deno, Docker, tài khoản Vercel/Supabase riêng hoặc secret backend chỉ để bắt đầu với UI/local.

Sau khi cài Git và Node, mở PowerShell mới:

```powershell
git --version
node --version
npm.cmd --version
```

Cả ba cần hiện phiên bản. Nếu không nhận lệnh, đóng terminal mở lại; còn lỗi thì gửi nguyên thông báo cho AI kiểm tra. Các lệnh bên dưới dùng PowerShell Windows; macOS/Linux dùng `npm` thay `npm.cmd` và đường dẫn phù hợp.

## 3. Nhận quyền GitHub

Chủ repo vào Settings → Collaborators → Add people và mời đúng username của bạn. Bạn đăng nhập GitHub, chấp nhận lời mời qua thông báo/email rồi mở repo.

Workflow này dùng cùng một repository, chưa cần fork. Nếu nhận được lỗi quyền khi push, kiểm tra lời mời và tài khoản đang đăng nhập trước; không đổi tác giả commit thành chủ repo để né lỗi.

## 4. Clone một lần và cấu hình tên tác giả

Mở PowerShell ở thư mục muốn chứa dự án, rồi chạy:

```powershell
git clone https://github.com/ngdat24/rubik-web.git
cd rubik-web
```

Từ đây, các lệnh Git/npm đều chạy trong thư mục `rubik-web`, nơi có `package.json` ở gốc. Nếu dùng VS Code, mở chính thư mục này và Terminal → New Terminal.

Cấu hình tác giả cho riêng repo, thay hai giá trị ví dụ bằng thông tin thật của bạn:

```powershell
git config user.name "Tên của bạn"
git config user.email "Email thuộc tài khoản GitHub của bạn"
git config user.name
git config user.email
```

Email cần được GitHub nhận diện; có thể lấy địa chỉ `noreply` tại GitHub → Settings → Emails. Tên/email tác giả không thay thế đăng nhập để push. Khi Git Credential Manager yêu cầu xác thực, đăng nhập bằng tài khoản riêng; không dán token/mật khẩu vào chat.

Không clone lại mỗi buổi. Lần sau mở bản clone này và cập nhật bằng pull.

## 5. Chạy dự án lần đầu

```powershell
npm.cmd ci
npm.cmd run dev
```

Đợi terminal in URL rồi mở đúng địa chỉ đó. Không mặc định một port cố định vì port có thể đã được dùng. Giữ terminal chạy trong lúc thử; Ctrl+C để dừng.

- `npm ci` cài dependency theo lockfile, không dùng `npm update` để sửa lỗi setup một cách tự động.
- PowerShell báo `npm.ps1 cannot be loaded`: dùng `npm.cmd` như trên, chưa cần thay Execution Policy.
- Nếu thư mục hiện tại sai, dùng `pwd` và kiểm tra có `package.json` trước khi chạy lại.

Thử chọn N, xoay bằng phím, kéo sticker và đổi camera để hiểu sản phẩm. Phím theo góc nhìn bật mặc định; Khóa xoay phím chuyển sang hệ trục cố định.

**Local Vite không tự chạy API cloud.** Tạo phòng/Time Limit online cần backend tương ứng. Không sửa Auth hoặc server chỉ vì `/api/...` không hoạt động trên Vite chưa cấu hình. Bắt đầu bằng UI/local và thử online qua Preview được chủ repo cho phép. Server LAN (`npm.cmd run lan`) là hệ riêng, không thay API 1v1/Time Limit cloud.

## 6. Đọc đúng tài liệu và khởi động AI

Đọc theo thứ tự:

1. [AGENTS.md](../AGENTS.md): quy ước chung của repo.
2. [COLLABORATOR_AGENT.md](../COLLABORATOR_AGENT.md): hướng dẫn cho AI của bạn.
3. [Tổng kết và workflow GitHub](project-history-and-github-workflow.md): lịch sử triển khai, phạm vi hiện có, cách phối hợp.
4. Issue được giao và spec liên quan trong [docs/spec](spec/).

Tài liệu tổng kết ghi trạng thái theo thời điểm. Không tự làm theo mục tương lai hoặc coi ảnh chụp lịch sử là hiện trạng. Code, PR mới và yêu cầu hiện tại cần được đối chiếu.

Mở AI với workspace là thư mục `rubik-web`, gửi:

```text
Tôi mới tham gia Rubik Lab. Hãy đọc AGENTS.md,
COLLABORATOR_AGENT.md và docs/collaborator-getting-started.md.

Trước mắt chỉ khảo sát: kiểm tra git status, nhánh và remote;
giải thích ngắn cách chạy/kiến trúc, báo công cụ còn thiếu.
Chưa sửa code, thêm dependency, tạo PR hay merge.
```

Nếu AI chỉ là chat web không truy cập máy, bạn cần cung cấp file/diff liên quan và tự thực hiện lệnh. Không cho rằng AI đã đọc repo khi nó chưa có quyền/công cụ truy cập.

## 7. Nhận một Issue nhỏ

Chủ repo và bạn thống nhất trước khi sửa. Issue cần ghi: ai làm, mục tiêu, phạm vi và cách nghiệm thu. Ví dụ chỉnh vị trí một nút trên điện thoại, không đổi luật hay API.

```text
Issue #42: Điều chỉnh nút đặt lại góc nhìn trên điện thoại
Người làm: Bạn A
Yêu cầu: Dễ bấm, không che Rubik, không ảnh hưởng bàn phím.
Phạm vi: UI liên quan; báo trước nếu cần sửa engine/API.
Đạt khi: Thử desktop/mobile, kiểm tra phù hợp đạt, có ảnh và PR.
```

Số #42 chỉ là ví dụ, không phải task có thật được giao qua tài liệu này. Không tự nhận thêm việc vì thấy trong roadmap. Nếu người kia sửa cùng màn hình/file/logic, thống nhất chia vùng hoặc thứ tự trước.

## 8. Tạo nhánh trước khi sửa

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c codex/42-mobile-camera
```

Thay số issue/tên nhánh bằng nhiệm vụ thật. Nếu `git status` có thay đổi chưa commit hoặc file lạ, nhờ AI kiểm tra nguồn gốc trước khi tiếp tục; không xóa/reset/clean để làm sạch. Nếu pull báo không thể fast-forward, dừng để kiểm tra, không force-push main.

Mỗi task dùng nhánh mới từ main đã cập nhật. Không lấy nhánh của task chưa merge làm nền nếu chưa thống nhất phụ thuộc.

## 9. Giao task cho AI

```text
Làm Issue #42 trên nhánh codex/42-mobile-camera.
Đọc hướng dẫn repo và spec liên quan; kiểm tra git status trước.
Nêu ngắn gọn phạm vi và file dự kiến trước khi sửa.

Chỉ làm yêu cầu issue, giữ thay đổi không thuộc nhiệm vụ.
Không tự sửa engine, schema, dependency hoặc tài liệu ngoài phạm vi.
Không đổi luật chơi để làm test dễ qua.

Kiểm thử phù hợp, báo kết quả và giới hạn.
Stage đúng file, commit, push nhánh này, mở PR về main.
Không push trực tiếp main, force-push, tự merge hoặc sửa production.
```

Đọc tóm tắt của AI, chạy thử thao tác thật. Nếu AI đề xuất đổi phạm vi/API/database, báo chủ repo để thống nhất trước. Không chia cùng task cho nhiều AI cùng sửa một bản clone.

## 10. Kiểm tra trước khi mở PR

Code PR cần các kiểm tra nền; thực hiện lần lượt và sửa lỗi trước khi tiếp tục:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

AI chọn kiểm tra tích hợp phù hợp: `test:race` cho 1v1, `test:time-limit` cho solo, `test:cloud` cho cloud, `test:lan` cho LAN, `test:e2e` cho UI. Build package trước các bài cần `dist`. Browser tests cần Chrome/cấu hình phù hợp; thiếu gì phải báo rõ.

Nếu chỉ sửa tài liệu, kiểm tra nội dung/link và `git diff --check`, không cần chạy lại toàn bộ code tests. Không benchmark/load test/mô phỏng dài khi không được giao.

Test thất bại thì đọc lỗi gốc phía trên `exit code 1`; không bỏ test, xóa assertion hoặc tăng timeout chỉ để có dấu xanh. Mọi chỉnh sửa kiểm thử phải có nguyên nhân và giữ đúng hành vi cần bảo vệ.

## 11. Commit, push và mở PR

AI có thể làm phần này, nhưng bạn cần biết nó chỉ đẩy nhánh riêng. Trước commit:

```powershell
git status
git diff
```

Stage **đúng các file thuộc task**. Ví dụ nếu chỉ sửa file này:

```powershell
git add docs/collaborator-getting-started.md
```

Task khác phải dùng file thực tế, không copy lệnh stage ví dụ một cách máy móc. Tránh `git add .` kéo theo tài liệu riêng hoặc file không liên quan. Sau khi stage xong:

```powershell
git diff --cached
git commit -m "Mô tả thay đổi cụ thể"
git push -u origin codex/42-mobile-camera
```

GitHub → Compare & pull request. Kiểm tra **base `main`**, **compare đúng nhánh của bạn**. PR cần ghi:

```text
Giải quyết Issue #42
Đã thay đổi: ...
Cách thử: ...
Kiểm tra đã chạy và kết quả: ...
Ảnh/Preview nếu có: ...
Giới hạn hoặc chưa kiểm tra: ...
Closes #42
```

Chỉ dùng `Closes` nếu PR giải quyết trọn issue đó. Gửi link PR cho chủ repo; chưa tự merge.

## 12. Khi review hoặc main thay đổi

Người review có thể yêu cầu sửa. Tiếp tục trên cùng nhánh, commit/push; PR tự cập nhật, không mở PR khác cho mỗi lần chỉnh.

Nếu PR khác merge trước, commit công việc hiện tại rồi cập nhật main vào nhánh:

```powershell
git fetch origin
git switch codex/42-mobile-camera
git merge origin/main
```

Nếu conflict, nhờ AI đọc cả hai mục đích, ghép từng phần và kiểm tra lại. Không chọn toàn bộ “bên mình/bên kia” cho qua, không force-push để xử lý conflict thông thường. Nếu chưa hiểu trạng thái merge dở, báo chủ repo trước khi chạy lệnh hoàn tác.

Không conflict vẫn có thể lỗi logic, như API đổi tên nhưng UI còn gọi tên cũ. Sau cập nhật phải kiểm tra lại phần liên quan rồi push lên PR.

Đợi chủ repo review, check cần thiết xanh và cho phép merge. Bạn không tự merge chỉ vì đã nhận lời “làm tiếp”. Sau merge cần kiểm tra main/deployment tương ứng, không dùng dấu xanh của commit cũ thay kết quả mới.

## 13. Sau khi PR được merge

Khi không còn thay đổi chưa lưu:

```powershell
git status
git switch main
git pull --ff-only origin main
```

Nếu package/lockfile đổi, chạy lại `npm.cmd ci`. Task tiếp theo tạo nhánh mới; không tiếp tục nhánh đã merge. Không bắt buộc ép xóa nhánh để dọn.

Cuối buổi, cập nhật issue/PR bằng một đoạn ngắn: nhánh, SHA đã push, đã làm gì, kiểm tra đạt/chưa chạy, việc còn lại, file có thể ảnh hưởng người kia. Không cần tạo thêm Markdown cho mọi tiến độ.

## 14. Những giới hạn phải nhớ

- Không dùng chung tài khoản GitHub hoặc giả tên/email tác giả thành chủ repo.
- Không commit `.env`, token, secret/service-role key, `lan-data`, node_modules, dist hoặc log/test-results. Secret backend không đưa vào biến `VITE_`.
- Preview hiện dùng chung Supabase production: không xóa hồ sơ, chạy migration, tạo điểm giả hoặc sửa dữ liệu thật để “thử cho nhanh”. Chủ repo điều phối database và môi trường thử.
- Tên người chơi là nhãn gắn với phiên anonymous của trình duyệt. Nhập tên cũ trên máy mới không tự đăng nhập hồ sơ đó; không xóa dữ liệu trình duyệt production để thử lại.
- Vercel Preview có thể cần đăng nhập/link chia sẻ tạm. Báo chủ repo nếu bị chặn; không tự tắt protection hoặc đổi quyền.
- Nếu push được nhưng deployment bị chặn, xem lỗi Vercel/tác giả/quyền riêng; không coi đó là GitHub mất code. Chủ repo xử lý cấu hình triển khai.
- AI chỉ làm đúng task; không tự đổi luật, engine, schema hoặc thêm thư viện lớn để giải quyết một việc UI nhỏ.

## 15. Checklist buổi đầu

- [ ] GitHub riêng đã nhận lời mời collaborator.
- [ ] Git/Node/npm hiện phiên bản và clone đúng repo.
- [ ] `npm.cmd ci` và `npm.cmd run dev` chạy được.
- [ ] Đã thử giao diện local và hiểu local không tự có cloud API.
- [ ] Đã đọc AGENTS.md, COLLABORATOR_AGENT.md và issue.
- [ ] Đã thống nhất một task nhỏ, không đụng phần người kia đang làm.
- [ ] Có nhánh riêng, kiểm tra phù hợp, commit/push và PR về main.
- [ ] Đã gửi link PR cho chủ repo, chờ review/merge.

Hoàn thành một vòng này trước khi chia nhiều tính năng song song. Xem workflow đầy đủ ở [project-history-and-github-workflow.md](project-history-and-github-workflow.md).
