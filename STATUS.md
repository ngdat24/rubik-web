# Trạng thái dự án

- Giai đoạn 2: engine N=2..10 đã merge PR #1; không sửa engine trong Giai đoạn 3/4/5.
- Giai đoạn 3 R0..R6 và Giai đoạn 4 I0..I6 đã merge (#2..#12).
- Giai đoạn 5: T0 #13, T1 #14, T2 #15, T3 #16, UI #17, T4 #18 đã merge.
- Main code mới nhất: 436b754 (T4). T5 hoàn tất tài liệu trên nhánh codex/gd5-t5, chờ PR/duyệt; chưa tuyên bố toàn bộ T0..T5 đã merge.
- T0: named input locks, gate kiểm tra batch trước mutate, sự kiện thay state và getter tránh clone trên input.
- T1/T2: timer thuần, inspection +2/DNF, Space hai bước, Shift+Space đổi scramble, dialog hủy không dừng thời gian.
- T3: lịch sử trong phiên, phạt gốc và override riêng, single/mo3/ao5/ao12 theo size, chỉnh/xóa/khôi phục gốc.
- UI: Rubik là chủ thể, timer bên dưới, scramble trên, sidebar phiên, công cụ nâng cao thu gọn; responsive.
- Phím theo góc nhìn là tùy chọn tắt mặc định; mapping diện tích chiếu, hòa trên/trái, lưu nước engine thực tế.
- Kiểm tra mốc T4: build/lint/typecheck, 306 unit test, 16 Chrome Playwright, Python differential 1160 chuỗi đạt; CI PR #18 xanh trước merge.
- T5: docs-only; kiểm tra nội dung/link tương đối và giới hạn số dòng. Không suy thay đổi tài liệu thành kiểm thử thiết bị thật.
- Nguồn chân lý: 04/06/09/11/12 và decisions D-022..D-024. Timer nhận timestamp controller, không lấy animation làm mốc.
- Chưa xác nhận điện thoại thật, FPS GPU laptop, độ trễ phím thực hoặc trải nghiệm dài hạn. Không coi SwiftShader/benchmark CPU là GPU thật.
- Không có backend/tài khoản/leaderboard, lưu history qua reload, undo hoặc âm thanh trong Giai đoạn 5.
- Giai đoạn 6 chưa bắt đầu.
