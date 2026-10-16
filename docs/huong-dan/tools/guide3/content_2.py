"""Phần 4 đến Phần 9: cán bộ LS, Quản lý, Quản trị, Giám sát, điện thoại, hỏi đáp."""


def build(g):
    # ============================================================ PHẦN 4
    g.h1('Phần 4. Dành cho cán bộ LS')
    g.p('Người nhận hồ sơ do Kiểm soát giao, xử lý và hoàn thành. Màn hình đầu tiên sau khi đăng nhập là **Dashboard cá nhân**: '
        'một nơi để biết hôm nay còn gì phải làm, việc tồn từ các ngày trước và kết quả của riêng bạn.')
    g.h2('Bạn làm được gì')
    g.li('Xem Dashboard cá nhân: hồ sơ còn tồn (hôm nay và các ngày trước), kết quả thực hiện, giờ làm trong ngày.',
         'Tiếp nhận hồ sơ một chạm hoặc Tiếp nhận tất cả; chuyển hồ sơ đang làm bằng Làm ngay / Làm tiếp.',
         'Ghi nhận Xong HĐTD, tick phần việc TSĐB, hẹn khách ký, hoàn thành hồ sơ.',
         'Tạm dừng hồ sơ (chờ khách / cấp phê duyệt), đổi hạn, hủy việc, hoặc Tạm dừng toàn bộ để làm việc khác và Ghi việc khác.',
         'Xem Phân giao toàn phòng, Thời gian của tôi, Nhật ký, khai báo nghỉ phép.')
    g.h2('Các bước chính')
    g.table(['Bước', 'Việc bạn làm', 'Trạng thái hồ sơ'], [
        ['1', 'Mở Dashboard cá nhân, xem Việc tồn', '—'],
        ['2', 'Tiếp nhận hồ sơ (hoặc Tiếp nhận tất cả)', 'Đã phân công → Đã tiếp nhận hồ sơ'],
        ['3', 'Làm ngay / Làm tiếp, ghi Xong HĐTD, tick phần việc TSĐB', 'Đã tiếp nhận hồ sơ (Đang làm / Chờ làm tiếp)'],
        ['4', 'Hẹn khách ký', 'Đang hẹn khách ký'],
        ['5', 'Hoàn thành', 'Hoàn thành'],
    ], [0.7, 5, 3])

    g.h2('Bước 1. Dashboard cá nhân: đầu ngày', bullets=[
        'Đăng nhập xong vào Dashboard cá nhân', 'Việc tồn: hôm nay và các ngày trước', 'Tiếp nhận tất cả (n) khi muốn nhận cả lô',
        'Ghi việc khác và Tạm dừng toàn bộ ở góc trên'])
    g.p('Dashboard cá nhân chỉ có số liệu của riêng bạn. Dải số đầu trang gồm **Hoàn thành hôm nay**, **Đang mở**, **Giờ làm hôm nay** và **Đã chậm hôm nay**. '
        'Nút **Ghi việc khác** và **Tạm dừng toàn bộ** nằm ở góc trên bên phải; **Khai báo nghỉ phép** nằm ở đầu khối Dashboard cá nhân.')
    g.p('Khối **Việc tồn** cho biết còn bao nhiêu hồ sơ chưa hết phần việc, chia hai nhóm: **Hôm nay** (hồ sơ được giao trong ngày) và **Tồn các ngày trước**. '
        'Mỗi nhóm có các thẻ đếm theo loại phần việc còn lại (HĐTD, HĐTC, Kho TSĐB, RLOS, Chưa nhận HS, Dời ngày, Khác). Nếu còn hồ sơ chưa nhận, '
        'nút **Tiếp nhận tất cả (n)** nằm ngay đầu khối. Cách một hồ sơ vào và ra khỏi Việc tồn nằm ở **Phần 11**.')
    g.fig('ls-01-dashboard-ca-nhan')

    g.h2('Bước 2. Mở Việc tồn: từng hồ sơ còn phần việc nào', bullets=[
        'Bấm Chi tiết việc để mở danh sách hồ sơ của nhóm', 'Cột Phần tồn nói còn thiếu gì', 'Thao tác ngay trên dòng: Tiếp nhận / Làm ngay / Làm tiếp'])
    g.p('Bấm **Chi tiết việc** ở nhóm Hôm nay hoặc Tồn các ngày trước để mở danh sách. Mỗi dòng là một hồ sơ, cột **Phần tồn** nói rõ còn thiếu gì: '
        '"HĐTD hết tồn khi hẹn ký hoặc bấm Xong HĐTD", "HĐTC hết tồn khi tick Đã soạn xong HĐ thế chấp", "Chưa nhận hồ sơ", '
        '"HĐTC ở việc kèm …" khi phần soạn nằm ở việc TSĐB đi kèm. Cột **Tiến độ** và nút **Tiếp nhận / Làm ngay / Làm tiếp** trên dòng cho phép '
        'xử lý luôn mà không cần sang Việc của tôi.')
    g.fig('ls-01a-viec-ton-chi-tiet')

    g.h2('Bước 3. Tiếp nhận hồ sơ', bullets=[
        'Bấm Tiếp nhận ở dòng hồ sơ: một chạm, không hộp thoại', 'Đang có hồ sơ Đang làm thì hồ sơ mới vào Chờ bắt đầu',
        'Tiếp nhận tất cả (n): xác nhận một lần, hồ sơ đầu tiên làm ngay'])
    g.p('Mở **Việc của tôi**. Hồ sơ vừa được giao ở trạng thái Đã phân công; bấm **Tiếp nhận** trên dòng hồ sơ. Tiếp nhận là **một chạm**, không có hộp thoại: '
        'hệ thống ghi **giờ nhận hồ sơ** ngay lúc bấm và từ đó bắt đầu tính SLA. Nếu bạn chưa có hồ sơ nào Đang làm thì hồ sơ vừa nhận vào **Đang làm**; '
        'nếu đang làm hồ sơ khác thì hồ sơ vừa nhận vào **Chờ bắt đầu**, không làm gián đoạn việc đang chạy. Hồ sơ TSĐB kèm theo (việc kèm) được giao cùng bạn được nhận cùng lúc.')
    g.p('Có nhiều hồ sơ cùng được giao, bấm **Tiếp nhận tất cả (n)**: hộp thoại liệt kê các hồ sơ sắp nhận và nhắc chỉ nhận khi đã cầm đủ hồ sơ '
        '(giờ nhận của từng hồ sơ ghi là bây giờ). Bấm **Tiếp nhận n hồ sơ**: hồ sơ đầu tiên vào Đang làm, các hồ sơ còn lại vào Chờ bắt đầu.')
    g.fig('ls-02-tiep-nhan-tat-ca')
    g.fig('ls-03-viec-cua-toi')

    g.h2('Bước 4. Làm ngay / Làm tiếp: chuyển hồ sơ đang làm', bullets=[
        'Chỉ một hồ sơ Đang làm tại một thời điểm', 'Làm ngay: bắt đầu hồ sơ Chờ bắt đầu', 'Làm tiếp: quay lại hồ sơ Chờ làm tiếp', 'Hồ sơ cũ tự sang Chờ làm tiếp'])
    g.p('Tại một thời điểm chỉ có **một** hồ sơ Đang làm. Muốn đổi sang hồ sơ khác, bấm **Làm ngay** (hồ sơ Chờ bắt đầu) hoặc **Làm tiếp** (hồ sơ Chờ làm tiếp) '
        'trên dòng hồ sơ đó: hệ thống dừng đồng hồ của hồ sơ cũ (chuyển sang **Chờ làm tiếp**) và bắt đầu đồng hồ cho hồ sơ mới trong cùng một thao tác. '
        'Các tab **Đang làm · Chờ bắt đầu · Chờ làm tiếp · Chờ khách / Tạm dừng** ở đầu danh sách cho biết bạn đang có bao nhiêu hồ sơ mỗi nhóm.')
    g.fig('ls-04-lam-ngay')

    g.h2('Bước 5. Mở chi tiết: Xong HĐTD, việc kèm, phần việc TSĐB', bullets=[
        'Con mắt → chi tiết hồ sơ', 'Xong HĐTD: đã soạn xong hợp đồng tín dụng', 'Việc TSĐB: tick soạn xong HĐ thế chấp / nhập kho / xuất kho',
        'Hẹn bổ sung của Phòng/PGD hiện ở đây'])
    g.p('Bấm biểu tượng **con mắt** để mở chi tiết: thông tin khách, **giờ LS tiếp nhận**, giờ xử lý, thời gian từ lúc nhận đến hoàn thành, phiên bản và các phần việc. '
        'Nếu hồ sơ vay còn phải soạn hợp đồng tín dụng, mục **Tình trạng soạn hợp đồng** có nút **Xong HĐTD**: bấm khi đã soạn xong; việc này '
        'cũng được ghi tự động khi bạn hẹn khách ký. Hồ sơ vay kèm TSĐB mới có hộp **Việc kèm** để bật/tắt việc TSĐB đi cùng.')
    g.p('Khi Phòng/PGD đã báo lịch hẹn mới của khách, mục **Hẹn bổ sung** hiện ngày giờ, ghi chú và người ghi. Đây chỉ là thông tin tham khảo: '
        'lịch ký bạn đã báo cho khách và trạng thái hồ sơ không đổi.')
    g.fig('ls-05-chi-tiet-da-tiep-nhan')
    g.p('Việc **TSĐB** có mục **Phần việc phải tick**. Mỗi phần việc xong thì tick một lần (mỗi ô lưu ngay người tick và giờ tick): **Đã soạn xong HĐ thế chấp** '
        '(kèm Số lượng HĐ thế chấp), **Đã nhập kho TSĐB** hoặc **Đã xuất kho TSĐB** (kèm số tài sản). Nhập kho và xuất kho chỉ tick được sau khi đã tick soạn xong HĐ thế chấp. '
        'Kết quả đi thẳng vào bảng kết quả theo **ngày tick**; chưa tick đủ thì chưa Hoàn thành được.')
    g.table(['Loại việc TSĐB', 'Ô phải tick'], [
        ['Nhập mới / nhập thêm / ĐKTC, nhập tăng, thay đổi TSĐB, việc kèm TSĐB mới', 'Đã soạn xong HĐ thế chấp → Đã nhập kho TSĐB'],
        ['Xuất giảm', 'Đã soạn xong HĐ thế chấp → Đã xuất kho TSĐB'],
        ['Xuất TSĐB, xóa thế chấp', 'Đã xuất kho TSĐB'],
        ['Mượn TSĐB, thủ tục khác', 'Không có ô phải tick'],
    ], [5.2, 4.4])
    g.fig('ls-05a-phan-viec-tsdb')

    g.h2('Bước 6. Hẹn khách ký', bullets=[
        'Hẹn ký trên dòng (hoặc trong chi tiết)', 'Chọn ngày ký, giờ ký', 'Chọn kênh báo khách: Email, Zalo, SMS', 'Hẹn khách ký hồ sơ'])
    g.p('Hồ sơ cần khách ký thì bấm **Hẹn ký**. Chọn **Ngày ký** (mặc định hôm nay) và **Giờ ký**; nơi ký lấy theo cấu hình chung của Quản trị (hiện là '
        '"Quầy giao dịch của đơn vị gửi hồ sơ"), bạn không phải chọn. Chọn **Kênh báo khách** (Email, Zalo, SMS; kênh nào khách chưa có thông tin sẽ bị khóa) '
        'rồi bấm **Hẹn khách ký hồ sơ**.')
    g.p('Hệ thống gửi tin mời khách theo mẫu đã duyệt (có bước xem trước và xác nhận nếu cấu hình yêu cầu). Khách không có kênh liên hệ nào thì tin được gửi vào '
        'nhóm nội bộ và gắn thẻ cán bộ phụ trách. Hồ sơ chuyển sang **Đang hẹn khách ký**, SLA dừng trong thời gian chờ khách, Phòng/PGD thấy lịch hẹn. '
        'Việc có phần HĐTD thì hẹn ký cũng ghi nhận luôn đã soạn xong HĐTD (hết tồn HĐTD).')
    g.fig('ls-06-hen-khach-ky')
    g.fig('ls-07-dang-hen-khach')

    g.h2('Bước 7. Hoàn thành hồ sơ', bullets=[
        'Hoàn thành trên dòng hoặc trong chi tiết', 'Ghi chú kết quả; tick Kết quả ghi nhận vào bảng ngày', 'Chọn cách thông báo cho Phòng/PGD', 'Hoàn thành'])
    g.p('Sau khi khách ký xong (hoặc hồ sơ không cần ký) bấm **Hoàn thành**. **Ghi chú kết quả** không bắt buộc. Kiểm tra mục **Tình trạng soạn hợp đồng** '
        'và **Kết quả ghi nhận vào bảng ngày**: hồ sơ vay có hai ô, **Đã soạn xong HĐ thế chấp (làm TSĐB mới / phụ lục TSĐB)** (tick sẵn khi vay có tài sản bảo đảm) '
        'và **Đã làm giao dịch trên Rlos** (tick sẵn). Bỏ tick nếu hồ sơ không có kết quả đó, tick thêm nếu có. Việc loại TSĐB thì thay bằng các ô phần việc ở Bước 5.')
    g.p('Chọn cách **Thông báo sau khi hoàn thành**: Không gửi, Chỉ báo trong app, hoặc Email Phòng/PGD và báo trong app (mặc định); hộp thoại hiện email nhận và '
        'lịch hẹn khách để bạn kiểm tra trước khi bấm **Hoàn thành**. Hồ sơ rời danh sách đang mở, chỉ số Hoàn thành tăng và Phòng/PGD nhận thông báo; không có bước trình '
        'hay duyệt thêm. Thao tác chạy nền: hộp thoại đóng ngay. Tick nhầm thì Kiểm soát/Quản lý sửa ở Quản lý hồ sơ (Phần 5, Bước 3).')
    g.fig('ls-08-hoan-thanh')
    g.fig('ls-08a-hoan-thanh-tsdb')

    g.h2('Bước 8. Tạm dừng một hồ sơ, đổi hạn, hủy việc', bullets=[
        'Tạm dừng trên dòng: chờ khách hoặc chờ cấp phê duyệt', 'SLA dừng; Tiếp tục xử lý để chạy lại', 'Đổi hạn: ngày hạn mới, lý do bắt buộc', 'Hủy việc: chọn lý do'])
    g.p('Hồ sơ phải chờ khách hoặc chờ cấp phê duyệt thì bấm **Tạm dừng** trên dòng, xác nhận. Hồ sơ vào **Tạm dừng**, SLA dừng đến khi bạn bấm **Tiếp tục xử lý**. '
        'Giờ xử lý cũng dừng. **Đổi hạn** (nút trên dòng hồ sơ đã tiếp nhận) để đặt ngày hạn mới, bắt buộc ghi lý do; **Hủy việc** (biểu tượng cấm) chọn lý do rồi xác nhận.')
    g.fig('ls-11-xac-nhan-tam-dung')

    g.h2('Bước 9. Tạm dừng toàn bộ và Ghi việc khác', bullets=[
        'Tạm dừng toàn bộ: họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ', 'Chọn công việc rồi Bắt đầu tạm dừng', 'Hạn của hồ sơ KHÔNG dừng',
        'Kết thúc tạm dừng: ghi số lượng việc đã làm', 'Ghi việc khác: ghi nhanh việc đã làm không cần tạm dừng'])
    g.p('Khi phải làm việc không thuộc hồ sơ nào (họp, báo cáo, hoàn thiện hồ sơ QTTD, TSBĐ…) bấm **Tạm dừng toàn bộ** ở Dashboard hoặc Việc của tôi. '
        'Ở **Tạm dừng để làm** chọn Hoàn thiện hồ sơ QTTD/TSBĐ, Báo cáo hoặc Khác, rồi **Bắt đầu tạm dừng**. Hồ sơ đang làm chuyển sang Chờ làm tiếp và thời gian '
        'được ghi là tác nghiệp khác. Lưu ý: **tạm dừng toàn bộ không dừng hạn SLA** của hồ sơ, chỉ dừng đồng hồ giờ xử lý.')
    g.fig('ls-12-tam-dung-toan-bo')
    g.fig('ls-12a-dang-tam-dung')
    g.p('Làm xong bấm **Kết thúc tạm dừng**: hồ sơ trước đó chạy lại. Hộp thoại **Kết thúc tạm dừng** có bảng số lượng cho sáu loại việc: Họp đầu ngày (lần), Xem văn bản, '
        'Sắp xếp kho hồ sơ, Scan hoàn thiện hồ sơ, Định giá lại TSBĐ, Xuất kho / thu nợ cầm cố. Nhập số lượng đã làm trong lượt tạm dừng rồi bấm **Kết thúc tạm dừng**; '
        'số phút của lượt được chia cho các việc đã ghi (cách chia ở Phần 10).')
    g.p('**Ghi việc khác** chỉ dùng để ghi **số lượng** của sáu loại việc đó, không có số phút đi kèm và không dừng hồ sơ nào, dùng được bất cứ lúc nào. '
        'Muốn công việc đó được tính giờ thì làm trong một lượt Tạm dừng toàn bộ.')
    g.fig('ls-12b-ket-thuc-tam-dung')
    g.fig('ls-12c-ghi-viec-khac')

    g.h2('Bước 10. Dashboard cuối ngày: Việc tồn và Kết quả thực hiện của riêng bạn', bullets=[
        'Cuối ngày xem lại Việc tồn còn lại', 'Kết quả thực hiện theo ngày chọn', 'Tồn soạn hiện nay là số còn mở, không phải kết quả trong ngày',
        'Mũi tên ở dòng Khác để xem từng loại'])
    g.p('Cuối ngày Dashboard cho biết bạn đã làm được gì và còn gì tồn. Dải số đầu trang cập nhật **Hoàn thành hôm nay**, **Giờ làm hôm nay** '
        '(thời gian các phiên làm hồ sơ cộng các lượt Tạm dừng toàn bộ, chồng nhau chỉ tính một lần, tính bằng giờ phút) và **Đã chậm hôm nay**. Khối **Việc tồn** cho biết '
        'còn bao nhiêu hồ sơ chưa xong phần việc để bạn biết sáng mai phải làm tiếp việc gì (chi tiết từng hồ sơ ở hình dưới).')
    g.fig('ls-01b-dashboard-cuoi-ngay')
    g.fig('ls-01f-viec-ton-cuoi-ngay')
    g.p('Khối **Kết quả thực hiện · Tồn soạn đang mở hiện nay** dùng cùng bảng với Kiểm soát nhưng chỉ có số của bạn: chọn **Ngày** để xem kết quả của ngày đó '
        '(HĐ thế chấp, HĐ tín dụng, Nhập/Xuất kho TSĐB, Rlos, Khác). Hai dòng **Còn soạn HĐ thế chấp** và **Còn soạn HĐ tín dụng** là số hồ sơ còn mở hiện nay, '
        'không phụ thuộc ngày bạn chọn. Dòng **Khác** có mũi tên để bung từng loại việc ghi thêm (họp, xem văn bản, sắp xếp kho…).')
    g.fig('ls-01c-ket-qua-thuc-hien')
    g.fig('ls-01d-khac-bung')

    g.h2('Bước 11. Phân giao toàn phòng, Thời gian của tôi và Nhật ký', bullets=[
        'Phân giao phòng: ai đang giữ bao nhiêu hồ sơ', 'Thời gian của tôi: giờ đã dùng, giờ xử lý, làm thêm ngoài giờ', 'Nhật ký: bấm Xem nhật ký'])
    g.p('**Phân giao phòng** là màn hình chỉ xem để biết ai đang làm hồ sơ nào: chọn tuần, cán bộ LS, trạng thái hồ sơ hoặc tìm theo tên khách / CIF rồi bấm Xem. '
        'Màn hình tổng hợp số hồ sơ đã giao, đang mở và khách có nhiều việc, kèm giờ giao và trạng thái; không hiện điện thoại, email hay ghi chú của khách.')
    g.p('**Thời gian của tôi** cho biết số phút bạn đã dùng theo ngày, nghiệp vụ, sản phẩm, số lần và thời gian tác nghiệp khác cùng tỷ lệ hồ sơ đúng hạn '
        '(chỉ việc của bạn): chọn khoảng ngày, nghiệp vụ rồi **Xem báo cáo**; cách đọc từng chỉ số ở **Phần 10**. **Nhật ký** liệt kê các thao tác do chính bạn thực hiện '
        '(Tiếp nhận hồ sơ, Hẹn khách ký, Hoàn thành…); bấm **Xem nhật ký** để tải, mỗi trang 100 dòng, bấm Xem thêm để nối trang.')
    g.fig('ls-14-phan-giao-phong')
    g.fig('ls-13-thoi-gian-sla')
    g.fig('ls-15a-nhat-ky-chua-xem')
    g.fig('ls-15-nhat-ky')

    g.h2('Bước 12. Khai báo nghỉ phép và phím tắt', bullets=[
        'Khai báo nghỉ phép ở thanh phía trên', 'Chọn Nghỉ từ / Nghỉ đến rồi Lưu lịch nghỉ', 'Phím tắt tăng tốc thao tác'])
    g.p('Ở Dashboard cá nhân, bấm **Khai báo nghỉ phép** (hoặc Sửa lịch nghỉ nếu đã có). Chọn **Nghỉ từ** và **Nghỉ đến**, thêm lý do nếu muốn (tối đa 160 ký tự) rồi '
        '**Lưu lịch nghỉ**. Lịch nghỉ có hiệu lực ngay: hệ thống chặn phân công việc mới cho bạn trong khoảng nghỉ, còn việc đang giao giữ nguyên và SLA vẫn tiếp tục chạy. '
        'Kiểm soát LS và Quản lý LS nhận thông báo để xem việc đang mở của bạn và phân giao lại khi cần. Để trống cả hai ngày rồi lưu để gỡ lịch nghỉ; '
        'Quản trị cũng đặt hoặc sửa lịch nghỉ hộ trong Quản lý người dùng.')
    g.fig('ls-16-khai-bao-nghi-phep')
    g.p('Bấm biểu tượng bàn phím ở góc trên (hoặc phím **?**) để mở bảng **Phím tắt**. Trong danh sách việc: **J / ↓** xuống dòng kế, **K / ↑** lên dòng trước, '
        '**Enter** hoặc **O** mở chi tiết, **A** bấm thao tác chính của dòng (Tiếp nhận, Hẹn ký…), **C** mở Hoàn thành khi đủ điều kiện. Trong hộp thoại: '
        '**1 – 9** bấm nút theo số, **E** sửa thông tin việc, **Ctrl + Enter** lưu / gửi, **Esc** đóng. Phím tắt chỉ hoạt động khi không gõ trong ô nhập.')
    g.fig('ls-17-phim-tat')
