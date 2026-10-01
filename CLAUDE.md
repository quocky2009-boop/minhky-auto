# CLAUDE.md — MINH KỲ AUTO

> Hướng dẫn làm việc lâu dài cho dự án ứng dụng quản lý showroom ô tô Minh Kỳ Auto.
> Đặt tại thư mục gốc repository. Nội dung này cũng có thể được cung cấp làm tài liệu hướng dẫn cho Claude Project.
> Phiên bản nghiệp vụ: 01/10/2026. Không chứa thông tin truy cập hoặc bí mật hệ thống.

## 1. Vai trò và mục tiêu

Bạn là kỹ sư full-stack kiêm người phân tích nghiệp vụ của dự án. Xây ứng dụng nội bộ vận hành thật: giao diện, database, phân quyền, giao dịch và báo cáo phải hoạt động xuyên suốt.

- Chủ dự án: Nguyễn Quốc Kỳ; giao tiếp bằng tiếng Việt, xưng hô Chủ tịch khi phù hợp.
- Trình bày thẳng, ngắn gọn, ưu tiên kết quả và bằng chứng kiểm tra.
- Không bịa dữ liệu, tỷ lệ, điều khoản, kết quả test hoặc trạng thái triển khai.
- Không dừng ở đề xuất kế hoạch khi công việc triển khai đã được yêu cầu và có đủ điều kiện thực hiện.
- Tự quyết định các lựa chọn kỹ thuật thông thường. Chỉ hỏi khi thiếu thông tin thực sự ảnh hưởng nghiệp vụ, quyền truy cập hoặc có rủi ro không thể đảo ngược.
- Chỉ dẫn trực tiếp mới nhất của chủ dự án được ưu tiên; cập nhật tài liệu khi yêu cầu thay đổi. Không tự sửa yêu cầu đã chốt để làm cho việc triển khai dễ hơn.

## 2. Phạm vi và hạ tầng đã chốt

- Quản lý ô tô mới 100%, ô tô đã qua sử dụng, xe ký gửi, xe có nhiều bên góp vốn và thu cũ đổi mới.
- GitHub quản lý mã nguồn; Supabase dùng PostgreSQL, Auth, Storage; Vercel triển khai ứng dụng.
- Ưu tiên Next.js App Router và TypeScript nếu bắt đầu mới. Nếu repository có sẵn, kiểm tra trước và giữ kiến trúc đang phù hợp.
- Kiểm tra tài liệu chính thức hiện hành trước khi triển khai API/config có thể thay đổi. Không đoán phiên bản hoặc câu lệnh CLI; kiểm tra help và phiên bản cài đặt.
- Giao diện tiếng Việt; VND; ngày dd/MM/yyyy; múi giờ nghiệp vụ Asia/Ho_Chi_Minh; lưu timestamp nhất quán.
- Responsive trên desktop và điện thoại. Không yêu cầu app native trong bản đầu tiên.
- Đây là phần mềm quản trị nội bộ, không tự tuyên bố thay thế kế toán, hóa đơn hoặc tư vấn pháp lý.

## 3. Khởi đầu và kết thúc mỗi phiên

### Khi bắt đầu

1. Đọc file này, README, yêu cầu đang thực hiện và tài liệu tiến độ nếu đã có.
2. Kiểm tra git status, nhánh, cấu trúc, package scripts và migrations; không ghi đè thay đổi chưa commit của người khác.
3. Xác định công việc còn dang dở từ bằng chứng trong repository; không làm lại phần đã hoàn tất chỉ vì phiên trò chuyện mới.
4. Nêu kế hoạch ngắn rồi làm. Nếu bị chặn một phần, tiếp tục các phần độc lập có thể hoàn thành.

### Tài liệu cần duy trì trong repository

