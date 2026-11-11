# 10. Renderer 3D và demo — Giai đoạn 3

## Ranh giới trách nhiệm

- Controller trong apps/web sở hữu Cube. Khi nhận input, controller áp nước và ghi raw performance timestamp ngay; Giai đoạn 5 mới chuyển thành thời gian tương đối nguyên của bản ghi Solve.
- CubeRenderer không tính trạng thái hoặc gọi applyMove của engine. Renderer dùng API hình học/parser thuần để chọn lớp và hướng xoay, nhận snapshot độc lập theo từng nước.
- Slot sticker cố định theo index E2. Animation dùng pivot tạm (N nhỏ) hoặc ma trận instance (N lớn), khôi phục transform gốc rồi tô snapshot. Không tích lũy góc quay.

## API công khai (@rubik/renderer)

```ts
new CubeRenderer(container, { size: 3, edgeLength: 3,
  gapRatio: 0.04, stickerInsetRatio: 0.08,
  theme: WESTERN_COLORS, instancing: true, measurePerformance: false });
renderer.setSize(n);
renderer.setState(state);
renderer.enqueueMove(move, stateAfter);
renderer.enqueueMoves([{ move, stateAfter }]);
renderer.setSpeed(150);
renderer.setInstant(true);
renderer.clearQueue();
renderer.setTheme(theme);
renderer.enableOrbit(true);
renderer.resetCamera();
renderer.setCameraView('dbl'); // 'ufr' hoặc 'dbl'
renderer.dispose();
```

- State có đúng 6*N*N byte, giá trị 0..5. Không kiểm tra tính khả thi vật lý ở renderer. Kiểm tra toàn bộ input trước khi đổi hiển thị/queue.
- setState hủy queue/pivot và tô ngay, không giữ tham chiếu state của caller. enqueue copy snapshot; caller có thể tiếp tục thay đổi Cube.
- setSize khác N dựng lại phần khối, giải phóng geometry/material/instance buffers cũ; giữ canvas, camera, controls. Cùng N vẫn hủy queue; controller phải cấp setState sau đó.
- clearQueue bỏ các animation chưa hoàn tất và tô snapshot cuối đã nhận, giữ hiển thị khớp trạng thái logic mới nhất.
- onMoveAnimated(move) chỉ phát cho nước đã hoàn tất hiển thị; onIdle() phát một lần khi hết việc. Đây không phải nguồn thời gian tính solve.
- isAnimating và pendingMoveCount cho biết công việc hiển thị còn chờ (kể cả nước đang xoay).
- Mặc định 150ms/nước đơn, 225ms/nước đôi. Thời lượng hiệu dụng chia cho 1 + queue.length*0.6; tích phân tiến độ để đổi tốc độ không lùi góc. Instant vẫn phát callback theo thứ tự trong RAF.
- onContextChange(available) báo mất/khôi phục WebGL. Khi mất context, bỏ animation và chốt snapshot cuối, dừng RAF; Three.js khôi phục GPU buffers khi browser trả context. setState vẫn nhận được khi context tạm mất. dispose gỡ listener và ngăn khởi động lại.
- getDiagnostics() trả backend, số draw call, geometry, triangle, pending, camera và trạng thái context. renderMs chỉ được đo khi measurePerformance=true; đây là thời gian CPU gửi lệnh, không phải thời gian GPU.
- buildLayout/layerSlots/rotationFor và stateToColors là các hàm thuần dùng trong test không GPU.

## Backend và hiệu năng

N=2..5 dùng Mesh để dễ kiểm tra. N=6..10 dùng hai InstancedMesh: nhựa và sticker. Tọa độ nền lưu một lần; frame animation tái sử dụng Matrix4/Quaternion/Vector3. Màu instance theo palette, chỉ cập nhật instanceColor khi state/theme đổi. Có tùy chọn instancing=false để đối chiếu.

Số đo 10x10 ngày 2026-11-11, Chrome headless, 1280x900, DPR=1, ANGLE/SwiftShader (Vulkan phần mềm), mỗi mẫu 1,5 giây:

| Backend | Draw calls | FPS đứng yên | FPS xoay | CPU render đứng yên / xoay |
| --- | ---: | ---: | ---: | ---: |
| Mesh trước tối ưu | 1088 | 44,8 | 14,5 | 2,48 / 62,07 ms |
| InstancedMesh | 2 | 44,8 | 44,2 | 0,20 / 0,27 ms |

Giữ 488 cubie bề mặt + 600 sticker, hai geometry. Không coi số đo SwiftShader là nghiệm thu 60 FPS trên laptop thật. Bước nghiệm thu phần cứng: chạy benchmark trên Chrome có GPU thật và ghi thiết bị; nếu còn chậm thì đo GPU/độ phân giải, giảm DPR trước khi giảm chất lượng hình học. Benchmark hiện cố định SwiftShader để so sánh tái lập; có thể sửa launch args ở harness khi đo GPU thật.

## Demo và kiểm tra

- Demo có chọn N, seed/scramble/reset, nút nước hợp lệ, nhập chuỗi, tốc độ/instant, thử queue, hai góc camera. Chuỗi sai bị từ chối nguyên khối; tối đa 2000 nước/lần.
- PowerShell: `npm.cmd run dev`. Các thư viện được build trước khi Vite khởi động; đổi code thư viện cần build lại.
- `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`.
- Playwright: `npx playwright install chromium`, `npm.cmd run build`, `npm.cmd run test:e2e`. Trên máy có Chrome: `$env:PLAYWRIGHT_CHANNEL='chrome'`.
- Benchmark: chạy preview cổng 4173 rồi `npm.cmd run benchmark:renderer --workspace=@rubik/web`.
- Chỉ với `?diagnostics=1`, demo cung cấp hàm đọc window.rubikDiagnostics(); thêm `&mesh=1` để đối chiếu backend cũ. Không cho phép ghi engine qua bridge này.
- Unit test kiểm tra mọi phép xoay/lớp/normal theo hoán vị engine N=2..10, queue/snapshot/cancel/timestamp, instance matrix không drift và lifecycle.
- Playwright kiểm tra pixel canvas, chuỗi hợp lệ/lỗi, các N, draw calls/geometry, heap sau nhiều lần đổi N, cảm ứng và context loss/restore. CI Ubuntu 24.04 dùng Google Chrome có sẵn với SwiftShader; tránh tải browser qua CDN trong mỗi job. Phiên bản browser theo runner image, phiên bản Playwright được ghim trong package.json.

## Giới hạn phạm vi

Chưa có keybinding, kéo lớp, timer hoặc backend; các phần đó thuộc giai đoạn tiếp theo. Mục tiêu 60 FPS trên phần cứng người dùng cần đo riêng như ghi ở trên.
