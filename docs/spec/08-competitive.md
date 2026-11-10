# 08. Luật Thi đấu (Competitive Rules)

## 1. Máy trạng thái Trận đấu
- **Thi đấu trực tuyến (1v1 / Online)**:
  `LOBBY` -> `COUNTDOWN` (3000 ms) -> `INSPECTING` (15000 ms, khối `k = 0`) -> `RUNNING` -> `ENDED` -> `VERIFYING` -> `RESULT`.
- **Chơi một người (Offline Time Attack)**:
  Bỏ qua `LOBBY` và `VERIFYING`. Bắt đầu trực tiếp từ `COUNTDOWN` -> `INSPECTING` -> `RUNNING` -> `ENDED` -> `RESULT`.
  - Trong chế độ 1 người: người chơi có thể bấm nước xoay lớp đầu tiên để vào `RUNNING` sớm trước khi hết 15000 ms.
  - Trong chế độ 1v1 trực tuyến: cả hai người chơi bắt buộc chờ hết đúng 15000 ms của `INSPECTING` để đồng hồ `RUNNING` bắt đầu chạy cùng một thời điểm (không có phạt +2 hay DNF riêng lẻ).

## 2. Quy tắc bảo mật Scramble và Chuyển khối
- **Chống lộ Scramble sớm**: Server tuyệt đối không gửi `seed` trong trạng thái `LOBBY` hoặc `COUNTDOWN`. Chỉ cấp scramble khi bước vào `INSPECTING` (cấp theo lô nhỏ: khối hiện tại cộng 2 khối kế tiếp để chuyển khối tức thời mà không lộ toàn bộ chuỗi).
- **Khối đầu tiên (`k = 0`)**: Trong 15000 ms `INSPECTING`, chỉ cho phép xoay camera bằng chuột hoặc xoay toàn khối `x, y, z` (ghi vào `preEvents`). Khóa mọi nước xoay lớp.
- **Chuyển khối liên hoàn (`k >= 1`)**:
  - Khi nước đi tại mốc `t` (`t <= durationMs`) làm thỏa mãn vị từ của chế độ chơi (`f2lSolvedAny` cho `f2lRush`, `isSolved` cho `fullSolve`), khối `k` hoàn thành ngay với `endT = t`.
  - Khối `k + 1` xuất hiện ngay lập tức với `startT = endT` ở hướng chuẩn (Trắng trên, Lục trước).
  - **Không khóa bàn phím khi chuyển khối**: Animation chỉ là hiển thị; mọi phím bấm có mốc thời gian sau `endT` lập tức được áp dụng logic vào khối `k + 1`.
- **Cắt giờ (Time Cutoff)**: Chỉ tính các nước đi có `t <= durationMs`. Khối đang giải dở khi hết giờ có `endT = null`, `result = "abandoned"` và không tính điểm.

## 3. Lọc Scramble cho Thi đấu (`ScrambleFilter`)
Sử dụng hàm `matchScrambleAt(seed, 3, k, genVersion, filter)` thử lần lượt ứng viên `j = 0, 1, 2...` (tối đa `maxCandidates = 1000`):
- Điều kiện vượt qua bộ lọc:
  1. `isSolved(state, 3) === false`
  2. `f2lSolvedAny(state) === false`
  3. Độ dài cross tối ưu nhỏ nhất trên cả 6 mặt (`min_face(crossOptimal(state, face))`) >= `minCrossOptimal` (nếu `minCrossOptimal` khác `null`).
- **Nhánh dự phòng tất định (Fallback)**: Nếu sau `maxCandidates` ứng viên vẫn không có ứng viên nào thỏa mãn, chọn cố định ứng viên cuối cùng (`j = maxCandidates - 1`) để đảm bảo thuật toán luôn dừng và cho cùng kết quả ở mọi máy.
- Ở giai đoạn trước khi có bộ giải Cross (Giai đoạn 7b), file `rules/v1.json` đặt `minCrossOptimal: null`. Khi có bộ giải ở Giai đoạn 7b, phát hành `rules/v2.json` với `minCrossOptimal: 5`.

## 4. Hàm chấm điểm thuần và Tiebreak
Hàm `scoreRun(cubes, rules)` trả về:
- `score`: Số khối có `result` hợp lệ (`"f2l"` hoặc `"solved"`).
- `lastEndT`: Giá trị `endT` của khối hoàn thành cuối cùng (`0` nếu `score === 0`).
- `totalMoves`: Tổng `pressCount` (theo HTM, không tính `x, y, z`) của **chỉ các khối đã hoàn thành**.

Thứ tự phân định thắng thua:
1. `score` lớn hơn thắng.
2. `lastEndT` nhỏ hơn thắng.
3. `totalMoves` nhỏ hơn thắng.
4. Cả 3 bằng nhau: Hòa (`Draw`, điểm trận `S = 0.5` khi tính Elo).

## 5. Giao thức mạng, Sự cố và Tính Elo
- **Gói tin hoàn thành khối**: Khi xong khối `k`, client gửi `cube_done(k, preEvents, events, endT)`. Server kiểm tra và trả về `cube_ack(k)`. Nếu mất kết nối và vào lại, client tự động gửi lại các khối chưa nhận được `cube_ack`.
- **Mất kết nối đến hết giờ**: Server chấm điểm dựa trên các khối đã nhận và xác minh thành công trước khi hết thời gian ân hạn (grace period 3000 ms sau khi kết thúc trận).
- **Bỏ cuộc (Forfeit)**: Người bỏ cuộc bị xử thua ngay lập tức (`S = 0`), đối thủ thắng (`S = 1`), Elo vẫn cập nhật bình thường theo công thức chuẩn để chống cày điểm/thoát trận.
- **Thời lượng Full Solve theo Elo**:
  - 1v1: Lấy trung bình cộng Elo của 2 người chơi trong chế độ `fullSolve`.
  - 1 người: Lấy Elo hiện tại của người chơi (hoặc `1000` nếu chưa có tài khoản).
  - So khớp với bảng `durationMsByElo`: chọn dòng có ngưỡng Elo lớn nhất `<= elo_trung_bình`.

## 6. Cấu trúc file cấu hình bất biến (`rules/v1.json`)
```json
{
  "rulesVersion": 1,
  "modes": {
    "f2lRush": { "durationMs": 45000, "firstInspectionMs": 15000 },
    "fullSolve": {
      "durationMsByElo": [[0, 120000], [1200, 150000], [1500, 180000]],
      "firstInspectionMs": 15000
    }
  },
  "scrambleFilter": {
    "minCrossOptimal": null,
    "maxCrossOptimal": null,
    "maxCandidates": 1000
  },
  "elo": {
    "initial": 1000,
    "kNew": 40,
    "kStable": 20,
    "newPlayerGames": 20
  }
}