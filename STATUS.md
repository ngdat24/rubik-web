# Trạng thái dự án

- Main đã merge Giai đoạn 2–5 và polish qua PR #1..#20; mốc main c12ef1e.
- Giai đoạn 6: persistence/backup ở PR #21, server LAN ở PR #22; cả hai chưa merge tại lần đối chiếu 13/11/2026.
- Nhánh codex/gd6-batch-guard khép review nền tảng, đồng bộ spec/default và kiểm tra bổ sung; code/kiểm tra local hoàn tất, chờ review/merge, chưa coi đã lên main.
- Engine TypeScript N=2..10 không sửa; controller sở hữu Cube, renderer chỉ nhận snapshot.
- Timer dùng timestamp input keydown/pointerup; animation không quyết định thời gian.
- Gate đang gắn thì controller từ chối batch nhiều nước, nhận từng nước; không gate vẫn có batch nguyên tử.
- Local history tự lưu IndexedDB, giữ phạt gốc/override riêng, JSON backup và CSV; reload giữ dữ liệu nếu ghi thành công.
- Nhập JSON validate trước merge, dedup ID; lỗi/quota không khóa phiên; revision ngăn tab cũ ghi đè, chưa tự đồng bộ tab.
- LAN cùng nguồn: npm.cmd run lan, tên/hồ sơ/Solve lưu lan-data/room.json, không cần hosting công khai.
- Bảng LAN 2×2/3×3 bên phải: hạng – tên – thời gian tốt nhất/người, +2 cộng thời gian, bỏ DNF.
- Chỉ lượt mới tự gửi; offline chờ/retry, ID dedup, replay kiểm trạng thái. Backup nhập và phạt chỉnh local không lên bảng.
- Không coi replay là chống gian lận thời gian client; chưa có auth đa thiết bị/challenge server/rate limit cho Internet.
- Phím theo góc nhìn mặc định bật; Khóa xoay phím bật hệ trục cố định; web 40 ms, range 30–100, mouse drag 0,675.
- Người dùng đã thử điện thoại/máy cá nhân/máy bạn cùng mạng, đánh giá FPS10×10/độ trễ ổn; chưa ghi số đo/cấu hình cụ thể.
- Kiểm tra khép Giai đoạn 6: build/lint/typecheck, 317 unit, 21 Chrome E2E và 2 LAN integration/browser đạt local; CI của PR cần đối chiếu riêng.
- Nguồn chân lý: spec 01..12, decisions D-025/D-026 thay các default/persistence cũ; quyết định lịch sử vẫn giữ để đối chiếu.
- Hosting Vercel/Supabase hoãn. Bước tiếp sau nghiệm thu/merge: Giai đoạn 7 Sandbox trước, rồi Cross solver/trainer; chưa triển khai solver/undo.