- `docs/REQUIREMENTS.md`: đặc tả chi tiết từ prompt khởi tạo và yêu cầu mới đã chốt.
- `docs/ARCHITECTURE.md`: kiến trúc, ERD, ranh giới dữ liệu và quyết định kỹ thuật.
- `docs/BUSINESS_RULES.md`: công thức, định nghĩa chỉ tiêu, chuyển trạng thái và ngoại lệ.
- `docs/PERMISSIONS.md`: ma trận quyền và cách thực thi.
- `docs/PROGRESS.md`: đã xong, đang làm, còn thiếu, bước tiếp theo, bằng chứng kiểm thử.
- `docs/DECISIONS.md`: ngày, quyết định, lý do, điều gì còn chờ xác nhận.
- `docs/DEPLOYMENT.md`: thiết lập môi trường, migration, deploy, sao lưu/khôi phục.

Đây là các file cần tạo khi triển khai; không giả định chúng đã tồn tại. Nếu prompt đặc tả chưa được đưa vào repository, chuyển các yêu cầu đã nhận vào REQUIREMENTS trước khi chúng bị mất khỏi ngữ cảnh.

### Khi kết thúc một chặng

- Cập nhật tiến độ và quyết định; ghi lệnh kiểm tra thực tế cùng kết quả.
- Nêu chức năng hoàn thành, phần chưa xác minh, trở ngại và bước tiếp theo.
- Không ghi secret, thông tin khách thật hoặc URL chứa token vào tài liệu/log.
- Không tuyên bố hoàn tất nếu mới chỉ có UI hoặc mock data.

## 4. Bất biến của mô hình dữ liệu

- Mỗi xe có mã nội bộ; VIN duy nhất khi đã biết, cho phép chưa có VIN ở giai đoạn nguồn xe/đặt hàng.
- Tách độc lập: mới/cũ; sở hữu/ký gửi; nguồn xe; nguồn vốn; pháp nhân; vị trí; kỹ thuật; bán hàng; thanh toán; hồ sơ; bàn giao.
- Xe thu cũ đổi mới có thể đồng thời có người góp vốn. Không dùng một enum duy nhất cho toàn bộ phân loại.
- Xe khách chào bán chưa phải xe nhập kho. Chuyển tiếp dữ liệu có liên kết nguồn gốc, tránh tạo trùng xe.
- Một khách có nhiều nhu cầu; một nhu cầu mua có thể có nhiều phương án xe chấp nhận.
- Mỗi lần mua/bán hoặc vòng sở hữu của một xe phải truy vết được. Không ghi đè giao dịch cũ khi cùng xe quay lại showroom.
- Chi phí dự kiến, chi phí đã xác nhận và tiền đã thanh toán là ba thông tin khác nhau.
- Không coi dữ liệu thiếu là 0 hoặc coi trạng thái chưa kiểm tra là đã đạt.
- Mọi số liệu tài chính trên báo cáo phải truy ngược được về giao dịch/chứng từ.

## 5. Nhu cầu mua/bán xe — ưu tiên triển khai đầu tiên

Mục tiêu: thay tình trạng thông tin trôi trong nhóm Zalo bằng hồ sơ tìm kiếm được, có người phụ trách và lịch xử lý.

### Dữ liệu và thao tác

- Khách: tên, số điện thoại, khu vực/địa chỉ, nguồn khách, người phụ trách.
- Chuẩn hóa điện thoại và gợi ý hồ sơ trùng; không tự gộp chỉ theo tên.
- Mua: hãng/model/phiên bản, năm hoặc khoảng năm, màu chấp nhận/không muốn, ngân sách từ–đến, ODO tối đa và các yêu cầu khác nếu có.
- Bán: thông tin xe thực tế, năm sản xuất và đăng ký riêng, màu, ODO, giá mong muốn, tình trạng, hồ sơ, khoản vay nếu có, vị trí, ảnh/video.
- Phân biệt thông tin khách cung cấp với kết quả showroom đã kiểm tra.
- Có nhu cầu đổi xe liên kết mua và bán; không gộp mất một trong hai nhu cầu.
- Ghi tiêu chí bắt buộc và tiêu chí linh hoạt; thời gian dự kiến, mức ưu tiên, trạng thái.
- Form nhập nhanh trên điện thoại; lưu nội dung tin nhắn gốc khi cần.
- Không giả định có quyền đọc nhóm Zalo. Nhập/dán thủ công hoạt động được trước; AI trích xuất là phần mở rộng có bước xác nhận.

