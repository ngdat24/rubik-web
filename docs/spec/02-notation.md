# 02. Ký hiệu và Quy tắc quay

## 1. Chiều quay quy ước
- Chiều thuận kim đồng hồ: Xoay -90 độ quanh pháp tuyến hướng ra ngoài của mặt đó (quy tắc bàn tay phải).
- Hậu tố:
  - Không hậu tố: -90 độ thuận chiều kim đồng hồ.
  - Dấu nháy đơn ('): +90 độ ngược chiều kim đồng hồ.
  - Số 2: 180 độ (chuẩn hóa 2' thành 2). Không chấp nhận số 3.

## 2. Phân loại và Cú pháp chuẩn
Parser phân tách các nước đi bằng khoảng trắng. Mỗi nước đi phải khớp đúng một trong 4 loại:
- **faceMove**: `[n] FACE [suffix]` (với n từ 1 đến N, mặc định là 1).
- **wideMove**: `[n] FACE "w" [suffix]` (với n từ 2 đến N-1, mặc định là 2).
- **sliceMove**: `("M" | "E" | "S") [suffix]` (Chỉ hợp lệ trên khối 3x3).
- **rotMove**: `("x" | "y" | "z") [suffix]` (Xoay toàn bộ khối).

Chi tiết:
- **Mặt ngoài (FACE)**: U, D, L, R, F, B.
- **Wide**: Rw, Uw, Fw... (xoay từ lớp 1 đến lớp n). Dạng chuẩn luôn là Rw, không viết 2Rw.
- **Layer đơn**: 2R (chỉ xoay duy nhất lớp thứ 2).
- **Toàn khối (x, y, z)**: Là nước đi thực của engine (hoán vị toàn bộ các lớp của khối), không phải xoay camera.
  - Được ghi vào `preEvents` (trong inspection) hoặc `events` (trong khi giải).
  - Không tính vào HTM (0 nước).
  - Không làm kích hoạt đồng hồ bấm giờ.
  - Xoay camera bằng chuột/cảm ứng là hiển thị thuần túy của Renderer, không tác động engine và không ghi log.

## 3. Quy tắc chuẩn hóa (Canonicalization)
- Chữ thường `r, u, f, d, l, b` chuyển thành `Rw, Uw, Fw, Dw, Lw, Bw`. (Báo lỗi với `3r` hoặc `m`).
- `2Rw` chuyển thành `Rw`.
- `1R` chuyển thành `R`.
- `R2'` chuyển thành `R2`.
- Dấu nháy cong (`’` hoặc `‘`) chuyển thành dấu nháy thẳng (`'`).
- Gộp nhiều khoảng trắng hoặc dấu xuống dòng liên tiếp thành 1 khoảng trắng đơn.
- Với khối 2x2: chỉ cho phép 6 nước mặt cơ bản (U, D, L, R, F, B) và x, y, z.
- Không hỗ trợ dấu ngoặc đơn như `(R U R' U')` ở bản đầu (báo lỗi cú pháp).

## 4. Bảng ánh xạ trục và góc quay cho Engine
Quy ước 1 phần tư vòng thuận chiều kim đồng hồ quanh trục dương:

| Nước đi | Trục quay | Góc quay | Lớp tác động (đếm từ mặt gọi tên) |
| :--- | :--- | :--- | :--- |
| R / L | x | -90 độ / +90 độ | +x (lớp 1) / -x (lớp 1) |
| U / D | y | -90 độ / +90 độ | +y (lớp 1) / -y (lớp 1) |
| F / B | z | -90 độ / +90 độ | +z (lớp 1) / -z (lớp 1) |
| M | x | +90 độ (cùng hướng L) | Lớp 2 (chỉ 3x3) |
| E | y | +90 độ (cùng hướng D) | Lớp 2 (chỉ 3x3) |
| S | z | -90 độ (cùng hướng F) | Lớp 2 (chỉ 3x3) |
| x / y / z | x / y / z | -90 độ | Tất cả các lớp (1 đến N) |