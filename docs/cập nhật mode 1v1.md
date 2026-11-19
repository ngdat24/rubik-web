# Cập nhật mode 1v1

## Sảnh và phòng đấu

- Tạo phòng hoặc nhập mã 8 ký tự để tham gia. Chủ phòng chọn 2×2, 3×3, F2L hoặc 1 mặt, từ 1 đến 5 ván và từ 1 đến 5 phút giải mỗi ván. F2L và 1 mặt dùng khối 3×3.
- Hiển thị skin đối phương và Giảm đồ họa là tùy chọn riêng trên thiết bị của mỗi người. Giảm đồ họa giữ texture chính và tắt các lớp hiệu ứng nặng. Champion của đối thủ chưa được đồng bộ.
- Trong phòng có mã sao chép, tỉ số, kết quả từng ván và hai khung Rubik. Scramble hiện cạnh tên khi khối đã được xáo trộn.
- Kênh chat dùng chung trên Trang chủ, 1v1, Time Limit và BXH Toàn Cầu. Khung chat nằm trong bố cục trang. Trên điện thoại, nút Kênh chat mở vùng tin nhắn.

## Luật thi đấu

- Cả hai bấm Sẵn sàng, sau đó cùng trải qua 3 giây đếm ngược và 15 giây inspection cố định. Đồng hồ giải bắt đầu sau inspection.
- Chủ phòng có thể đổi mode trước khi bắt đầu giải và giữa các ván. Đổi trong lúc chuẩn bị tạo scramble mới và khởi động lại đếm ngược cùng inspection. Mã phòng giữ nguyên.
- Người hoàn thành trước thắng ván. Người còn lại có thể giải nốt để ghi thời gian hoặc bỏ cuộc. Hết giờ hoặc bỏ cuộc hiện X. Nếu cả hai hết giờ mà chưa hoàn thành, ván hòa.
- Trận kết thúc khi hết số ván hoặc cách biệt lớn hơn số ván còn lại. Tỉ số bằng nhau khi hết ván thì hòa. Cả hai có thể chọn Đấu lại trong cùng phòng.
- Mất mạng không dừng đồng hồ. Khi máy chủ nhận tín hiệu chủ phòng đóng tab hoặc rời trang, phòng đóng ngay. Tải lại cũng phát tín hiệu này. Tạo phòng mới thay thế các phòng chờ cũ của chủ phòng mà chưa có người tham gia.

## Cược và phát hành

- Có thể chọn không cược, cược CB ở mức 100, 200, 300 hoặc 500, hoặc cược ZN ở mức 1 hoặc 2. Cả chủ phòng lẫn người tham gia phải có đủ số dư của đúng loại tiền.
- Máy chủ kiểm tra lại và khóa cược khi cả hai sẵn sàng ở ván đầu. Cược được quyết toán một lần cho cả trận. Người thắng nhận 90% tổng cược CB hoặc 100% tổng cược ZN. Trận hòa hoàn đủ cược. Bỏ cuộc tính thua ván, còn rời phòng trong trận tính thua cả trận.
- Để bật trên production, áp migration `20261119213000_one_on_one_matches.sql` trước, rồi đặt `ONE_ON_ONE_MATCHES_ENABLED=1` và `VITE_ONE_ON_ONE_MATCHES=1` trên Vercel và deploy lại. Link mời cũ dùng tham số `room` vẫn đi qua luồng cũ.
