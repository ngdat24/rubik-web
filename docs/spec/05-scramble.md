# 05. Luật Scramble và Hạt giống (Scramble & Seed)

## 1. Bảng độ dài và Nước đi theo Kích thước (genVersion = 1)

| Kích thước | Độ dài (nước) | Nước đi cho phép |
| :--- | :--- | :--- |
| 2x2 | 9 | R, U, F (kèm ' và 2) |
| 3x3 | 20 | U, D, L, R, F, B (kèm ' và 2) |
| 4x4 | 40 | 6 mặt cơ bản + Rw, Uw, Fw (độ rộng w = 2) |
| 5x5 | 60 | 6 mặt cơ bản + Rw, Uw, Fw (w = 2) |
| 6x6 | 80 | 6 mặt cơ bản + Rw, 3Rw, Uw, 3Uw, Fw, 3Fw (w = 2, 3) |
| 7x7 | 100 | 6 mặt cơ bản + Rw, 3Rw, Uw, 3Uw, Fw, 3Fw (w = 2, 3) |
| 8x8 | 100 | 6 mặt cơ bản + Wide trên R, U, F với w từ 2 đến 4 |
| 9x9 | 110 | 6 mặt cơ bản + Wide trên R, U, F với w từ 2 đến 4 |
| 10x10 | 120 | 6 mặt cơ bản + Wide trên R, U, F với w từ 2 đến 5 |

*Quy ước: Với N >= 4, nước wide chỉ sinh trên 3 mặt R, U, F với độ rộng từ 2 đến floor(N/2). Scramble luôn áp dụng lên khối đã giải ở hướng chuẩn (Trắng trên, Lục trước) và không ghi vào events.*

## 2. Quy tắc chống dư thừa theo đoạn cùng trục
Chia chuỗi scramble thành các đoạn liên tiếp gồm các nước có cùng trục quay (trục x: R/L, trục y: U/D, trục z: F/B). Trong mỗi đoạn cùng trục:
1. Mỗi mặt chỉ được xuất hiện **tối đa 1 lần** (không phân biệt nước mặt đơn hay wide).
2. Các mặt trong đoạn bắt buộc phải đứng theo **thứ tự chỉ số mặt tăng dần** (U=0, R=1, F=2, D=3, L=4, B=5).
   - Hợp lệ: `U D`, `R L`, `F B`, `Rw L'`.
   - Không hợp lệ: `R R'`, `R Rw`, `L R`, `D U`, `R L R'`.

## 3. Bộ sinh số giả ngẫu nhiên (PRNG) và Hạt giống
- Hàm băm chuỗi: Sử dụng `xmur3` để băm chuỗi seed thành số nguyên 32-bit không dấu.
- PRNG: Sử dụng `mulberry32(hash32)` chỉ dùng phép toán nguyên 32-bit và `Math.imul`, tuyệt đối không dùng `Math.random()`.
- Chuỗi đầu vào để băm cho khối thứ `k`, ứng viên thứ `j`: `seed + "|" + size + "|" + k + "|" + j`.

### 3.1. Thủ tục chọn nước (genVersion 1)

Luồng `u32` của mỗi scramble là `mulberry32(xmur3(seed + "|" + size + "|" + k + "|" + j)())`; mỗi lần gọi trả một số nguyên không dấu 32-bit.

```text
axis(f) = f % 3  // U,D → 0; R,L → 1; F,B → 2
cands = []
for f in (N = 2 ? [U,R,F] : [U,R,F,D,L,B]):
  wmax = (N >= 4 và f thuộc {U,R,F}) ? floor(N/2) : 1
  for w in 1..wmax:
    for s in ["", "'", "2"]:
      cands.push({f, w, s})
last = none; segLen = 0
lặp length(N) lần:
  pool = cands lọc theo: last = none
         hoặc axis(c.f) != axis(last)
         hoặc (segLen = 1 và last < c.f)
  c = pool[floor(u32() * pool.length / 4294967296)]
  segLen = (last != none và axis(c.f) = axis(last)) ? segLen + 1 : 1
  last = c.f
  xuất tên mặt c.f: w = 1 → "F"; w = 2 → "Fw"; w >= 3 → "{w}Fw"
  rồi thêm hậu tố c.s (F ở ví dụ này đại diện cho mặt c.f)
```

Gọi `u32()` đúng một lần cho mỗi nước. Nhóm `scramble` trong vectors.json đã được duyệt; `matchScramble_draft` hoãn tới Giai đoạn 7 và không dùng làm tiêu chí E1–E10.

## 4. Hai hàm API công khai
1. **Hàm lõi (`scrambleAt`)**:
   - Chữ ký: `scrambleAt(seed: string, size: number, k: number, genVersion: number): Move[]`
   - Dùng cố định ứng viên `j = 0`, không lọc, trả về mảng các nước đi chuẩn hóa.
   - Bất biến theo `genVersion`: Khi nâng cấp thuật toán ở bản sau, phải giữ nguyên code của `genVersion = 1` để tái lập lại các lần giải cũ.
2. **Hàm thi đấu (`matchScrambleAt`)**:
   - Chữ ký: `matchScrambleAt(seed: string, size: number, k: number, genVersion: number, filter: ScrambleFilter): Move[]`
   - Lặp thử ứng viên `j = 0, 1, 2...` (tối đa 1000 lần) cho đến khi trạng thái sau scramble thỏa mãn:
     - `isSolved === false`
     - `f2lSolvedAny === false` (đối với 3x3)
     - Độ dài cross tối ưu nằm trong khoảng `[minCrossOptimal, maxCrossOptimal]` của `filter`.
