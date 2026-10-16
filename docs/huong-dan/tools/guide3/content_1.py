"""Phần 1 đến Phần 3: tổng quan, Phòng/PGD, Kiểm soát LS."""


def build(g):
    # ============================================================ PHẦN 1
    g.h1('Phần 1. Tổng quan và luồng xử lý')
    g.p('LS-Routing giúp Phòng / PGD gửi hồ sơ tín dụng sang bộ phận LS, Kiểm soát phân công cho cán bộ, cán bộ tiếp nhận, hẹn khách ký '
        'và hoàn thành. Mọi bước đều có mốc thời gian để tính hạn xử lý (SLA) và lưu nhật ký.')
    g.h2('Luồng xử lý chính')
    g.fig('luong-xu-ly', caption='Sơ đồ luồng xử lý hồ sơ', legend=[])
    g.p('Sau khi Phòng/PGD tạo việc, hồ sơ chuyển thẳng sang Kiểm soát/Quản lý LS để phân công. Cán bộ được giao chỉ có ba việc: '
        '**Tiếp nhận hồ sơ**, **Hẹn khách ký**, **Hoàn thành**. Trong lúc xử lý, cán bộ chuyển hồ sơ giữa **Đang làm** và **Chờ làm tiếp** '
        'bằng nút Làm ngay / Làm tiếp. Không có các bước trung gian như bàn giao, báo soạn xong hay trình duyệt.')
    g.h2('Vai trò trong hệ thống')
    g.table(['Vai trò', 'Việc chính', 'Xem ở'], [
        ['Phòng / PGD', 'Tạo việc, sửa nhanh bằng bút chì, hẹn bổ sung, gửi lại khi Chưa giao hồ sơ, hủy hoặc tạm dừng việc của mình, theo dõi hồ sơ của phòng', 'Phần 2'],
        ['Kiểm soát LS', 'Nhận hồ sơ, phân công (từng hồ sơ, hàng loạt, Phân công nhanh), trả về Phòng/PGD, đổi người, duyệt đề nghị sửa, giao kế hoạch', 'Phần 3'],
        ['Cán bộ LS', 'Xem Dashboard cá nhân và Việc tồn, tiếp nhận, làm hồ sơ (Làm ngay / Làm tiếp), hẹn khách ký, hoàn thành, ghi việc khác', 'Phần 4'],
        ['Quản lý LS', 'Như Kiểm soát; bắt đầu từ Kết quả & kế hoạch', 'Phần 5'],
        ['Quản trị hệ thống', 'Tài khoản, danh mục, kênh gửi tin, lịch làm việc', 'Phần 6'],
        ['Giám sát', 'Chỉ xem số liệu tổng hợp và báo cáo', 'Phần 7'],
    ], [1.6, 6, 1])
    g.h2('Trạng thái hồ sơ')
    g.table(['Trạng thái', 'Ý nghĩa', 'Ai xử lý tiếp', 'Bước tiếp theo'], [
        ['Chờ phân công', 'Phòng/PGD đã gửi, chờ giao cán bộ', 'Kiểm soát / Quản lý LS', 'Phân công · Trả về Phòng/PGD · Hủy'],
        ['Chưa giao hồ sơ', 'Kiểm soát trả về Phòng/PGD, hoặc hệ thống tự trả khi quá ngày làm việc chưa tiếp nhận; SLA dừng', 'Phòng / PGD (người tạo đề nghị)', 'Chọn ngày và Gửi lại LS · Hủy'],
        ['Đã phân công', 'Đã giao, chờ cán bộ tiếp nhận', 'Cán bộ LS', 'Tiếp nhận hồ sơ (Kiểm soát đổi người được)'],
        ['Đã tiếp nhận hồ sơ', 'Cán bộ đã nhận hồ sơ; SLA chạy. Tiến độ làm việc: Chờ bắt đầu, Đang làm, Chờ làm tiếp', 'Cán bộ LS', 'Làm ngay / Làm tiếp · Hẹn ký · Hoàn thành · Tạm dừng'],
        ['Đang hẹn khách ký', 'Đã báo khách lịch ký; SLA dừng', 'Cán bộ LS', 'Hoàn thành · Tạm dừng'],
        ['Tạm dừng', 'Chờ khách hoặc chờ cấp phê duyệt; SLA dừng', 'Cán bộ / Kiểm soát / Quản lý', 'Tiếp tục xử lý · Đổi người'],
        ['Hoàn thành', 'Xong phần việc của LS', '—', 'Kiểm soát / Quản lý có thể Mở lại'],
        ['Đã hủy', 'Việc bị hủy, lưu lý do', '—', '—'],
    ], [1.5, 3.4, 1.8, 2.6])
    g.note('**Hồ sơ cũ.** Hồ sơ tạo trước khi đổi luồng có thể còn ở các trạng thái cũ: Chờ hoàn thiện hồ sơ và Chờ tiếp nhận (hiểu như Chờ phân công), '
           'Đã soạn xong, Chờ kiểm soát duyệt. Hệ thống không đưa hồ sơ mới vào các trạng thái này nữa, nhưng hồ sơ cũ vẫn xử lý được bình thường.')
    g.h2('Các nhánh của luồng')
    g.li('**Trả về Phòng/PGD:** Kiểm soát trả hồ sơ thiếu thông tin về Phòng/PGD (nhãn Chưa giao hồ sơ, SLA dừng). Hệ thống cũng tự trả hồ sơ đã '
         'phân công của ngày làm việc liền trước nếu cán bộ LS chưa tiếp nhận. Người tạo đề nghị chọn ngày rồi bấm Gửi lại: hồ sơ quay về Chờ phân công.',
         '**Tạm dừng:** cán bộ LS (hoặc Phòng/PGD với việc do mình đề nghị) tạm dừng khi chờ khách hoặc chờ cấp phê duyệt; bấm Tiếp tục xử lý để chạy lại. '
         'Làm việc khác như họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ thì dùng **Tạm dừng toàn bộ** (không dừng hạn của hồ sơ).',
         '**Đổi người:** Kiểm soát/Quản lý chuyển hồ sơ cho cán bộ khác (bắt buộc ghi lý do). Mốc nhận hồ sơ và hạn SLA được giữ nguyên.',
         '**Hủy việc:** Phòng/PGD hủy việc còn mở của đơn vị mình, cán bộ LS hủy việc được giao, Kiểm soát/Quản lý hủy việc chưa hoàn thành. '
         'Chọn lý do rồi xác nhận, không cần chờ duyệt.',
         '**Đổi hạn:** cán bộ LS được giao (hoặc Phòng/PGD đã tạo đề nghị) đổi ngày hạn xử lý của hồ sơ đã tiếp nhận, bắt buộc ghi lý do; giờ trong hạn giữ nguyên.',
         '**Đổi ngày phát sinh:** khi khách dời lịch, Phòng/PGD sửa Ngày phát sinh bằng bút chì; thay đổi chỉ có ngày thì ghi nhận ngay, không cần duyệt. '
         '**Hẹn bổ sung** (trong chi tiết hồ sơ) để báo cán bộ LS lịch hẹn mới của khách, không bắt buộc.')
    g.h2('Quy tắc cần nhớ')
    g.li('SLA bắt đầu khi cán bộ LS bấm **Tiếp nhận hồ sơ** (không tính từ lúc tạo hay lúc phân công) và được tính theo giờ làm việc đã cấu hình.',
         'SLA tạm dừng khi hồ sơ ở **Tạm dừng**, **Đang hẹn khách ký** hoặc **Chưa giao hồ sơ**; ra khỏi các trạng thái này hạn được lùi đúng thời gian đã chờ.',
         'Đổi người phụ trách không làm mất mốc nhận hồ sơ và không đặt lại SLA.',
         'Loại việc có bật **Cần hẹn khách ký** chỉ hoàn thành được sau khi đã hẹn khách.',
         'Loại việc có danh sách **Việc phải làm** chỉ hoàn thành khi đã tích đủ các nhóm việc.',
         'Việc TSĐB phải tick đủ phần việc (soạn xong HĐ thế chấp, nhập kho hoặc xuất kho tùy loại việc) rồi mới Hoàn thành được.',
         'Chỉ khi hồ sơ **Đang làm** thì đồng hồ giờ xử lý mới chạy; Chờ bắt đầu, Chờ làm tiếp và Tạm dừng thì giờ xử lý dừng.',
         'Hồ sơ có phần HĐ thế chấp (TSĐB mới, phụ lục TSĐB và các hồ sơ vay đi kèm) hiện nhãn **Không tính quá hạn (HĐTC)**: không bị tính quá hạn.',
         'Hồ sơ tồn trong bảng kết quả chỉ tính sau khi cán bộ LS đã tiếp nhận hồ sơ.',
         'Mọi thao tác quan trọng đều ghi vào Nhật ký (người làm, thời điểm, lý do); Nhật ký chỉ tải khi bấm **Xem nhật ký**.')
    g.p('Cách ghi nhận thời gian làm việc ở **Phần 10**, cách ghi nhận việc tồn ở **Phần 11**.')

    # ============================================================ PHẦN 2
    g.h1('Phần 2. Dành cho Phòng / PGD')
    g.p('Người đăng ký hồ sơ tại phòng giao dịch hoặc phòng nghiệp vụ, gửi sang bộ phận LS.')
    g.h2('Bạn làm được gì')
    g.li('Tạo việc mới cho khách hàng, một hồ sơ có thể có nhiều việc.',
         'Theo dõi trạng thái từng hồ sơ của phòng mình và cán bộ đang xử lý.',
         'Sửa nhanh bằng biểu tượng bút chì: đổi ngày phát sinh khi khách dời lịch, hoặc gửi đề nghị sửa cho việc đã giao LS.',
         'Hẹn bổ sung để báo cán bộ LS lịch hẹn mới của khách (không bắt buộc).',
         'Chọn ngày và Gửi lại khi hồ sơ ở Chưa giao hồ sơ (Kiểm soát trả về hoặc hệ thống tự trả).',
         'Hủy việc trực tiếp, tạm dừng việc của mình, đổi hạn.',
         'Xem toàn bộ hồ sơ, dashboard và nhật ký của phòng.')
    g.h2('Các bước chính')
    g.table(['Bước', 'Việc bạn làm', 'Trạng thái hồ sơ'], [
        ['1', 'Tạo việc mới', 'Chờ phân công'],
        ['2', 'Theo dõi hồ sơ đã gửi', 'Đã phân công → Hoàn thành'],
        ['3', 'Sửa nhanh, đổi ngày, Hẹn bổ sung khi khách dời lịch', 'Giữ nguyên trạng thái'],
        ['4', 'Gửi lại khi Chưa giao hồ sơ', 'Chưa giao hồ sơ → Chờ phân công'],
    ], [0.7, 5, 3])

    g.h2('Bước 1. Đăng nhập và làm quen màn hình', bullets=[
        'Nhập Mã cán bộ + Mật khẩu, bấm Đăng nhập', 'Màn hình chính: Đề nghị & hồ sơ', 'Số liệu tóm tắt nằm ở thanh trên cùng'])
    g.p('Mở đường dẫn hệ thống, nhập **Mã cán bộ / user** và **Mật khẩu** do Quản trị cấp rồi bấm **Đăng nhập**. Bản thử nghiệm có sẵn danh sách tài khoản mẫu để bấm chọn nhanh.')
    g.p('Sau khi vào, màn hình **Đề nghị & hồ sơ** hiện các hồ sơ phòng bạn đã gửi. Thanh phía trên tóm tắt Đang mở, Chưa giao hồ sơ, Quá hạn, Hoàn thành. '
        'Thanh dọc bên trái là các mục chức năng; góc dưới có nút Thoát và tài khoản của bạn. Mỗi dòng hồ sơ có bút chì (sửa nhanh) và con mắt (xem chi tiết).')
    g.fig('00-man-hinh-dang-nhap')
    g.fig('pgd-01-man-hinh-chinh')

    g.h2('Bước 2. Tạo việc mới: nhập thông tin khách hàng', bullets=[
        'Bấm Tạo việc mới', 'Nhập tên khách (bắt buộc), điện thoại, email, CIF', 'Chọn mức ưu tiên nếu cần'])
    g.p('Bấm **Tạo việc mới**. Trong hộp thoại Đăng ký việc mới, nhập **Tên khách hàng** (bắt buộc), **Mã CIF** nếu khách đã có, **Điện thoại** và **Email**. '
        'Số điện thoại và email giúp cán bộ LS báo lịch ký cho khách, vì vậy nên nhập đủ.')
    g.p('Ở mục Mức ưu tiên, đánh dấu **Khách hàng VIP**, **Quan trọng** hoặc **Xử lý gấp** khi cần để hồ sơ được nhìn thấy nổi bật ở phía LS.')
    g.fig('pgd-03-thong-tin-khach')
    g.note('**Lưu ý.** Khách chưa có số điện thoại hoặc email vẫn gửi được; khi hẹn ký, cán bộ LS sẽ chuyển sang báo qua nhóm nội bộ.')

    g.h2('Bước 3. Chọn loại việc, sản phẩm và gửi sang LS', bullets=[
        'Chọn Loại việc và Sản phẩm', 'Việc có TSBĐ: chọn Tình trạng TSBĐ, nhập Số HĐ thế chấp cần soạn',
        'Ngày phát sinh mặc định hôm nay; chọn nhanh theo thứ', 'Bấm Gửi sang LS'])
    g.p('Ở mục Danh sách việc, chọn **Loại việc** (Món, HM SXKD, Thấu chi, Thẻ tín dụng, TSĐB, Khác) rồi chọn **Sản phẩm**. Với việc tín dụng, chọn '
        '**Tình trạng TSBĐ**: TSBĐ có sẵn, Không có TSBĐ hoặc TSBĐ mới. TSBĐ mới và các việc TSĐB cần nhập **Số HĐ thế chấp cần soạn** (mặc định 1); '
        'việc xuất TSĐB nhập **Số bìa tài sản cần xuất**.')
    g.p('**Ngày phát sinh** mặc định là hôm nay. Muốn đổi, gõ ngày DD/MM/YYYY, bấm biểu tượng lịch hoặc dùng **Chọn nhanh theo thứ**: chọn Tuần này hoặc '
        'Tuần sau rồi bấm Thứ 2 đến Thứ 6. Mỗi dòng việc chọn một ngày riêng. Khách có nhiều việc thì bấm **Thêm dòng việc**.')
    g.p('Ghi chú cho LS những điều Kiểm soát cần lưu ý, rồi bấm **Gửi sang LS**. Hồ sơ vào Hàng chờ của Kiểm soát LS và hệ thống ghi giờ gửi. '
        'Vay có TSBĐ mới tự sinh thêm một **việc kèm** TSĐB (hồ sơ nhập TSĐB đi cùng).')
    g.fig('pgd-04-chon-viec')
    g.fig('pgd-04a-tsbd-moi')

    g.h2('Bước 4. Theo dõi hồ sơ vừa gửi', bullets=[
        'Hồ sơ mới ở đầu danh sách, trạng thái Chờ phân công', 'Cột Cán bộ hiện người phụ trách khi đã phân công',
        'Con mắt: xem chi tiết và lịch sử'])
    g.p('Hồ sơ mới hiện ở đầu danh sách với trạng thái **Chờ phân công** và Cán bộ **Chưa giao**. Khi Kiểm soát phân công, cột Cán bộ hiện tên người phụ trách '
        'và trạng thái đổi theo từng bước: Đã phân công, Đã tiếp nhận hồ sơ, Đang hẹn khách ký, Hoàn thành.')
    g.p('Bấm biểu tượng **con mắt** để xem chi tiết: thông tin khách, thời điểm Phòng/PGD gửi hồ sơ, thời điểm LS tiếp nhận, cán bộ xử lý, lịch hẹn và lịch sử hoạt động.')
    g.fig('pgd-05-sau-khi-gui')
    g.fig('pgd-06-chi-tiet-ho-so')

    g.h2('Bước 5. Khách dời lịch: sửa nhanh, đổi ngày phát sinh và Hẹn bổ sung', bullets=[
        'Bút chì ngay trên dòng để sửa thông tin', 'Chỉ đổi ngày phát sinh: ghi nhận ngay, việc kèm dời theo',
        'Đổi nội dung khác của việc đã giao: đề nghị sửa, chờ Kiểm soát duyệt', 'Hẹn bổ sung trong chi tiết: báo cán bộ LS lịch mới, không bắt buộc'])
    g.p('Bấm biểu tượng **bút chì** ngay trên dòng hồ sơ để mở hộp thoại **Sửa việc** (cũng có nút Sửa thông tin trong chi tiết). Có ba trường hợp:')
    g.li('**Chỉ đổi Ngày phát sinh** (khách dời lịch): được ghi nhận ngay, không cần duyệt. Việc chính và việc kèm còn mở đang cùng ngày cũ dời theo; '
         'cán bộ LS thấy hồ sơ mang thẻ **Dời ngày** trong Việc tồn cho tới ngày mới. Hạn xử lý và mốc nhận hồ sơ không đổi.',
         '**Đổi nội dung khác của việc đã giao LS** (tên khách, điện thoại, loại việc, sản phẩm…): thành **đề nghị sửa**, ghi lý do rồi gửi; '
         'dòng hồ sơ hiện nhãn Chờ duyệt sửa cho tới khi Kiểm soát/Quản lý duyệt hoặc từ chối.',
         '**Việc chưa giao cán bộ** (Chờ phân công, Chưa giao hồ sơ): sửa trực tiếp, có hiệu lực ngay.')
    g.fig('pgd-08a-de-nghi-sua')
    g.fig('pgd-08b-doi-ngay-phat-sinh')
    g.p('**Hẹn bổ sung** dùng khi đổi ngày nhưng lịch hẹn ký đã báo khách chưa kịp cập nhật. Mở chi tiết hồ sơ (con mắt), bấm **Hẹn bổ sung**, chọn Ngày giờ hẹn '
        'và ghi chú nếu cần rồi **Lưu hẹn bổ sung**. Nút chỉ có cho cán bộ Phòng/PGD đã tạo đề nghị, với hồ sơ đang mở đã giao cán bộ LS. '
        'Cán bộ LS nhận thông báo trong ứng dụng và thấy lịch hẹn bổ sung trong chi tiết hồ sơ; lịch hẹn ký LS đã báo, trạng thái và hạn không đổi. '
        'Mỗi lần lưu thay lịch hẹn bổ sung trước đó.')
    g.fig('pgd-12-hen-bo-sung-nut')
    g.fig('pgd-12a-hen-bo-sung')

    g.h2('Bước 6. Gửi lại khi hồ sơ Chưa giao hồ sơ', bullets=[
        'Hồ sơ Chưa giao hồ sơ có nút Gửi lại', 'Chỉ người tạo đề nghị gửi lại được', 'Chọn ngày KH đề nghị gửi lại rồi xác nhận'])
    g.p('Khi Kiểm soát trả hồ sơ về (thiếu thông tin) hoặc hệ thống tự trả (hồ sơ đã phân công của ngày làm việc liền trước mà cán bộ LS chưa tiếp nhận), '
        'hồ sơ chuyển sang **Chưa giao hồ sơ**: đầu màn hình có thông báo và dòng hồ sơ có nút **Gửi lại**. Mở chi tiết để đọc lý do. '
        'Chỉ người đã tạo đề nghị mới gửi lại được.')
    g.p('Cần sửa thông tin thì bấm **Sửa thông tin** (sửa trực tiếp khi hồ sơ chưa giao cán bộ). Sau đó bấm **Gửi lại LS**, chọn **Ngày KH đề nghị** gửi lại '
        '(không trước hôm nay; gõ DD/MM/YYYY hoặc bấm biểu tượng lịch) rồi xác nhận. Hồ sơ quay về Chờ phân công.')
    g.fig('pgd-07-can-bo-sung')
    g.fig('pgd-07a-chi-tiet-can-bo-sung')
    g.fig('pgd-07b-gui-lai-ls')

    g.h2('Bước 7. Hủy việc và tạm dừng', bullets=[
        'Biểu tượng cấm trên dòng: Hủy việc', 'Chọn lý do, xác nhận, không cần duyệt', 'Tạm dừng việc của mình khi chờ khách'])
    g.p('Phòng/PGD hủy trực tiếp việc còn mở của đơn vị mình bằng biểu tượng cấm trên dòng hồ sơ (hoặc nút **Hủy việc** trong chi tiết): chọn lý do, ghi diễn giải '
        'nếu chọn Lý do khác rồi bấm **Hủy việc**. Không cần Kiểm soát duyệt.')
    g.p('Việc do mình đề nghị đang chờ khách thì bấm **Tạm dừng** trên dòng; cán bộ LS bấm Tiếp tục xử lý khi làm lại.')
    g.fig('pgd-08-huy-viec')

    g.h2('Bước 8. Xem toàn bộ hồ sơ, dashboard và nhật ký của phòng', bullets=[
        'Toàn bộ phòng: mọi hồ sơ của phòng, kể cả đã hoàn thành trong kỳ', 'Xem cả việc tồn: mở rộng kỳ xem về ngày sớm nhất còn việc mở',
        'Nhật ký: bấm Xem nhật ký mới tải'])
    g.p('**Toàn bộ phòng** liệt kê mọi hồ sơ của phòng (kể cả đã hoàn thành trong kỳ), có cột Hạn xử lý. Khi còn việc mở ở ngày trước kỳ đang xem, màn hình hiện cảnh báo '
        'số việc còn mở kèm nút **Xem cả việc tồn** để mở rộng kỳ xem về tận ngày sớm nhất còn việc, tránh bỏ sót hồ sơ tồn khi lọc theo tuần hoặc tháng. '
        'Kiểm soát LS dùng chung màn này.')
    g.p('**Dashboard phòng** có các số **Gửi → LS hoàn thành TB**, **Hoàn thành đúng hạn**, **Đang quá hạn**; biểu đồ **Phòng gửi và LS hoàn thành** theo ngày; '
        'biểu đồ và bảng **LS đang xử lý cho phòng** (cán bộ nào đang giữ bao nhiêu việc của phòng, đã hoàn thành bao nhiêu) và bảng theo nhóm cấp độ / loại việc.')
    g.p('**Nhật ký** ghi từng sự kiện trên hồ sơ của phòng; mở màn Nhật ký chưa tải gì, bấm **Xem nhật ký** để tải theo kỳ đang chọn '
        '(đổi kỳ thì bấm lại), mỗi lần 100 dòng và **Xem thêm** để nối trang.')
    g.fig('pgd-09-toan-bo-phong', legend=['Cảnh báo việc còn mở trước kỳ và nút Xem cả việc tồn', 'Dòng hồ sơ với bút chì và con mắt'])
    g.fig('pgd-10-dashboard-phong')
    g.fig('pgd-11a-nhat-ky-chua-xem')
    g.fig('pgd-11-nhat-ky')

    # ============================================================ PHẦN 3
    g.h1('Phần 3. Dành cho Kiểm soát LS')
    g.p('Người nhận hồ sơ từ Phòng/PGD, kiểm tra và phân giao cho cán bộ LS.')
    g.h2('Bạn làm được gì')
    g.li('Xem Hàng chờ và phân công hồ sơ cho cán bộ LS: từng hồ sơ, hàng loạt hoặc Phân công nhanh theo quy tắc.',
         'Trả hồ sơ về Phòng/PGD khi thiếu thông tin (nhãn Chưa giao hồ sơ).',
         'Theo dõi tiến độ hồ sơ đã giao ở Quản lý hồ sơ, xem theo từng phòng; Đổi người, duyệt đề nghị sửa của Phòng/PGD.',
         'Đăng ký hộ phòng khi nhận hồ sơ qua điện thoại hoặc giấy.',
         'Giao kế hoạch ngày và chỉ tiêu tháng; xem việc đang mở của từng cán bộ; khai báo nghỉ phép cán bộ.',
         'Cấu hình phân công nhanh, xem báo cáo, thời gian và SLA; cài tiện ích Firefox báo hồ sơ chờ phân công.')
    g.h2('Các bước chính')
    g.table(['Bước', 'Việc bạn làm', 'Trạng thái hồ sơ'], [
        ['1', 'Nhận hồ sơ ở Hàng chờ', 'Chờ phân công'],
        ['2', 'Phân công cho cán bộ LS: tích chọn, hàng loạt hoặc Phân công nhanh', 'Đã phân công'],
        ['3', 'Theo dõi ở Quản lý hồ sơ, giao kế hoạch, xem việc của từng cán bộ', 'Đã phân công → Hoàn thành'],
    ], [0.7, 5, 3])

    g.h2('Bước 1. Mở Hàng chờ', bullets=[
        'Hàng chờ có hồ sơ chưa giao cán bộ', 'Lọc theo phòng; hồ sơ hôm nay và T+1 xếp trước', 'Nút Phân công nằm ngay trên dòng'])
    g.p('Hàng chờ chỉ có hồ sơ chưa giao cho cán bộ (Chờ phân công và hồ sơ Kiểm soát vừa trả về, nhãn Chưa giao hồ sơ). Thanh trên cùng đếm Chờ phân công, '
        'Chưa giao hồ sơ, Phát sinh hôm nay. Khối **Đề nghị sửa chờ duyệt** (nếu có) nằm trên cùng để bạn xử lý trước. Hàng nút theo phòng giúp lọc nhanh hồ sơ '
        'của một phòng; hồ sơ phát sinh hôm nay và ngày làm việc kế tiếp (nhãn T+1) được xếp lên trước.')
    g.p('Mỗi hồ sơ có nút **Phân công** ngay trên dòng. Đầu khối có ba nút: **Phân công nhanh** (giao theo quy tắc), **Đăng ký hộ phòng** (chỉ Kiểm soát) và '
        '**Cấu hình phân công nhanh**. Hồ sơ đã giao không còn ở đây: theo dõi ở Quản lý hồ sơ.')
    g.fig('ks-01-hang-cho')

    g.h2('Bước 2. Phân công từng hồ sơ', bullets=[
        'Bấm Phân công trên dòng hồ sơ', 'Tích chọn cán bộ (xem số việc Đang mở, Phân công hôm nay, Đã hoàn thành)',
        'Đánh dấu Ưu tiên xử lý nếu cần', 'Bấm Phân công cán bộ LS'])
    g.p('Bấm **Phân công** trên dòng hồ sơ. Hộp thoại nêu **Ngày KH đề nghị** của hồ sơ và liệt kê các cán bộ kèm số việc Đang mở, Phân công hôm nay, '
        'Đã hoàn thành để bạn chia tải hợp lý: tích chọn ngay trên dòng của cán bộ. Nếu đã có quy tắc phân công nhanh cho phòng và sản phẩm đó, cán bộ theo quy tắc '
        'được tick sẵn và có nhãn **Theo quy tắc**; có thể tích người khác. Đánh dấu **Ưu tiên xử lý cho cán bộ LS** nếu hồ sơ cần làm trước, rồi bấm '
        '**Phân công cán bộ LS**.')
    g.p('Hồ sơ chuyển sang Đã phân công và cán bộ nhận thông báo. Phân công không tính SLA: đồng hồ chỉ chạy khi cán bộ bấm Tiếp nhận hồ sơ. '
        'Thao tác chạy nền: hộp thoại đóng ngay, hồ sơ rời Hàng chờ và sang Quản lý hồ sơ.')
    g.fig('ks-02-hop-thoai-phan-cong')

    g.h2('Bước 3. Phân công hàng loạt', bullets=[
        'Tích chọn nhiều hồ sơ ở cột đầu', 'Chọn một cán bộ hoặc Theo quy tắc ở thanh phía dưới', 'Mỗi lần tối đa 100 hồ sơ'])
    g.p('Khi có nhiều hồ sơ cùng giao một người, tích chọn ở cột đầu của từng dòng (hoặc tích ô đầu bảng để chọn cả trang). Thanh **Đã chọn N hồ sơ** hiện ở '
        'cuối màn hình: chọn một cán bộ, hoặc chọn **Theo quy tắc Phân công nhanh** để hệ thống tự chọn người theo quy tắc, tùy chọn **Ưu tiên LS**, rồi bấm '
        '**Phân công**. Mỗi lần tối đa 100 hồ sơ. Hồ sơ vay kèm TSĐB mới có thêm một dòng việc kèm; hai dòng này nên giao cùng một người.')
    g.fig('ks-03-phan-cong-hang-loat')

    g.h2('Bước 4. Trả Phòng/PGD bổ sung', bullets=[
        'Mở chi tiết → Trả Phòng/PGD bổ sung', 'Chọn lý do (hoặc ghi diễn giải)', 'Hồ sơ sang Chưa giao hồ sơ, chờ Phòng gửi lại'])
    g.p('Nếu hồ sơ thiếu thông tin, mở chi tiết (biểu tượng con mắt) rồi bấm **Trả Phòng/PGD bổ sung**. Chọn lý do có sẵn (ví dụ Thiếu giấy tờ tùy thân) '
        'hoặc chọn Lý do khác và ghi diễn giải, sau đó xác nhận. Hồ sơ chuyển sang Chưa giao hồ sơ, SLA dừng, Phòng/PGD nhận thông báo. '
        'Người tạo đề nghị chọn ngày rồi Gửi lại; hồ sơ quay về Chờ phân công.')
    g.fig('ks-04-chi-tiet-tra-bo-sung')
    g.fig('ks-05-ly-do-bo-sung')

    g.h2('Bước 5. Hồ sơ Chưa giao hồ sơ', bullets=[
        'Hồ sơ vừa trả về vẫn ở Hàng chờ, nhãn Chưa giao hồ sơ', 'Không có nút Phân công', 'Chỉ Phòng/PGD tạo đề nghị mới gửi lại được'])
    g.p('Hồ sơ Kiểm soát vừa trả về vẫn hiện trong Hàng chờ với nhãn **Chưa giao hồ sơ**, không có nút Phân công và không chọn để phân công hàng loạt được. '
        'Chỉ Phòng/PGD đã tạo đề nghị mới gửi lại được. Hồ sơ do hệ thống tự trả (quá ngày làm việc chưa tiếp nhận) nằm ở Phòng/PGD và trong Quản lý hồ sơ, tab Đang mở, '
        'cho đến khi gửi lại. Riêng việc phát sinh ngay trong hôm nay, nếu trước đó bị trả nhầm, hệ thống tự đưa lại vào Chờ phân công (vẫn nhớ tên cán bộ LS cũ).')
    g.fig('ks-06-hang-cho-con-lai')

    g.h2('Bước 6. Đăng ký hộ phòng', bullets=['Bấm Đăng ký hộ phòng ở đầu Hàng chờ', 'Chọn Phòng / PGD gửi hồ sơ (bắt buộc)', 'Nhập khách hàng và việc như khi Phòng tự tạo'])
    g.p('Khi nhận hồ sơ qua điện thoại hoặc giấy, bấm **Đăng ký hộ phòng** ở đầu khối Hàng chờ. Chọn **Phòng / PGD** gửi hồ sơ (bắt buộc), rồi nhập khách hàng '
        'và việc như khi Phòng tự tạo. Hồ sơ được ghi vào đúng phòng đã chọn.')
    g.fig('ks-08-dang-ky-ho-phong')

    g.h2('Bước 7. Cấu hình Phân công nhanh', bullets=[
        'Cấu hình phân công nhanh ở đầu Hàng chờ', 'Thêm quy tắc: phòng → cán bộ phụ trách, kèm sản phẩm', 'Quy tắc cụ thể được xét trước quy tắc chung'])
    g.p('Bấm **Cấu hình phân công nhanh** ở đầu Hàng chờ để xem các quy tắc; bấm Quay lại hàng chờ để trở về. Mỗi quy tắc nói: phòng nào do cán bộ nào phụ trách '
        'và sản phẩm nào đi theo. Bấm **Thêm quy tắc**, chọn Phòng / PGD (bỏ trống là mọi phòng), Cán bộ LS phụ trách và Thứ tự (số nhỏ được xét trước).')
    g.p('Hồ sơ cầm cố của phòng được tick sẵn: phòng đó có cán bộ phụ trách thì mặc định cầm cố về cán bộ ấy. Sản phẩm hoặc cấu phần khác thì tick thêm vào quy tắc '
        '(tick cả nhóm bằng ô ở đầu nhóm, hoặc chọn Mọi sản phẩm). Tích **Tự động giao khi tạo hồ sơ** nếu muốn hệ thống giao ngay không cần Kiểm soát; tích '
        '**Đánh dấu ưu tiên** để hồ sơ theo quy tắc mang nhãn ưu tiên. Quy tắc cụ thể (có sản phẩm) được xét trước quy tắc chung cả phòng. Cán bộ đang nghỉ được '
        'bỏ qua và việc chuyển cho người thay thế đã khai báo.')
    g.fig('ks-09-quy-tac-phan-cong')
    g.fig('ks-09a-them-quy-tac')
    g.fig('ks-09b-quy-tac-da-luu')

    g.h2('Bước 8. Phân công nhanh', bullets=[
        'Bấm Phân công nhanh ở đầu Hàng chờ', 'Hồ sơ khớp quy tắc được tick sẵn kèm cán bộ', 'Bấm Giao các hồ sơ đã chọn'])
    g.p('Bấm **Phân công nhanh** ở đầu Hàng chờ để giao các hồ sơ chờ phân công theo quy tắc. Hộp thoại cho biết có bao nhiêu hồ sơ khớp quy tắc và bao nhiêu chưa có '
        'quy tắc. Hồ sơ khớp quy tắc được tick sẵn kèm cán bộ theo quy tắc; hồ sơ chưa có quy tắc không tick sẵn, chọn cán bộ nếu muốn giao. '
        'Có thể đổi cán bộ và đánh dấu Ưu tiên LS từng dòng, rồi bấm **Giao các hồ sơ đã chọn**.')
    g.fig('ks-03b-phan-cong-nhanh')

    g.h2('Bước 9. Quản lý hồ sơ: theo dõi hồ sơ đã giao, theo từng phòng', bullets=[
        'Chỉ hồ sơ đã giao cán bộ, kể cả đã hoàn thành', 'Tab theo tiến độ và nút lọc theo phòng', 'Đổi người ngay trên dòng ở tab Đang xử lý'])
    g.p('**Quản lý hồ sơ** theo dõi các hồ sơ đã phân công cho cán bộ, kể cả đã hoàn thành. Hồ sơ chờ phân công nằm ở Hàng chờ nên không hiện ở đây. '
        'Các tab: Đang mở, Đã phân công (cán bộ chưa tiếp nhận), Đang xử lý, Đang hẹn khách, Tạm dừng, Quá hạn, Hoàn thành; tab Đã hủy ở cuối hàng. '
        'Số trên mỗi tab là số hồ sơ đang xem. Mặc định xem tuần hiện tại; hồ sơ cán bộ đã nhận còn mở, hoặc đã giao mà ngày bị dời sang tuần sau, vẫn hiện '
        'để không bỏ sót.')
    g.p('Hàng nút theo phòng bên dưới chia hồ sơ theo từng Phòng/PGD kèm số đếm: bấm tên phòng để chỉ xem hồ sơ phòng đó (số trên các tab đếm riêng phòng), '
        'bấm Tất cả phòng để quay lại. Có ô tìm, bộ lọc theo loại việc và cán bộ, và sắp xếp. Cột **Hạn xử lý** hiện giờ hạn, Còn …, Quá … hoặc Dừng tính hạn. '
        'Trên dòng có nút **Đổi người** để chuyển hồ sơ cho cán bộ khác (chọn người mới bằng ô tick, ghi lý do bắt buộc; mốc nhận hồ sơ và SLA giữ nguyên).')
    g.fig('ks-07-quan-ly-ho-so')
    g.fig('ks-07a-theo-phong')
    g.fig('ks-07b-dang-xu-ly')

    g.h2('Bước 10. Duyệt đề nghị sửa', bullets=[
        'Khối Đề nghị sửa chờ duyệt ở đầu Hàng chờ', 'Xem giá trị cũ, giá trị mới và lý do', 'Bấm Duyệt hoặc Từ chối'])
    g.p('Đề nghị sửa của Phòng/PGD (việc đã giao LS) hiện ở khối **Đề nghị sửa chờ duyệt** đầu Hàng chờ, kèm nội dung thay đổi (giá trị cũ gạch ngang, giá trị mới in đậm) '
        'và lý do. Bấm **Duyệt** để áp dụng hoặc **Từ chối**; người đề nghị được báo kết quả. Đổi chỉ Ngày phát sinh không qua bước này (được ghi nhận ngay). '
        'Việc bị hủy do Phòng/PGD hoặc cán bộ LS tự hủy trực tiếp, không qua bước duyệt.')
    g.fig('ks-13-de-nghi-sua-cho-duyet')

    g.h2('Bước 11. Kết quả & kế hoạch: giao kế hoạch, xem việc từng cán bộ', bullets=[
        'Bảng Kết quả thực hiện theo ngày, tuần, tháng', 'Tồn soạn hiện nay: còn soạn HĐ thế chấp, HĐ tín dụng',
        'Giao kế hoạch: kế hoạch ngày, chỉ tiêu tháng', 'Xem việc (n): việc đang mở của từng cán bộ'])
    g.p('**Kết quả & kế hoạch** cho biết cả phòng LS và từng cán bộ đã làm được gì trong ngày, tuần, tháng hoặc khoảng ngày bất kỳ. Bảng **Kết quả thực hiện** có các dòng: '
        'Soạn thảo HĐ thế chấp (làm TSĐB mới hoặc phụ lục TSĐB), Soạn thảo HĐ tín dụng, Nhập kho TSĐB, Xuất kho TSĐB, Giao dịch trên Rlos, '
        'nhóm **Tồn soạn hiện nay** (Còn soạn HĐ thế chấp, Còn soạn HĐ tín dụng) và Khác. Số liệu kết quả lấy từ các ô tick của cán bộ theo ngày tick; '
        'nhóm Tồn soạn luôn là số hồ sơ còn mở hiện nay (xem Phần 11). Dòng **Khác** gộp hồ sơ loại khác và việc khác cán bộ tự ghi; bấm mũi tên cạnh chữ Khác để '
        'xem từng loại.')
    g.p('Bấm **Giao kế hoạch** để đặt kế hoạch mỗi ngày cho từng dòng của bảng (kể cả Nhập kho / Xuất kho TSĐB) và chỉ tiêu hoàn thành mỗi tháng (toàn LS và mỗi '
        'cán bộ), rồi **Lưu kế hoạch**. Kế hoạch kỳ tuần, tháng, năm tự nhân với số ngày làm việc (riêng các dòng Tồn là mức tồn mong muốn, không nhân). '
        'Bảng hiện cột Kế hoạch ngày và % hoàn thành để so với kết quả; nút Ẩn / Hiện kế hoạch điều khiển cả ảnh và Excel tải về.')
    g.p('Bảng **Tải việc theo cán bộ LS** phía dưới có nút **Xem việc (n)** ở mỗi cán bộ: mở danh sách hồ sơ đang mở của người đó (phần việc còn tồn, tiến độ, quá hạn) '
        'để cân tải hoặc đổi người. Nút **Nghỉ phép cán bộ** để cài lịch nghỉ giúp: trong khoảng nghỉ, cán bộ không xuất hiện khi phân công; việc đang giao không tự chuyển người.')
    g.fig('ks-14-ket-qua-ke-hoach')
    g.fig('ks-14c-viec-cua-can-bo')
    g.fig('ks-14d-nghi-phep-can-bo')
    g.fig('ks-14a-giao-ke-hoach')
    g.fig('ks-14b-ke-hoach-va-ket-qua')

    g.h2('Bước 12. Báo cáo: nhiều kỳ, Thời gian & SLA, Kế hoạch tháng', bullets=[
        'Ba tab: Nhiều kỳ, Thời gian & SLA, Kế hoạch tháng', 'Chọn khoảng thời gian rồi Chạy báo cáo / Xem báo cáo', 'Tải Excel'])
    g.p('Báo cáo gộp ba loại báo cáo thành ba tab. **Nhiều kỳ**: chọn khoảng thời gian (tháng, quý, năm hoặc tùy chọn) rồi **Chạy báo cáo**, có Tải Excel; '
        'cột Tồn cuối kỳ là số việc chưa hoàn thành khi chốt kỳ. **Thời gian & SLA**: chọn khoảng ngày, cán bộ, nghiệp vụ rồi **Xem báo cáo** để xem giờ theo ngày, '
        'cán bộ, nghiệp vụ, giờ làm thêm ngoài giờ và tỷ lệ đúng hạn; mục **Rà soát mốc thời gian** giúp phát hiện hồ sơ thiếu mốc. '
        '**Kế hoạch tháng**: danh sách các kỳ tháng (Kỳ, Thời gian, Trạng thái Đang hoạt động / Đã tạo trước / Đã lưu lịch sử, liên kết Mở Sheet); nút '
        '**Tạo tháng kế tiếp** tạo trước kỳ của tháng sau. Bản thử nghiệm trong ảnh chưa có kỳ nào nên bảng còn trống.')
    g.fig('ks-11-bao-cao')
    g.fig('ks-10-thoi-gian-sla')
    g.fig('ks-12-ky-thang')

    g.h2('Bước 13. Tiện ích Firefox báo hồ sơ chờ phân công', bullets=[
        'Cài tiện ích LS-Routing trên Firefox 140 trở lên', 'Hiện số hồ sơ chờ phân công trên biểu tượng', 'Không đọc mật khẩu hay thông tin khách'])
    g.p('Kiểm soát LS và Quản lý LS dùng Firefox 140 trở lên có thể cài tiện ích LS-Routing để biết có hồ sơ mới chờ phân công khi không mở ứng dụng. '
        'Tải gói ở đường dẫn ứng dụng thêm ?download=firefox, rồi làm theo hướng dẫn cài trên trang tải. Sau khi cài, mở hoặc tải lại LS-Routing một lần và đăng nhập.')
    g.p('Tiện ích kiểm tra mỗi phút khi Firefox đang chạy, hiện số hồ sơ chờ phân công trên biểu tượng và popup khi có hồ sơ mới; bấm thông báo hoặc '
        '**Mở danh sách phân công** để vào Hàng chờ. Tiện ích không đọc mật khẩu, không nhận tên khách, CIF, điện thoại hay email. Hết phiên đăng nhập, đăng xuất '
        'hoặc Firefox đóng hoàn toàn thì dừng nhận; đăng nhập lại ứng dụng để kết nối lại.')
