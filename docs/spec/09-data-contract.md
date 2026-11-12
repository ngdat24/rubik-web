# 09. Hợp đồng Dữ liệu (Data Contract)

## 1. Quy ước chung
- **Thời gian**: Mọi trường thời gian (`t`, `timeMs`, `inspectionMs`, `durationMs`, `startT`, `endT`) đều là số nguyên mili-giây không âm (`number`, integer >= 0).
- **Mốc tương đối**:
  - Trong `preEvents`: `t` tính từ lúc bắt đầu `INSPECTING`.
  - Trong `events` của `Solve`: `t` tính từ nước xoay lớp đầu tiên (`events[0].t === 0`).
  - Trong `events` của `Attempt`: `t` tính từ lúc đồng hồ trận đấu bắt đầu chạy (`RUNNING`).
- **Tái lập**: Mọi bản ghi lưu trữ đều có `schemaVersion`, `seed`, `genVersion`, `engineVersion` (và `rulesVersion` với thi đấu).
- **Thời gian hệ thống**: Trường `startedAt` do client gửi chỉ dùng hiển thị lịch sử cá nhân; server dùng đồng hồ riêng (`created_at`) cho bảng xếp hạng.

## 2. Định nghĩa Kiểu dữ liệu (TypeScript Interfaces)

### 2.1. Kiểu cơ sở
- `Move`: string (Dạng chuẩn: `"R"`, `"U'"`, `"Rw2"`, `"x"`)
- `Penalty`: `"none" | "+2" | "DNF"`
- `ScrambleSource`: `"generated" | "custom"`
- `MoveEvent`:
  - `m`: Move (bao gồm cả `x, y, z`)
  - `t`: number (ms nguyên)

### 2.2. Bản ghi Lần giải cá nhân (`Solve`)
- `schemaVersion`: `1`
- `id`: string (UUID v4)
- `size`: number (2..10)
- `seed`: string
- `scrambleIndex`: number (Mặc định `k = 0` cho giải đơn)
- `scrambleSource`: ScrambleSource (Chỉ `"generated"` mới được lên bảng xếp hạng)
- `genVersion`: number
- `engineVersion`: string
- `preEvents`: `MoveEvent[]` (Chỉ chứa `x, y, z` trong inspection)
- `events`: `MoveEvent[]` (Các nước đi trong lúc giải; rỗng `[]` nếu DNF từ inspection)
- `inspectionMs`: number
- `timeMs`: number (Bằng `t` của nước cuối cùng; bằng `0` nếu DNF từ inspection)
- `penalty`: Penalty
- `startedAt`: string (ISO 8601 UTC)

### 2.2.1. Metadata lịch sử local (Giai đoạn 5)

```ts
interface HistoryEntry {
  solve: Solve;                  // Bản ghi gốc, giữ nguyên penalty và timeMs
  penaltyOverride: Penalty | null; // null: dùng phạt gốc; khác null: chỉnh local
}
```

- Wrapper này dùng cho lịch sử local và backup JSON, không phải trường mới của Solve schemaVersion=1 và không được gửi nguyên wrapper vào endpoint xác minh Solve.
- Phạt hiệu dụng = penaltyOverride ?? solve.penalty. Chỉnh phạt không sửa timeMs, inspectionMs, sự kiện hoặc phạt gốc. Khôi phục phạt gốc đặt override=null.
- Một id chỉ thêm một lần; đọc ra bản sao độc lập. Xóa chỉ loại mục khỏi lịch sử/thống kê, không hoàn tác trạng thái khối. Thống kê lọc theo size và dùng thứ tự giải, dù danh sách hiển thị mới nhất trước.
- Lịch sử tự lưu IndexedDB, envelope lưu trữ có revision riêng, không thêm trường vào Solve. Tab cũ không được ghi đè revision mới; chưa có tự hợp nhất nhiều tab. Backup JSON version=1 gồm entries, tối đa 10 MB/10.000 bản ghi; validate toàn bộ trước merge, giữ bản hiện tại khi lỗi, ID đã có không bị ghi đè. CSV chỉ xuất để xem, không dùng nhập khôi phục. Server LAN chỉ nhận Solve gốc của lượt mới 2×2/3×3 qua luồng gửi riêng, không nhận wrapper hoặc backup nhập. Chỉnh nhẹ hơn phạt gốc chỉ ảnh hưởng thống kê local; quy tắc xác minh tối thiểu trên server tại mục 4 vẫn giữ nguyên.

