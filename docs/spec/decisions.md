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

## D-013 | 2026-11-11 | Layout tĩnh R1 lấy trực tiếp hình học sticker từ engine
- **Quyết định**: Cạnh khối mặc định 3 đơn vị; cell = cạnh/N. Tọa độ cubie nhân đôi từ E2 nhân cell/2, vị trí slot cộng normal*cell/2. Giữ nguyên index/pháp tuyến engine. Dedupe tọa độ cubie để chỉ dựng bề mặt. Khe nhựa mặc định 4% cell; viền sticker mỗi bên 8% cell; góc bo 9% cạnh sticker. Mesh sticker nhô 0,2% cell, slot toán vẫn ở mặt lý tưởng.
- **Lý do**: Một hệ chỉ số xuyên engine/renderer và không phụ thuộc WebGL cho test toán. Mọi N có cùng kích thước hiển thị.
- **Ảnh hưởng**: layout.ts, CubeRenderer, demo R1. Trong R1, controller đổi N bằng cách dispose renderer cũ và dựng lại; API setSize/setState tái sử dụng cảnh sẽ làm ở R2.

## D-014 | 2026-11-11 | R2 tô state tức thì và đổi kích thước giữ camera
- **Quyết định**: setState kiểm tra độ dài/màu rồi gán material dùng chung theo state[i], không lưu mảng state hoặc tạo material mỗi lần tô. setTheme đổi màu 6 material hiện có. setSize khác N dựng lại cubie/sticker và giải phóng geometry/material cũ, giữ canvas/camera/controls; cùng N là no-op. Controller cấp trạng thái sau setSize, Reset và Scramble. Scramble luôn bắt đầu từ Cube đã giải, dùng seed trong demo và k=0, hiển thị chuỗi đã áp dụng.
- **Lý do**: Renderer chỉ giữ dữ liệu hiển thị; scramble tái lập và không tích lũy từ trạng thái cũ. R3/R4 sẽ bổ sung hủy pivot/queue khi setState.
- **Ảnh hưởng**: CubeRenderer, colors.ts, controller.ts, demo R2.

## D-015 | 2026-11-11 | R3 animation một nước bằng pivot tạm
- **Quyết định**: layerSlots chọn cả sticker/nhựa theo tọa độ cubie E2; rotationFor trả trục dương và quarterTurns*pi/2. Renderer dùng pivot + smoothstep, 150ms/nước đơn, 225ms/nước đôi. enqueueMove(move,stateAfter) giữ snapshot hiển thị độc lập; xong trả pivot về 0, đưa mesh về slot cũ rồi tô snapshot. setState/setSize/dispose hủy pivot, không phát callback cho nước bị hủy. onMoveAnimated chỉ báo hoàn tất hiển thị.
- **Lý do**: Chặn sai chiều/lớp bằng test Three.js rotation so với permutation engine; tránh tích lũy sai số. Controller áp nước và giữ timestamp input trước khi bắt đầu animation.
- **Ảnh hưởng**: layout.ts, animator.ts, CubeRenderer, controller và demo R3. Chỉ nhận một nước tại một thời điểm, nút nước đi tạm khóa khi xoay; hàng đợi và tốc độ động thuộc R4.

## D-016 | 2026-11-11 | R4 nhận input ngay và xếp hàng snapshot để vẽ
- **Quyết định**: Controller luôn nhận nước, cập nhật Cube/timestamp ngay cả khi đang xoay. enqueueMove/enqueueMoves nhận cặp move/stateAfter, kiểm tra cả batch trước khi thêm và copy snapshot. Không gộp R R. setSpeed điều chỉnh ms/nước đơn (>0), nước đôi x1,5; thời lượng hiệu dụng chia cho 1 + số nước chờ*0,6. Tích phân tiến độ theo delta RAF không âm; frame đầu lấy mốc RAF, đổi tốc độ không quay lùi. Giữ easing smoothstep.
- **Quyết định hủy**: clearQueue hủy phần hiển thị chưa xong và tô snapshot cuối đã nhận để khớp logic controller. setState ưu tiên snapshot truyền vào, setSize/dispose xóa hàng chờ. Nước bị bỏ animation không phát onMoveAnimated; onIdle chỉ phát một lần khi hết việc. Instant hoàn tất theo thứ tự trong RAF, không lấy callback làm nguồn thời gian.
- **Lý do**: Hình ảnh đuổi theo input mà không nuốt thao tác; không giữ góc quay dở hoặc dùng thời gian vẽ làm thời gian giải. Batch/callback trong một frame có giới hạn để tránh vòng lặp vô hạn khi callback thêm nước mới.
- **Ảnh hưởng**: CubeRenderer, animator.ts, controller và demo R4. Camera reset ở R5; phím/timer thuộc giai đoạn sau. Cubie bề mặt đã được kiểm tra trong R1.

