# 11. Điều khiển — Giai đoạn 4

Bàn phím và schema hồ sơ được mô tả trong 06-keybindings.md, D-019 và D-020. Controller trong packages/controller là cửa duy nhất thay trạng thái. Renderer không áp nước engine.

## Picking và kéo lớp
Raycast xét vật thể gần nhất: Mesh sticker hoặc instanceId của InstancedMesh sticker ánh xạ trực tiếp vào slot E2. Trúng nhựa/nền không chọn sticker; nền dùng OrbitControls. Không pick khi queue còn chạy.

Pointer Events dùng chung chuột/cảm ứng. Nhấn sticker khóa camera và input bàn phím. Ngưỡng 8px; ray chiếu lên mặt phẳng sticker, lấy normal cross displacement, chọn thành phần lớn nhất làm trục rồi khóa trục/lớp cho hết cử chỉ. Lớp lấy từ cubie coordinate của engine, không tính lại index. Hai phía N=2 dùng tên mặt đối diện hợp lệ.

Renderer beginDrag/updateDrag/endDrag chỉ thay transform tạm và trả góc. Khi thả, controller làm tròn góc tới bội 90 độ (tối đa 180), zero hủy, còn lại applyMove với timestamp pointerup rồi renderer tiếp tục animation từ góc đang kéo đến góc chốt. Góc giới hạn ±pi; kéo ngược đổi chiều. Hủy preview trả transform gốc, không đổi engine.

Một ngón trên sticker kéo lớp; trên nền xoay camera. Ngón thứ hai trong kéo lớp hủy preview và chuyển pinch zoom, không tạo nước. Zoom giới hạn khoảng cách 5..18. Canvas touch-action:none. Pointer capture giữ cử chỉ ngoài biên. pointercancel/lost capture/blur/visibilitychange/context loss và dispose hủy cử chỉ, phục hồi điều khiển; context loss vẫn khóa input theo controller của demo.

## Kiểm tra và giới hạn
Unit test mọi slot, mọi mặt và hai hướng tangent cho N=2..10 so với geometry/parser engine; giữ nguyên invariant permutation R3. Chrome Playwright kiểm tra keyboard/settings, raycast trên Mesh/InstancedMesh, kéo + nước ngược về solved, hủy blur, touch và orbit nền. Đo CPU applyMove riêng (không GPU) để kiểm tra đường nhận input không đợi animation. Không lấy callback onMoveAnimated làm đồng hồ.

Ngưỡng 8px và độ nhạy pi/1.5 rad trên một đơn vị thế giới là mặc định có thể chỉnh sau trải nghiệm tay. Cảm ứng đã mô phỏng trong Chrome; chưa xác nhận điện thoại thật hoặc FPS trên GPU người dùng. Giai đoạn 4 không có undo/timer/network; Giai đoạn 5 đã bổ sung timer tại 12-timer-ui.md, chưa có undo/network.

Đo local Node ngày 2026-11-12, 200 nước R với display giả không chờ animation: median 0,0029 ms, p95 0,0131 ms. Đây là chi phí CPU từ gọi controller tới khi trạng thái đã đổi, không phải độ trễ bàn phím hệ điều hành hay thời gian hiện hình trên GPU.

## Lưu ý Alt/Option

Alt cho nước đôi chỉ hoạt động khi tổ hợp được trình duyệt chuyển tới trang. Alt trên Windows có thể dành cho menu; Option trên macOS có thể tạo ký tự khác. Dùng event.code không vượt qua phím tắt hệ điều hành. Có thể gán một phím thường cho nước đôi (ví dụ R2) trong Cài đặt phím làm phương án thay thế. Không dùng AltGr (Ctrl+Alt) để chơi.

## Bổ sung T0/T2: khóa độc lập và gate

Controller dùng lockInput(reason)/unlockInput(reason), inputEnabled chỉ đọc. Các lý do drag/context/timer độc lập; kết thúc kéo chỉ gỡ drag, không gỡ khóa timer/context. disposed không thể mở lại. lockedBy trả bản sao. Trong idle/finished timer khóa nhận nước; khi inspecting/solving timer nhả khóa của chính nó.

setMoveGate kiểm tra ParsedMove và timestamp trước khi mutate; batch parse và kiểm tra toàn bộ trước khi áp bất kỳ nước nào. Gate từ chối thì không đổi Cube/timestamp/queue. Gate chỉ được có side effect idempotent advance(now), tránh bắt đầu/ghi nước trước khi enqueue thành công. onStateReplaced sau setSize/reset/scramble giúp timer disarm; sau scramble thành công, web arm timer với seed/index tương ứng. size và isSolved() đọc trực tiếp, không clone Cube trên đường input.

Phím theo góc nhìn và hai bước Space được mô tả tại 06 mục 3/7. Render preview vẫn độc lập thời gian; nước kéo được timer nhận ở pointerup, không phải pointerdown hay lúc animation xong.
