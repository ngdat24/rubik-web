# Quy ước làm việc

- Trao đổi và giải thích thay đổi bằng tiếng Việt. Mỗi issue có nhánh `codex/gd3-r<số>` hoặc `codex/gd4-i<số>` và PR nhỏ.
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

## Lệnh tại thư mục gốc

- `npm install`: cài dependency workspace.
- `npm run dev`: build các thư viện rồi chạy demo Vite.
- `npm run build`: engine → renderer → web.
- `npm run lint`, `npm run typecheck`, `npm test`: kiểm tra các workspace.
- `python -B tools/reference/check-engine.py`: đối chiếu engine đã build với Python.
- `npm run benchmark`: benchmark engine; chỉ chạy khi cần đo hiệu năng engine.
