# 12. Timer, lịch sử và giao diện — Giai đoạn 5

## 1. Phạm vi và kiến trúc

- packages/timer: SolveTimer và SolveHistory thuần, chỉ phụ thuộc engine; không DOM, Three.js hay đồng hồ animation.
- packages/controller: giữ Cube, khóa input theo lý do, gate trước nước, phát nước đã nhận và thay trạng thái. Không sửa packages/engine trong Giai đoạn 5.
- apps/web/src/timer-controls.ts: Space/Escape, nút cảm ứng, dialog hủy, khóa điều khiển, readout và vòng cập nhật.
- apps/web/src/history-controls.ts: danh sách mới nhất trước, chỉnh/xóa phạt và thống kê theo size. Bản ghi gốc được giữ độc lập với penaltyOverride.
- Renderer nhận snapshot/preview; onMoveAnimated chỉ phục vụ hiển thị. Không lấy thời điểm vẽ xong làm thời gian solve.

## 2. Cách chơi

1. Chọn N=2..10. Space hoặc nút Chuẩn bị scramble tạo seed mới và scramble k=0, vẫn IDLE. Nút Xáo trộn dùng seed hiện tại.
2. Nếu muốn scramble mới, nhấn Shift+Space; nút Xáo trộn tái tạo theo seed hiện tại (cùng seed vẫn ra cùng chuỗi). Space/Bắt đầu lần tiếp theo mới vào inspection.
3. Xoay camera tự do; phím x/y/z trong inspection ghi preEvents. Nước lớp đầu tiên (mặt, wide hoặc M/E/S hợp lệ) bắt đầu solve với events[0].t=0.
4. Giải khối bằng phím hoặc kéo lớp; engine isSolved trên snapshot sau nước chốt kết quả tự động, không bấm Space để dừng.
5. Sau FINISHED, mọi nước bị chặn; Space chuẩn bị scramble mới và về IDLE, bấm lần nữa mới inspection.
6. Esc/Hủy lượt mở dialog xác nhận. Đồng hồ không dừng. Xác nhận khi còn chạy khôi phục cùng scramble, về IDLE, không thêm lịch sử. Nếu đã timeout trong dialog thì giữ DNF, xác nhận chỉ đóng dialog.

Space/Escape không chạy trong vùng nhập, khi composing, với Ctrl/Meta/Alt hoặc khi có dialog mở. Chặn Space trên cả keydown/keyup trong vùng chơi, kể cả nút đang focus. Nút Bắt đầu/Hủy dùng click event.timeStamp để phục vụ thiết bị không có bàn phím.

## 3. Timestamp và readout

Giữ timestamp chính xác, floor duy nhất chênh lệch với origin. Inspection origin là Space/Start bắt đầu inspection; solve origin là nước lớp đầu tiên nhận ở controller (keydown hoặc pointerup). Date được inject chỉ để startedAt ISO, không đo elapsed. Các sự kiện có thể cùng timestamp; controller từ chối batch nhiều nước khi có timer gate để tránh kết thúc giữa batch.

| Pha | Readout | Điều kiện chuyển |
| --- | --- | --- |
| idle | 0.00 | Chuẩn bị scramble hoặc bắt đầu inspection |
| inspecting | ceil((15000 − elapsedMs)/1000), không âm; sau 15000 hiển thị +2 | Nước lớp đầu tiên hoặc floor elapsed >17000 |
| solving | engine formatTime(elapsedMs), cắt phần trăm giây | isSolved sau nước được ghi |
| finished | Thời gian cuối cộng phạt hiệu dụng; DNF nếu phạt DNF | Chuẩn bị lượt mới |

+2 được ghi cùng penalty, không cộng vào timeMs gốc. Auto-DNF lưu inspectionMs đo lúc phát hiện, timeMs=0, events=[], giữ preEvents. advance(stamp) idempotent; gate trước nước cũng gọi advance để input muộn không vượt timeout. RAF và timeout đánh thức tại mốc 17001 chỉ giúp cập nhật; mất tab không tạm dừng và khi quay lại gọi advance ngay. Mốc đúng dựa trên timestamp, không dựa số tick.

## 4. Khóa và điều khiển

