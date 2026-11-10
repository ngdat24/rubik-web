# 01. Hệ tọa độ, Màu và Chỉ số Sticker

## 1. Quy ước trục và mặt
- **Không gian 3D (Y-up)**:
  - Trục +x: Hướng về mặt Right (R).
  - Trục +y: Hướng về mặt Up (U).
  - Trục +z: Hướng về mặt Front (F).
- **Thứ tự mặt chuẩn**: `U, R, F, D, L, B` tương ứng với chỉ số mặt từ `0` đến `5`.
- **Tính chất mặt đối diện**: `oppositeFace = (face + 3) % 6` (U-D: 0-3, R-L: 1-4, F-B: 2-5).
- **Màu chuẩn (Western Scheme)**:
  - 0: Trắng (U)
  - 1: Đỏ (R)
  - 2: Lục (F)
  - 3: Vàng (D)
  - 4: Cam (L)
  - 5: Lam (B)
  *(Giao diện cho phép đổi bảng màu hiển thị nhưng Engine chỉ lưu số từ 0 đến 5).*

## 2. Trải phẳng và chỉ số mảng
- Mảng phẳng trạng thái: `Uint8Array(6 * N * N)`.
- Công thức chỉ số toàn cục của sticker tại mặt `face` (0..5), hàng `r` (0..N-1), cột `c` (0..N-1):
  `index = face * N * N + r * N + c`
- **Quy ước hướng nhìn từng mặt (nhìn thẳng từ bên ngoài vào mặt đó)**:
  - Hàng `0` ở cạnh trên, hàng `N - 1` ở cạnh dưới.
  - Cột `0` ở cạnh trái, cột `N - 1` ở cạnh phải.
  - Với mặt **U (0)**: Cạnh trên giáp B, cạnh dưới giáp F, cạnh trái giáp L, cạnh phải giáp R.
  - Với mặt **D (3)**: Cạnh trên giáp F, cạnh dưới giáp B, cạnh trái giáp L, cạnh phải giáp R.
  - Với mặt **F (2)**: Cạnh trên giáp U, cạnh dưới giáp D, cạnh trái giáp L, cạnh phải giáp R.
  - Với mặt **B (5)**: Cạnh trên giáp U, cạnh dưới giáp D, cạnh trái giáp R, cạnh phải giáp L.
  - Với mặt **L (4)**: Cạnh trên giáp U, cạnh dưới giáp D, cạnh trái giáp B, cạnh phải giáp F.
  - Với mặt **R (1)**: Cạnh trên giáp U, cạnh dưới giáp D, cạnh trái giáp F, cạnh phải giáp B.

## 3. Sơ đồ chỉ số toàn cục trên khối 3x3 (0..53)
Mỗi mặt có 9 sticker:
- **U (0..8)**: Hàng trên `0, 1, 2` (giáp B); Tâm `4`; Hàng dưới `6, 7, 8` (giáp F).
- **R (9..17)**: Hàng trên `9, 10, 11` (giáp U); Tâm `13`; Cột trái `9, 12, 15` (giáp F).
- **F (18..26)**: Hàng trên `18, 19, 20` (giáp U); Tâm `22`; Cột phải `20, 23, 26` (giáp R).
- **D (27..35)**: Hàng trên `27, 28, 29` (giáp F); Tâm `31`; Hàng dưới `33, 34, 35` (giáp B).
- **L (36..44)**: Hàng trên `36, 37, 38` (giáp U); Tâm `40`; Cột phải `38, 41, 44` (giáp F).
- **B (45..53)**: Hàng trên `45, 46, 47` (giáp U); Tâm `49`; Cột trái `45, 48, 51` (giáp R).

## 4. Chỉ số lớp (Layer Indexing)
- Lớp `1` là lớp ngoài cùng của mặt được gọi tên.
- Lớp `N` là lớp ngoài cùng của mặt đối diện.