# Trạng thái dự án

- Giai đoạn 2 đã merge qua PR #1; engine N=2..10.
- Giai đoạn 3 R0 đã merge qua PR #2, main 7bdc6ea.
- R1 đã merge qua PR #3; người dùng đã nghiệm thu hiển thị bằng mắt.
- R2 đã merge qua PR #4; người dùng đã nghiệm thu Scramble/Reset.
- R3 đã merge qua PR #5, người dùng đã nghiệm thu animation.
- R4 đã merge qua PR #6, người dùng đã nghiệm thu hàng đợi.
- R5/R6 đã merge qua PR #7/#8; CI trên main 542a6d0 xanh.
- R6 đã triển khai: InstancedMesh N>=6, WebGL recovery, Playwright, benchmark và spec/10-renderer.md.
- Quyết định: controller sở hữu Cube và timestamp input; renderer nhận stateAfter.
- Mặc định: 150 ms, nước đôi x1,5, màu phương Tây, hỗ trợ cảm ứng.
- Local R6: build/lint/typecheck, 261 unit test và 2 Playwright test đạt.
- 10x10 SwiftShader: 1088 -> 2 draw calls, xoay 14,5 -> 44,2 FPS; chưa đo 60 FPS trên GPU laptop thật.
- I0 đã merge qua PR #9, main 6140369; controller dùng chung trong packages/controller.
- I1 PR #10: đổi sang keymap dễ nhớ theo yêu cầu mới; Shift nghịch, Alt đôi, W wide, số chọn lớp.
- I1 đã nghiệm thu và merge qua PR #10, main c808bae; CI PR xanh.
- I2: cấu hình phím, hồ sơ, trùng phím và nhập/xuất JSON; chưa merge.
- Local I2: build/lint/typecheck, 272 unit test và 6 Chrome Playwright test đạt (một lượt retry sau timeout hiển thị cũ).