## D-017 | 2026-11-11 | R5 camera và nhập chuỗi demo
- **Quyết định**: Camera có preset U/F/R (6,5,7) và D/B/L (-6,-5,-7), reset cả quán tính OrbitControls. Đổi camera không đổi engine. Controller parse toàn bộ chuỗi trước khi nhận, tối đa 2000 nước/lần; lỗi cú pháp không nhận dở chuỗi. Vòng đời renderer tiếp tục giữ canvas/controls khi đổi N.
- **Lý do**: Người dùng kiểm tra đầy đủ ký hiệu và mặt khuất, phục hồi góc nhìn sau thao tác cảm ứng.
- **Ảnh hưởng**: CubeRenderer, controller và demo R5.

## D-018 | 2026-11-11 | R6 InstancedMesh và kiểm tra trình duyệt thật
- **Quyết định**: N>=6 mặc định hai InstancedMesh (nhựa/sticker), giữ nguyên index/layout/permutation. Ma trận nền bất biến, xoay instance từ ma trận nền và trả lại sau nước; không tạo Three math objects mỗi frame. Có backend Mesh để đối chiếu. Context mất sẽ chốt snapshot cuối và dừng RAF; restored tiếp tục vẽ. Hủy renderer gỡ cả listener context.
- **Bằng chứng**: Chrome headless SwiftShader 10x10: Mesh 1088 draw calls, 44,8 FPS idle/14,5 FPS xoay; instanced 2 draw calls, 44,8 FPS idle/44,2 FPS xoay. CPU submit khi xoay 62,07 -> 0,27ms. Hai geometry, 488 cubie + 600 sticker. Chi tiết và giới hạn trong spec/10-renderer.md; chưa xác minh mục tiêu 60 FPS trên GPU laptop thật.
- **Kiểm tra**: Playwright chính thức ở R6 chạy Chrome local/Chromium CI; canvas phải có pixel, không console error, đổi N không tích lũy geometry, có heap GC check, cảm ứng và context restore. Không dựa vào mock để kết luận WebGL hoạt động.
- **Ảnh hưởng**: Renderer, demo, test:e2e, CI và tài liệu renderer.

## D-019 | 2026-11-12 | I1 keymap dễ nhớ và chọn lớp bằng phím giữ
- **Quyết định**: Theo yêu cầu mới của người dùng, thay bảng phím cũ của 06 bằng U/R/F/D/L/B, X/Y/Z, M/E/S; dùng event.code. Shift đảo chiều, Alt quay đôi (Shift+Alt vẫn đôi), Ctrl/Meta và AltGr bị bỏ qua. Giữ W cho wide; giữ số 1..9 hoặc 0 (=10) cho lớp; số+W chọn độ rộng. Parser engine quyết định giới hạn N, không sửa engine. Tổ hợp số/W không ghép rotation/slice; nhiều số đồng thời bị từ chối.
- **Vòng đời**: Xóa phím chọn khi blur/visibilitychange/nhập văn bản hoặc input bị khóa; không nhận repeat/IME/modal. Timestamp lấy nguyên event.timeStamp tại phím tạo nước. Space/Tab/Escape vẫn dành cho hệ thống. Alt chỉ hoạt động khi trình duyệt nhận được tổ hợp, không bảo đảm vượt qua phím tắt hệ điều hành.
- **Ảnh hưởng**: 06-keybindings.md, controller/keyboard, demo I1. JSON bindings là nước cơ sở, modifier do hàm thuần resolveKey xử lý. Tùy chỉnh/lưu hồ sơ ở I2; chưa làm timer/kéo lớp.

## D-020 | 2026-11-12 | I2 tùy chỉnh phím và hồ sơ local
- **Quyết định**: Schema version=1 theo 06, localStorage rubik.keymap.v1; chỉ cho phím chữ/dấu an toàn, giữ W/số/modifier/system cho điều khiển chung. Default bất biến, chỉnh default tạo custom. Tối đa hai phím/nước và 20 hồ sơ; nhập tối đa 100 KB, kiểm tra toàn bộ trước commit. Trùng phím có Gán lại/Hoán đổi/Hủy; đích đủ hai phím phải chọn phím thay. Bản nhập cũ/hỏng bị từ chối, cấu hình hiện tại giữ nguyên; dữ liệu local hỏng hoặc chặn đọc dùng mặc định. Chặn ghi chỉ làm mất lưu qua phiên, không khóa chơi.
- **Ảnh hưởng**: controller/keymap-settings thuần, dialog cài đặt web, bộ đọc keymap hiện hành cho I1; JSON xuất/nhập và kiểm thử lỗi lưu trữ. Chưa đồng bộ tài khoản/tab.

