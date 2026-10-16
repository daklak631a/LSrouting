"""Phần 5 đến Phần 9: Quản lý LS, Quản trị, Giám sát, điện thoại, hỏi đáp."""


def build(g):
    # ============================================================ PHẦN 5
    g.h1('Phần 5. Dành cho Quản lý LS')
    g.p('Điều hành bộ phận LS: dùng các màn hình như Kiểm soát (Phần 3; riêng Đăng ký hộ phòng chỉ Kiểm soát làm) và bắt đầu từ **Kết quả & kế hoạch**.')
    g.h2('Bạn làm được gì')
    g.li('Làm các việc của Kiểm soát LS: phân công (kể cả Phân công nhanh), trả về Phòng/PGD, đổi người, duyệt đề nghị sửa, mở lại việc.',
         'Xem Kết quả & kế hoạch: kết quả theo ngày, cán bộ, loại việc, đơn vị gửi; giao kế hoạch ngày, chỉ tiêu tháng.',
         'Theo dõi hồ sơ đã giao theo từng phòng ở Quản lý hồ sơ; xem báo cáo nhiều kỳ, thời gian & SLA, kỳ tháng và nhật ký toàn bộ.')
    g.h2('Các bước chính')
    g.table(['Bước', 'Việc bạn làm', 'Nơi làm'], [
        ['1', 'Xem kết quả và kế hoạch', 'Kết quả & kế hoạch'],
        ['2', 'Cân tải: đổi người xử lý', 'Quản lý hồ sơ → Đang xử lý'],
        ['3', 'Xem và sửa kết quả ghi nhận của hồ sơ đã hoàn thành', 'Quản lý hồ sơ → Hoàn thành'],
        ['4', 'Duyệt đề nghị sửa', 'Hàng chờ'],
    ], [0.7, 5.6, 3.4])
    g.h2('Bước 1. Kết quả & kế hoạch', bullets=[
        'Chọn kỳ, ngày, Cán bộ LS, Đơn vị gửi rồi bấm Xem', 'Bốn tab: Kết quả thực hiện, Theo cán bộ, Theo loại việc, Theo đơn vị gửi', 'Giao kế hoạch; Tải ảnh, Tải Excel'])
    g.p('Màn hình đầu tiên là **Kết quả & kế hoạch**. Chọn **Kỳ**, ngày, **Cán bộ LS** và **Đơn vị gửi** rồi bấm **Xem**. Bảng **Kết quả thực hiện** có các dòng '
        'Soạn thảo HĐ thế chấp, Soạn thảo HĐ tín dụng, Nhập kho TSĐB, Xuất kho TSĐB, Giao dịch trên Rlos, Tồn soạn hiện nay và Khác theo từng cán bộ; nút **Giao kế hoạch** '
        'để đặt kế hoạch (xem Phần 3, Bước 11). Các tab **Theo cán bộ**, **Theo loại việc**, **Theo đơn vị gửi** cho các góc nhìn khác; có Tải ảnh và Tải Excel. '
        'Việc quá hạn và trạng thái hồ sơ xem ở Quản lý hồ sơ.')
    g.fig('ql-01-tong-hop')
    g.fig('ql-02-theo-can-bo')
    g.h2('Bước 2. Cân tải: đổi người xử lý', bullets=[
        'Quản lý hồ sơ → tab Đang xử lý → Đổi người', 'Tích chọn cán bộ mới theo bảng tải', 'Tick phần cán bộ cũ đã làm xong; ghi lý do; Chuyển người khác'])
    g.p('Vào **Quản lý hồ sơ**, tab **Đang xử lý** và bấm **Đổi người** trên dòng hồ sơ. Tích chọn cán bộ mới dựa vào bảng tải (Đang mở, Phân công hôm nay, Đã hoàn thành). '
        'Mục **Phần <cán bộ cũ> đã làm xong** cho tick những phần cán bộ cũ đã hoàn tất (Soạn HĐ tín dụng, Soạn HĐ thế chấp, Giao dịch trên Rlos): phần được tick tính vào '
        'kết quả ngày của người cũ, cán bộ mới chỉ được tính phần còn lại khi hoàn thành. Ghi **Lý do** (bắt buộc) rồi bấm **Chuyển người khác**. Cán bộ mới nhận thông báo; '
        'mốc nhận hồ sơ và SLA không đổi.')
    g.fig('ql-03-dang-xu-ly-doi-nguoi')
    g.fig('ql-04-doi-nguoi')
    g.h2('Bước 3. Xem và sửa kết quả ghi nhận của hồ sơ đã hoàn thành', bullets=[
        'Quản lý hồ sơ → tab Hoàn thành → con mắt', 'Dòng Kết quả ghi nhận: HĐ thế chấp, Rlos', 'Sửa ghi nhận kết quả khi cán bộ tick nhầm'])
    g.p('Vào **Quản lý hồ sơ**, tab **Hoàn thành**, bấm biểu tượng con mắt: dòng **Kết quả ghi nhận** cho biết HĐ thế chấp và Rlos mà cán bộ đã tick khi hoàn thành. '
        'Bấm **Sửa ghi nhận kết quả** để chỉnh khi cán bộ tick nhầm; thao tác được lưu vào Nhật ký. Hồ sơ đã hoàn thành cần xử lý lại thì dùng **Mở lại việc** '
        '(Kiểm soát / Quản lý): hồ sơ về Đã tiếp nhận hồ sơ, hạn tính lại từ lúc mở, lịch sử các phiên giữ nguyên.')
    g.fig('ql-07-chi-tiet-hoan-thanh')
    g.h2('Bước 4. Duyệt đề nghị sửa', bullets=['Khối Đề nghị sửa chờ duyệt đầu Hàng chờ', 'Duyệt hoặc Từ chối'])
    g.p('Làm như Kiểm soát LS (Phần 3, Bước 10): đề nghị sửa của Phòng/PGD hiện ở khối **Đề nghị sửa chờ duyệt** đầu Hàng chờ. Bấm **Duyệt** để áp dụng '
        'hoặc **Từ chối**; người đề nghị được báo kết quả. Việc hủy do Phòng/PGD hoặc cán bộ LS tự hủy trực tiếp, không qua bước duyệt.')

    # ============================================================ PHẦN 6
    g.h1('Phần 6. Dành cho Quản trị hệ thống')
    g.p('Người cấu hình hệ thống, cấp tài khoản và giám sát việc gửi thông báo. Mỗi thay đổi cấu hình ghi vào **Nhật ký cấu hình**.')
    g.h2('Bạn làm được gì')
    g.li('Tạo, sửa, khóa tài khoản và nhập người dùng hàng loạt từ Excel.',
         'Quản lý danh mục: loại việc, đơn vị, lý do, nguồn dropdown.',
         'Cấu hình kênh gửi tin, mẫu tin, quy tắc thông báo; theo dõi hàng đợi gửi.',
         'Đặt lịch làm việc, ngày lễ và cấu hình chung (nơi ký, ngưỡng cảnh báo…).',
         'Phát Thông báo phiên bản mới cho người dùng.')
    g.h2('Menu quản trị')
    g.table(['Nhóm', 'Mục', 'Dùng để'], [
        ['Giám sát', 'Tổng quan', 'Tin chờ gửi, tin thất bại, việc quá hạn, điểm vận hành, tình trạng kênh gửi tin'],
        ['', 'Hàng đợi gửi', 'Xem tin đang chờ, đã gửi, lỗi; thử lại hoặc hủy'],
        ['', 'Chi phí & hiệu quả', 'Thống kê chi phí và hiệu quả gửi tin theo kênh'],
        ['', 'Nhật ký cấu hình', 'Ai đã đổi cấu hình gì, lúc nào'],
        ['Gửi tin', 'Kênh gửi tin · Mẫu tin · Quy tắc thông báo', 'Bật/tắt kênh, nội dung tin, sự kiện nào gửi cho ai'],
        ['Danh mục', 'Loại việc · Đơn vị · Người dùng · Lý do · Dropdown nguồn · Phân công nhanh', 'Danh mục dùng trong form, báo cáo và quy tắc giao hồ sơ'],
        ['Hệ thống', 'Lịch làm việc · Cấu hình chung · Thông báo phiên bản · Dữ liệu', 'Lịch tính SLA, tham số chung, thông báo cập nhật, kho dữ liệu'],
    ], [1.6, 4.2, 4])
    g.h2('Bước 1. Tổng quan quản trị', bullets=[
        'Tin chờ gửi, tin thất bại, việc quá hạn', 'Điểm vận hành: Tạm ẩn điểm khi cần chiếu màn hình', 'Menu bên trái theo bốn nhóm'])
    g.p('Tổng quan hiển thị tin chờ gửi, tin thất bại, việc quá hạn, điểm vận hành và tình trạng kênh gửi tin. Menu bên trái chia bốn nhóm: Giám sát, Gửi tin, Danh mục, '
        'Hệ thống. Điểm vận hành có thể tạm ẩn khỏi Tổng quan khi cần (ví dụ lúc chiếu màn hình) bằng nút **Tạm ẩn điểm** và bật lại bằng nút **Hiện điểm vận hành**.')
    g.fig('adm-01-tong-quan')
    g.h2('Bước 2. Quản lý người dùng', bullets=[
        'Thêm người dùng hoặc bút chì để sửa', 'Vai trò, đơn vị, trạng thái, thời gian nghỉ, mật khẩu mới', 'Nhập Excel/CSV để thêm nhiều người'])
    g.p('**Người dùng** liệt kê tài khoản, vai trò, đơn vị, số việc đang mở. Bấm **Thêm người dùng** hoặc biểu tượng bút để sửa: mã cán bộ, họ tên, email, đơn vị, '
        'vai trò (Phòng/PGD, Kiểm soát LS, Cán bộ LS, Quản lý LS, Quản trị, Giám sát), thời gian nghỉ, mật khẩu mới và trạng thái hoạt động. **Nhập Excel/CSV** để thêm '
        'nhiều người, có mẫu Excel. Khi đổi một cán bộ LS còn việc mở sang vai trò khác, hoặc khóa / cho nghỉ, phải chọn cán bộ thay thế để hệ thống bàn giao '
        'việc đang mở trong cùng thao tác.')
    g.fig('adm-02-nguoi-dung')
    g.fig('adm-03-sua-nguoi-dung')
    g.h2('Bước 3. Loại việc và SLA', bullets=[
        'SLA theo giờ làm việc', 'Cần hẹn khách ký hồ sơ', 'Việc phải làm: mỗi dòng một mục'])
    g.p('**Loại việc** là danh mục sản phẩm. Với mỗi loại, đặt **SLA** (giờ làm việc; mặc định 8 giờ), có **Cần hẹn khách ký hồ sơ** hay không và danh sách '
        '**Việc phải làm** (mỗi dòng một mục). Loại việc không cần khách ký sẽ được hoàn thành ngay sau khi xử lý. Luồng hiện tại không còn bước kiểm soát duyệt '
        'nên không còn tùy chọn duyệt ở đây.')
    g.fig('adm-04-loai-viec')
    g.fig('adm-05-sua-loai-viec')
    g.h2('Bước 4. Kênh gửi tin và Quy tắc thông báo', bullets=[
        'Bật/tắt từng kênh khi đủ điều kiện', 'Quy tắc: sự kiện → người nhận → kênh → mẫu tin'])
    g.p('**Kênh gửi tin**: bật/tắt từng kênh (thông báo trong ứng dụng, Email công vụ, Zalo OA ZBS, SMS, nhóm Zalo nội bộ, Telegram). Kênh chỉ bật được khi đủ điều kiện '
        '(cấu hình, khóa bí mật, mẫu tin đã duyệt); bảng cho biết điều kiện còn thiếu. **Quy tắc thông báo** quyết định sự kiện nào (giao việc, chuyển việc, trả bổ sung, '
        'hẹn khách ký, hoàn thành, quá hạn) gửi cho ai, qua kênh nào, dùng mẫu nào.')
    g.fig('adm-06-kenh-gui-tin')
    g.fig('adm-07-quy-tac-thong-bao')
    g.h2('Bước 5. Lịch làm việc, Cấu hình chung, Phân công nhanh', bullets=[
        'Lịch làm việc quyết định SLA và giờ xử lý', 'Cấu hình chung: nơi ký mặc định, ngưỡng cảnh báo', 'Kế hoạch ngày không đặt ở đây'])
    g.p('**Lịch làm việc**: ngày làm việc, giờ bắt đầu/kết thúc, giờ nghỉ trưa và ngày nghỉ lễ; SLA và giờ xử lý tính theo lịch này (Phần 10). **Cấu hình chung**: tên ngân hàng, '
        'múi giờ, Nơi ký hồ sơ mặc định (hiện trong hộp thoại hẹn khách), ngưỡng cảnh báo và cổng gửi tin ngoài. Kế hoạch ngày và chỉ tiêu tháng không đặt ở đây: do '
        'Kiểm soát / Quản lý LS giao ở Kết quả & kế hoạch. **Phân công nhanh**: xem và sửa các quy tắc (phòng → cán bộ phụ trách, kèm các sản phẩm đi theo) như ở phần Kiểm soát.')
    g.fig('adm-08-lich-lam-viec')
    g.fig('adm-09-cau-hinh-chung')
    g.fig('adm-10-phan-cong-nhanh')
    g.h2('Bước 6. Thông báo phiên bản, Nhật ký cấu hình và Dữ liệu', bullets=[
        'Thông báo phiên bản: mã phiên bản, số lần hiện (1–3), nội dung', 'Nhật ký cấu hình: bấm Xem nhật ký', 'Dữ liệu: xuất JSON'])
    g.p('**Thông báo phiên bản**: nhập mã phiên bản, số lần popup hiển thị (1 đến 3, mặc định 3 lần cho mỗi tài khoản, tính chung trên các thiết bị) và nội dung bổ sung '
        '(tối đa 800 ký tự), rồi bấm **Phát thông báo cho toàn bộ user**. Muốn thôi hiện thì bấm Gỡ thông báo (người đã thấy không bị ảnh hưởng). '
        '**Nhật ký cấu hình** ghi mọi thay đổi (thời gian, người thực hiện, khu vực, nội dung); bản chạy trên Google Apps Script chỉ tải khi bấm **Xem nhật ký**. '
        '**Dữ liệu** cho biết số hồ sơ, việc, tin trong hàng đợi và người dùng; **Xuất toàn bộ JSON** để sao lưu. Khôi phục dữ liệu mẫu chỉ có tác dụng ở bản thử nghiệm '
        'cục bộ, không dùng được trên kho Google Sheet.')
    g.fig('adm-11-thong-bao-phien-ban')
    g.fig('adm-12-nhat-ky-cau-hinh')

    # ============================================================ PHẦN 7
    g.h1('Phần 7. Dành cho Giám sát')
    g.p('Người chỉ xem số liệu tổng hợp toàn hệ thống, không thao tác trên hồ sơ.')
    g.h2('Bạn làm được gì')
    g.li('Xem số liệu **Tổng hợp** theo đơn vị, nghiệp vụ và cán bộ.',
         'Xem báo cáo **Thời gian & SLA** và **Báo cáo** nhiều kỳ.',
         'Không xem được thông tin khách hàng và không sửa được dữ liệu.')
    g.h2('Bước 1. Tổng hợp', bullets=['Kết quả tổng hợp toàn hệ thống', 'Chưa có số liệu tổng hợp: màn hình báo như ảnh'])
    g.p('**Tổng hợp** hiển thị kết quả tổng hợp toàn hệ thống. Khi hệ thống chưa có số liệu tổng hợp, màn hình báo **Chưa có số liệu tổng hợp** (như ảnh chụp trên bản thử nghiệm).')
    g.fig('gs-01-tong-hop')
    g.h2('Bước 2. Thời gian & SLA và Báo cáo', bullets=['Chọn khoảng ngày, cán bộ, nghiệp vụ rồi Xem báo cáo', 'Báo cáo: chọn phạm vi rồi Chạy báo cáo, Tải Excel'])
    g.p('**Thời gian & SLA**: chọn khoảng ngày, cán bộ, nghiệp vụ rồi **Xem báo cáo**. **Báo cáo**: chọn phạm vi rồi **Chạy báo cáo**, có Tải Excel. Dữ liệu là số liệu '
        'tổng hợp, không hiển thị nhãn sản phẩm có thể chứa thông tin khách hàng.')
    g.fig('gs-02-thoi-gian-sla')
    g.fig('gs-03-bao-cao')

    # ============================================================ PHẦN 8
    g.h1('Phần 8. Dùng trên điện thoại')
    g.p('Giao diện tự co giãn theo màn hình điện thoại: thanh chức năng chuyển xuống dưới cùng, hồ sơ hiển thị dạng thẻ với nút thao tác lớn dễ bấm. Các bước làm việc '
        'giống hệt trên máy tính: bấm vào thẻ hồ sơ để thao tác, bấm biểu tượng con mắt để mở chi tiết và cuộn xuống để xem các nút cuối hộp thoại.')
    g.phones(['mobile-01-viec-cua-toi', 'mobile-02-dashboard', 'mobile-03-chi-tiet'])
    g.li('**Việc của tôi:** mỗi hồ sơ là một thẻ, nút thao tác chính (Tiếp nhận, Làm ngay, Hẹn ký…) nằm ngay trên thẻ.',
         '**Dashboard cá nhân:** các số đầu ngày, Việc tồn theo nhóm Hôm nay và Tồn các ngày trước; bấm để mở chi tiết việc.',
         '**Chi tiết hồ sơ:** các mục xếp dọc; cuộn xuống để thấy các nút cuối (Hẹn khách ký hồ sơ, Tạm dừng, Hoạt động & lịch sử).')

    # ============================================================ PHẦN 9
    g.h1('Phần 9. Câu hỏi thường gặp')
    g.table(['Tình huống', 'Cách xử lý'], [
        ['Không thấy nút Tiếp nhận', 'Hồ sơ chưa được giao cho bạn hoặc bạn không phải cán bộ được giao. Nhờ Kiểm soát/Quản lý kiểm tra người phụ trách.'],
        ['Bấm Tiếp nhận nhưng hồ sơ nằm ở Chờ bắt đầu', 'Bạn đang có hồ sơ khác Đang làm nên hồ sơ mới vào danh sách chờ. Bấm Làm ngay trên hồ sơ muốn làm trước.'],
        ['Không thấy nút Hoàn thành', 'Loại việc cần khách ký nên phải Hẹn ký trước; hoặc chưa tích đủ Việc phải làm / Phần việc TSĐB; hoặc chưa Tiếp nhận hồ sơ; hoặc hồ sơ đang Chờ bắt đầu / Chờ làm tiếp (bấm Làm ngay / Làm tiếp trước).'],
        ['Khách không có số điện thoại hoặc email', 'Vẫn hẹn ký được. Chọn báo qua nhóm nội bộ: tin được gắn thẻ cán bộ phụ trách để liên hệ khách.'],
        ['Giao nhầm người phụ trách', 'Kiểm soát/Quản lý bấm Đổi người và ghi lý do. SLA và mốc nhận hồ sơ được giữ nguyên.'],
        ['Ghi nhầm giờ tiếp nhận', 'Mở chi tiết hồ sơ, bấm Ghi / sửa giờ LS nhận đủ, nhập giờ đúng và lý do. Thao tác được lưu trong Nhật ký.'],
        ['Gửi nhầm việc', 'Phòng/PGD bấm Hủy việc trên dòng hồ sơ, chọn lý do và xác nhận; hủy trực tiếp, không cần duyệt (hồ sơ đã giao LS vẫn hủy được).'],
        ['Khách dời lịch', 'Phòng/PGD bấm bút chì trên dòng hồ sơ, đổi Ngày phát sinh (ghi nhận ngay, không cần duyệt). Muốn báo cán bộ LS lịch hẹn mới của khách thì dùng Hẹn bổ sung trong chi tiết hồ sơ.'],
        ['Hồ sơ bỗng chuyển sang Chưa giao hồ sơ', 'Hồ sơ đã phân công của ngày làm việc liền trước mà cán bộ LS chưa tiếp nhận được hệ thống tự trả về Phòng/PGD lúc đầu ngày làm việc (khoảng 7h). Người tạo đề nghị chọn ngày và bấm Gửi lại.'],
        ['Bị đăng xuất hoặc đổi máy', 'Đăng nhập lại bằng mã cán bộ và mật khẩu. Đổi mật khẩu ở mục Tài khoản (nút tròn góc dưới bên trái).'],
        ['Giao kế hoạch ngày ở đâu?', 'Kiểm soát/Quản lý LS: vào Kết quả & kế hoạch, bấm Giao kế hoạch, nhập kế hoạch mỗi ngày cho từng dòng của bảng kết quả và chỉ tiêu hoàn thành tháng, rồi Lưu kế hoạch. Bấm Hiện kế hoạch / % để so với kết quả.'],
        ['Hồ sơ TSĐB tính vào dòng nào của bảng kết quả ngày?', 'Làm TSĐB mới hoặc phụ lục TSĐB tính vào Soạn thảo HĐ thế chấp; nhập kho và xuất kho tính vào Nhập kho TSĐB, Xuất kho TSĐB theo ngày cán bộ tick; mượn TSĐB, thủ tục khác tính vào Khác. Kiểm soát/Quản lý sửa lại ở Quản lý hồ sơ, tab Hoàn thành, nút Sửa ghi nhận kết quả.'],
        ['Phân công nhanh giao những hồ sơ nào?', 'Theo quy tắc đã cấu hình: phòng do cán bộ nào phụ trách thì hồ sơ cầm cố của phòng về cán bộ đó (tick sẵn khi thêm quy tắc), sản phẩm khác tick thêm trong quy tắc. Hồ sơ chưa có quy tắc không tick sẵn để Kiểm soát tự chọn người.'],
        ['Bấm xong không thấy máy chủ báo gì?', 'Mọi thao tác ghi chạy nền: hộp thoại đóng ngay và màn hình đổi ngay. Chỉ khi hệ thống từ chối mới có thông báo lỗi và hồ sơ trở lại như cũ. Nếu có nhãn Đang lưu ở cuối màn hình thì chờ nó tắt rồi hãy đóng trang.'],
        ['Giờ xử lý chỉ thấy 0 phút hoặc "—"', '"—" là chưa có căn cứ đo (chưa có phiên Đang làm nào). 0 phút nghĩa là đã có phiên nhưng nằm ngoài lịch làm việc (đêm, nghỉ trưa, cuối tuần) hoặc phiên chưa khép. Hồ sơ Chờ bắt đầu, Chờ làm tiếp, đang tạm dừng không có giờ xử lý thêm.'],
        ['Hồ sơ đang làm bị chuyển sang Chờ làm tiếp', 'Mỗi lúc chỉ một hồ sơ Đang làm. Làm ngay hồ sơ khác hoặc bấm Tạm dừng toàn bộ thì hồ sơ đang làm sang Chờ làm tiếp; bấm Làm tiếp (hoặc Kết thúc tạm dừng) để chạy lại.'],
        ['Tạm dừng toàn bộ có làm hồ sơ quá hạn không?', 'Không dừng hạn SLA của hồ sơ; chỉ dừng đồng hồ giờ xử lý. Muốn dừng hạn thì Tạm dừng từng hồ sơ (chờ khách / cấp phê duyệt).'],
        ['Giờ làm hôm nay khác giờ xử lý của hồ sơ', 'Giờ làm hôm nay gồm cả các lượt Tạm dừng toàn bộ; giờ xử lý của hồ sơ chỉ gồm thời gian hồ sơ đó Đang làm. Xem Phần 10.'],
        ['Hồ sơ vẫn còn trong Việc tồn dù đã hẹn ký', 'HĐTC chỉ hết tồn khi tick Đã soạn xong HĐ thế chấp; Kho TSĐB hết khi tick nhập kho; RLOS khi đã ghi giao dịch trên Rlos. Xem Phần 11.'],
        ['Hồ sơ có nhãn Không tính quá hạn (HĐTC)', 'Hồ sơ có phần soạn HĐ thế chấp (TSĐB mới, phụ lục TSĐB và hồ sơ vay đi kèm) không bị tính quá hạn; theo dõi bằng kế hoạch ngày và Việc tồn.'],
        ['Làm sao xem nhật ký?', 'Mở màn Nhật ký rồi bấm Xem nhật ký; nhật ký không tự tải để màn hình mở nhanh.'],
    ], [3.4, 6.8])