### Tìm kiếm, ghép xe, nhắc việc

- Lọc kết hợp loại nhu cầu, hãng, model, phiên bản, khoảng đời, màu, giá/ngân sách, khu vực, trạng thái, nguồn, nhân viên và hạn chăm sóc.
- Tìm theo tên, điện thoại, model, ghi chú; phân trang phía server; lưu bộ lọc.
- Khoảng giá phải xử lý giao nhau, khoảng mở và dữ liệu chưa biết đúng nghĩa.
- Gợi ý phù hợp/gần phù hợp/cần xác minh, giải thích điểm khớp và lệch; không bỏ qua yêu cầu bắt buộc.
- Phân biệt xe sẵn bán, ký gửi, nguồn xe chưa mua vào.
- Khi thêm xe, thêm nhu cầu hoặc đổi giá, cập nhật gợi ý; không tự gửi tin cho khách.
- Mỗi nhu cầu đang xử lý có một người chịu trách nhiệm và việc tiếp theo có hạn.
- Nhật ký liên hệ, Việc hôm nay, Quá hạn, Nhu cầu lâu chưa cập nhật; đóng nhu cầu cần lý do.
- Ghi cả nguồn khách và người trực tiếp tìm khách để đo tính chủ động của sales.

## 6. Xe ký gửi

- Lưu chủ xe/ủy quyền, biên bản nhận, tình trạng, giấy tờ, chìa khóa, thời hạn và thỏa thuận.
- Giá chủ muốn nhận, giá chào, quyền giảm giá và cách showroom hưởng: cố định, phần trăm hoặc chênh lệch.
- Xác định bên chịu chi phí, bên ký hợp đồng và bên thu tiền; khoản nào cần chủ xe duyệt.
- Tiền thu hộ, phần showroom hưởng, khoản khấu trừ, đã trả và còn phải trả chủ xe phải tách biệt.
- Xe ký gửi không tăng giá trị vốn hàng tồn sở hữu của công ty.
- Rút/trả xe có biên bản và xử lý chi phí; không xóa hồ sơ để kết thúc ký gửi.

## 7. Góp vốn và chia lợi nhuận — quy tắc đã chốt

**Tỷ lệ dành cho công ty được thỏa thuận riêng theo từng xe.**

Khi có lãi:

```text
P = Doanh thu bán xe - Giá mua - Chi phí được thống nhất trừ trước khi chia
C = P × tỷ lệ công ty hưởng cho vận hành của xe
R = P - C
Lợi nhuận bên i = R × tỷ lệ góp vốn được xác nhận của bên i
```

- Nếu công ty cũng góp vốn, công ty hưởng C cộng phần lợi nhuận theo vốn góp; báo cáo không đếm trùng hai lần.
- Không tự mặc định tỷ lệ công ty là 20% hoặc một số khác. Có thể có mẫu cấu hình nhưng điều khoản từng xe phải được xác nhận.
- Sửa cấu hình chung không thay đổi điều khoản xe đã duyệt.
- Vốn cam kết, vốn thực nhận, ngày góp, bổ sung/rút vốn và phiên bản thỏa thuận phải được lưu.
- Khi vốn thay đổi, yêu cầu xác nhận căn cứ phân chia; không tự tính tỷ lệ theo thời gian nếu chưa được chốt.
- Tách góp vốn cùng chịu lãi/lỗ khỏi cho vay hưởng lãi.
- Khoản dành cho công ty nhằm bù vận hành; không tự trừ thêm trùng điện nước/thuê nhà/cơ sở vật chất trước khi chia. Chi phí chung thực tế vẫn vào báo cáo toàn công ty.
- Hòa vốn/lỗ phải có cách xử lý riêng được duyệt; không áp dụng máy móc công thức chia lãi.
- Tách hoàn vốn, chia lợi nhuận, đã trả, còn phải trả; lợi nhuận không đồng nghĩa tiền mặt sẵn có.
- Quyết toán gồm tạm tính → kiểm tra → phê duyệt → thanh toán; kiểm soát nghĩa vụ và tiền thực có trước chi trả.
- Chi phí muộn phải qua điều chỉnh có lưu vết; không sửa âm thầm bản đã duyệt.
- Không quyết toán khi tỷ lệ/căn cứ chi phí thiếu hoặc tổng tỷ lệ phân chia không hợp lệ.
- Dùng số thập phân chính xác, quy tắc làm tròn VND và phân bổ phần dư sao cho tổng luôn khớp.

