# Rubik Lab — Tổng quan, lịch sử phát triển và workflow

Ngày đối chiếu: **18/11/2026, giờ Việt Nam**. Dành cho chủ dự án, Sang và AI cộng tác.

- Repository: [ngdat24/rubik-web](https://github.com/ngdat24/rubik-web).
- Website: [Rubik Lab](https://rubik-web-rho.vercel.app).
- Mốc ứng dụng: `main` tại `bd32edb9a9e98a0b1261fa9cd5a368c123af9208`, sau PR #65.
- Đã xác nhận deployment production Vercel **READY**, đúng commit trên khi viết tài liệu.
- Đây là bản tổng hợp mới, không thay thế spec hoặc xóa các ghi chép cũ. Không suy mô tả lịch sử thành yêu cầu triển khai mới.
- Dữ liệu vận hành, gói dịch vụ và trạng thái staging có thể đổi. Tài liệu này không phải báo cáo giám sát trực tiếp hay cam kết số người dùng chịu tải.

## 1. Web này là gì?

Rubik Lab là website luyện tập và thi đấu Rubik ngay trên trình duyệt. Người chơi có thể thao tác khối 3D từ 2×2 đến 10×10, luyện giải với scramble và đồng hồ, xem lịch sử/thống kê, thi đấu 1v1 hoặc thử thách Time Limit. Ví, nhiệm vụ, cửa hàng và skin tạo thêm mục tiêu tích lũy và cá nhân hóa.

Game chạy logic Rubik và vẽ 3D chủ yếu trên máy người chơi. Các chức năng online dùng backend để quản lý hồ sơ, cấp challenge, kiểm tra replay, lưu kết quả và xử lý tiền thưởng. Laptop của chủ dự án không cần bật để website production hoạt động.

Đây là sản phẩm đang phát triển. Có xác minh chuỗi nước và nhiều kiểm tra phía server, nhưng **chưa phải hệ thống chống gian lận hoàn chỉnh**, chưa có matchmaking/Elo hay solver/trainer chuyên dụng hoàn chỉnh.

## 2. Các tính năng hiện có

### 2.1. Rubik 3D và điều khiển

- Khối NxN, N từ 2 đến 10; animation lớp, hàng đợi hiển thị và thay đổi tốc độ.
- Chuột trái kéo lớp, chuột phải đổi góc nhìn và **giữ hướng đứng**. Bản camera tự do như hình cầu đã được thử trước đó rồi thay bằng hành vi này.
- Kéo từ viền đen hoặc khe giữa sticker cũng được nhận diện theo ô/lớp gần nhất trên mặt đang trỏ.
- Điểm đầu và cuối phải nằm trong vùng canvas Rubik; gesture từng đi ra khỏi vùng bị hủy, trở lại trạng thái trước kéo. “Vùng Rubik” ở đây là vùng tương tác canvas, không yêu cầu cả hai điểm đều chạm hình khối đang vẽ.
- Quãng kéo quyết định góc/nước, không dùng tốc độ vuốt làm tiêu chí chính. Chuột có hệ số `0.675 × 0.8 = 0.54`; touch dùng `0.7`. Đây là hệ số trong thuật toán, không phải đơn vị vật lý hay phép đo độ nhạy giữa mọi thiết bị.
- Cảm ứng giữ cơ chế kéo lớp/camera và pinch zoom riêng; không đổi thao tác điện thoại thành chuột trái/phải.
- Bàn phím hỗ trợ nước mặt, nghịch, nước đôi, wide, lớp và xoay toàn khối theo parser. M/E/S chỉ cho 3×3.
- Phím theo góc nhìn bật mặc định; bật “Khóa xoay phím” để dùng hệ trục cố định. Có tùy chỉnh phím và lưu cấu hình local.
- Web mặc định 40 ms/nước đơn, thanh chỉnh 30–100 ms; API renderer có mặc định riêng 150 ms. Không lấy thời lượng animation làm thời gian giải.

### 2.2. Luyện tập, timer, lịch sử

- Space lần đầu chuẩn bị scramble, lần tiếp theo bắt đầu inspection; Shift+Space đổi scramble khi chưa chạy.
- Nước lớp đầu bắt đầu solve theo timestamp input. Inspection luyện tập đến 15 giây không phạt, trên 15 đến 17 giây +2, quá 17 giây DNF theo hợp đồng timer.
- Giải xong hợp lệ hoặc xác nhận hủy sẽ chuẩn bị scramble mới; DNF giữ trạng thái để xem.
- Lưu single, thống kê mo3/ao5/ao12 theo kích thước; có chỉnh phạt cá nhân và khôi phục phạt gốc.
- Solve gốc bất biến. Chỉnh phạt local không được dùng để làm nhẹ kết quả gốc đã lên bảng.
- IndexedDB lưu lịch sử trên thiết bị; có backup JSON, nhập có validation/dedup và xuất CSV. Xóa dữ liệu trình duyệt vẫn có thể làm mất phần local chưa sao lưu/đồng bộ.
- Có scramble máy chủ và biên nhận xác minh replay cho luồng thưởng. Một lượt gửi lại không được nhận thưởng nhiều lần; challenge thuộc hồ sơ khác không được dùng thay.

### 2.3. Hồ sơ và bảng xếp hạng

- UI hiện dùng hồ sơ chỉ đặt tên, gắn với phiên Supabase Anonymous Auth. Tên hiển thị không phải mật khẩu và không tự giúp lấy lại tài khoản trên thiết bị khác.
- Bảng single 2×2/3×3 lấy top 10 **lượt giải** all-time; một người có thể xuất hiện nhiều dòng.
- Có bảng tuần và cơ chế chốt thưởng riêng. Không nhầm bảng tuần, bảng single, Time Limit và kết quả 1v1 thành cùng một hệ điểm.
- Nhập backup không mặc nhiên biến dữ liệu đó thành thành tích mới được xếp hạng.

### 2.4. Phòng 1v1 tái sử dụng

- Tạo/vào phòng bằng mã hoặc link, sẵn sàng, đổi mode, đấu lại, rời và vào lại trong giới hạn phòng.
- Hiển thị khối của mình và đối thủ; tiến độ đối thủ đến từ snapshot đồng bộ, không phải livestream từng animation.
- Ba mục tiêu trên 3×3: giải toàn khối, F2L, một mặt hợp lệ. Một mặt phải đúng cả cạnh/góc bên hông theo tâm, không chỉ có chín sticker cùng màu.
- Countdown 3 giây, inspection 15 giây, thời gian chơi 180 giây và ân hạn chốt kết quả 3 giây. Không áp cách bắt đầu sớm của luyện tập vào inspection thi đấu.
- Xếp điểm: số khối hoàn thành giảm dần → thời điểm hoàn thành khối cuối tăng dần → số nước tăng dần. Khối chưa hoàn thành hết giờ không được tính.
- Có retry/ACK, xác minh server, xử lý bỏ cuộc và cược/escrow theo luật kinh tế. Mất mạng hoặc đóng tab không dừng đồng hồ server.

### 2.5. Time Limit

- Trang riêng `/time-limit.html`, chơi solo theo cơ chế challenge/đồng hồ/xác minh của thi đấu.
- Ba mode: một mặt, F2L, Full 3×3. Mode của phiên và tab bảng xếp hạng là hai lựa chọn có ý nghĩa riêng, đã được làm rõ trên UI.
- Mỗi mode có bảng riêng; phiên hoàn thành hợp lệ mới được xét theo luật tương ứng. Hủy lượt không mặc nhiên được xếp hạng hay hoàn phí.
- Cơ chế vé/thưởng kinh tế áp dụng cho **Full 3×3**; không suy rằng mọi mode đều có cùng phần thưởng.

### 2.6. Ví, nhiệm vụ và kinh tế

Hai đơn vị là **CB (Cubit)** và **ZN (Zenith)**. Server/SQL quyết định số tiền, giá, hạn mức và điều kiện; client chỉ hiển thị và gửi yêu cầu.

| Mục | Luật hiện hành cần nhớ |
| --- | --- |
| Quà tân thủ | 200 CB ngay khi tạo hồ sơ theo PR #53; không còn phải chờ năm lượt như bản trước đó |
| Quà tài khoản cũ | PR #58 cấp một lần 1.000 CB cho nhóm trước cutoff cố định; không phải 5.000 CB và không áp cho tài khoản tạo sau cutoff |
| Nhiệm vụ luyện tập ngày | 10 lượt 2×2 **hoặc** 5 lượt 3×3 **hoặc** 3 lượt 4×4 **hoặc** 1 lượt 5×5–10×10 đủ điều kiện ghi tiến độ |
| Nhiệm vụ Time Limit | Hoàn thành một phiên hợp lệ, không yêu cầu chỉ Full |
| Nhiệm vụ thời gian | Online đủ 10 phút theo heartbeat hợp lệ; **không** thay bằng giải 3×3 dưới 70 giây |
| Thưởng nhiệm vụ | Luyện tập 50 CB, Time Limit 50 CB, online 100 CB; hoàn thành đủ ba nhiệm vụ có 2 ZN, chuyên cần có mốc 7 ngày theo SQL |
| Solo đủ thưởng | Ngưỡng v2 cho 2×2/3×3/4×4/5×5: tối thiểu 6/14/35/55 nước và 1,5/3,5/15/35 giây; 6×6–10×10 không nhận thưởng Solo |
| Vé Full 3×3 | Vé đầu ngày miễn phí, lượt sau 100 CB; chỉ ba vé đầu có quyền nhận thưởng. Không nhầm với giới hạn chỉ được chơi ba lượt |
| Thưởng Full 3×3 | Các mức CB theo 1/2/ít nhất 3 khối là 75/145/205; ZN tối đa 3/ngày, 10/tuần, vẫn phải đạt điều kiện SQL |
| PB | CB và ZN có hạn mức riêng; chạm trần CB không tự chặn ZN còn đủ điều kiện. Phép mo3 phải phân biệt với tên hiển thị ao3 |
| Chuỗi 1v1 | Mốc 3/5 thắng có 50/150 CB, mỗi mốc một lần/ngày, áp dụng cả cược 100 CB theo bản sửa #62 |
| Cược | Giữ tiền bằng escrow; người thắng nhận 90% quỹ. Trần thưởng thêm không được áp nhầm để cắt tiền gốc/quỹ cược |
| Ví | Trần thưởng thông thường 50.000 CB/60 ZN; một số khoản hoàn tiền/hoàn trùng/quà đặc biệt có ngoại lệ theo SQL |

Các ngưỡng cho **receipt hợp lệ**, **đủ thưởng Solo**, **tiến độ nhiệm vụ**, **PB**, **xếp hạng** không phải một khái niệm. Ví dụ một khối lớn có thể được xác minh và tính nhiệm vụ nhưng không có thưởng Solo.

Phần thưởng đã trả được giữ khi chuyển luật; không thu hồi hay cấp lại mù. Không hứa mọi tài khoản nhận đúng 30 ZN trong bất kỳ bảy ngày liên tiếp nào: còn phụ thuộc điều kiện, chuyên cần và tuần lịch.

### 2.7. Shop, hòm, vòng quay và skin thường

- Có danh mục 30 skin thường trong đợt shop, bốn offer hằng ngày, reroll, ba hòm, tiện ích/FX và vòng quay mùa.
- Skin có bảng màu và có thể có vật liệu, texture, artwork/atlas hoặc hiệu ứng. Không phải mọi skin đều là ảnh 2D bọc đơn giản lên một khối 3D.
- Mua/trang bị/xem thử trong UI; server kiểm tra quyền sở hữu và giá. Request ID, receipt, ledger và transaction chống thu/phát lặp khi retry.
- Hòm có bảo hiểm riêng; ưu tiên skin chưa sở hữu trong bậc đã quay ra, hoàn trùng theo luật.
- Tỷ lệ vòng quay thường sau #62: đỏ 1%, vàng 2%, tím 12%, lam 25%, trắng 35%, 200 CB 5%, 100 CB 20%. Tổng 100%; **chưa tính bảo hiểm** mốc 20/30.
- Vòng quay dùng ZN, có gói 1/5/10, tính số lượt thực hiện và dừng/trao mốc theo luật server.
- Reset mùa hoàn các khoản escrow cần hoàn trước; CB còn một nửa làm tròn xuống, ZN về 0, giữ vật phẩm theo luật. Chạy lại cùng mùa không được reset lần nữa.
- Đã tinh chỉnh Matcha/PCB; artwork phải đi theo sticker vật lý khi xoay, không đứng yên theo mặt nhìn.

### 2.8. Champion hiện tại, sau PR #65

- Champion 2×2 và 3×3 là quyền cấp riêng theo hồ sơ/kích thước. Có 3×3 **không tự có** 2×2.
- Nằm trong **Kho skin**, dạng thẻ **Huyền thoại màu vàng**. Có hai nút nhóm Skin 2×2 / Skin 3×3. Hiện nhóm 2×2 chỉ có Champion 2×2 khi được cấp; skin thường/phụ kiện hiện có vẫn ở nhóm 3×3.
- Đặt/đổi tên, xem thử 3D và trang bị ngay trong kho; không có link Champion riêng ở đầu danh sách.
- Có thể trang bị với tên mặc định nếu để trống. Sau khi nhận, đổi tên giữ mức **500 CB**, phải xác nhận. Retry kết quả mạng chưa rõ giữ cùng request ID.
- Chỉ dùng bản **không viền**. Hồ sơ đã chọn viền đen trước đây vẫn giữ tên/quyền, nhưng renderer hiển thị không viền; không cần sửa metadata cũ chỉ để đổi cách vẽ.
- Trang `/champion.html` cũ chỉ chuyển bookmark về kho đúng kích thước/ngôn ngữ. Trang giới thiệu, chọn viền và viewer riêng trước đây đã bỏ khỏi luồng sản phẩm.
- Trang bị đổi ngoại hình trên canvas đang có, giữ controller và snapshot trạng thái; preview chỉ tạo khi mở và giải phóng khi đóng.
- Lựa chọn trang bị Champion lưu theo hồ sơ/kích thước **trên trình duyệt**, xác minh lại quyền qua API. Tên/quyền ở server; lựa chọn trang bị này chưa đồng bộ giữa các thiết bị.

Đợt cấp thủ công đã thực hiện: Champion 2×2 cho `ngdatttt`, `sang`, `Quang`, `NgdatDT`; Champion 3×3 cho `ngdatttt`, `sang`, `VŨ NO1 SEVER`, `NgdatDT`. Đây là lịch sử đợt cấp, không phải whitelist hard-code hay chỉ dẫn tự cấp lại. Danh sách 2×2 thực tế có **bốn** hồ sơ dù lời nhắn ban đầu ghi “3 user”.

## 3. Kiến trúc ứng dụng

```text
Trình duyệt: input → controller → engine → snapshot → renderer Three.js
                   └→ timer/history → IndexedDB/backup

Chức năng online: trình duyệt + phiên Auth
                   → API Vercel → xác minh/RPC → PostgreSQL Supabase
```

| Khu vực | Trách nhiệm |
| --- | --- |
| `packages/engine` | TypeScript thuần: trạng thái, parser, hoán vị, geometry, predicates, scramble, thống kê; không phụ thuộc DOM/Three.js/React |
| `packages/controller` | Sở hữu Cube, áp input và timestamp, locks/gate; không chờ animation mới ghi nước |
| `packages/renderer` | Three.js: vẽ, camera, picking, animation và snapshot; không tự sở hữu logic giải |
| `packages/timer` | Timer/history/backup theo hợp đồng dữ liệu |
| `apps/web` | Vite + TypeScript, DOM UI; không dùng React |
| `api/[route].mjs`, `server` | Entry Vercel, xác minh session/replay, điều phối API và luật backend |
| `shared` | Luật dùng chung, nhất là thi đấu |
| `supabase/migrations`, `supabase/tests` | Lịch sử SQL có version và kiểm tra database |
| `tools/lan`, `tools/reference` | LAN và reference Python đối chiếu engine |

Ranh giới quan trọng: renderer nhận `enqueueMove(move, stateAfter)`, `setState` hủy queue và hiển thị tức thì. `onMoveAnimated` chỉ phục vụ hiển thị/âm thanh, không phải nguồn tính thời gian hay điểm.

## 4. Hạ tầng hiện tại

### Vercel

Vercel build và phục vụ website tĩnh từ `apps/web/dist`, đồng thời chạy Functions cho API. Project `rubik-web` liên kết GitHub; production theo `main`, các nhánh/PR có Preview khi deployment đủ điều kiện.

Theo `vercel.json` hiện tại: vùng Functions `icn1` Seoul; build `npm run build`, install `npm ci`; entry API có `maxDuration: 30`; cron `/api/economy-maintenance` chạy `0 17 * * *`, tức 00:00 Việt Nam ngày kế tiếp. Cron cần xác thực secret, không phải URL công khai ai cũng có quyền chốt thưởng.

Trước đây từng vượt giới hạn số Functions của gói Hobby khi thêm tính năng. Đã gom wrapper vào entry route chung, giữ các URL API. Không coi giới hạn gói ở lần đó là thông số bất biến; cần kiểm tra tài khoản/gói hiện hành khi mở rộng.

### Supabase và PostgreSQL

- Project production đã dùng: `dfknbaritcibkzvavmta`. Supabase cung cấp PostgreSQL, Auth và Data API/RPC. SQL là ngôn ngữ thao tác database; PostgreSQL là hệ quản trị; migration là file thay đổi cấu trúc/hàm/dữ liệu có version, không phải bản sao lưu.
- Backend dùng credential riêng, frontend chỉ dùng public key và phiên người dùng. Không đưa secret/service-role/cron secret vào mã VITE_, log, PR hoặc tài liệu.
- Quyền dựa trên phiên Auth và kiểm tra server/RLS. Có bảng backend-only không mở policy cho client; không tự thêm policy rộng để “hết lỗi”.
- Repo có **25 file migration** đến `20261118020000_champion_manual_awards.sql`. Số file trong repo không tự chứng minh toàn bộ history của mọi môi trường khớp timestamp.
- Các migration kinh tế, quà, nhiệm vụ và Champion đã được triển khai production trong chuỗi công việc trước, sau xác nhận riêng của chủ repo. #64–#65 không cần migration.
- Khi chuẩn bị lần thay đổi tiếp theo phải lấy history thực tế và đối chiếu với file; tài liệu này không thay cho bước đó.

Nhóm bảng chính theo migration của repo:

| Nhóm | Ví dụ bảng |
| --- | --- |
| Hồ sơ/kết quả | `profiles`, `solves`, `api_usage` |
| Thi đấu | `race_rooms`, `race_lobbies`, `time_limit_sessions` |
| Xác minh luyện tập | `practice_challenges` |
| Ví và tính đúng giao dịch | `user_wallets`, `currency_ledger`, `economy_receipts`, `shop_receipts` |
| Nhiệm vụ/PB | `economy_daily_quests`, `economy_quest_solves`, `economy_quest_presence`, `economy_personal_bests`, `economy_pb_rewards` |
| Vé/thưởng/chốt kỳ | `economy_time_limit_tickets`, `economy_time_limit_payouts`, `economy_closed_weeks`, `economy_weekly_awards`, `economy_closed_seasons` |
| Cược | `economy_race_wagers`, `economy_race_escrow`, `economy_race_moves`, `economy_race_streaks` |
| Shop/kho | `skin_palettes`, `owned_skins`, `equipped_skins`, `shop_skins`, `user_inventory`, `shop_daily_offers`, `shop_crate_progress`, `season_gacha_progress`, `shop_seasons`, các bảng cấu hình/pool |
| Champion | `champion_awards` |

Đây là bản đồ chức năng từ code/migration, không phải export đầy đủ schema hay số dòng production.

### Production, Preview, staging và local

| Môi trường | Cách sử dụng và giới hạn |
| --- | --- |
| Production | Người dùng thật, dữ liệu thật; thay đổi bền vững cần được cho phép đúng phạm vi |
| Preview thông thường | Có thể vẫn dùng **chung database production**. URL khác không làm database tự tách |
| Staging riêng | Đã dựng `rubik-lab-staging`, ref `jytcjlivuixlznuyszbq`, nhánh `codex/staging-shop-acceptance` trong đợt nghiệm thu shop. Đây là mốc lịch sử; chưa xác minh lại health/schema/env của staging trong lần viết này |
| Local | UI, fixture/API giả, PGlite hoặc Supabase local nếu đã thiết lập. `npm run dev` không tự cung cấp đầy đủ cloud API |
| LAN | Node server và `lan-data`, độc lập với cloud; máy host LAN phải hoạt động |

Staging từng áp migration qua connector với version history khác tên file nguồn. Không chạy `db push` mù hoặc sửa history production theo bảng mapping staging cũ.

## 5. Lịch sử từ nền tảng đến hiện tại

| Chặng | Kết quả và bài học |
| --- | --- |
| Giai đoạn 1–2 | Spec, engine NxN, parser/predicates/metrics, PRNG và reference Python; giữ logic thuần, có thể kiểm tra độc lập WebGL |
| Giai đoạn 3 | Renderer, animation, camera, snapshot và tối ưu khối lớn |
| Giai đoạn 4–6 | Input/controller, tùy chỉnh phím, timer/history, IndexedDB/backup và LAN |
| #26–#35 | Top 10 lượt all-time, hồ sơ name-only, 1v1, tiến độ đối thủ, ba mục tiêu, Time Limit và giảm độ trễ online bằng vùng API gần DB |
| #36–#42 | Hướng dẫn cộng tác, dọn tài liệu, phòng dùng lại #40, làm rõ mode #41 và Việt/Anh #42 |
| #43–#44 | Kho skin và challenge/replay luyện tập; nền tảng để thưởng có căn cứ |
| #45–#50 | Ví/ledger, nhiệm vụ/PB, vé Time Limit, bảng tuần, cược/escrow và reset mùa |
| #51–#55 | Hoàn thiện shop/hòm/vòng quay, nghiệm thu staging, quà tân thủ 200 CB ngay khi tạo hồ sơ, phát hành chuỗi vào main và sửa regression staging |
| #56 | Tinh chỉnh Matcha/PCB, sửa lưu và hiển thị nhiệm vụ ngày |
| #57–#59 | Thử đảo chuột/camera; quyết định cuối: trái kéo lớp, phải xoay camera giữ hướng đứng. #58 riêng về quà 1.000 CB cho tài khoản cũ |
| #60–#61 | Nhận kéo từ viền/khe; sửa nhiệm vụ nhầm 5×5 thành 3×3. Ngưỡng nhiệm vụ sau đó tiếp tục đổi ở #62 |
| #62 | Điều chỉnh kinh tế: ngưỡng ngày mới, vé/trần thưởng/PB/chuỗi, tỷ lệ vòng quay; giữ **online 10 phút** theo yêu cầu chủ repo |
| #63 | Champion Apex Chrono 2×2/3×3, cấp quyền riêng, tên riêng/đổi tên 500 CB và thiết kế chi tiết |
| #64 | Demo A/B và tối ưu Champion, người dùng thử rồi đồng ý phát hành |
| #65 | Đưa Champion về thẻ kho, nhóm 2×2/3×3, đặt tên tại chỗ, chỉ không viền và bỏ trang riêng; sửa E2E còn kiểm tra UI cũ trước khi merge |

Chuỗi #43–#51 được tích hợp và kiểm tra qua `skin-system`, sau đó phát hành qua #54. `skin-system` là nhánh tích hợp lịch sử, **không phải base mặc định cho mọi PR mới**. Tính năng độc lập hiện hướng vào `main` nếu không có quyết định khác.

Trong chuỗi này đã phải giải quyết conflict, lỗi CI, mô tả PR thiếu và chênh lệch luật giữa UI/API/SQL. Không nên suy số PR liên tiếp nghĩa là chúng tự chứa đủ các sửa của nhau. Retarget base không tự đồng bộ code.

## 6. Những gì vừa hoàn thành về hiệu năng

Skin Champion vẫn có thể giữ khoảng 56–57 FPS trên máy người dùng nhưng nóng hơn: FPS chỉ cho biết số khung hoàn thành, không cho biết lượng công GPU/CPU/điện năng cần cho mỗi khung.

#64 áp ba cách: gộp chi tiết cùng geometry/material bằng instancing, dùng chung texture lặp và ngừng render khi đứng yên. Giữ nguyên số tam giác và chi tiết nhìn thấy; đánh thức render khi thao tác/camera/resize/texture đổi, vẫn chạy liên tục nếu surface cần animation.

| Chrome local dùng SwiftShader | Trước | Sau |
| --- | --- | --- |
| Draw calls Champion 2×2/khung | 160 | 52 |
| Texture GPU Champion 2×2 | 57 | 11 |
| Draw calls Champion 3×3/khung | 568 | 136 |
| Texture GPU Champion 3×3 | 117 | 11 |

Số tam giác giữ ở 19.248 cho 2×2 và 80.748 cho 3×3 trong phép đo đó. Ảnh A/B lúc đóng/mở lớp gần như trùng; người dùng đã thử demo và chấp nhận. Đây **không** phải phép đo nhiệt độ, pin hay benchmark GPU thật. Cần tiếp tục kiểm tra trên điện thoại và phần cứng yếu.

Vị trí tìm skin: `apps/web/public/assets/skins`. Champion dùng thư mục `rank_gold_apex_chrono_01` và `rank_gold_apex_chrono_2x2_01`; thiết kế/atlas do `champion-design.ts` phối hợp renderer dựng lên. Không có một “file mô hình Champion hoàn chỉnh” duy nhất đại diện toàn bộ vật liệu, lõi, chữ ký và FX.

## 7. Vận hành: cần chú ý điều gì?

### Vấn đề đã ghi nhận, chưa được coi là đã sửa

Ghi chép lỗi polling ghi nhận ngày 17/11, 00:00–16:00 Việt Nam: 21.589 lỗi `P0001`, `race_action`, “Room not found or expired”, hơn 99,7% lỗi trong khoảng đối chiếu. Giả thuyết là tab phòng hết hạn vẫn polling; **chưa xác minh cuối cùng nguồn client** và chưa giải quyết trong #62–#65.

Phải phân biệt lỗi nghiệp vụ này với database hết RAM hoặc ngừng hoạt động. Hướng xử lý cần kiểm tra: API trả lỗi terminal rõ ràng; client dừng polling/retry phòng hết hạn, xóa tham chiếu cũ và đưa đường quay lại. Test cần có reload link cũ, tab mở qua hạn, offline/online và retry lỗi mạng tạm thời. Nội dung điều tra chính được giữ ngay trong mục này; ghi chú local riêng chưa nằm trong commit tài liệu này.

### Đọc dashboard đúng cách

- Connections như `21/60` là số kết nối database, không phải 21 tài khoản trong tổng 60 người, cũng không phải số người đã đặt tên.
- CPU/RAM, swap/memory commitment, dung lượng đĩa, Disk IO balance, truy vấn chậm và tỷ lệ lỗi phải được đọc cùng khoảng thời gian và log cụ thể.
- Memory commitment “severe” là tín hiệu cần điều tra, không đủ để kết luận riêng nó rằng website đã quá tải. Có swap cũng cần xem xu hướng và độ trễ thực tế.
- Nhiều tính năng tự chúng không nhất thiết làm quá tải; polling, cron, retry lỗi, truy vấn/index chưa hợp lý và dữ liệu tăng có thể tạo tải ngay cả khi ít người.
- Skin nặng chủ yếu ảnh hưởng máy người chơi và việc tải asset; không đồng nghĩa Supabase phải chạy toàn bộ hình ảnh 3D.
- Giám sát cả Vercel (requests, execution, lỗi, băng thông) lẫn Supabase (DB/Auth/API, kết nối, IO, storage). Không có số người đồng thời bảo đảm khi chưa load test.

**Lần viết này không đo lại quota/gói dịch vụ, kích thước DB, lượng user hoặc tài nguyên sống.** Các ảnh từng thấy 57% RAM, 4% CPU, 16% disk, 99% IO balance hoặc 97,8% lỗi chỉ là snapshot lịch sử, không phải chỉ số hiện tại.

## 8. Workflow làm việc cho chủ repo, Sang và AI

### 8.1. Trước khi nhận việc

1. Đọc `AGENTS.md`, `COLLABORATOR_AGENT.md`, tài liệu này, spec và issue liên quan; đối chiếu code/PR mới nhất.
2. Kiểm tra `git status`, nhánh, remote, PR đang mở và file có người khác đang sửa. Không xóa/revert file lạ chỉ để tree sạch.
3. Khi phù hợp, fetch và cập nhật `main` bằng fast-forward. Tạo **một nhánh `codex/...` và một PR cho một yêu cầu**.
4. Chốt phạm vi, tiêu chí nghiệm thu và môi trường dữ liệu trước khi sửa. Không tự thêm backend/schema/dependency/engine ngoài phạm vi được duyệt.

### 8.2. Trong khi làm

- Commit/push tiếp lên cùng nhánh để cập nhật PR. Viết code cần thiết; không tự viết thêm tài liệu trùng lặp nếu không được yêu cầu.
- Các PR phụ thuộc phải có base/đồ thị phụ thuộc rõ. Nếu B nhắm A, merge B vào A sẽ đưa thay đổi B đi cùng A khi A được merge sau đó; chưa đồng nghĩa B đã có trên main.
- Với dự án lớn có nhánh tích hợp, chỉ hợp nhất các phần đã review vào nhánh đó. Đừng mở sáu PR độc lập cùng sửa nhiều file chung rồi giả định chúng không conflict.
- Khi main/nhánh cha có bản sửa, cập nhật nhánh làm việc và giải conflict theo ý định cả hai bên. Không chọn toàn bộ ours/theirs để cho qua; không force-push như cách chữa conflict thông thường.
- Description PR phải ghi vấn đề, hành vi mới, scope, thay đổi dữ liệu, kiểm thử và giới hạn. Không chỉ ghi “thêm tính năng”.

### 8.3. Kiểm tra và nghiệm thu

Chạy lệnh phù hợp từ gốc repo trên Windows bằng `npm.cmd`:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Theo phần thay đổi, chọn thêm `test:cloud`, `test:race`, `test:time-limit`, `test:lan`, `test:e2e`, SQL regression hoặc reference Python. Không benchmark/mô phỏng dài vô cớ. Lỗi test do UI đã thay đổi cần sửa test theo hành vi mới và giữ coverage tương đương; không bỏ kiểm tra cho xanh.

Phân biệt các cấp bằng chứng: unit → API giả → PGlite → PostgreSQL/Supabase staging thật → trình duyệt với API thật → thiết bị người dùng. Một cấp đạt không tự chứng minh các cấp còn lại. Build/READY không thay kiểm tra flow và dữ liệu.

### 8.4. Database và phát hành

1. Chuẩn bị migration review được; đối chiếu history trên đúng project, sao lưu phần liên quan và test trên môi trường riêng.
2. Xin quyền riêng cho thao tác production có tác động bền vững. **Cho phép merge không mặc nhiên cho phép chạy migration hoặc cấp quà.**
3. Áp theo thứ tự tương thích code/schema, kiểm tra sau áp. Rollback code không tự rollback database hay ledger.
4. Chỉ merge đúng PR đã được chủ repo cho phép, checks cần thiết đạt và không còn conflict/nhận xét cần xử lý.
5. Dùng squash cho PR nhỏ độc lập khi phù hợp; merge commit có thể hợp với nhánh tích hợp/phụ thuộc cần giữ lịch sử. Rebase viết lại tuyến commit nên phải hiểu quan hệ nhánh. Không có một lựa chọn đúng cho mọi chuỗi PR.
6. Xác nhận production READY **đúng SHA**, kiểm tra nhanh read-only và flow được phép. Sau merge, về main/cập nhật trước khi làm task mới; giữ nguyên file ngoài nhiệm vụ.

“Able to merge” chỉ nói Git ghép được nhánh, không nói CI đạt, quyền connector đủ hay ứng dụng chạy đúng. Connector 403 là vấn đề quyền của tích hợp/thao tác cụ thể; không suy từ quyền trên giao diện GitHub rằng connector cũng có quyền đó. Không tắt bảo vệ hoặc đổi quyền rộng chỉ để né lỗi.

### 8.5. Khi trao việc cho Sang hoặc AI

Gửi link issue/PR, base branch, commit mốc, scope, tiêu chí nghiệm thu, môi trường DB và giới hạn merge/migration. Hai AI không chia sẻ bộ nhớ chat; code đã push và description là tài liệu bàn giao thực tế. Không gửi secret/token vào chat.

## 9. Nguồn tra cứu và bảo trì tài liệu

- [Tổng kết nền tảng và workflow cũ](project-history-and-github-workflow.md): chi tiết giai đoạn đầu; các trạng thái/số luật cũ cần đối chiếu lại.
- [Lịch sử shop, skin và tiền tệ](lịch%20sử%20cập%20nhật%20shop,%20skin%20và%20tiền%20tệ.md): nghiệm thu staging và chuỗi #43–#51; câu “chưa merge main” chỉ đúng ở thời điểm ghi chép cũ.
- [Hướng dẫn cộng tác viên](../COLLABORATOR_AGENT.md), [quy tắc repo](../AGENTS.md), [decisions](spec/decisions.md).
- PR cụ thể: [#54](https://github.com/ngdat24/rubik-web/pull/54), [#62](https://github.com/ngdat24/rubik-web/pull/62), [#63](https://github.com/ngdat24/rubik-web/pull/63), [#64](https://github.com/ngdat24/rubik-web/pull/64), [#65](https://github.com/ngdat24/rubik-web/pull/65).

Khi đọc lại sau này, kiểm tra main/deployment, migration history và env trước khi áp các thông tin vận hành. Tài liệu mô tả trạng thái theo mốc; code đang chạy, lịch sử database và bằng chứng kiểm thử mới là nơi xác nhận cuối cùng.
