# 07. Vị từ Trạng thái (State Predicates)

## 1. Nguyên tắc cốt lõi
- Toàn bộ vị từ là hàm thuần (pure functions), kiểm tra trực tiếp trên mảng `Uint8Array` của engine.
- Phụ thuộc hoàn toàn vào tương quan màu với các viên tâm (`center(X) = state[X * 9 + 4]`), không phụ thuộc vào hướng xoay toàn khối (`x, y, z`).
- Engine chỉ cần gọi kiểm tra vị từ sau mỗi nước xoay lớp (`x, y, z` không làm thay đổi kết quả vị từ).
- Phạm vi áp dụng:
  - `isSolved`: Mọi kích thước từ 2x2 đến 10x10.
  - `crossSolved`, `pairSolved`, `f2lSolved`, `f2lSolvedAny`: Chỉ áp dụng cho khối 3x3.

## 2. Bảng chỉ số tường minh trên khối 3x3
Tâm của 6 mặt: `U: 4, R: 13, F: 22, D: 31, L: 40, B: 49`.

### 2.1. Bảng 12 viên cạnh (Edges)
Mỗi viên cạnh nối giữa hai mặt `(A, B)` có cặp chỉ số sticker `[sticker_trên_A, sticker_trên_B]`:
- **UF (0, 2)**: `[7, 19]`
- **UR (0, 1)**: `[5, 10]`
- **UB (0, 5)**: `[1, 46]`
- **UL (0, 4)**: `[3, 37]`
- **DF (3, 2)**: `[28, 25]`
- **DR (3, 1)**: `[32, 16]`
- **DB (3, 5)**: `[34, 52]`
- **DL (3, 4)**: `[30, 43]`
- **FR (2, 1)**: `[23, 12]`
- **FL (2, 4)**: `[21, 41]`
- **BR (5, 1)**: `[48, 14]`
- **BL (5, 4)**: `[50, 39]`

### 2.2. Bảng 8 viên góc (Corners)
Mỗi viên góc nối 3 mặt `(A, B, C)` có bộ 3 chỉ số `[sticker_A, sticker_B, sticker_C]`:
- **UFR (0, 2, 1)**: `[8, 20, 9]`
- **UFL (0, 2, 4)**: `[6, 18, 38]`
- **UBL (0, 5, 4)**: `[0, 47, 36]`
- **UBR (0, 5, 1)**: `[2, 45, 11]`
- **DFR (3, 2, 1)**: `[29, 26, 15]`
- **DFL (3, 2, 4)**: `[27, 24, 44]`
- **DBL (3, 5, 4)**: `[33, 53, 42]`
- **DBR (3, 5, 1)**: `[35, 51, 17]`

### 2.3. Quy ước đánh số Khe F2L (Slot 0..3)
Với một mặt đáy `X` bất kỳ, 4 khe F2L được xác định bởi các cặp mặt bên kề nhau `(A, B)` thỏa mãn `A < B` theo chỉ số mặt (`U=0, R=1, F=2, D=3, L=4, B=5`), sắp xếp theo thứ tự từ điển tăng dần của cặp `(A, B)`:
- Với **X = D (3)** hoặc **X = U (0)**:
  - Slot 0: `(R=1, F=2)`
  - Slot 1: `(R=1, B=5)`
  - Slot 2: `(F=2, L=4)`
  - Slot 3: `(L=4, B=5)`
- Với **X = F (2)** hoặc **X = B (5)**:
  - Slot 0: `(U=0, R=1)`
  - Slot 1: `(U=0, L=4)`
  - Slot 2: `(R=1, D=3)`
  - Slot 3: `(D=3, L=4)`
- Với **X = R (1)** hoặc **X = L (4)**:
  - Slot 0: `(U=0, F=2)`
  - Slot 1: `(U=0, B=5)`
  - Slot 2: `(F=2, D=3)`
  - Slot 3: `(D=3, B=5)`

## 3. Định nghĩa các vị từ

- **`isSolved(state, size): boolean`**: Với mỗi mặt từ `0` đến `5`, toàn bộ `size * size` sticker trên mặt đó có cùng giá trị màu với sticker đầu tiên của mặt đó.
- **`crossSolved(state, face): boolean`**: Cả 4 viên cạnh tiếp giáp với `face` đều có sticker trên `face` bằng `center(face)` và sticker trên mặt kề `A` bằng `center(A)`.
- **`pairSolved(state, face, slot): boolean`**: Xét cặp mặt bên `(A, B)` ứng với `slot` của mặt `face`. Đạt `true` khi viên góc `(face, A, B)` có 3 sticker khớp `center(face), center(A), center(B)` VÀ viên cạnh giữa `(A, B)` có 2 sticker khớp `center(A), center(B)`.
- **`f2lSolved(state, face): boolean`**: `crossSolved(state, face)` đạt `true` và cả 4 khe `slot = 0..3` đều thỏa `pairSolved(state, face, slot) === true`.
- **`f2lSolvedAny(state): boolean`**: Tồn tại ít nhất một mặt `face` trong `0..5` thỏa mãn `f2lSolved(state, face) === true`.

## 4. Trường hợp kiểm thử chuẩn (3x3)
- Khối đã giải: `isSolved` đúng, `f2lSolved(X)` đúng với cả 6 mặt `X`.
- Từ khối đã giải, thực hiện 1 nước mặt đơn bất kỳ (ví dụ `R` hoặc `R2`): chỉ duy nhất mặt đối diện (`L`) còn thỏa `f2lSolved(L) === true`, 5 mặt còn lại đều `false`.
- Từ khối đã giải, thực hiện `R U R' U'`: cả 6 mặt đều có `f2lSolved(X) === false`, do đó `f2lSolvedAny === false`.