- IDLE/FINISHED giữ khóa timer: mọi nước (kể cả x/y/z và drag preview) bị từ chối. Camera/zoom vẫn dùng được.
- INSPECTING/SOLVING nhả riêng khóa timer; khóa context/drag/disposed vẫn độc lập.
- Trong lượt khóa: chọn N, seed, Xáo trộn, Đặt lại, nút nước, textarea/nút chạy thuật toán và Cài đặt phím.
- Giữ camera, tốc độ hiển thị, instant và tùy chọn Khóa xoay phím. Nút Bắt kịp ngay/Thử chuỗi nhanh đã bỏ; API thư viện vẫn tồn tại. Chúng không thay đổi thời gian ghi nhận nước.
- Cài đặt phím không mở được trong lượt; dialog hủy tạm chặn tương tác nền nhưng đồng hồ tiếp tục.
- onStateReplaced disarm timer; sau scramble thành công web arm với size/seed/index. Reset hoặc đổi N bỏ armed context, không xóa lịch sử phiên.

## 5. Lịch sử và thống kê

SolveHistory thêm mỗi id một lần khi finished, gồm cả auto-DNF. Solve gốc được copy để bên ngoài không sửa trạng thái đã giữ. Metadata local `{solve, penaltyOverride}` được mô tả tại 09 mục 2.2.1. Các nút Không phạt/+2/DNF chỉnh override, Phạt gốc đặt null; Xóa loại khỏi thống kê. Kết quả đang hiển thị phản ánh phạt hiệu dụng nếu mục còn trong lịch sử.

Single/mo3/ao5/ao12 gọi engine statistic(), lọc đúng size và thứ tự thời gian giải. Danh sách hiển thị đảo thứ tự, không đảo cửa sổ thống kê. Chưa đủ mẫu hiển thị '-', single toàn DNF cũng '-', trung bình DNF hiển thị 'DNF'. Chỉnh/xóa cập nhật ngay. Đổi size chuyển tập lịch sử, không tạo phiên mới.

Lịch sử tự lưu IndexedDB và tải lại khi mở đúng origin/trình duyệt. Backup JSON là lựa chọn dự phòng hoặc chuyển máy; CSV chỉ để xem. Lưu lỗi/quota vẫn chơi và xuất được kết quả trong phiên; dữ liệu hỏng không bị ghi đè. Không có tài khoản online, âm thanh hoặc undo. Server LAN/bảng xếp hạng là phần bổ sung sau Giai đoạn 5, mô tả ở mục 9. Chỉnh nhẹ hơn phạt gốc chỉ phục vụ thống kê cá nhân local, không vượt quy tắc xác minh server.

## 6. Bố cục

Theo ảnh tham chiếu người dùng: Rubik là chủ thể chính, scramble phía trên, đồng hồ gọn dưới khối, lịch sử/thống kê và cấu hình ở cột trái. Điều khiển nâng cao chứa seed, nút nước và chuỗi; mở khi cần. Trên mobile, khối/đồng hồ đứng trước lịch sử. Giao diện tối, điểm nhấn xanh; giữ ID DOM cho luồng thao tác và kiểm tra.

Phím theo góc nhìn mặc định bật, checkbox Khóa xoay phím bỏ chọn; chọn để dùng hệ trục cố định. Tùy chọn không lưu qua reload, có dòng ánh xạ. Chế độ theo góc nhìn dùng diện tích chiếu và quy tắc hòa trên/trái; sáu mặt là một orientation nhất quán. Orbit không tự tạo nước. Chi tiết tại 06 mục 7.

## 7. Kiểm thử và nghiệm thu

Mốc T4: build/lint/typecheck, 306 unit test (17 controller +223 engine +36 renderer +30 timer/history), 16 Chrome Playwright và Python differential 1160 chuỗi N=2..10 đã đạt; CI PR T4 xanh trước merge.

Các kiểm tra chính: mốc 15000/15000.9/15001/17000/17000.9/17001; timeout advance/gate; preEvents/events, replay ngược N=2/3/5, fixture Solve, lịch sử/override và DNF statistics. Chrome giải 2×2/3×3, ghi một lần, khóa nước sau FINISHED, Space trên nút focus, hủy không lưu, timeout trong dialog, input muộn, touch drag/Cancel, hồ sơ phím, context recovery, tài nguyên và bố cục desktop/mobile.

T4 xác nhận clock giả lập làm tăng timestamp KeyboardEvent tại môi trường Chrome kiểm thử, rồi mới dùng nó cho bài DNF. Cử chỉ touch dùng Input.synthesizeScrollGesture sau khi chuỗi touch rời bị treo ở lượt thử đầu; không nới giới hạn test để che lỗi. Cảm ứng mô phỏng không thay thế điện thoại thật.

