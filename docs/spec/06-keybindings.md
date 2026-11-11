# 06. Điều khiển và Bàn phím (Keybindings)

## 1. Nguyên tắc nhận diện phím
- **Chỉ sử dụng `event.code`** ở phiên bản đầu: Nhận diện vị trí phím vật lý cố định (KeyJ, KeyI...), không bị ảnh hưởng bởi CapsLock hay bộ gõ tiếng Việt.
- Kích hoạt nước đi ngay tại sự kiện `keydown` (không đợi `keyup`), lấy `t = event.timeStamp`.
- Bỏ qua sự kiện phím trong các trường hợp:
  - `event.repeat === true` (giữ lì phím).
  - `event.isComposing === true` (đang gõ tổ hợp IME).
  - Có kèm `Ctrl` hoặc `Meta`, kể cả AltGr (`Ctrl+Alt`). `Shift` đảo chiều và `Alt` chọn nước đôi.
  - Con trỏ đang nằm trong `<input>`, `<textarea>`, `<select>` hoặc phần tử `contenteditable`.
  - Đang mở hộp thoại cài đặt gán phím hoặc menu tạm dừng.
- Chặn hành vi cuộn trang mặc định (`event.preventDefault()`) với `Space` và các phím đã gán nước đi, nhưng giữ nguyên phím `Tab` để duyệt giao diện.

## 2. Bộ phím mặc định (I1, thay bảng 3×3 Standard cũ)

Nhận diện theo vị trí vật lý `event.code`, không theo ký tự hay CapsLock.

| Nước cơ sở | Phím | Shift + phím | Alt + phím |
| :--- | :--- | :--- | :--- |
| U, R, F, D, L, B | KeyU, KeyR, KeyF, KeyD, KeyL, KeyB | Nước nghịch, ví dụ R' | Nước đôi, ví dụ R2 |
| x, y, z | KeyX, KeyY, KeyZ | x', y', z' | x2, y2, z2 |
| M, E, S (chỉ 3×3) | KeyM, KeyE, KeyS | M', E', S' | M2, E2, S2 |

- `Shift+Alt` vẫn là nước đôi; không tạo nước ba. Chỉ chặn hành vi mặc định của tổ hợp đã nhận; Ctrl/Meta và phím chưa gán vẫn thuộc trình duyệt. Một số tổ hợp Alt có thể bị hệ điều hành giữ trước khi tới trang.
- Giữ `W` rồi nhấn phím mặt để quay wide hai lớp: W+R → Rw; thêm Shift → Rw'; thêm Alt → Rw2. W tự nó không tạo nước.
- Giữ một phím hàng số `2`…`9` hoặc `0` (=10) rồi nhấn phím mặt để chọn đúng lớp đếm từ mặt đó: 3+R → 3R. `1` chọn lớp ngoài. Không dùng bàn phím số Numpad ở bản đầu.
- Kết hợp số và W để chọn độ rộng: 3+W+R → 3Rw. Có thể giữ số/W theo bất kỳ thứ tự nào trước phím mặt. Nhả phím chọn thì hiệu lực kết thúc, không lưu lớp cho lần bấm sau.
- Số/W chỉ áp dụng cho phím mặt U/R/F/D/L/B, không ghép với x/y/z hoặc M/E/S. Giữ nhiều phím số cùng lúc thì từ chối nước, không đoán lớp.
- Tuân theo parser: N=2 không có inner/wide; lớp đơn 1..N cho N>=3; wide 2..N-1; M/E/S chỉ N=3. Tổ hợp vượt giới hạn không đổi trạng thái.
- Xóa các phím chọn đang giữ khi mất focus, đổi tab, bắt đầu nhập văn bản, nhận input IME, Ctrl/Meta hoặc khi input bị khóa. Gỡ toàn bộ listener khi hủy trang.
- Timestamp là `event.timeStamp` của phím tạo nước, không phải thời điểm nhấn W/số hay kết thúc animation. Nước đôi cũng có thể nhập bằng hai lần nhấn mặt riêng biệt; không gộp hai sự kiện.
- `resolveKey(code, modifiers, keymap, N)` là hàm thuần; modifiers gồm Ctrl/Alt/Meta/Shift, `wide` và `layer`. JSON bindings lưu nước cơ sở; biến thể do bộ phân giải tạo.

## 3. Phím hệ thống và phím chọn lớp bị khóa (Không cho phép gán)
- **Space**: Bắt đầu Inspection (khi ở IDLE) và chuyển sang lượt mới (khi ở FINISHED).
- **Escape**: Mở menu / Hủy lượt giải đang chạy (có xác nhận).
- **Tab**: Duyệt focus trên giao diện.
- **KeyW, Digit0..Digit9**: Phím chọn wide/lớp, không gán thành nước.
- Khi chưa làm timer, Space không tạo nước; chặn cuộn trên vùng chơi, vẫn giữ kích hoạt nút/link đang focus bằng Space.

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
- `version`: Số nguyên (bắt đầu từ `1`; triển khai lưu trữ ở I2).
- `activeProfile`: Tên hồ sơ đang dùng (ví dụ `"default"`).
- `profiles`: Object chứa các hồ sơ, mỗi hồ sơ gồm `bindings` ánh xạ từ `event.code` sang ký hiệu nước chuẩn (ví dụ `"KeyR": "R"`).

Khi người dùng nhập file JSON: kiểm tra đúng cấu trúc bằng schema, từ chối và giữ nguyên cấu hình cũ nếu file hỏng, chứa phím bị cấm hoặc gán quá 2 phím cho 1 nước.