# 04. Luật bấm giờ và Thống kê (Timer & Statistics)

## 1. Máy trạng thái Timer
Chuỗi chuyển trạng thái chuẩn:
- **IDLE** -> (Bấm Space) -> **INSPECTING**
- **INSPECTING** -> (Nước xoay lớp đầu tiên) -> **SOLVING**
- **INSPECTING** -> (Quá 17000 ms) -> **FINISHED** (phạt DNF)
- **SOLVING** -> (isSolved == true) -> **FINISHED**
- **FINISHED** -> (Bấm Space) -> **INSPECTING** (lượt mới)

Chi tiết từng trạng thái:
- **IDLE**: Khối đã áp dụng scramble. Chờ người dùng bắt đầu.
- **INSPECTING**:
  - Đếm ngược từ 15000 ms, tối đa 17000 ms.
  - Cho phép: xoay camera bằng chuột; xoay toàn khối `x, y, z` (ghi vào mảng `preEvents` với mốc thời gian tính từ lúc bắt đầu inspection).
  - Khóa: mọi nước xoay lớp (R, U, F, wide, slice...).
  - Thoát khi: Nhận nước xoay lớp đầu tiên (đặt `t = 0`, sang SOLVING) hoặc vượt quá 17000 ms (sang FINISHED, phạt DNF).
- **SOLVING**:
  - Ghi nhận các nước đi (kể cả x, y, z) vào mảng `events[]` với `t` tính bằng mili-giây nguyên từ `event.timeStamp` (hệ quy chiếu `performance.now()`).
  - Đồng hồ không tạm dừng nếu người dùng chuyển tab hoặc mất focus.
  - Thoát khi: `isSolved()` trả về `true` ngay sau nước cuối.
- **FINISHED**:
  - Chốt `timeMs = t` của nước xoay cuối cùng.
  - Nếu DNF do quá giờ inspection: lưu `timeMs = 0`, `penalty = "DNF"`, `events = []`, giữ nguyên `preEvents`.
- **Hủy lượt (Phím Escape)**: Khi đang INSPECTING hoặc SOLVING, bấm Esc mở hộp thoại xác nhận hủy (đồng hồ không dừng khi hộp thoại mở). Lượt hủy không lưu vào lịch sử và đưa về IDLE.

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