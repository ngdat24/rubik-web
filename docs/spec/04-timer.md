# 04. Luật bấm giờ và Thống kê (Timer & Statistics)

## 1. Máy trạng thái Timer
Chuỗi chuyển trạng thái chuẩn:
- **IDLE chưa có scramble** -> (Space/Bắt đầu) -> **IDLE đã có scramble**
- **IDLE đã có scramble** -> (Space/Bắt đầu) -> **INSPECTING**
- **INSPECTING** -> (Nước xoay lớp đầu tiên) -> **SOLVING**
- **INSPECTING** -> (Quá 17000 ms) -> **FINISHED** (phạt DNF)
- **SOLVING** -> (isSolved == true) -> **FINISHED**
- **FINISHED** -> (Space/Bắt đầu) -> **IDLE** (scramble mới; bấm tiếp mới inspection)

Chi tiết từng trạng thái:
- **IDLE**: Chưa hoặc đã có scramble. Khi chưa có, Space chuẩn bị scramble tự động; khi đã có thì Space bắt đầu inspection. Shift+Space tạo lại scramble khi IDLE/FINISHED.
- **INSPECTING**:
  - Đếm ngược từ 15000 ms, tối đa 17000 ms.
  - Cho phép: xoay camera bằng chuột; xoay toàn khối `x, y, z` (ghi vào mảng `preEvents` với mốc thời gian tính từ lúc bắt đầu inspection).
  - Nước xoay lớp đầu tiên (R, U, F, wide, slice...) được nhận và chuyển ngay sang SOLVING; không áp nước lớp mà vẫn giữ INSPECTING.
  - Thoát khi: Nhận nước xoay lớp đầu tiên (đặt `t = 0`, sang SOLVING) hoặc vượt quá 17000 ms (sang FINISHED, phạt DNF).
- **SOLVING**:
  - Ghi nhận các nước đi (kể cả x, y, z) vào mảng `events[]` với `t` tính bằng mili-giây nguyên từ `event.timeStamp` (hệ quy chiếu `performance.now()`).
  - Đồng hồ không tạm dừng nếu người dùng chuyển tab hoặc mất focus.
  - Thoát khi: `isSolved()` trả về `true` ngay sau nước cuối.
- **FINISHED**:
  - Chốt `timeMs = t` của nước xoay cuối cùng.
  - Nếu DNF do quá giờ inspection: lưu `timeMs = 0`, `penalty = "DNF"`, `events = []`, giữ nguyên `preEvents`.
- **Hủy lượt (Phím Escape)**: Khi đang INSPECTING hoặc SOLVING, bấm Esc mở hộp thoại xác nhận hủy (đồng hồ không dừng khi hộp thoại mở). Nếu xác nhận khi lượt còn chạy: không lưu lịch sử, áp lại cùng seed/index và về IDLE sẵn sàng. Nếu đã timeout trong hộp thoại: giữ kết quả DNF đã chốt, xác nhận chỉ đóng hộp thoại.

## 2. Quy tắc phạt Inspection (theo mili-giây nguyên)
- `inspectionMs <= 15000`: Không phạt (`penalty = "none"`).
- `15001 <= inspectionMs <= 17000`: Phạt +2 giây (`penalty = "+2"`, thời gian tính điểm = `timeMs + 2000`).
- `inspectionMs > 17000`: Xử thua (`penalty = "DNF"`).

## 3. Thống kê và Làm tròn
- Lưu trữ và xếp hạng luôn so sánh bằng số nguyên mili-giây (`ms`).
- Hiển thị ra màn hình: cắt xuống 2 chữ số thập phân (ví dụ `12345 ms` hiển thị `12.34`).
- Tính trung bình (mo3, ao5, ao12): `avgMs = Math.round(tổng_ms / số_lần)`, chỉ tính trên các lần giải liên tiếp cùng kích thước khối trong cùng một phiên. Chưa đủ số lần thì hiển thị "-".
- **Single**: Lần giải hợp lệ thấp nhất. Nếu tất cả đều DNF thì hiển thị "-".
- **mo3 (Mean of 3)**: Trung bình 3 lần gần nhất. Có bất kỳ DNF nào thì mo3 là DNF.
- **ao5 / ao12**:
  - Bỏ 1 lần nhanh nhất (Best) và 1 lần chậm nhất (Worst), lấy trung bình các lần còn lại (3 lần cho ao5, 10 lần cho ao12).
  - Có đúng 1 DNF: Coi DNF là lần Worst bị bỏ.
  - Có từ 2 DNF trở lên: Kết quả là DNF.
- Khi người dùng xóa một lần giải hoặc sửa penalty (+2 / DNF / none) trong lịch sử, toàn bộ thống kê tự động tính lại ngay lập tức.
## 4. Làm rõ theo quyết định Giai đoạn 5 (D-022)

- Giữ nguyên timestamp thập phân làm mốc inspection/solve; mọi t và thời gian lưu là floor(stamp − origin), không làm tròn mốc trước rồi trừ. Ví dụ delta 15000,9 ms → 15000 (none), 17000,9 → 17000 (+2), 17001 → DNF.
- Nước bàn phím nhận tại keydown, kéo tại pointerup; mốc solve là thời điểm controller chốt nước lớp đầu tiên. Camera không tạo nước; x/y/z trong inspection chỉ vào preEvents.
- IDLE và FINISHED từ chối mọi nước, kể cả rotation, nút nước và kéo. Camera/zoom vẫn tự do.
- Auto-DNF lưu inspectionMs bằng giá trị nguyên đo khi phát hiện (>17000), timeMs=0, events=[], giữ preEvents. advance(timestamp) và gate trước nước đều kiểm tra timeout; RAF/setTimeout chỉ đánh thức/cập nhật hình, không quyết định thời gian dựa trên số tick.
- Thời gian không tạm dừng khi mất focus, đổi tab, mất WebGL hoặc mở hộp hủy. Hộp thoại ghi rõ đồng hồ vẫn chạy và hết inspection vẫn DNF.
- Hai bước Space áp dụng cả sau kết quả: chuẩn bị scramble ngẫu nhiên với seed mới, k=0 rồi về IDLE; bấm tiếp mới inspection. Nút Bắt đầu trên cảm ứng có cùng hành vi, dùng click event.timeStamp. Shift+Space chỉ đổi scramble khi chưa chạy.
- Phạt gốc của Solve bất biến. Chỉnh phạt lịch sử lưu ở penaltyOverride riêng; thống kê dùng override nếu có, ngược lại dùng Solve.penalty. Có thể khôi phục phạt gốc. Chi tiết wrapper tại 09 mục 2.2.1.
- Lịch sử chỉ trong bộ nhớ phiên trang, lọc theo kích thước và thứ tự giải; reload mất lịch sử. Timer giao diện và danh sách điều khiển tại 12-timer-ui.md.
