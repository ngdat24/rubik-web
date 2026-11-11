# Trạng thái dự án

- Giai đoạn 2 đã merge qua PR #1; engine N=2..10.
- Giai đoạn 3 R0 đã merge qua PR #2, main 7bdc6ea.
- R1 đã merge qua PR #3; người dùng đã nghiệm thu hiển thị bằng mắt.
- R2 đã merge qua PR #4; người dùng đã nghiệm thu Scramble/Reset.
- R3 đã merge qua PR #5, người dùng đã nghiệm thu animation.
- R4 đã merge qua PR #6, người dùng đã nghiệm thu hàng đợi.
- R5 đang triển khai: camera U/F/R, D/B/L và nhập chuỗi có kiểm tra cú pháp.
- Chờ R6: đo FPS, tối ưu, Playwright và docs/spec/10-renderer.md.
- Quyết định: controller sở hữu Cube và timestamp input; renderer nhận stateAfter.
- Mặc định: 150 ms, nước đôi x1,5, màu phương Tây, hỗ trợ cảm ứng.
- Local R4: build, lint, typecheck đạt; 223 test engine + 32 renderer + 4 controller đạt.
- Chưa nghiệm thu R4 bằng mắt trên WebGL; chưa thêm Playwright (R6).
