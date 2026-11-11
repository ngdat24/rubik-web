# Trạng thái dự án

- Giai đoạn 2: engine N=2..10 đã merge PR #1, không sửa engine trong Giai đoạn 3/4.
- Giai đoạn 3: R0..R6 đã merge PR #2..#8; renderer tách khỏi controller.
- Giai đoạn 4: I0 controller PR #9, I1 bàn phím PR #10, I2 cấu hình PR #11 đã merge.
- I3..I6: chọn sticker, kéo chuột/touch, pinch, hủy gesture và tài liệu 11-input đã triển khai; đã merge PR #12 tại 4bdfa70 sau khi CI xanh, theo ủy quyền người dùng.
- Local: build/lint/typecheck, 273 unit test, 8 Chrome Playwright test đạt.
- Kiểm tra kéo: N=2/3/7/10, nước ngược về solved, camera không đổi, hủy blur, touch và pinch; toán mọi slot N=2..10.
- Controller sở hữu Cube; bàn phím ghi event.timeStamp tại keydown, drag tại pointerup. Renderer chỉ preview/animation.
- Phím theo 06-keybindings.md; quyết định D-019..D-021; hướng dẫn nhập/kéo tại 11-input.md.
- CPU controller 200 mẫu: median 0,0029 ms, p95 0,0131 ms; không phải độ trễ hệ điều hành/GPU.
- Chưa thử điện thoại thật, giải scramble thủ công trọn lượt hoặc đo FPS GPU laptop thật; tự động đã kiểm tra thao tác và trạng thái engine.
- Giai đoạn 5 (timer/inspection) chưa bắt đầu.
