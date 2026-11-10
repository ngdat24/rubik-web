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