# Trạng thái dự án

- Giai đoạn 2 đã merge qua PR #1; engine N=2..10.
- Giai đoạn 3 R0: khung renderer/demo đã triển khai trên codex/gd3-r0; chờ duyệt PR.
- R0 gồm cảnh Three.js, hộp tạm, OrbitControls, resize, dispose và cấu hình workspace/CI.
- Chờ R1: hình học sticker và cubie bề mặt.
- Chờ R2: setState/setSize, màu, reset và scramble tức thì.
- Chờ R3: animation lớp và test đối chiếu hoán vị.
- Chờ R4: queue, tốc độ, hủy animation và onMoveAnimated.
- Chờ R5: hoàn thiện camera/demo và kiểm tra dọn bộ nhớ.
- Chờ R6: đo FPS, tối ưu, Playwright và docs/spec/10-renderer.md.
- Quyết định: controller sở hữu Cube và timestamp input; renderer nhận stateAfter.
- Mặc định: 150 ms, nước đôi x1,5, màu phương Tây, hỗ trợ cảm ứng.
- Local: build, lint, typecheck đạt; 223 test engine + 1 test vòng đời renderer đạt.
- Chưa nghiệm thu bằng mắt camera/cảm ứng/WebGL; chưa thêm Playwright (R6).
