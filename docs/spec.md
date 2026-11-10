\# Rubik Engine Specification



\## 1. Biểu diễn trạng thái khối NxN

\- Khối kích thước $N \\times N$ gồm 6 mặt: U (0), R (1), F (2), D (3), L (4), B (5).

\- Sử dụng mảng phẳng `Uint8Array(6 \* N \* N)`.

\- Thứ tự các mặt: `U, R, F, D, B, L` theo chỉ số từ 0 đến 5.

\- Công thức tính chỉ số sticker tại mặt `face`, hàng `r`, cột `c` ($0 \\le r, c < N$):

&#x20; $$\\text{index} = \\text{face} \\cdot N^2 + r \\cdot N + c$$



\## 2. Màu mặc định và giá trị số (Western Scheme)

\- 0: Trắng (U - Up)

\- 1: Đỏ (R - Right)

\- 2: Xanh lá (F - Front)

\- 3: Vàng (D - Down)

\- 4: Cam (L - Left)

\- 5: Xanh dương (B - Back)



\## 3. Hệ thống nước đi (Move Notation)

\- Ký hiệu chuẩn WCA: `U, D, L, R, F, B`.

\- Biến thể:

&#x20; - Chiều quay: Thuận kim đồng hồ (không dấu), ngược kim đồng hồ (`'`), quay 180 độ (`2`).

&#x20; - Lớp rộng (Wide): `Rw, Uw...` (xoay nhiều lớp từ ngoài vào).

&#x20; - Lát cắt (Slice): `M, E, S`.

&#x20; - Toàn khối: `x, y, z`.

\- Thước đo nước đi mặc định: \*\*HTM (Half Turn Metric)\*\*. Xoay toàn khối không tính nước.



\## 4. Điều kiện hoàn thành

\- `isSolved()`: Mọi sticker trên từng mặt có cùng giá trị số với tâm mặt đó.

\- `f2lSolved(face)`: Cross hoàn tất trên mặt `face` + 4 cặp góc-cạnh thuộc 2 tầng đầu tiên đúng vị trí và hướng.

