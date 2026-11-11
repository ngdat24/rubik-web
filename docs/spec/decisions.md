# Nhật ký Quyết định Kiến trúc (Architecture Decisions)

## D-001 | 2026-11-11 | Hệ tọa độ Y-up và thứ tự mặt U R F D L B
- **Quyết định**: Chọn trục +x hướng về R, +y hướng về U, +z hướng về F. Đánh số mặt: U=0, R=1, F=2, D=3, L=4, B=5.
- **Lý do**: Cùng hướng trục mặc định (Y hướng lên) với Three.js và giữ tính chất đối xứng số học: mặt đối diện = `(face + 3) % 6`.
- **Phương án đã bỏ**: Hệ tọa độ Z-up hoặc đặt F=0.
- **Ảnh hưởng**: `01-coordinates.md`, `02-notation.md`, Engine, Renderer.

## D-002 | 2026-11-11 | Nước xoay toàn khối (x, y, z) là nước đi thật của Engine
- **Quyết định**: `x, y, z` trực tiếp hoán vị toàn bộ các lớp trong trạng thái engine, được ghi vào `preEvents` (khi inspection) hoặc `events` (khi giải), tính 0 nước HTM và không kích hoạt đồng hồ bấm giờ. Xoay camera bằng chuột chỉ là hiển thị.
- **Lý do**: Đảm bảo sau khi xoay khối, các nước đi tiếp theo tác động đúng mặt người dùng đang nhìn và server có thể chạy lại chính xác lời giải.
- **Phương án đã bỏ**: Coi `x, y, z` là phép xoay camera thuần túy.
- **Ảnh hưởng**: `02-notation.md`, `03-metrics.md`, `04-timer.md`, `06-keybindings.md`, `09-data-contract.md`.

## D-003 | 2026-11-11 | Chỉ sử dụng event.code cho bàn phím ở phiên bản đầu
- **Quyết định**: Nhận diện phím qua vị trí vật lý `event.code` (KeyI, KeyJ...) kèm kiểm tra `event.isComposing`, bỏ tùy chọn `event.key`.
- **Lý do**: Ổn định hơn nhiều khi người dùng bật bộ gõ tiếng Việt hoặc CapsLock, loại bỏ trường hợp biên khi chuyển đổi qua lại giữa 2 chế độ.
- **Phương án đã bỏ**: Hỗ trợ song song cả `event.code` và `event.key`.
- **Ảnh hưởng**: `06-keybindings.md`.

## D-004 | 2026-11-11 | Quy tắc HTM mở rộng và tách biệt pressCount / solutionLength
- **Quyết định**:
  - Theo HTM mở rộng (OBTM): nước chứa lớp ngoài (mặt đơn, wide) tính 1 nước; nước chỉ chứa lớp trong (M, E, S, 2R) tính 2 nước; xoay toàn khối (x, y, z) tính 0 nước.
  - `pressCount` đếm trực tiếp từng lần bấm để tính TPS và tiebreak thi đấu.
  - `solutionLength` rút gọn các nước liên tiếp cùng khối lớp (`R R` thành `R2`, `R R'` thành rỗng), lấy `x, y, z` làm rào cản không gộp xuyên qua, và xóa nước cuối khỏi chuỗi khi bấm Undo ở phòng tập.
- **Lý do**: Phản ánh đúng tốc độ bấm trong thi đấu nhưng không làm người chơi bị thiệt nước khi thử/sai ở phòng tập tối ưu.
- **Phương án đã bỏ**: Chỉ dùng một bộ đếm duy nhất.
- **Ảnh hưởng**: `03-metrics.md`, `08-competitive.md`.

## D-005 | 2026-11-11 | PRNG Mulberry32 + xmur3 và tách hàm scrambleAt / matchScrambleAt
- **Quyết định**: Dùng hàm băm chuỗi `xmur3` kết hợp `mulberry32` để sinh số giả ngẫu nhiên tất định. `scrambleAt` là hàm lõi cố định theo `genVersion`. `matchScrambleAt` bọc bên ngoài, lặp thử ứng viên theo cấu hình `rules/vN.json` bất biến.
- **Lý do**: Khi thay đổi ngưỡng lọc luật thi đấu ở các mùa giải sau, các bản ghi cũ vẫn tái tạo lại được scramble chính xác 100%.
- **Phương án đã bỏ**: Dùng `Math.random()` hoặc nhúng bộ lọc trực tiếp vào `scrambleAt`.
- **Ảnh hưởng**: `05-scramble.md`, `08-competitive.md`, `09-data-contract.md`.

