# Trạng thái dự án

- Giai đoạn 2 đã merge qua PR #1; engine N=2..10.
- Giai đoạn 3 R0 đã merge qua PR #2, main 7bdc6ea.
- R1 đã merge qua PR #3; người dùng đã nghiệm thu hiển thị bằng mắt.
- R2 đã merge qua PR #4; người dùng đã nghiệm thu Scramble/Reset.
- R3 đã triển khai trên codex/gd3-r3, chờ duyệt PR: animation lớp và test hoán vị N=2..10.
- Chờ R4: queue, tốc độ, hủy animation và onMoveAnimated.
- Chờ R5: hoàn thiện camera/demo và kiểm tra dọn bộ nhớ.
- Chờ R6: đo FPS, tối ưu, Playwright và docs/spec/10-renderer.md.
- Quyết định: controller sở hữu Cube và timestamp input; renderer nhận stateAfter.
- Mặc định: 150 ms, nước đôi x1,5, màu phương Tây, hỗ trợ cảm ứng.
- Local R3: build, lint, typecheck đạt; 223 test engine + 28 renderer + 3 controller đạt.
- Chưa nghiệm thu R3 bằng mắt trên WebGL; chưa thêm Playwright (R6).
