# Lịch sử cập nhật shop, skin và tiền tệ

> **Bản ghi nghiệm thu lịch sử, không phải trạng thái hiện tại.** Chuỗi shop đã phát hành vào main qua #54; quà tân thủ #53 là 200 CB ngay khi tạo hồ sơ; luật nhiệm vụ/vé/thưởng/vòng quay tiếp tục sửa ở #62; Champion hoàn thiện đến #65. Các câu “chưa merge”, ví mới 0 CB và ngưỡng cũ bên dưới chỉ mô tả lúc nghiệm thu. Đọc [tổng quan hiện hành](tong-quan-rubik-lab-va-lo-trinh-phat-trien.md) trước; cấu hình staging/history bên dưới không được coi là đã kiểm tra lại hôm nay.

Ngày ghi chép: 17/11/2026 (UTC+7). Dự án Rubik Lab, repository ngdat24/rubik-web.

## Trạng thái và phạm vi

Chuỗi PR #43–#51 đã tích hợp vào `skin-system`. Mốc code được nghiệm thu là `e2608f200ba1a7a2b5947218b80efe06ea9951b4` (merge #51). Đây là tính năng cửa hàng/kinh tế trên nền gameplay hiện có; không phải thay đổi luật giải Rubik hay hệ thống chống gian lận hoàn chỉnh.

Đã dựng và nghiệm thu website dùng Supabase staging riêng. Chưa merge `skin-system` vào `main`, chưa áp migration kinh tế hoặc đổi biến môi trường của production trong công việc này. Những Preview ở nhánh khác vẫn có thể dùng database production theo cấu hình cũ; chỉ URL/nhánh staging ghi dưới đây được xác nhận tách biệt.

## Lịch sử tích hợp và sửa lỗi