## D-006 | 2026-11-11 | Đồng hồ lấy mốc event.timeStamp, tự chạy ở nước đầu và tự dừng khi Solved
- **Quyết định**: Lấy mốc thời gian từ `event.timeStamp` (hệ quy chiếu `performance.now()`). Đồng hồ bắt đầu ở nước xoay lớp đầu tiên (`t = 0`) và dừng tự động khi vị từ hoàn thành đạt `true`.
- **Lý do**: Loại bỏ độ trễ chuyển tay từ phím Space và không bị lệch giờ bởi thời gian chạy animation 3D.
- **Phương án đã bỏ**: Dùng `Date.now()` hoặc đập phím Space để dừng giờ.
- **Ảnh hưởng**: `04-timer.md`, `06-keybindings.md`, `09-data-contract.md`.

## D-007 | 2026-11-11 | Phạm vi F2L 3x3 Color Neutral và làm tròn thống kê
- **Quyết định**:
  - Vị từ Cross/F2L chỉ áp dụng cho khối 3x3 và chấp nhận mọi mặt đáy (Color Neutral - `f2lSolvedAny`).
  - Trong thi đấu, cả 2 người chơi nhận cùng chuỗi scramble theo cùng thứ tự `k`.
  - Mọi phép so sánh xếp hạng dùng mili-giây nguyên; trung bình `mo3, ao5, ao12` tính bằng `Math.round(tổng_ms / số_lần)` rồi mới cắt xuống 2 chữ số thập phân khi hiển thị.
- **Lý do**: Công bằng tuyệt đối trong thi đấu và nhất quán kết quả tính thống kê giữa mọi thiết bị.
- **Phương án đã bỏ**: Khóa cố định mặt Trắng/Vàng hoặc làm tròn số hiển thị trước khi tính trung bình.
- **Ảnh hưởng**: `04-timer.md`, `07-predicates.md`, `08-competitive.md`.

## D-008 | 2026-11-11 | Thủ tục chọn nước của scramble genVersion 1
- **Quyết định**: Ứng viên theo thứ tự cố định, lọc chống dư thừa, chọn bằng `floor(u32 * n / 2^32)`; chi tiết tại 05 mục 3.1. `matchScramble_draft` hoãn tới Giai đoạn 7.
- **Lý do**: Scramble tất định, tái lập được ở client và server; mọi bản cài đặt cho kết quả giống nhau.
- **Ảnh hưởng**: `05-scramble.md`, `vectors.json` (nhóm scramble).

## D-009 | 2026-11-11 | Single toàn DNF hiển thị "-"
- **Quyết định**: Single không có lần giải hợp lệ thì hiển thị "-"; mo3, ao5, ao12 DNF hiển thị "DNF".
- **Lý do**: Single không có giá trị để hiển thị, còn trung bình DNF là một kết quả.
- **Ảnh hưởng**: `04-timer.md`, `vectors.json` (nhóm stats).

## D-010 | 2026-11-11 | Controller sở hữu Cube và cấp snapshot cho renderer
- **Quyết định**: Controller áp nước vào engine ngay khi input tới. Renderer chỉ hiển thị; API animation R3/R4 là `enqueueMove(move, stateAfter)`. Kết thúc animation trả pivot về 0 rồi tô snapshot. `setState(state)` hủy animation/hàng đợi và tô ngay. Dùng snapshot độc lập để tránh thay đổi bởi các nước đến sau.
- **Lý do**: Giữ engine là nguồn sự thật, tránh renderer sở hữu hoặc tính trạng thái Rubik.
- **Ảnh hưởng**: Controller của apps/web, packages/renderer, Giai đoạn 3 R2–R4.

## D-011 | 2026-11-11 | Timestamp input độc lập animation
- **Quyết định**: Controller giữ timestamp tại sự kiện input. Với bàn phím dùng `event.timeStamp` theo 04/09; input khác lấy `performance.now()` ngay khi nhận (cùng hệ quy chiếu). Timer/inspection/solve dùng mốc này. Callback renderer là `onMoveAnimated`, chỉ cho âm thanh/hiển thị, không làm nguồn thời gian.
- **Lý do**: Thời lượng animation và độ dài queue không làm sai thời gian giải.
- **Ảnh hưởng**: Controller, API renderer R4, timer Giai đoạn 5.

## D-012 | 2026-11-11 | Stack và mặc định renderer Giai đoạn 3
- **Quyết định**: Three.js ghim phiên bản, renderer TypeScript độc lập React; demo Vite + TypeScript thuần. 150 ms/nước đơn, nước đôi x1,5; bảng màu phương Tây, cảm ứng OrbitControls bật, pan tắt, damping bật, pixel ratio tối đa 2. R0 dùng hộp tạm. Không làm kéo lớp hoặc timer ở giai đoạn này.
- **Lý do**: Kiểm tra hình học/animation từng bước và tái sử dụng renderer với giao diện React sau này.
- **Ảnh hưởng**: packages/renderer, apps/web, Giai đoạn 3 R0–R6.