### 2.3. Bản ghi Khối trong trận (`CubeRun`)
- `index`: number (`k = 0, 1, 2...`)
- `startT`: number (Khối `k = 0` có `startT = 0`)
- `endT`: `number | null` (`null` nếu hết giờ chưa xong)
- `preEvents`: `MoveEvent[]` (Chỉ khối `k = 0` được phép có phần tử)
- `events`: `MoveEvent[]`
- `result`: `"f2l" | "solved" | "abandoned"`

### 2.4. Bản ghi Lượt thi đấu (`Attempt`)
- `schemaVersion`: `1`
- `id`: string (UUID v4)
- `mode`: `"f2lRush" | "fullSolve"`
- `durationMs`: number
- `seed`: string
- `genVersion`: number
- `rulesVersion`: number
- `engineVersion`: string
- `cubes`: `CubeRun[]`
- `startedAt`: string (ISO 8601 UTC)

## 3. Ví dụ JSON chuẩn (Fixture kiểm thử cho Solve)

    {
      "schemaVersion": 1,
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "size": 3,
      "seed": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "scrambleIndex": 0,
      "scrambleSource": "generated",
      "genVersion": 1,
      "engineVersion": "0.1.0",
      "preEvents": [
        { "m": "y", "t": 1200 },
        { "m": "x'", "t": 2500 }
      ],
      "events": [
        { "m": "R", "t": 0 },
        { "m": "U", "t": 180 },
        { "m": "R'", "t": 350 },
        { "m": "U'", "t": 520 }
      ],
      "inspectionMs": 8400,
      "timeMs": 520,
      "penalty": "none",
      "startedAt": "2026-11-11T04:00:00.000Z"
    }

## 4. Quy tắc xác minh nghiêm ngặt trên Server (Validation Rules)

### 4.1. Giới hạn kích thước và chống lạm dụng
- Schema ở chế độ strict (từ chối mọi bản ghi có trường lạ).
- Giới hạn mảng: `preEvents.length <= 100`, `events.length <= 2000` mỗi khối, `cubes.length <= 200` mỗi trận. Tổng dung lượng JSON <= 256 KB.
- Đánh dấu bất thường (flag for review) nếu tốc độ bấm trung bình `TPS > 25` trên toàn bộ lần giải.

### 4.2. Danh sách kiểm tra cho `Solve`
1. Chỉ nhận xác minh nếu `scrambleSource === "generated"` và `seed` do server cấp hợp lệ.
2. Server tự tính mức phạt tối thiểu từ `inspectionMs` (`<= 15000`: none, `15001..17000`: +2, `> 17000`: DNF). Không tin tưởng `penalty` nhẹ hơn từ client.
3. Mọi phần tử trong `preEvents` phải là `x, y, z`, có `t` tăng dần và `preEvents.last.t <= inspectionMs`.
4. Nếu `inspectionMs > 17000`: bắt buộc `penalty === "DNF"`, `events` rỗng, `timeMs === 0`.
5. Với lần giải hoàn thành: `events[0]` là nước xoay lớp có `t === 0`; `t` tăng dần không nghiêm ngặt; nước cuối cùng là nước xoay lớp; `timeMs === events.last.t`.
6. Khi chạy lại từ trạng thái scramble qua `preEvents` và `events`: `isSolved` chỉ đạt `true` lần đầu tiên tại đúng nước cuối cùng của `events`.

### 4.3. Danh sách kiểm tra cho `Attempt`
1. `cubes[0].startT === 0`, và với mọi `k >= 0`: `cubes[k + 1].startT === cubes[k].endT`.
2. Chỉ khối cuối cùng trong danh sách `cubes` mới được phép có `result === "abandoned"` hoặc `endT === null`.
3. Các khối `k >= 1` bắt buộc có `preEvents` rỗng (`[]`).
4. Mọi sự kiện trong khối `k` có `startT <= t <= endT <= durationMs` (hoặc `startT <= t <= durationMs` nếu khối cuối bỏ dở).
5. Khi mô phỏng lại từng khối `k` thành công: vị từ tương ứng (`f2lSolvedAny` hoặc `isSolved`) phải đạt `true` lần đầu tiên ở đúng nước cuối cùng của khối đó, và `endT === events.last.t`.