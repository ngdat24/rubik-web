# Quy ước làm việc

- Trao đổi và giải thích thay đổi bằng tiếng Việt. Mỗi issue có nhánh `codex/gd3-r<số>` hoặc `codex/gd4-i<số>` / `codex/gd5-t<số>` và PR nhỏ.
- Đọc STATUS.md, docs/spec/decisions.md và API engine trước khi code.
- Chỉ sửa file cần thiết cho issue; chỉ cập nhật tài liệu được yêu cầu.
- Giai đoạn 3: không sửa packages/engine khi chưa được người dùng đồng ý rõ ràng.
- Engine TypeScript thuần giữ trạng thái; không phụ thuộc DOM, Three.js hay React.
- Controller bên ngoài renderer sở hữu Cube, áp nước ngay khi nhận input và lưu timestamp của input.
- Renderer chỉ hiển thị; không sở hữu Cube hoặc áp nước vào engine.
- API animation khi triển khai R3/R4: enqueueMove(move, stateAfter). Renderer chốt màu từ snapshot sau animation.
- setState hủy animation/hàng đợi và hiển thị tức thì. Callback onMoveAnimated chỉ phục vụ hiển thị/âm thanh.
- Timer giai đoạn 5 dùng timestamp input ở controller, không lấy thời gian kết thúc animation.
- Mặc định: 150 ms/nước đơn, nước đôi 1,5 lần, màu phương Tây, cảm ứng OrbitControls bật.
- Renderer là lớp TypeScript thuần; demo dùng Vite + TypeScript, chưa dùng React.
- Ghim chính xác phiên bản three. Hỏi trước khi thêm thư viện lớn ngoài lựa chọn đã duyệt.
- Toán vị trí, chọn lớp và chiều quay tách khỏi WebGL, lấy quy ước từ engine/spec.
- M/E/S chỉ trên 3x3; các lớp khối lớn theo parser hiện có.
- Giai đoạn 4: bàn phím theo 06-keybindings.md và D-019 (event.code, Shift nghịch, Alt đôi, W wide, số chọn lớp); không sửa engine.
- Không làm phím tự chỉnh, kéo lớp, timer hay backend trong giai đoạn 3.
- Chạy lint, typecheck, test, build cho PR; kiểm tra trình duyệt khi phù hợp và báo giới hạn kiểm tra.
- Chỉ thêm Playwright ở R6. Không nhân bản project hoặc chạy mô phỏng dài không cần thiết.
- STATUS.md dưới 60 dòng, AGENTS.md dưới 150 dòng; decisions.md ghi quyết định đã chốt.
- Giải thích bằng tiếng Việt trước khi merge. Không tự merge khi issue yêu cầu người dùng duyệt trước.

## Giai đoạn 5

- Đọc 04/09/12 và D-022..D-024; mỗi task một PR, chờ người dùng duyệt trước merge.
- Timer thuần chỉ phụ thuộc engine. Timestamp ở controller (keydown/pointerup); giữ origin chính xác, floor chênh lệch. Date chỉ cho startedAt.
- Named locks drag/context/timer/disposed độc lập; chỉ gỡ khóa của mình. Gate kiểm tra trước mutate; khi có gate thì từ chối batch nhiều hơn một nước để không vượt điểm kết thúc solve.
- Space hai bước: chuẩn bị scramble rồi mới inspection; Shift+Space đổi scramble khi chưa chạy. Hộp hủy không dừng đồng hồ.
- Solve gốc bất biến, penaltyOverride là metadata local riêng. History ban đầu trong phiên; Giai đoạn 6 đã thêm IndexedDB/backup và LAN, thống kê vẫn dùng engine theo size.
- Không sửa engine, không thêm backend/lưu history lâu dài hoặc tự đổi hợp đồng dữ liệu ngoài task được duyệt.

## Lệnh tại thư mục gốc

- `npm install`: cài dependency workspace.
- `npm run dev`: build các thư viện rồi chạy demo Vite.
- `npm run build`: engine → renderer → controller → timer → web.
- `npm run lint`, `npm run typecheck`, `npm test`: kiểm tra các workspace.
- `python -B tools/reference/check-engine.py`: đối chiếu engine đã build với Python.
- `npm run benchmark`: benchmark engine; chỉ chạy khi cần đo hiệu năng engine.
- `npm run lan` / `npm run start:lan`: build/chạy hoặc chỉ chạy server LAN; dữ liệu ở lan-data/ (không commit).
- `npm run test:lan`: integration API và Chrome hai trình duyệt cho LAN.

## Mốc Giai đoạn 6

- Web: phím theo góc nhìn mặc định bật; Khóa xoay phím bật hệ trục cố định. Web 40 ms, range 30–100; API renderer mặc định 150 ms.
- Chuột kéo lớp hệ số 0,675; touch/camera riêng. Người dùng đã thử nhiều thiết bị, chưa ghi số đo FPS/latency.
- IndexedDB local tự lưu; backup nhập không tự lên bảng. LAN nhận Solve gốc mới 2×2/3×3, không nhận override local.
- Không suy kết quả replay thành chống gian lận thời gian; hosting online/Sandbox/solver là scope tiếp theo.