Người dùng đã thử điện thoại và nhiều máy cùng mạng; đánh giá FPS10×10 và độ trễ phím ổn. Chưa có số đo FPS, latency hoặc cấu hình thiết bị được ghi nhận; không coi nhận xét định tính là số liệu đo. Không coi CPU benchmark hay SwiftShader là kết quả GPU thật.

Checklist khi thử bản mới: Space/Shift+Space hai bước; giải một lượt bằng phím/kéo; chờ inspection quá 17 giây; hủy khi đang giải; chỉnh và khôi phục phạt; đổi N; reload lịch sử và kiểm tra bảng LAN. Đo FPS/latency kèm cấu hình thiết bị vẫn là mục nghiệm thu định lượng trước public launch, không thay nhận xét người dùng bằng một con số suy đoán.

## 8. Các PR

| Task | PR |
| --- | --- |
| T0 khóa/gate/controller | #13 |
| T1 timer thuần | #14 |
| T2 web, Space và phím theo góc nhìn | #15 |
| T3 lịch sử và thống kê | #16 |
| UI theo ảnh tham chiếu | #17 |
| T4 kiểm tra trình duyệt | #18 |
| T5 đặc tả và trạng thái | #19 (đã merge) |

Quy trình Giai đoạn 5 là từng task một PR, giải thích bằng tiếng Việt và chờ người dùng cho merge; ủy quyền tự merge Giai đoạn 4 không tự áp dụng sang đây.

## 9. Bổ sung Giai đoạn 6: local và LAN

- Web đặt 40 ms/nước đơn, thanh 30–100 ms bước 10; nước đôi ×1,5. Mặc định API renderer vẫn 150 ms. Xáo trộn nằm cạnh Start dưới khối; scramble lớn căn giữa phía trên.
- Server LAN chạy `npm.cmd run lan` ở gốc (build rồi phục vụ web/API); `npm.cmd run start:lan` dùng bản đã build. Dùng địa chỉ IP terminal in ra, không dùng localhost từ thiết bị khác. Máy chủ phải bật; không cần dịch vụ hosting bên ngoài.
- Server lưu tên/hồ sơ và Solve gốc vào `lan-data/room.json`, ghi file tạm rồi rename trước khi trả thành công; thư mục dữ liệu không commit Git. Chưa có tài khoản dùng chung nhiều thiết bị hoặc tự khôi phục hồ sơ sau khi xóa dữ liệu trình duyệt.
- Pop-up đặt tên 1–30 ký tự, tên trùng không phân biệt hoa/thường bị từ chối; đổi tên cần token hồ sơ. Bảng bên phải trên desktop, xuống dưới khối trên mobile: hạng – tên – thời gian; riêng 2×2 và 3×3, nhanh đến chậm, một personal best/người, +2 cộng 2000 ms, DNF không xếp hạng. Bằng thời gian thì sắp tên rồi ID cho thứ tự ổn định.
- Lượt mới 2×2/3×3 tự vào hàng đợi local trước khi gửi; mỗi Solve một khóa riêng để tránh hai tab ghi đè cả danh sách. Khi offline hoặc lỗi mạng sẽ thử lại mỗi 5 giây/khi online và sau reload. Không tự gửi backup nhập hoặc sửa phạt local. Kết quả bị server từ chối giữ local và báo lý do, không chặn lượt hợp lệ phía sau.
- Server kiểm schema, size/version, phạt inspection, replay scramble/preEvents/events bằng engine và kết thúc đúng nước cuối; deduplicate ID, ràng buộc người gửi. Replay xác minh trạng thái, chưa chứng minh thời gian client trung thực hoặc ngăn dùng solver ngoài. Chưa có challenge server cấp, rate limit hay dịch vụ Internet công khai.
- Giới hạn hiện tại: backup 10 MB/10.000 entries, server 1.000 hồ sơ/100.000 Solve, payload API 300 KB. Không gọi các giới hạn này là chống gian lận hoặc bảo đảm quy mô production.
- PR #21 (persistence) và #22 (LAN) còn chờ merge tại thời điểm cập nhật; không suy trạng thái code trên nhánh thành đã có trên main.

Kiểm tra khép Giai đoạn 6: build/lint/typecheck, 317 unit test, 21 Chrome E2E và 2 LAN integration/browser đạt local. Bổ sung regression timer/controller thật (2×2/3×3 và late DNF), mapping 24 orientation cùng ranh giới hòa, lỗi quota không phát pageerror, dữ liệu lưu không đọc được không bị ghi đè. Không đổi engine hoặc thêm dependency.