## D-021 | 2026-11-12 | I3–I6 picking, kéo lớp và cảm ứng
- **Quyết định**: Slot/instanceId lấy từ E2; hit nhựa không chọn. Kéo chỉ bắt đầu khi queue rỗng; khóa input trong gesture. Ngưỡng 8px, khóa trục theo normal cross displacement, lớp từ cubie engine. Thả làm tròn 90 độ, tối đa 180; timestamp pointerup. Renderer preview transform và nối animation phần còn lại; không áp nước engine.
- **Vòng đời**: Pointer Events chung chuột/touch; nền orbit, hai ngón pinch hủy preview; blur/cancel/lost capture/context loss hủy gesture. Chi tiết và giới hạn tại 11-input.md. Người dùng cho phép tự kiểm tra và merge toàn bộ phần còn lại.

## D-022 | 2026-11-12 | Timer/inspection và 11 lựa chọn Giai đoạn 5 đã chốt
1. Giữ origin thập phân, floor(stamp-origin) khi lưu; không làm tròn hai lần.
2. inspectionMs <=15000 none, 15001..17000 +2, >17000 DNF; 17000,9 thô vẫn +2 sau floor.
3. Auto-DNF ghi inspectionMs đo tại phát hiện, timeMs=0, events=[], giữ preEvents; kiểm tra theo timestamp, không tick.
4. IDLE/FINISHED chặn mọi nước, camera/zoom tự do.
5. Quyết định cập nhật của người dùng: Space khi chưa scramble tự chuẩn bị scramble và ở IDLE, không vào inspection ngay.
6. Space sau FINISHED tạo seed mới/k=0 rồi ở IDLE; Space tiếp theo mới inspection. Shift+Space đổi scramble trong IDLE/FINISHED.
7. Hủy mở dialog có cảnh báo đồng hồ vẫn chạy; xác nhận khi còn chạy bỏ lượt, khôi phục cùng scramble, về IDLE và không lưu. Nếu timeout trong dialog thì giữ DNF đã chốt.
8. Đổi tab/mất focus không dừng thời gian; quay lại advance theo timestamp.
9. Giữ nguyên Solve.penalty gốc, lưu penaltyOverride local riêng, có khôi phục gốc; xóa/chỉnh cập nhật thống kê, không sửa timeMs gốc.
10. Thống kê dùng engine statistic() theo size/thứ tự phiên, bộ nhớ trang, reload mất lịch sử.
11. Có Start/Cancel cảm ứng tương đương Space/Escape, timestamp từ click event.timeStamp.
- **Nguồn thời gian**: controller nhận timestamp bàn phím keydown/kéo pointerup, input không có DOM event dùng performance.now; Date chỉ cho metadata startedAt. Renderer callback không làm mốc solve.
- **Ảnh hưởng**: packages/timer, controller gate/named locks, web timer/history, 04/06/09/11/12.

## D-023 | 2026-11-12 | Tùy chọn phím theo góc nhìn
- **Quyết định**: Mặc định tắt. Dựa diện tích chiếu mặt; hòa ưu tiên tâm trên rồi trái. Suy một hệ trục sáu mặt nhất quán, hiển thị mapping. Chuyển face/inner/wide/slice/rotation tại keydown trước controller, giữ timestamp và ghi nước engine thực tế; orbit không tạo x/y/z. Không lưu tùy chọn qua reload, chưa dùng hysteresis.
- **Ảnh hưởng**: renderer/view.ts, getViewFaces, keyboard web và 06 mục 7. Theo lựa chọn trực tiếp của người dùng.

## D-024 | 2026-11-12 | Giao diện ưu tiên Rubik và quy trình nghiệm thu
- **Quyết định**: Theo ảnh tham chiếu người dùng, Rubik lớn ở giữa, timer gọn dưới, scramble trên, sidebar lịch sử/thống kê; công cụ nâng cao thu gọn, mobile ưu tiên khối/timer. Giữ logic và ID điều khiển, không thêm dependency.
- **Nghiệm thu**: T0..T4 và UI đã được người dùng cho merge từng PR; T5 hoàn tất tài liệu và chờ duyệt. Kiểm thử tự động không thay thế điện thoại/GPU thật. Không suy ủy quyền tự merge Giai đoạn 4 thành ủy quyền Giai đoạn 5.