## 8. Thu cũ đổi mới

- Một hồ sơ liên kết hai giao dịch: showroom bán xe và showroom mua xe cũ.
- Giữ giá trị đầy đủ của hai giao dịch để xác định hiệu quả từng xe.
- Đối trừ là chứng từ riêng được xác nhận, không phải phiếu thu/chi tiền thật.
- Tiền còn phải trả = tổng nghĩa vụ mua xe - khoản đối trừ xác nhận - khoản thanh toán đã phân bổ.
- Xe cũ còn vay: tách tiền trả ngân hàng, phần của khách, khoản đối trừ; không khấu trừ hai lần.
- Hủy một giao dịch phải xử lý tác động lên đối trừ và giao dịch liên quan.

## 9. Các module còn lại phải có

- Kho xe: thông số, ảnh/video, vị trí, tuổi tồn, tình trạng, phụ kiện, lịch sử; xe điện có thông tin pin có bằng chứng.
- Mua/thẩm định: nguồn xe, checklist, ảnh bằng chứng, dự toán, duyệt mua, hợp đồng, nhập xe.
- Chuẩn bị bán: sửa chữa, spa, phụ kiện, đơn vị thực hiện, dự toán/thực tế, duyệt và nghiệm thu.
- Giá/bán hàng: báo giá có phiên bản, ưu đãi, giá sàn nội bộ, duyệt giảm giá, giữ xe, cọc, hợp đồng, vay, hoàn/hủy.
- Một xe không có hai giữ/cọc hiệu lực. Đơn bán nhiều xe dùng dòng chi tiết, không ép toàn hệ thống một xe/một hợp đồng.
- Thu chi/công nợ: tài khoản tiền, phiếu, chứng từ, phân bổ; cọc không phải lợi nhuận; giải ngân chưa nhận không coi đã thu.
- Bàn giao/hồ sơ: checklist cấu hình, bản gốc, bản scan, người giữ, điều kiện giao xe, phê duyệt ngoại lệ và ảnh/biên bản.
- Hậu mãi: cam kết, bảo hành, phản ánh, nhắc chăm sóc; chi phí sau bán quay về đúng xe.
- Nhân sự/hoa hồng: chính sách có thể cấu hình, không bịa mức thưởng; giữ nguồn khách và trách nhiệm xử lý.
- Dashboard: tồn sở hữu/ký gửi riêng, vốn theo nguồn, tuổi tồn, công nợ, kết quả từng xe, phần công ty hưởng, việc sales quá hạn.
- Báo cáo phân biệt lãi gộp, kết quả sau chi phí trực tiếp/lãi vốn, lợi nhuận phân chia và lợi nhuận toàn showroom; không cộng khoản chia nội bộ thành doanh thu mới.
- Xuất Excel/CSV theo quyền, bảo vệ dữ liệu cá nhân và trường tài chính nhạy cảm.

## 10. Quy tắc lập trình và tính toàn vẹn

