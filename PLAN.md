# Kế hoạch tiếp nối Gemini

Phạm vi lượt này: hoàn thành parser và metrics đầu Giai đoạn 2 theo phần bàn giao.

1. Kiểm tra vectors.json hiện có với dữ liệu bàn giao; giữ các chỉnh sửa đang có của người dùng.
2. Bổ sung Axis, MoveType, ParsedMove, Penalty và SolveTime vào types.ts, giữ CubeState.
3. Cài parser.ts theo 02-notation.md: chuẩn hóa, kiểm tra lỗi, ánh xạ trục, dải lớp và góc quay cho N = 2..10.
4. Cài metrics.ts theo 03-metrics.md và vectors: nước trong tính 2, nước ngoài tính 1, rotation tính 0; không rút gọn xuyên rotation.
5. Thêm test dùng trực tiếp nhóm parse và metrics trong vectors.json, kiểm tra mã lỗi và các biên ánh xạ lớp/rút gọn.
6. Chạy typecheck và test một lượt; sửa nếu có lỗi.

Không thay nội dung đặc tả khác, không triển khai moves.ts hoặc predicates.ts trong lượt này. Chưa coi toàn bộ Giai đoạn 1/2 hoàn tất chỉ vì parser và metrics pass.