| PR | Chức năng | Sửa lỗi hoặc điểm đã làm rõ |
|---|---|---|
| [#43](https://github.com/ngdat24/rubik-web/pull/43) | Kho skin, tám bảng màu, trang bị theo hồ sơ, viewer thử riêng | Bảo vệ quyền sở hữu phía server; các PR sau giữ lifecycle, route và bản dịch của Kho skin. |
| [#44](https://github.com/ngdat24/rubik-web/pull/44) | Scramble máy chủ, xác minh replay, biên nhận lượt luyện tập | Ghép conflict với Kho skin, giữ cả mount/dispose/API/bản dịch. Commit sửa `00b0b8a`. Biên nhận không tự chứng minh thời gian client trung thực hoặc không dùng solver. |
| [#45](https://github.com/ngdat24/rubik-web/pull/45) | Ví CB/ZN, ledger, thưởng Solo và quà tân thủ | Chuẩn hóa ngưỡng Hydrogen v2 ở server/SQL, loại biên nhận chỉ đạt ngưỡng cũ khỏi thưởng; ngừng refresh ví khi tab ẩn. Commit `3daca7c`. |
| [#46](https://github.com/ngdat24/rubik-web/pull/46) | Nhiệm vụ ngày, chuyên cần, thưởng PB | Dùng eligibility v2 cho quest/PB; CB đạt trần không chặn ZN còn hạn mức; xử lý tab ẩn; sửa selector phân biệt panel nhiệm vụ và lịch sử. Commit `ef0dcf2`. |
| [#47](https://github.com/ngdat24/rubik-web/pull/47) | Vé và thưởng Time Limit Full 3×3 | Ghép các bản sửa trước, bổ sung thiếu tiền/retry/hủy/trần tuần. Sửa helper polling có thể chờ vô hạn khi đồng hồ browser đóng băng; không tăng timeout để che lỗi. Commit `4c99a82`, `4bbc83d`. |
| [#48](https://github.com/ngdat24/rubik-web/pull/48) | Bảng tuần, thưởng ZN, maintenance | Lọc lượt đủ v2, kiểm tra cron secret/query/cache/escape tên. Vercel từng lỗi vì 13 Functions vượt giới hạn Hobby tại lần deploy đó; gom wrapper vào `api/[route].mjs`, giữ URL/router. Commit `e7d8c9c`, `f320349`. |
| [#49](https://github.com/ngdat24/rubik-web/pull/49) | Cược 1v1, escrow, hoàn tiền, quyết toán | Giữ xử lý lỗi Kho skin khi ghép API, thêm regression hoàn cược khi hủy/retry. Tách khởi tạo Auth dùng timer thật khỏi đồng hồ giả của race test. Commit `a1d06a7`, `f5145e4`; merge `048f4f8`. |
| [#50](https://github.com/ngdat24/rubik-web/pull/50) | Chốt mùa và reset ví | Hoàn escrow còn giữ trước khi giảm CB còn một nửa, làm tròn xuống; ZN về 0. Khóa giao dịch và receipt theo mùa; API có xử lý mùa đang chờ chốt. Head `4fcf3b2`; merge `6bbc66b`. |
| [#51](https://github.com/ngdat24/rubik-web/pull/51) | Cửa hàng, 30 skin, ba hòm, tiện ích, vòng quay, hiệu ứng renderer | API Kho skin cũ và cửa hàng mới dùng chung trạng thái trang bị; dịch tên 30 skin/mùa/kết quả/preview/xác nhận sang tiếng Anh. Thêm SQL/API/Chrome regression, cập nhật base về skin-system và viết lại description. Commit sửa `ed001c1`; merge `e2608f2`. |

Các nhánh sau từng được tạo trước khi nhánh trước nhận bản sửa, dẫn tới conflict và kế thừa lỗi. Những vùng dễ đụng gồm `main.ts`, `race.ts`, `translations.ts`, `cloud.mjs`. Đồng bộ nhánh cha phải lấy cả code mới; chỉ đổi base PR không giải quyết lỗi tích hợp.

## Các luật chính trong code đã tích hợp

- Solo đủ thưởng: 2×2 / 3×3 / 4×4 / 5×5 tối thiểu lần lượt 6/14/35/55 nước và 1,5/3,5/15/35 giây. Xoay toàn khối không giúp vượt ngưỡng; +2 tính vào kết quả nhưng không giúp vượt thời gian tối thiểu. Khối 6×6–10×10 không nhận thưởng Solo.
- Hồ sơ mới bắt đầu 0 CB/ZN; quà tân thủ 200 CB sau năm lượt hợp lệ. Solo tối đa 750 CB/ngày UTC+7.
- Ví có trần thưởng thông thường 50.000 CB/60 ZN. Hoàn gốc/thắng cược và hoàn trùng gacha được phép vượt trần theo luật v2; ledger ghi số thực nhận.
- Time Limit áp dụng vé/thưởng cho Full 3×3: một vé miễn phí/ngày, tối đa hai vé 100 CB. Vé được chốt sau countdown; không tự nâng một lượt luyện tập thiếu tiền thành lượt có thưởng khi nạp tiền sau đó.
- Thưởng trực tiếp Time Limit: 75/145/205 CB theo 1/2/ít nhất 3 khối; ZN có hạn mức ngày/tuần. Bỏ cuộc không nhận thưởng; phí vé đã tiêu không mặc nhiên hoàn lại.
- Bảng tuần xếp lượt giải, không phải danh sách người duy nhất. Nếu một người giữ nhiều vị trí top 3, chỉ nhận mốc cao nhất; không đẩy hạng 4 lên bù.
- Cược giữ tiền hai bên trong một transaction. Thắng nhận 90% quỹ; hòa/hủy hợp lệ hoàn tiền. Chấm kết quả theo số khối, mốc cuối và số nước server xác minh.
- Cửa hàng giữ bốn ô trong ngày UTC+7. Ô đã mua không bị đổi khi reroll; giao dịch dùng request ID và giá từ server.
- Hòm ưu tiên skin chưa sở hữu trong bậc đã quay ra; hết bậc mới hoàn trùng. Pity riêng từng hòm, cấu hình từ catalog.
- Vòng quay 1 ZN/lượt, gói 1/5/10; dừng khi trúng đỏ, chỉ thu số lượt thực hiện và phát các mốc còn thiếu. Bảo hiểm vàng/đỏ theo mốc 20/30 nếu chưa nhận.
- Reset mùa: hoàn escrow còn giữ, chốt các khoản phù hợp rồi CB còn một nửa làm tròn xuống, ZN về 0; giữ skin/FX và các tiến độ được luật yêu cầu giữ. Chạy lại cùng mùa không reset lần nữa.

Giá, tỷ lệ, hạn mức chi tiết phải đối chiếu migration và catalog tại commit đang chạy; không dùng các bản nháp DOCX cũ để ghi đè số liệu v2.

## Staging đã dựng

| Thành phần | Giá trị |
|---|---|
| Supabase | [rubik-lab-staging](https://supabase.com/dashboard/project/jytcjlivuixlznuyszbq) |
| Project ref | `jytcjlivuixlznuyszbq` |
| Tổ chức | `ngdat24's Org` / `gkooayhhfhkgtctocdih` |
| Vùng | Seoul, `ap-northeast-2` |
| Giá tạo project được báo | 0 USD/tháng; gói Free có quota, không phải tài nguyên không giới hạn |
| Website đã nghiệm thu | [Mở staging](https://rubik-182xbnn00-ngdattttt.vercel.app) |
| Vercel deployment | `dpl_C6dxDS3QUBMHjt4L1abyPBj3qCmL`, READY |
| Commit ứng dụng | `e2608f200ba1a7a2b5947218b80efe06ea9951b4` |
| Nhánh môi trường | `codex/staging-shop-acceptance` |
| Production Supabase không được thao tác | `dfknbaritcibkzvavmta` |

Đã bật Anonymous Sign-ins cho riêng staging bằng CLI sau khi chủ repo đăng nhập. Diff cấu hình chỉ thay `auth.enable_anonymous_sign_ins`; các thuộc tính không khai báo được giữ nguyên. CLI gọi môi trường mặc định của project staging là “production”; đó là nhãn nội bộ của project mới, không phải database production của Rubik Lab.

Sáu biến Vercel đã đặt riêng cho target `preview` và đúng Git branch trên: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET`. Secret backend/cron lưu dạng sensitive; không đưa secret vào tài liệu, repo hoặc frontend. Biến production và các nhánh khác không bị sửa.

Khi tạo Git branch, Vercel có thể tự build trước khi env theo nhánh được đặt. Deployment được nghiệm thu là bản tạo lại sau khi cấu hình đủ env, đúng ID và URL ở trên; không dùng một deployment cũ chỉ vì tên nhánh giống nhau.

## Migration staging và đối chiếu history

Database mới ban đầu không có bảng public hoặc migration. Đã áp đủ 18 file theo thứ tự repo từ mốc code nêu trên. Connector Supabase cấp version theo thời điểm apply; version trong history staging khác timestamp trong tên file nguồn.

**Không chạy `supabase db push` mù vào staging này:** cần đối chiếu/reconcile migration history trước để tránh chạy lại schema đã tồn tại. Không sửa history production theo bảng staging dưới đây.

| File nguồn trong supabase/migrations | Version thực trên staging |
|---|---|
| `20261112192305_rubik_accounts.sql` | `20261117022246` |
| `20261112202317_incremental_history_sync.sql` | `20261117022253` |
| `20261113111134_top_ten_solves.sql` | `20261117022259` |
| `20261113170905_invite_race.sql` | `20261117022306` |
| `20261115193912_race_live_progress.sql` | `20261117022313` |
| `20261115201408_race_one_face_three_minutes.sql` | `20261117022319` |
| `20261115211630_time_limit_sessions.sql` | `20261117022327` |
| `20261116061543_reusable_race_lobbies.sql` | `20261117022333` |
| `20261117010000_skin_inventory.sql` | `20261117022346` |
| `20261117010200_practice_challenges.sql` | `20261117022354` |
| `20261117010300_economy_wallet.sql` | `20261117022402` |
| `20261117010400_economy_progress.sql` | `20261117022408` |
| `20261117010500_economy_time_limit.sql` | `20261117022415` |
| `20261117010600_economy_weekly.sql` | `20261117022421` |
| `20261117010700_economy_race.sql` | `20261117022629` |
| `20261117010800_economy_season.sql` | `20261117024325` |
| `20261117010900_hydrogen_shop.sql` | `20261117024332` |
| `20261117011000_hydrogen_skin_catalog.sql` | `20261117024339` |

## Bằng chứng kiểm tra

### Nền local và CI trước merge #51

Build, lint, typecheck, 319 unit tests, API regression và Chrome regression đạt. CI push `44001149595`, pull_request `44001158509`, cùng Vercel của head `ed001c1` xanh trước merge. Các bộ PGlite trước đây là PostgreSQL nhúng local, không được gọi là nghiệm thu Supabase thật.

### SQL trên Supabase staging thật

Đã chạy đạt bảy file `supabase/tests/economy_wallet.sql`, `economy_progress.sql`, `economy_time_limit.sql`, `economy_weekly.sql`, `economy_race.sql`, `economy_season.sql`, `hydrogen_shop.sql`.

Các bài dùng transaction rollback, kiểm tra số dư/ledger, hạn mức, eligibility v2, thưởng/PB, vé, bảng tuần, escrow, retry, reset mùa và tương thích Kho skin cũ/mới. SQL thay thời gian/fixture để kiểm tra biên; không đợi nhiều ngày thật.

Kiểm tra quyền cho thấy không có bảng public nào thiếu RLS. Hai bảng profiles/solves cho authenticated SELECT có policy chỉ đọc dữ liệu của chính hồ sơ; các bảng kinh tế không mở đọc trực tiếp cho client. Advisor trả INFO “RLS enabled no policy” ở các bảng backend-only; đây phù hợp thiết kế service-only, không phải lý do thêm policy mở cho trình duyệt.

### Nghiệm thu website → API → Supabase

Lượt nghiệm thu tổng cuối đã đạt 17 mục:

1. Tạo hai phiên Chrome bằng Anonymous Auth thật, đăng ký hai tên hồ sơ.
2. Hồ sơ mới có ví 0 CB/0 ZN.
3. Mở hòm khi thiếu tiền bị từ chối.
4. Scramble máy chủ → replay hợp lệ → receipt → thưởng Solo vào ví; gửi lại không trả trùng, hồ sơ khác không dùng được challenge.
5. API nhiệm vụ/PB trả snapshot.
6. Mua skin theo offer và giá từ server, trừ đúng tiền.
7. Hai HTTP request đồng thời cùng request ID mở hòm chỉ thu tiền một lần và nhận cùng kết quả.
8. API Kho skin cũ đọc/gỡ/trang bị thống nhất với cửa hàng mới.
9. Hai giao dịch đồng thời khác request ID được xử lý đủ, không mất cập nhật số dư.
10. Quay mùa thật trừ đúng 1 ZN và trả kết quả.
11. Kho skin tiếng Anh, trạng thái trang bị sau reload, viewer thử 3D và viewport mobile 390×844 hoạt động; không tràn ngang.
12. Bấm mua trực tiếp trong UI tiếng Anh → API thật → SQL trừ tiền → UI báo thành công.
13. Hai người vào 1v1, giữ đúng 100 CB mỗi bên và hoàn đủ khi rời phòng chủ động trước giờ chơi.
14. Time Limit cấp vé miễn phí đầu tiên, vé sau thu đúng 100 CB sau countdown; hủy lượt hoạt động.
15. API bảng tuần truy cập được.
16. Tổng ledger từng tiền tệ khớp số dư ví.
17. Không có page error và không có request đến Supabase production trong lượt nghiệm thu.

Bài shop dùng tiền fixture được cấp có chủ đích trên staging. Không coi các lượt giải dựng bằng inverse/replay trong kịch bản là thành tích người chơi thật. Lịch mùa được đổi tạm để thử vòng quay rồi khôi phục về lịch gốc.

Có hai lần sửa kịch bản thử: join có thể cấp round mới nên phải lấy round từ phản hồi join; `depart=true` là tín hiệu đóng tab có ân hạn 5 giây, không phải thao tác rời phòng tức thì. Lượt tổng cuối dùng đúng round và rời phòng chủ động, đạt hết; không sửa code ứng dụng vì hai lỗi kịch bản đó.

### Maintenance và dọn dữ liệu

Gọi HTTP `/api/economy-maintenance` trên staging: không secret trả 401; đúng secret trả 200; gọi lại trả 0 tuần/escrow/mùa/phần thưởng mới. Luật ngày/tuần/reset mùa đã được kiểm bằng SQL regression.

Vercel Preview không tự chạy lịch cron production. Kiểm tra trên xác nhận gọi HTTP thủ công và logic SQL, chưa phải bằng chứng scheduler đã tự chạy đúng giờ trong production.

Sau nghiệm thu đã xóa các tài khoản thử qua Auth Admin của riêng staging, để cascade dọn dữ liệu liên quan; khôi phục lịch mùa. Kiểm tra dọn dữ liệu phải còn 0 profiles, wallets, ledger, shop receipts, race lobbies và Time Limit sessions; catalog giữ 30 skin. Người dùng truy cập staging sau đó sẽ tạo phiên/hồ sơ riêng, không kế thừa tiền thử của kịch bản.

## Cách chủ repo thử tiếp

Mở URL staging phía trên, đặt tên hồ sơ, bấm **Ví & Cửa hàng**. Hồ sơ mới bắt đầu từ 0 tiền theo luật thật; không có nút nạp tiền giả công khai như demo local. Muốn thử mua ngay với hồ sơ của mình, cần cấp fixture có chủ đích trên staging, không cấp vào production.

Lịch mùa gốc mở từ 18/11/2026 UTC+7; trước thời điểm đó UI có thể báo vòng quay chưa mở. Việc này không đồng nghĩa shop lỗi. Nghiệm thu tự động đã mở lịch tạm rồi khôi phục.

Demo local trước đó ở localhost:4180 là server PGlite trong RAM với tiền giả và nút reset; nó không phải website staging hoặc database Supabase này, và có thể vẫn chạy bản nháp cũ nếu chưa khởi động lại.

## Giới hạn và điều kiện trước main

- Hai phiên Chrome và viewport mobile đã thử; chưa thay thế hai điện thoại thật, cảm nhận thao tác của chủ repo hoặc đo GPU/FPS trên thiết bị yếu.
- Hai giao dịch HTTP đồng thời đã kiểm trên hệ thống thật; chưa có load test hoặc cam kết số người dùng tối đa, cũng chưa stress đồng thời reset mùa với nhiều phiên đang giao dịch.
- Asset gốc hình/âm thanh còn thiếu; renderer dùng hiệu ứng/texture tạo bằng mã và fallback. Chủ repo cần chấp nhận mức hoàn thiện hình ảnh trước phát hành.
- SQL reset/ngày/tuần đã kiểm bằng fixture; chưa theo dõi scheduler qua nhiều ngày thật.
- Runner nghiệm thu và PGlite hiện nằm thư mục tạm của phiên làm việc, chưa thành công cụ CI tái lập trong repo. Các regression code/SQL đã commit trong #51 vẫn có trong repo.
- Chỉ sau khi chủ repo duyệt trải nghiệm staging mới mở/duyệt PR tổng `skin-system → main`. Không tự merge theo quyền đã cấp cho #51.
- Trước migration production: đối chiếu applied history thực tế, backup/khả năng khôi phục phù hợp, chốt thứ tự schema và code. Preview còn dùng production phải được điều phối. Không chạy lại migration đã applied.
- Rollback code không rollback tiền đã thu/phát hay schema. Nếu phát hiện sai tiền, dừng giao dịch mới và đối chiếu receipt/ledger trước khi cân nhắc sửa dữ liệu; không tự xóa/reset ví người chơi.