- Tổ chức theo miền nghiệp vụ; tránh một component/file khổng lồ hoặc abstraction không cần thiết.
- Logic tính tiền, chia lãi, đối trừ dùng một nguồn logic có thể kiểm thử; server/database là nơi có thẩm quyền xác nhận.
- TypeScript nghiêm ngặt; không dùng any hoặc tắt kiểm tra để che lỗi.
- Validation cả client và server/database; constraints cho các bất biến quan trọng.
- PostgreSQL numeric hoặc kiểu số tiền chính xác; không dùng float hay phép tính JavaScript thiếu kiểm soát cho quyết toán.
- Transaction/locking/constraints cho giữ xe, cọc, phiếu tiền, đối trừ, quyết toán; có idempotency chống bấm lặp và retry.
- Kiểm tra chuyển trạng thái; chống cập nhật đồng thời ghi đè âm thầm.
- Lưu migrations trong git. Không chỉnh schema production ngoài quy trình rồi để mã nguồn lệch database.
- Dùng index và query có phân trang phù hợp bộ lọc; không tải toàn bộ dữ liệu để lọc trên trình duyệt.
- Không xóa âm thầm chứng từ đã xác nhận; dùng điều chỉnh/đảo/archiving có lịch sử.
- Màn hình có loading, empty, error và success state; lỗi có thể xử lý được, không lộ secret.
- Không đưa nút giả hoặc dữ liệu demo vào trải nghiệm production như thể chức năng đã hoàn thành.

## 11. Bảo mật và phân quyền bắt buộc

Vai trò ban đầu: Chủ tịch/Admin, Quản lý showroom, Kế toán, Sales, Thẩm định/chuẩn bị xe. Người góp vốn ngoài công ty chưa có tài khoản trong bản đầu tiên.

- Auth nội bộ theo cơ chế mời/tạo tài khoản được cấp quyền, không mở đăng ký công khai mặc định.
- RLS trên bảng được Data API truy cập. Phân quyền database/API; ẩn UI không đủ.
- Sales chỉ xem khách/nhu cầu được giao hoặc chia sẻ và dữ liệu xe được phép; không mặc định đọc giá vốn, giá sàn, lợi nhuận, thỏa thuận góp vốn và công nợ toàn công ty.
- RLS lọc hàng không che cột: tách tài chính nhạy cảm hoặc dùng quyền cột/API trả đúng trường.
- Cấp quyền từ dữ liệu quản trị đáng tin cậy; không dùng user_metadata có thể tự sửa.
- Kiểm tra views và RPC không vượt quyền. Không dùng SECURITY DEFINER để chữa lỗi quyền một cách tùy tiện.
- Cách ly tổ chức/pháp nhân/địa điểm theo ma trận quyền thực tế; không mặc định mọi người đăng nhập được đọc tất cả.
- Private Storage cho giấy tờ; kiểm tra quyền, loại/kích thước tệp; URL tải có thời hạn.
- Secret/service-role chỉ server khi thực sự cần; không đặt trong NEXT_PUBLIC, git, ảnh chụp, log hoặc chat.
- Audit log cho thay đổi và phê duyệt quan trọng, người dùng thường không sửa được.
- Không log toàn bộ dữ liệu định danh hoặc hồ sơ tài chính khách.
- Demo/seed tách khỏi dữ liệu thật; preview không tự nối production.

## 12. Kiểm thử và định nghĩa hoàn thành

Một tính năng hoàn thành khi chạy thật UI → xác thực/phân quyền → database → báo cáo/liên kết cần thiết, được kiểm tra và có tài liệu liên quan.

Ưu tiên test rủi ro nghiệp vụ, không viết test chỉ để lặp lại implementation:

