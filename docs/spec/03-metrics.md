# 03. Thước đo nước đi (Move Metrics)

## 1. Hai đại lượng đếm nước
Hệ thống tách biệt số lần bấm thực tế của người chơi và độ dài lời giải rút gọn:

### 1.1. pressCount (Số nước thao tác)
- Đếm trực tiếp theo từng nước người chơi thực hiện.
- Dùng để tính tốc độ quay TPS và phân định thắng thua (Tiebreak) trên các khối đã hoàn thành trong thi đấu.
- Công thức TPS: `TPS = pressCount / (timeMs / 1000)` (chỉ tính trong trạng thái SOLVING, không tính x, y, z).

### 1.2. solutionLength (Độ dài lời giải rút gọn)
- Chuỗi nước đi sau khi đã gộp các nước liên tiếp có cùng khối lớp (ví dụ: `R R` thành `R2`, `R R'` thành rỗng, `R2 R` thành `R'`).
- Nước toàn khối `x, y, z` là rào cản, không gộp xuyên qua.
- Dùng để so sánh với bộ giải tối ưu ở Phòng tập (Cross / F2L Solver).
- Quy ước Undo ở phòng tập: bấm Undo sẽ trừ trực tiếp nước vừa đi ra khỏi nhánh hiện tại và giảm `solutionLength` tương ứng.

## 2. Quy tắc đếm Outer Block Turn Metric (HTM mở rộng)
Mỗi nước đi tác động lên một dải lớp liền nhau:
- **Chứa lớp ngoài cùng (lớp 1 hoặc lớp N)**: Tính **1 nước** (Ví dụ: R, R', R2, Rw, 3Rw, 4R trên 4x4).
- **Chỉ gồm các lớp bên trong**: Tính **2 nước** (Ví dụ: M, E, S trên 3x3; 2R, 3R trên 4x4).
  - Quan hệ tương đương trên 3x3: `M = Rw' R` (2 nước).
- **Toàn bộ N lớp (x, y, z)**: Tính **0 nước** (nước thật của engine, có ghi vào events/preEvents nhưng không tăng bộ đếm).

*Ghi chú: STM và QTM chưa cài đặt ở phiên bản đầu, chỉ giữ làm tài liệu tham khảo.*