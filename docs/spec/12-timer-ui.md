# 12. Timer, lịch sử và giao diện — Giai đoạn 5

## 1. Phạm vi và kiến trúc

- packages/timer: SolveTimer và SolveHistory thuần, chỉ phụ thuộc engine; không DOM, Three.js hay đồng hồ animation.
- packages/controller: giữ Cube, khóa input theo lý do, gate trước nước, phát nước đã nhận và thay trạng thái. Không sửa packages/engine trong Giai đoạn 5.
- apps/web/src/timer-controls.ts: Space/Escape, nút cảm ứng, dialog hủy, khóa điều khiển, readout và vòng cập nhật.
- apps/web/src/history-controls.ts: danh sách mới nhất trước, chỉnh/xóa phạt và thống kê theo size. Bản ghi gốc được giữ độc lập với penaltyOverride.
- Renderer nhận snapshot/preview; onMoveAnimated chỉ phục vụ hiển thị. Không lấy thời điểm vẽ xong làm thời gian solve.

## 2. Cách chơi

1. Chọn N=2..10. Space hoặc nút Chuẩn bị scramble tạo seed mới và scramble k=0, vẫn IDLE. Nút Xáo trộn dùng seed hiện tại.
2. Nếu muốn đổi scramble, nhấn Shift+Space hoặc Xáo trộn. Space/Bắt đầu lần tiếp theo mới vào inspection.
3. Xoay camera tự do; phím x/y/z trong inspection ghi preEvents. Nước lớp đầu tiên (mặt, wide hoặc M/E/S hợp lệ) bắt đầu solve với events[0].t=0.
4. Giải khối bằng phím hoặc kéo lớp; engine isSolved trên snapshot sau nước chốt kết quả tự động, không bấm Space để dừng.
5. Sau FINISHED, mọi nước bị chặn; Space chuẩn bị scramble mới và về IDLE, bấm lần nữa mới inspection.
6. Esc/Hủy lượt mở dialog xác nhận. Đồng hồ không dừng. Xác nhận khi còn chạy khôi phục cùng scramble, về IDLE, không thêm lịch sử. Nếu đã timeout trong dialog thì giữ DNF, xác nhận chỉ đóng dialog.

Space/Escape không chạy trong vùng nhập, khi composing, với Ctrl/Meta/Alt hoặc khi có dialog mở. Chặn Space trên cả keydown/keyup trong vùng chơi, kể cả nút đang focus. Nút Bắt đầu/Hủy dùng click event.timeStamp để phục vụ thiết bị không có bàn phím.

## 3. Timestamp và readout

Giữ timestamp chính xác, floor duy nhất chênh lệch với origin. Inspection origin là Space/Start bắt đầu inspection; solve origin là nước lớp đầu tiên nhận ở controller (keydown hoặc pointerup). Date được inject chỉ để startedAt ISO, không đo elapsed. Các nước cùng batch có thể cùng timestamp.

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
- Trong lượt khóa: chọn N, seed, Xáo trộn, Đặt lại, nút nước, textarea/nút chạy thuật toán, thử chuỗi nhanh và Cài đặt phím.
- Giữ camera, tốc độ hiển thị, instant, bắt kịp queue và tùy chọn phím theo góc nhìn. Chúng không thay đổi thời gian ghi nhận nước.
- Cài đặt phím không mở được trong lượt; dialog hủy tạm chặn tương tác nền nhưng đồng hồ tiếp tục.
- onStateReplaced disarm timer; sau scramble thành công web arm với size/seed/index. Reset hoặc đổi N bỏ armed context, không xóa lịch sử phiên.

## 5. Lịch sử và thống kê

SolveHistory thêm mỗi id một lần khi finished, gồm cả auto-DNF. Solve gốc được copy để bên ngoài không sửa trạng thái đã giữ. Metadata local `{solve, penaltyOverride}` được mô tả tại 09 mục 2.2.1. Các nút Không phạt/+2/DNF chỉnh override, Phạt gốc đặt null; Xóa loại khỏi thống kê. Kết quả đang hiển thị phản ánh phạt hiệu dụng nếu mục còn trong lịch sử.

