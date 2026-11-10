# 06. Điều khiển và Bàn phím (Keybindings)

## 1. Nguyên tắc nhận diện phím
- **Chỉ sử dụng `event.code`** ở phiên bản đầu: Nhận diện vị trí phím vật lý cố định (KeyJ, KeyI...), không bị ảnh hưởng bởi CapsLock hay bộ gõ tiếng Việt.
- Kích hoạt nước đi ngay tại sự kiện `keydown` (không đợi `keyup`), lấy `t = event.timeStamp`.
- Bỏ qua sự kiện phím trong các trường hợp:
  - `event.repeat === true` (giữ lì phím).
  - `event.isComposing === true` (đang gõ tổ hợp IME).
  - Có kèm phím bổ trợ `Ctrl`, `Alt`, `Meta`. (Phím `Shift` để dành cho việc chọn lớp khối lớn ở Giai đoạn 6).
  - Con trỏ đang nằm trong `<input>`, `<textarea>`, `<select>` hoặc phần tử `contenteditable`.
  - Đang mở hộp thoại cài đặt gán phím hoặc menu tạm dừng.
- Chặn hành vi cuộn trang mặc định (`event.preventDefault()`) với `Space` và các phím đã gán nước đi, nhưng giữ nguyên phím `Tab` để duyệt giao diện.

## 2. Bộ phím mặc định (3x3 Standard)

| Nước đi | Phím thuận | Phím nghịch (') | Ghi chú |
| :--- | :--- | :--- | :--- |
| R / R' | KeyI | KeyK | Tay phải |
| U / U' | KeyJ | KeyF | Ngón trỏ 2 tay |
| F / F' | KeyH | KeyG | Ngón trỏ với vào trong |
| L / L' | KeyD | KeyE | Tay trái |
| D / D' | KeyS | KeyL | Ngón áp út |
| B / B' | KeyW | KeyO | Hàng phím trên |
| y / y' | Semicolon (;) | KeyA | Xoay toàn khối ngang |
| x / x' | KeyT | KeyN | Xoay toàn khối dọc |
| z / z' | KeyP | KeyQ | Xoay toàn khối nghiêng |

*Ghi chú: Nước quay đúp (R2, U2...) thực hiện bằng cách bấm phím 2 lần. Các nước M, E, S và wide nằm ngoài phạm vi bảng mặc định bản đầu.*

## 3. Phím hệ thống bị khóa (Không cho phép gán)
- **Space**: Bắt đầu Inspection (khi ở IDLE) và chuyển sang lượt mới (khi ở FINISHED).
- **Escape**: Mở menu / Hủy lượt giải đang chạy (có xác nhận).
- **Tab**: Duyệt focus trên giao diện.

## 4. Quy tắc gán phím và Xử lý xung đột
Mỗi phím chỉ gán cho tối đa 1 nước đi. Mỗi nước đi có tối đa 2 phím (hoặc 0 phím, vẫn bấm được trên màn hình).
Khi gán phím `K` (đang thuộc nước `A`) sang cho nước `B`:
1. Nếu `B` đã đủ 2 phím: Yêu cầu người dùng chọn 1 trong 2 phím hiện tại của `B` để thay thế.
2. Hiển thị lựa chọn:
   - **Gán lại (Reassign)**: `K` chuyển sang `B`, nước `A` mất phím `K` (hiện cảnh báo nếu `A` không còn phím nào).
   - **Hoán đổi (Swap)**: Đổi chỗ `K` của `A` với phím vừa chọn của `B`.
   - **Hủy (Cancel)**: Giữ nguyên không đổi.

## 5. Hồ sơ và Cấu trúc JSON xuất/nhập
Hỗ trợ tạo nhiều hồ sơ phím (profile), nút "Khôi phục mặc định" luôn giữ lại hồ sơ gốc. Định dạng lưu trữ:
- `version`: Số nguyên (bắt đầu từ `1`).
- `activeProfile`: Tên hồ sơ đang dùng (ví dụ `"default"`).
- `profiles`: Object chứa các hồ sơ, mỗi hồ sơ gồm `bindings` ánh xạ từ `event.code` sang ký hiệu nước chuẩn (ví dụ `"KeyI": "R"`).

Khi người dùng nhập file JSON: kiểm tra đúng cấu trúc bằng schema, từ chối và giữ nguyên cấu hình cũ nếu file hỏng, chứa phím bị cấm hoặc gán quá 2 phím cho 1 nước.