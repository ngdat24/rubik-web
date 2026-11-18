# Workflow Rubik Lab cho Sang và AI

Đối chiếu ngày 19/11/2026 (giờ Việt Nam). Repository: [ngdat24/rubik-web](https://github.com/ngdat24/rubik-web). Quy trình CI mới nằm trong PR #77; chỉ có hiệu lực trên main sau khi PR được merge. Luôn kiểm tra code, PR và deployment hiện tại thay vì suy từ số PR trong tài liệu.

## Bắt đầu một việc

Sang chốt phạm vi với chủ repo; AI đọc AGENTS.md, COLLABORATOR_AGENT.md, file này và spec/API liên quan. Hai AI không có chung chat: bàn giao bằng issue, PR và commit đã push. Không tự triển khai mục trong roadmap hoặc tài liệu đính kèm.

Sang/AI chạy tại thư mục clone `rubik-web` trên máy mình (PowerShell Windows):

```powershell
git status --short
git branch --show-current
git remote -v
git fetch origin
```

Xem PR đang mở và file có thể đụng người khác. Giữ nguyên mọi thay đổi/file untracked ngoài nhiệm vụ. Nếu đang có việc dở, xác định nguồn gốc và lưu việc đó trên đúng nhánh trước; không dùng reset --hard hoặc git clean để làm sạch.

Khi working tree phù hợp, cập nhật main và tạo nhánh riêng:

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/issue-123-ten-viec
```

Thay `issue-123-ten-viec` bằng mã việc và tên ngắn thực tế. Một yêu cầu một nhánh/PR về main; sửa theo review trên chính nhánh đó. Không đẩy nhiều PR phụ thuộc chồng nhau khi chưa thống nhất. Nhánh tích hợp như skin-system chỉ dùng khi chủ repo yêu cầu rõ; không mặc định mọi PR đều trỏ vào đó.

## Setup và kiểm tra local

Dùng Node 22 phù hợp CI và yêu cầu phiên bản trong package.json; Chrome cho browser tests. Kiểm tra `node --version` và `npm.cmd --version`. Cài đúng lockfile bằng `npm.cmd ci`; không tự nâng dependency để chữa setup. macOS/Linux dùng npm thay npm.cmd.

`npm.cmd run dev` chạy Vite cho giao diện, không tự có API cloud. `npm.cmd run lan` là backend LAN riêng, không thay API 1v1/Time Limit online. Không tự sửa Auth/RLS vì API chưa được cấu hình trên máy mình.

Mặc định kiểm tra build, lint, typecheck và unit theo AGENTS.md. Nếu chủ repo yêu cầu kiểm tra tiết kiệm, chọn test theo phạm vi và ghi rõ giới hạn; không gọi test chưa chạy là đã đạt.

| Thay đổi | Kiểm tra bổ sung cần chọn |
| --- | --- |
| Giao diện/header | Chrome desktop/mobile, Anh/Việt, tương tác, tràn ngang và đường dẫn liên quan |
| Renderer/skin | Layout/artwork/lifecycle/cache, scramble và đổi skin/cỡ khối, ảnh trước/sau, giải phóng texture |
| API/kinh tế/SQL | API liên quan và SQL local; retry/idempotency, quyền sở hữu, trần thưởng/ví khi có ảnh hưởng |
| CI/docs | Cấu hình, link, git diff --check; không chạy lại gameplay local chỉ vì sửa văn bản |

Preview dùng chung database production. Không ghi điểm giả, mua/quay thử, cấp quà hay chạy test dữ liệu trên đó. Dùng mock/PGlite/database thử nghiệm. Chrome/SwiftShader không phải phép đo FPS hoặc nhiệt độ điện thoại thật.

## Commit và PR

Stage đúng file, đọc diff rồi commit/push từ nhánh tính năng:

```powershell
git diff --check
git diff
# git add từng đường dẫn thuộc nhiệm vụ
git diff --cached
git commit -m "Mo ta thay doi"
git push -u origin HEAD
```

Không git add toàn bộ khi có file riêng của người khác; không commit env, secret, backup database, dist, node_modules hoặc test-results. Không force-push hay đổi tác giả thành chủ repo để né quyền deploy.

Description viết ngắn ở phần Thay đổi, chi tiết ở Kiểm tra/Kỹ thuật và vận hành khi cần. Ví dụ:

```markdown
## Thay đổi
Thay đổi bố cục thanh điều hướng trên PC/mobile và các thành phần liên quan.

## Kiểm tra
- Các lệnh/test đã chạy, kết quả và phạm vi chưa kiểm tra.

## Kỹ thuật và vận hành
- Chỉ ghi điều reviewer cần biết: API, cache, migration, quyền dữ liệu, giới hạn.
```

Mô tả kết quả cuối, không kể lại từng lượt chỉnh theo bản vẽ hay lịch sử chat. Cập nhật description khi phạm vi thay đổi; không giữ thông tin triển khai đã lỗi thời.

## CI sau PR #77

- Push nhánh tính năng: không chạy push CI; mở/cập nhật PR vào main mới chạy CI qua pull_request.
- Push main (kể cả sau merge): chạy CI để kiểm tra trạng thái main.
- Concurrency nhóm theo workflow/ref, tự hủy run cũ khi có commit mới cùng PR/nhánh. Run bị hủy do commit mới không đồng nghĩa code lỗi.
- PR chỉ sửa Markdown vẫn chạy CI; chưa dùng paths-ignore để tránh required check bị pending.
- Các bước verify, npm ci và Node 22 giữ nguyên; không cắt test để làm xanh CI.

Khi đỏ, mở Details, lấy commit SHA và bước lỗi. Phân biệt lỗi cài đặt/build/typecheck, lỗi hành vi và test chờ sai thời điểm. Tái hiện đúng test thất bại; ví dụ lỗi mobile cần kiểm tra phần tử tràn và nhãn tiếng Anh, không chỉ nhìn desktop. Không che lỗi bằng bỏ assertion, nới timeout tùy tiện hoặc chạy lại mãi.

Số run giảm giúp tiết kiệm tài nguyên, không tự sửa bug. Local đạt không bảo đảm CI đạt: Linux có phân biệt hoa/thường, phiên bản Chrome/tốc độ máy có thể khác Windows. Chờ check trên đúng SHA mới nhất; run của commit cũ không đủ để duyệt merge.

## Đồng bộ và conflict

Nếu main có thay đổi cần tích hợp, commit phần việc của mình trước rồi trên nhánh PR:

```powershell
git fetch origin
git merge origin/main
```

Đọc hai mục đích thay đổi khi giải conflict, không chọn toàn bộ ours/theirs cho qua. Chạy lại test phần giao nhau; push lên cùng nhánh để cập nhật PR. Không conflict vẫn phải review logic.

## Database, phát hành và kết thúc

AI/Sang chỉ chuẩn bị migration review được, tạo bằng Supabase CLI và thử local. Trước áp production, chủ repo phải cho phép đúng thay đổi; quyền merge không tự bao gồm migration. Sao lưu phần liên quan, đối chiếu history, chỉ áp bản còn thiếu và xác minh metadata/quyền sở hữu sau khi áp. Không chạy lại migration đã áp hoặc sửa history nếu chưa được cho phép.

Nếu connector cấp timestamp khác tên file, đối chiếu SQL đã chạy và cập nhật tên file repo cho khớp version thật trước khi merge; không đổi nội dung bản đã áp. Không tự sửa Auth, secrets hoặc cấu hình môi trường production.

Không tự merge: cần yêu cầu rõ của chủ repo cho PR cụ thể. Sau merge, xác minh deployment đúng commit và luồng bị ảnh hưởng. Vercel deploy không tự cập nhật database; rollback code cũng không tự rollback SQL.

Sau khi hoàn tất và tree phù hợp:

```powershell
git switch main
git pull --ff-only origin main
```

Việc tiếp theo dùng nhánh mới. Bàn giao ngắn: link PR/commit, kết quả kiểm tra, migration đã/chưa áp, deployment và phần còn cần nghiệm thu. Không tự tạo thêm bản tổng kết Markdown nếu chưa được yêu cầu.

## Tài liệu tham chiếu

- [AGENTS.md](../AGENTS.md): quy ước bắt buộc của repo.
- [COLLABORATOR_AGENT.md](../COLLABORATOR_AGENT.md): ràng buộc kiến trúc và hành vi cho AI.
- [Spec và quyết định](spec/decisions.md): hợp đồng kỹ thuật; các mốc lịch sử phải đối chiếu code mới.
- [Tổng quan đến #65](tong-quan-rubik-lab-va-lo-trinh-phat-trien.md) và [lịch sử nền tảng](project-history-and-github-workflow.md): tài liệu lưu theo thời điểm, không dùng thay workflow hiện hành.