Single/mo3/ao5/ao12 gọi engine statistic(), lọc đúng size và thứ tự thời gian giải. Danh sách hiển thị đảo thứ tự, không đảo cửa sổ thống kê. Chưa đủ mẫu hiển thị '-', single toàn DNF cũng '-', trung bình DNF hiển thị 'DNF'. Chỉnh/xóa cập nhật ngay. Đổi size chuyển tập lịch sử, không tạo phiên mới.

Dữ liệu chỉ trong bộ nhớ trang. Reload mất lịch sử; localStorage chỉ lưu hồ sơ phím, không lưu solves. Không có backend, tài khoản, xếp hạng, âm thanh, undo hay lưu lịch sử lâu dài trong phạm vi này. Chỉnh nhẹ hơn phạt gốc chỉ phục vụ thống kê cá nhân local, không vượt quy tắc xác minh server.

## 6. Bố cục

Theo ảnh tham chiếu người dùng: Rubik là chủ thể chính, scramble phía trên, đồng hồ gọn dưới khối, lịch sử/thống kê và cấu hình ở cột trái. Điều khiển nâng cao chứa seed, nút nước và chuỗi; mở khi cần. Trên mobile, khối/đồng hồ đứng trước lịch sử. Giao diện tối, điểm nhấn xanh; giữ ID DOM cho luồng thao tác và kiểm tra.

Phím theo góc nhìn mặc định tắt, không lưu qua reload, có dòng ánh xạ. Khi bật dùng diện tích chiếu và quy tắc hòa trên/trái; sáu mặt là một orientation nhất quán. Orbit không tự tạo nước. Chi tiết tại 06 mục 7.

## 7. Kiểm thử và nghiệm thu

Mốc T4: build/lint/typecheck, 306 unit test (17 controller +223 engine +36 renderer +30 timer/history), 16 Chrome Playwright và Python differential 1160 chuỗi N=2..10 đã đạt; CI PR T4 xanh trước merge.

Các kiểm tra chính: mốc 15000/15000.9/15001/17000/17000.9/17001; timeout advance/gate; preEvents/events, replay ngược N=2/3/5, fixture Solve, lịch sử/override và DNF statistics. Chrome giải 2×2/3×3, ghi một lần, khóa nước sau FINISHED, Space trên nút focus, hủy không lưu, timeout trong dialog, input muộn, touch drag/Cancel, hồ sơ phím, context recovery, tài nguyên và bố cục desktop/mobile.

T4 xác nhận clock giả lập làm tăng timestamp KeyboardEvent tại môi trường Chrome kiểm thử, rồi mới dùng nó cho bài DNF. Cử chỉ touch dùng Input.synthesizeScrollGesture sau khi chuỗi touch rời bị treo ở lượt thử đầu; không nới giới hạn test để che lỗi. Cảm ứng mô phỏng không thay thế điện thoại thật.

Chưa xác nhận: điện thoại thật, FPS 10×10 trên GPU laptop, độ trễ bàn phím hệ điều hành/GPU và cảm giác sử dụng lâu dài. Không coi CPU benchmark hay SwiftShader là kết quả GPU thật.

Người dùng nên thử: Space/Shift+Space hai bước; giải một lượt bằng phím/kéo; chờ inspection quá 17 giây; hủy khi đang giải; chỉnh và khôi phục phạt; đổi N; kiểm tra điện thoại nếu có. Chỉ đo FPS trên GPU thật mới đóng được mục hiệu năng còn tồn từ Giai đoạn 3.

## 8. Các PR

| Task | PR |
| --- | --- |
| T0 khóa/gate/controller | #13 |
| T1 timer thuần | #14 |
| T2 web, Space và phím theo góc nhìn | #15 |
| T3 lịch sử và thống kê | #16 |
| UI theo ảnh tham chiếu | #17 |
| T4 kiểm tra trình duyệt | #18 |
| T5 đặc tả và trạng thái | PR tài liệu hiện tại, chờ người dùng duyệt |

Quy trình Giai đoạn 5 là từng task một PR, giải thích bằng tiếng Việt và chờ người dùng cho merge; ủy quyền tự merge Giai đoạn 4 không tự áp dụng sang đây.