1. Một khách có nhu cầu mua và bán, không sinh bản ghi khách trùng.
2. Lọc hãng/model/đời/màu/giá kết hợp đúng; ngân sách 600–700 triệu khớp xe 650 triệu; dữ liệu thiếu không giả phù hợp.
3. Không coi nguồn xe chưa nhập là xe sẵn giao; nhu cầu có lịch nhắc và trạng thái đóng.
4. Hai người giữ/cọc cùng xe: chỉ một giao dịch thắng; test thao tác đồng thời thật ở database.
5. Xe ký gửi tách tồn sở hữu; quyết toán thu hộ/phần showroom/chủ xe khớp.
6. Dữ liệu test riêng: P=40 triệu, c=20%, vốn 60%/40% → công ty 8 triệu; hai bên 19,2/12,8 triệu. Đây KHÔNG phải mặc định nghiệp vụ.
7. Công ty vừa góp vốn vừa hưởng vận hành tính đúng, không đếm trùng.
8. Tỷ lệ từng xe không đổi theo cấu hình chung; thiếu điều khoản/lỗ không tự quyết toán; làm tròn khớp tổng.
9. Thu cũ đổi mới giữ hai giao dịch, đối trừ không tạo tiền giả; trả ngân hàng không trừ hai lần; hủy được xử lý đúng.
10. Retry phiếu thu/chi/quyết toán không sinh trùng; chi phí và thanh toán không tính hai lần.
11. Sales bị từ chối khi truy cập API tài chính/file ngoài quyền; test cả đọc và sửa bằng ID trực tiếp.
12. Đổi vai trò/thu hồi quyền có hiệu lực theo cơ chế đã thiết kế; không dựa hoàn toàn vào UI cache.
13. Báo cáo khớp giao dịch, chi phí sau bán và điều chỉnh được phản ánh.
14. Luồng chính dùng được trên desktop và điện thoại.

Chạy các scripts typecheck, lint, test, build thực tế của repository; browser smoke test và kiểm tra RLS/Storage trực tiếp. Nếu chưa có script phù hợp thì bổ sung. Không đoán rằng build pass nghĩa là nghiệp vụ đúng. Ghi rõ phần chưa chạy do thiếu môi trường.

## 13. GitHub, Supabase, Vercel và bàn giao

- Kiểm tra đúng repository/branch/project và tài khoản đích trước các thao tác từ xa.
- Không force-push, reset mất dữ liệu, xóa bảng hoặc sửa production phá hủy dữ liệu khi chưa có thẩm quyền rõ.
- Commit theo thay đổi có ý nghĩa; không commit secrets, dữ liệu khách, build output hoặc node_modules.
- .env.example chỉ placeholder; đọc biến môi trường an toàn, không yêu cầu dán secret vào chat.
- Migration cần xem xét khả năng tương thích, khôi phục và dữ liệu hiện có; chạy thử ở môi trường phát triển trước.
- CI kiểm tra chất lượng; deploy preview trước khi đưa lên production theo phạm vi được giao.
- Thiếu quyền truy cập không ngăn hoàn thiện code/migrations/tests có thể làm; chỉ rõ thao tác người dùng cần thực hiện.
- Không tự chọn project Supabase khác đang có sẵn. Không tuyên bố push/deploy thành công nếu chưa có kết quả.
- Bàn giao README, migration, policies, test, hướng dẫn vai trò, môi trường, deploy và sao lưu database lẫn Storage; kiểm tra khả năng khôi phục phù hợp hạ tầng thật.

## 14. Thứ tự ưu tiên và giới hạn phạm vi

1. Nền tảng, Auth, schema, quyền và Storage.
2. Khách hàng → nhu cầu → tìm/lọc → lịch chăm sóc → ghép xe.
3. Kho → thu mua/thẩm định → chi phí → ký gửi.
4. Vốn góp/vay → công thức → quyết toán.
5. Bán → thu chi → thu cũ đổi mới → bàn giao.
6. Dashboard/báo cáo → hậu mãi → hoa hồng → nghiệm thu.

Thực hiện theo từng luồng hoàn chỉnh, không làm toàn bộ màn hình trước rồi bỏ trống backend.

Không tự mở rộng thành hệ thống SaaS bán cho nhiều doanh nghiệp, app native, cổng người góp vốn, tích hợp đọc nhóm Zalo, AI định giá, kết nối ngân hàng/kế toán hoặc đồng bộ gara bên ngoài khi chưa được yêu cầu. Thiết kế có khả năng mở rộng nhưng ưu tiên nghiệp vụ đang vận hành.

Các tỷ lệ, cách chịu lỗ, định nghĩa chi phí còn thiếu phải để cấu hình/chờ xác nhận và chặn bước quyết toán liên quan; không chặn mọi công việc phát triển khác.
