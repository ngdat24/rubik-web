# Trạng thái dự án

- Giai đoạn 2 đã merge qua PR #1; engine N=2..10.
- Giai đoạn 3 R0 đã merge qua PR #2, main 7bdc6ea.
- R1 đã triển khai trên codex/gd3-r1, chờ duyệt PR: layout thuần, cubie bề mặt/sticker, bộ chọn N=2..10.
- Chờ R2: setState/setSize, màu, reset và scramble tức thì.
- Chờ R3: animation lớp và test đối chiếu hoán vị.
- Chờ R4: queue, tốc độ, hủy animation và onMoveAnimated.
- Chờ R5: hoàn thiện camera/demo và kiểm tra dọn bộ nhớ.
- Chờ R6: đo FPS, tối ưu, Playwright và docs/spec/10-renderer.md.
- Quyết định: controller sở hữu Cube và timestamp input; renderer nhận stateAfter.
- Mặc định: 150 ms, nước đôi x1,5, màu phương Tây, hỗ trợ cảm ứng.
- Local R1: build, lint, typecheck đạt; 223 test engine + 13 test renderer đạt.
- Chưa nghiệm thu R1 bằng mắt trên WebGL; chưa thêm Playwright (R6).
