"""Phần 10 (cách ghi nhận thời gian làm việc) và Phần 11 (cách ghi nhận việc tồn)."""


def build(g):
    # ============================================================ PHẦN 10
    g.h1('Phần 10. Cách ghi nhận thời gian làm việc')
    g.p('LS-Routing tự ghi nhận thời gian từ chính các nút bạn bấm: không có ô nhập giờ. Phần này giải thích từng nút ghi lại điều gì, '
        'con số nào được tính ra từ đó và xem chúng ở đâu. Tài liệu riêng **Cách tính giờ LS-Routing** có thêm công thức và ví dụ.')

    g.h2('10.1 Bốn cách đo, bốn câu hỏi khác nhau', bullets=[
        'Hạn xử lý (SLA): hồ sơ phải xong trước lúc nào', 'Giờ xử lý hồ sơ: cán bộ đã làm hồ sơ bao nhiêu phút',
        'Giờ cán bộ đã dùng: một người dùng bao nhiêu phút trong ngày', 'Khoảng chờ giữa các mốc'])
    g.table(['Con số', 'Trả lời câu hỏi', 'Bắt đầu tính', 'Dừng khi', 'Ngoài giờ làm việc'], [
        ['**Hạn xử lý (SLA)**', 'Hồ sơ phải xong trước thời điểm nào?', 'Cán bộ bấm Tiếp nhận hồ sơ',
         'Hồ sơ ở trạng thái chờ bên ngoài: Tạm dừng, Đang hẹn khách ký, Chưa giao hồ sơ', 'Không tính; chỉ đếm giờ làm việc'],
        ['**Giờ xử lý hồ sơ**', 'Cán bộ đã làm hồ sơ này bao nhiêu phút?', 'Cán bộ bấm Làm ngay / Làm tiếp (hoặc Tiếp nhận khi chưa làm hồ sơ nào)',
         'Chuyển hồ sơ khác, Tạm dừng toàn bộ, Tạm dừng, Hẹn khách ký, Hoàn thành', 'Tính nếu phiên đóng trong cùng ngày, tối đa 4 giờ mỗi phiên'],
        ['**Giờ cán bộ đã dùng**', 'Một người đã dùng bao nhiêu phút trong ngày?', 'Cộng mọi phiên làm hồ sơ và các lượt Tạm dừng toàn bộ có ghi nhận',
         'Mỗi khoảng thời gian chỉ tính một lần', 'Tính như giờ xử lý hồ sơ'],
        ['**Khoảng chờ giữa các mốc**', 'Hồ sơ nằm chờ bao lâu ở từng bước?', 'Từ một mốc đến mốc kế (gửi, phân công, nhận, hoàn thành)', 'Đến mốc kế', 'Không tính'],
    ], [1.5, 1.7, 1.8, 2.2, 1.5], size=9.5)
    g.p('Ba điều cần nhớ:')
    g.li('**Mọi số đo bằng giờ làm việc.** Đêm, cuối tuần, ngày lễ và nghỉ trưa không chạy. Ngoại lệ duy nhất là phần làm thêm đã đóng trong ngày (10.9).',
         '**Hạn xử lý thuộc về hồ sơ, giờ xử lý thuộc về cán bộ.** Mỗi cán bộ chỉ có một hồ sơ ở trạng thái Đang làm tại một thời điểm.',
         '**Đóng phiên đúng lúc thì giờ mới đúng.** Bấm Hoàn thành, Tạm dừng hoặc Tạm dừng toàn bộ trước khi rời chỗ; phiên bỏ mở qua đêm không được cộng phần ngoài giờ.')

    g.h2('10.2 Lịch làm việc chuẩn', bullets=[
        'Thứ Hai đến thứ Sáu', 'Sáng 07:30–11:30, chiều 13:30–18:00', 'Một ngày làm việc là 510 phút', 'Quản trị chỉnh ở Lịch làm việc'])
    g.p('Mọi phép tính giờ dựa trên một lịch duy nhất do Quản trị đặt ở **Lịch làm việc**. Lịch chuẩn đang dùng:')
    g.table(['Hạng mục', 'Giá trị'], [
        ['Ngày làm việc', 'Thứ Hai đến thứ Sáu'],
        ['Buổi sáng', '07:30 – 11:30 (240 phút)'],
        ['Nghỉ trưa', '11:30 – 13:30 (không tính)'],
        ['Buổi chiều', '13:30 – 18:00 (270 phút)'],
        ['Một ngày làm việc', '**510 phút** (8,5 giờ)'],
        ['Ngày lễ', 'Do Quản trị khai báo, tính như ngày nghỉ'],
        ['Múi giờ', 'Việt Nam (UTC+7), hiển thị 24 giờ'],
    ], [2.4, 7])
    g.fig('hinh-1-lich-ngay')
    g.note('**Lịch do Quản trị đặt.** Nếu phòng chốt giờ khác, ví dụ đóng cửa 17:30, ngày chuẩn là 480 phút và mọi công thức bên dưới tự đổi theo. '
           'Báo cáo giờ luôn tính theo lịch hiện hành mỗi lần xem; hạn xử lý của một hồ sơ được tính lại mỗi lần hồ sơ đổi trạng thái.')

    g.h2('10.3 Đọc các con số trên màn hình', bullets=[
        'Dưới 60 phút ghi phút; từ 60 phút ghi giờ và phút', '"—" là chưa đo được; "0 phút" là đã có phiên nhưng không rơi vào giờ làm việc', 'Còn / Quá là khoảng cách tới hạn theo đồng hồ thật'])
    g.table(['Hiển thị', 'Ý nghĩa'], [
        ['**45 phút**', 'Thời lượng dưới một giờ ghi bằng phút.'],
        ['**2 giờ 15 phút**', 'Từ 60 phút trở lên ghi giờ và phút (tròn giờ thì chỉ ghi "2 giờ"). Số lớn có dấu chấm ngăn nghìn.'],
        ['**<1 phút**', 'Đã làm nhưng chưa đủ một phút.'],
        ['**—**', 'Chưa đo được: chưa có phiên làm nào, hoặc dữ liệu cũ thiếu mốc.'],
        ['**0 phút**', 'Đã có phiên nhưng phần tính được bằng không: phiên rơi hết vào nghỉ trưa, hoặc làm ngoài giờ mà chưa đóng trong ngày.'],
        ['**15:30 12/10/2026**', 'Hạn đã tính bằng giờ làm việc, hiện theo giờ đồng hồ thật.'],
        ['**Còn 90 phút**', 'Còn chưa tới 2 giờ đồng hồ là đến hạn (nhãn vàng).'],
        ['**Quá 3 giờ**', 'Đã qua hạn (nhãn đỏ). Dưới 60 phút ghi phút, dưới 48 giờ ghi giờ, từ đó trở lên ghi ngày (ví dụ Quá 2 ngày).'],
        ['**Dừng tính hạn**', 'Hồ sơ đang ở trạng thái chờ bên ngoài, hạn đứng yên và không tính quá hạn.'],
        ['**Không tính quá hạn (HĐTC)**', 'Hồ sơ có phần soạn HĐ thế chấp (TSĐB mới, phụ lục TSĐB và hồ sơ vay đi kèm): không bị tính quá hạn.'],
    ], [3, 6.4])
    g.p('Lưu ý: **Còn** và **Quá** là khoảng cách đồng hồ thật tới mốc hạn, nên qua đêm hay cuối tuần con số vẫn tăng. Bản thân mốc hạn mới là kết quả tính bằng giờ làm việc.')

    g.h2('10.4 Mỗi thao tác của bạn được ghi nhận thế nào', bullets=[
        'Mỗi nút bấm để lại một mốc giờ', 'Tiếp nhận: mốc nhận hồ sơ, SLA bắt đầu', 'Làm ngay / Làm tiếp: mở và đóng phiên', 'Hẹn ký, Tạm dừng, Hoàn thành: đóng phiên'])
    g.table(['Bạn bấm', 'Hệ thống ghi', 'Hạn SLA', 'Giờ xử lý'], [
        ['**Tiếp nhận** (một chạm)', 'Giờ nhận hồ sơ = lúc bấm. Chưa có hồ sơ Đang làm thì hồ sơ vào Đang làm và mở phiên; đang làm hồ sơ khác thì vào Chờ bắt đầu.', 'Bắt đầu tính', 'Chạy nếu vào Đang làm'],
        ['**Tiếp nhận tất cả**', 'Mỗi hồ sơ ghi giờ nhận ngay lúc bấm; hồ sơ đầu Đang làm, các hồ sơ còn lại Chờ bắt đầu.', 'Bắt đầu tính cả lô', 'Chỉ hồ sơ đầu chạy'],
        ['**Làm ngay / Làm tiếp**', 'Đóng phiên của hồ sơ đang làm (sang Chờ làm tiếp) và mở phiên mới cho hồ sơ vừa bấm, trong cùng một thao tác.', 'Không đổi', 'Hồ sơ mới chạy, hồ sơ cũ dừng'],
        ['**Xong HĐTD**, tick phần việc TSĐB', 'Người tick và giờ tick; vào bảng Kết quả thực hiện theo ngày tick.', 'Không đổi', 'Không đổi'],
        ['**Hẹn ký**', 'Đóng phiên, ghi lịch hẹn ký; ghi nhận luôn đã soạn xong HĐTD.', 'Dừng', 'Dừng'],
        ['**Tạm dừng** (một hồ sơ)', 'Đóng phiên, ghi mốc bắt đầu chờ.', 'Dừng', 'Dừng'],
        ['**Tiếp tục xử lý**', 'Hạn được lùi đúng số phút giờ làm việc đã chờ; hồ sơ quay lại xử lý.', 'Chạy lại', 'Chạy lại khi Đang làm'],
        ['**Hoàn thành**', 'Đóng phiên đúng giờ hoàn thành, chốt hạn và các khoảng đo.', 'Kết thúc', 'Kết thúc'],
        ['**Tạm dừng toàn bộ**', 'Đóng phiên của hồ sơ Đang làm (sang Chờ làm tiếp), mở lượt tác nghiệp khác theo loại đã chọn.', 'Vẫn chạy', 'Hồ sơ dừng; lượt tính vào giờ cán bộ đã dùng'],
        ['**Kết thúc tạm dừng**', 'Đóng lượt, chia phút của lượt cho các việc đã ghi; hồ sơ trước đó quay lại Đang làm.', 'Không đổi', 'Chạy lại ở hồ sơ trước đó'],
        ['**Ghi việc khác**', 'Chỉ ghi số lượng sáu loại việc, không có phút, không dừng hồ sơ nào.', 'Không đổi', 'Không đổi'],
        ['**Đổi người** (Kiểm soát)', 'Đóng phiên của người cũ; người mới tính từ lúc họ bắt đầu. Mốc nhận hồ sơ giữ nguyên.', 'Không đổi', 'Người mới chỉ chạy khi bấm làm'],
        ['**Đổi ngày phát sinh** (Phòng)', 'Chỉ đổi ngày hồ sơ được tính vào báo cáo và Việc tồn.', 'Không đổi', 'Không đổi'],
    ], [2.2, 4.6, 1.5, 2.3], size=9.5)
    g.note('**Trong lúc Tạm dừng toàn bộ**, hệ thống không cho cập nhật hồ sơ (Hẹn ký, Hoàn thành, Làm ngay…): hãy bấm Kết thúc tạm dừng trước. '
           'Hồ sơ đang Chờ bắt đầu hoặc Chờ làm tiếp phải bấm Làm ngay / Làm tiếp trước khi Hẹn ký hay Hoàn thành.')

    g.h2('10.5 Các mốc của một hồ sơ và các khoảng đo', bullets=[
        'Sáu bước, mỗi bước một mốc giờ', 'SLA chỉ bắt đầu khi LS bấm Tiếp nhận', 'Phân công chưa chạy đồng hồ'])
    g.table(['Bước', 'Ai làm', 'Mốc ghi nhận', 'Ảnh hưởng đến giờ'], [
        ['1', 'Phòng / PGD gửi hồ sơ', 'Giờ gửi', 'Bắt đầu đo khoảng chờ phân công. Chưa có hạn.'],
        ['2', 'Kiểm soát phân công cho cán bộ', 'Giờ phân công (lần đầu)', 'Bắt đầu đo khoảng chờ tiếp nhận. Chưa bắt đầu SLA.'],
        ['3', 'Cán bộ LS bấm Tiếp nhận hồ sơ', 'Giờ nhận hồ sơ đủ', 'SLA bắt đầu, hạn được tính.'],
        ['4', 'Cán bộ LS làm hồ sơ', 'Các phiên làm việc', 'Cộng dồn thành giờ xử lý hồ sơ.'],
        ['5', 'Cán bộ LS hẹn khách ký', 'Lịch hẹn ký', 'Dừng hạn và dừng giờ xử lý.'],
        ['6', 'Cán bộ LS bấm Hoàn thành', 'Giờ hoàn thành', 'Chốt hạn, giờ xử lý và các khoảng đo.'],
    ], [0.7, 2.5, 2.3, 4], size=9.5)
    g.p('Các khoảng đo giữa các mốc đều tính bằng giờ làm việc:')
    g.table(['Khoảng', 'Từ', 'Đến', 'Trừ khoảng dừng tính hạn?', 'Xem ở đâu'], [
        ['Phân công', 'Phòng / PGD gửi', 'Phân công lần đầu', 'Không', 'Sheet tháng (Thời gian hồ sơ)'],
        ['Tiếp nhận', 'Phân công lần đầu', 'LS tiếp nhận', 'Không', '"Nhận hồ sơ TB" ở Kết quả thực hiện'],
        ['Nhận → xong', 'LS tiếp nhận', 'Hoàn thành (hoặc hiện tại)', 'Không, gồm cả lúc chờ khách', '"Từ LS nhận đến hoàn thành" trong chi tiết hồ sơ; "SLA nhận→xong TB" ở báo cáo giờ'],
        ['Toàn trình', 'Phòng / PGD gửi', 'Hoàn thành (hoặc hiện tại)', 'Có', '"Toàn trình tạo→xong TB" ở báo cáo giờ'],
        ['SLA đã dùng', 'LS tiếp nhận', 'Hoàn thành (hoặc hiện tại)', 'Có', 'Sheet tháng'],
    ], [1.4, 1.6, 1.9, 2, 2.9], size=9.5)
    g.note('**Phân công không chạy đồng hồ.** Hồ sơ vừa được giao mà LS chưa bấm Tiếp nhận hồ sơ thì chưa có hạn. Nếu hồ sơ phát sinh ở ngày làm việc trước '
           'mà đến đầu ngày làm việc kế tiếp LS vẫn chưa tiếp nhận, hệ thống tự trả hồ sơ về Phòng / PGD để chọn lại ngày gửi.')

    g.h2('10.6 Hạn xử lý (SLA)', bullets=[
        'Hạn = giờ nhận + số giờ SLA của loại việc, chỉ đếm giờ làm việc', 'Dừng khi Tạm dừng, Đang hẹn khách ký, Chưa giao hồ sơ', 'Ra khỏi trạng thái chờ thì hạn lùi đúng thời gian đã chờ',
        'Tạm dừng toàn bộ không dừng hạn'])
    g.p('Mỗi loại việc có số giờ SLA, mặc định **8 giờ làm việc** (Quản trị chỉnh ở Loại việc). Hạn là thời điểm mà, kể từ lúc LS tiếp nhận, đã trôi qua đủ số giờ SLA, '
        '**chỉ đếm giờ làm việc**, cộng thêm số giờ làm việc đã nằm trong các lần dừng tính hạn.')
    g.table(['LS tiếp nhận lúc', 'Cách đếm (SLA 8 giờ = 480 phút)', 'Hạn'], [
        ['Thứ Ba 09:00', 'Thứ Ba còn 420 phút (150 phút sáng + 270 phút chiều). Thiếu 60 phút nên sang thứ Tư 07:30 cộng 60 phút.', '**Thứ Tư 08:30**'],
        ['Thứ Sáu 16:00', 'Thứ Sáu còn 120 phút. Thứ Hai sáng 240 phút. Còn thiếu 120 phút, thứ Hai chiều 13:30 cộng 120 phút.', '**Thứ Hai 15:30**'],
        ['Thứ Bảy 09:00', 'Ngày nghỉ nên đếm từ thứ Hai 07:30: sáng 240 phút, chiều 240 phút.', '**Thứ Hai 17:30**'],
    ], [1.8, 5.8, 1.8])
    g.p('Hạn dừng khi hồ sơ ở một trong các trạng thái chờ bên ngoài: **Tạm dừng**, **Đang hẹn khách ký**, **Chưa giao hồ sơ**. Khi hồ sơ quay lại xử lý, hạn được '
        '**lùi đúng số phút giờ làm việc đã chờ**.')
    g.fig('hinh-3-han-sla')
    g.table(['Trạng thái hồ sơ', 'Hạn xử lý', 'Giờ xử lý của cán bộ'], [
        ['Đã phân công, chưa tiếp nhận', 'Chưa có hạn', 'Không chạy'],
        ['Đã tiếp nhận hồ sơ, đang ở **Đang làm**', 'Chạy', '**Chạy**'],
        ['Đã tiếp nhận hồ sơ, ở **Chờ bắt đầu** hoặc **Chờ làm tiếp**', 'Chạy', 'Không chạy'],
        ['Tạm dừng', 'Dừng', 'Dừng'],
        ['Đang hẹn khách ký', 'Dừng', 'Dừng'],
        ['Chưa giao hồ sơ (trả về Phòng / PGD)', 'Dừng', 'Dừng'],
        ['Đổi người xử lý sau khi đã tiếp nhận', 'Chạy tiếp, mốc nhận giữ nguyên', 'Không chạy tới khi người mới bấm làm'],
        ['Hoàn thành, Đã hủy', 'Kết thúc', 'Kết thúc'],
    ], [5.2, 2.2, 2.6], size=9.5)
    g.p('**Đổi hạn:** hồ sơ đã được LS tiếp nhận có thể đổi hạn bởi cán bộ LS đang giữ hồ sơ hoặc cán bộ Phòng / PGD đã tạo đề nghị. Chọn **ngày hạn mới**, hệ thống '
        'giữ nguyên giờ trong hạn hiện tại; bắt buộc ghi lý do. Hạn đổi tay được giữ nguyên, hệ thống không tự tính lại.')
    g.p('**Hồ sơ HĐTC không tính quá hạn:** nhóm hồ sơ có phần soạn HĐ thế chấp (TSĐB mới, phụ lục TSĐB, hồ sơ vay đi kèm hoặc việc chuyển tiếp của chúng) vẫn có hạn hiển thị '
        'nhưng mang nhãn **Không tính quá hạn (HĐTC)**: không vào cảnh báo quá hạn, tab Quá hạn và điểm đúng hạn; phần việc còn lại của chúng theo dõi ở Việc tồn (Phần 11).')
    g.p('Những việc **không đổi hạn**: đổi người xử lý, đổi ngày phát sinh (khách dời lịch), Tạm dừng toàn bộ, Ghi việc khác, Mở lại hồ sơ đã hoàn thành '
        '(giữ SLA toàn trình và lịch sử các phiên) và giờ làm thêm ngoài giờ.')

    g.h2('10.7 Giờ xử lý hồ sơ', bullets=[
        'Giờ xử lý = phút thật sự làm hồ sơ', 'Ba trạng thái: Đang làm, Chờ bắt đầu, Chờ làm tiếp', 'Mỗi lúc chỉ một hồ sơ Đang làm', 'Mỗi lần Đang làm → dừng là một phiên'])
    g.p('Giờ xử lý cho biết cán bộ **thực sự làm** hồ sơ bao nhiêu phút. Nó không phải khoảng từ lúc nhận đến lúc xong: lúc chờ khách, chờ làm tiếp hay ngoài giờ không nằm trong đó.')
    g.table(['Trạng thái', 'Nghĩa', 'Vào bằng', 'Ra bằng'], [
        ['**Chờ bắt đầu**', 'Đã tiếp nhận nhưng chưa làm', 'Tiếp nhận khi đang làm hồ sơ khác; Tiếp nhận tất cả (hồ sơ thứ hai trở đi)', 'Làm ngay'],
        ['**Đang làm**', 'Đồng hồ giờ xử lý chạy', 'Tiếp nhận khi chưa làm hồ sơ nào; Làm ngay; Làm tiếp; Kết thúc tạm dừng toàn bộ', 'Chuyển hồ sơ khác, Tạm dừng toàn bộ, Tạm dừng, Hẹn khách ký, Hoàn thành'],
        ['**Chờ làm tiếp**', 'Đã từng làm, đang bị dừng', 'Bị chuyển sang hồ sơ khác hoặc Tạm dừng toàn bộ', 'Làm tiếp'],
    ], [1.5, 2.1, 3.4, 3], size=9.5)
    g.p('Khi bạn bấm **Làm ngay** ở hồ sơ B trong lúc đang làm hồ sơ A, hệ thống đổi cả hai trong cùng một giây: A sang **Chờ làm tiếp**, B sang **Đang làm**. '
        'Vì vậy không có khoảng hở và không có khoảng trùng giữa hai hồ sơ.')
    g.p('Mỗi lần hồ sơ chạy từ Đang làm đến lúc dừng tạo ra một **phiên** (người làm, giờ bắt đầu, giờ kết thúc); một hồ sơ có thể có nhiều phiên và nhiều người. '
        '**Giờ xử lý hồ sơ = tổng phần nằm trong giờ làm việc của mọi phiên**, cộng phần làm thêm nếu phiên đủ điều kiện (10.9).')
    g.table(['Ví dụ (lịch chuẩn)', 'Cách tính', 'Giờ xử lý'], [
        ['Một phiên 10:00 – 15:00', '10:00 – 11:30 là 90 phút, 13:30 – 15:00 là 90 phút; nghỉ trưa 120 phút bị loại', '**180 phút**'],
        ['Hai phiên 09:00 – 09:30 (LS1) và 10:00 – 10:20 (LS2)', 'Cả hồ sơ cộng hai phiên', '**50 phút** (LS1: 30, LS2: 20)'],
        ['Phiên 16:00 hôm trước đến 08:00 hôm sau, không đóng giữa chừng', '120 phút chiều hôm trước + 30 phút sáng hôm sau. Đêm không tính', '**150 phút**'],
    ], [3.4, 4.4, 2.2], size=9.5)
    g.p('Số hiện ở: cột **Giờ xử lý KH** của bảng Việc được giao; chi tiết hồ sơ (**Giờ xử lý (trừ tạm dừng, chờ khách)** và **Từ LS nhận đến hoàn thành**). '
        'Hồ sơ đang làm cập nhật theo thời gian thực nhưng chỉ đổi khi sang phút mới.')

    g.h2('10.8 Tạm dừng toàn bộ và Ghi việc khác', bullets=[
        'Tạm dừng toàn bộ ghi giờ, Ghi việc khác chỉ ghi số lượng', 'Sáu loại việc khác', 'Phút của lượt được chia theo bốn quy tắc'])
    g.p('Không phải việc nào cũng là hồ sơ. **Tạm dừng toàn bộ** ghi **giờ**, **Ghi việc khác** ghi **số lượng**; hai nút liên thông với nhau (Phần 4, Bước 9).')
    g.table(['Loại lượt tạm dừng', 'Tính vào Giờ cán bộ đã dùng?'], [
        ['Hoàn thiện hồ sơ QTTD/TSBĐ', 'Có, toàn bộ lượt'],
        ['Báo cáo', 'Có, toàn bộ lượt'],
        ['Khác', 'Chỉ khi bạn ghi ít nhất một việc khác gắn vào lượt. Không ghi việc nào thì chỉ là thời gian dừng, không tính vào giờ'],
    ], [3.2, 6.4])
    g.table(['Việc khác', 'Đơn vị', 'Ghi chú'], [
        ['Họp đầu ngày', 'lần', 'Cố định 15 phút mỗi lần'],
        ['Xem văn bản', 'văn bản', ''],
        ['Sắp xếp kho hồ sơ', 'hồ sơ', ''],
        ['Scan hoàn thiện hồ sơ', 'hồ sơ', ''],
        ['Định giá lại TSBĐ', 'tài sản', ''],
        ['Xuất kho, thu nợ cầm cố', 'khoản', ''],
    ], [3.8, 1.8, 3.8], size=10)
    g.p('Hộp thoại luôn hiện đủ sáu dòng, mỗi dòng một ô số lượng từ 0 đến 999; để trống hoặc 0 là không làm việc đó. Khi kết thúc tạm dừng, số phút giờ làm việc của '
        'lượt được chia cho các việc đã ghi theo bốn quy tắc, theo thứ tự:')
    g.li('**Họp đầu ngày** lấy 15 phút mỗi lần, nhưng không vượt số phút của lượt.',
         'Phần còn lại **chia đều cho từng loại việc** có ghi, không chia theo số lượng.',
         'Trong cùng một loại, chia theo tỉ lệ số lượng.',
         'Phút lẻ dồn về loại đứng trước trong danh sách trên.')
    g.table(['Lượt tạm dừng', 'Việc đã ghi', 'Kết quả chia'], [
        ['60 phút', 'Họp ×1, Xem văn bản ×5, Scan ×2', 'Họp 15 · Xem văn bản 23 · Scan 22 (cộng đủ 60)'],
        ['10 phút', 'Họp ×1, Xem văn bản ×5, Scan ×2', 'Họp 10 · Xem văn bản 0 · Scan 0 (họp lấy hết)'],
        ['120 phút', 'Họp ×2, Xem văn bản ×2, Sắp xếp ×6, Định giá ×2', 'Họp 30 · Xem văn bản 30 · Sắp xếp 30 · Định giá 30'],
        ['60 phút', 'Chỉ Họp ×1', 'Họp 15 (45 phút còn lại không gán cho việc nào)'],
    ], [1.8, 4, 4], size=9.5)
    g.p('**Ghi việc khác** ngoài lượt tạm dừng chỉ có **số lượng và 0 phút**, không dừng đồng hồ hồ sơ. Số lượng cộng vào dòng **Khác** của bảng Kết quả thực hiện (bấm mũi tên '
        'cạnh chữ Khác để xem từng loại). Bạn hủy được lượt do chính mình ghi trong ngày hôm nay; giờ của lượt bị hủy không được chia lại cho các việc còn lại.')

    g.h2('10.9 Làm thêm ngoài giờ', bullets=[
        'Phiên đã đóng trong cùng ngày thì phần ngoài giờ được ghi cho bạn', 'Tối đa 4 giờ mỗi phiên', 'Không đổi hạn xử lý'])
    g.p('Nếu bạn vẫn làm hoặc bấm **Hoàn thành** sau giờ đóng cửa, phần thời gian ngoài lịch cũng được ghi cho chính bạn. Điều kiện là phiên (hoặc lượt Tạm dừng toàn bộ) '
        '**đã đóng trong cùng một ngày**.')
    g.li('**Được tính:** phần trước giờ mở cửa và sau giờ đóng cửa của ngày làm việc; cả phiên nếu rơi vào ngày nghỉ hoặc ngày lễ.',
         '**Không tính:** nghỉ trưa; phiên còn mở (chưa đóng); phiên kéo qua nửa đêm (thường là do quên tạm dừng).',
         '**Giới hạn:** tối đa 4 giờ ngoài lịch cho mỗi phiên hoặc mỗi lượt tạm dừng, lấy từ đầu khoảng ngoài giờ.',
         '**Không đổi:** hạn xử lý, "Nhận → xong" và toàn trình vẫn tính theo lịch.')
    g.table(['Tình huống (lịch chuẩn)', 'Giờ xử lý', 'Trong đó làm thêm'], [
        ['Làm 17:30 – 18:45, bấm Hoàn thành lúc 18:45', '**1 giờ 15 phút**', '45 phút (18:00 – 18:45)'],
        ['Làm 06:50 – 08:00 rồi hoàn thành', '**1 giờ 10 phút**', '40 phút (06:50 – 07:30)'],
        ['Làm 18:00 – 23:30 rồi hoàn thành', '**4 giờ**', '4 giờ (đạt giới hạn)'],
        ['Làm thứ Bảy 09:00 – 10:00 rồi hoàn thành', '**1 giờ**', '60 phút (ngày nghỉ)'],
        ['Làm 10:00 – 15:00', '**3 giờ**', '0 (nghỉ trưa 120 phút không tính)'],
        ['Mở phiên 16:00, quên đóng, hôm sau 08:00 mới Hoàn thành', '**2 giờ 30 phút**', '0 (phiên qua đêm: chỉ phần trong lịch)'],
        ['Thứ Sáu 17:00 đến thứ Hai 08:00 không đóng', '**1 giờ 30 phút**', '0 (phiên qua nhiều ngày)'],
        ['Đang làm từ 17:00, lúc 21:00 vẫn chưa đóng', '**1 giờ**', '0 (chưa đóng nên chưa tính ngoài giờ)'],
    ], [4.8, 1.8, 3], size=9.5)
    g.p('Với phiên 17:30 – 18:45 ở dòng đầu, khoảng "Nhận → xong" chỉ là 30 phút (phần trong lịch) còn giờ xử lý là 1 giờ 15 phút: hai con số trả lời hai câu hỏi khác nhau. '
        'Giờ làm thêm hiện ở giờ xử lý của hồ sơ, **Giờ làm hôm nay** ở Dashboard cá nhân, chỉ số **Làm thêm ngoài giờ** trong Thời gian của tôi (chỉ hiện khi lớn hơn 0) '
        'và dòng "Giờ làm thêm ngoài giờ" trong file Excel.')
    g.note('**Cách để giờ làm thêm được ghi.** Trước khi rời vị trí, hãy bấm Hoàn thành, Tạm dừng, Hẹn khách ký hoặc Tạm dừng toàn bộ. Phiên bỏ mở qua đêm chỉ ghi phần trong lịch.')

    g.h2('10.10 Giờ cán bộ đã dùng trong ngày', bullets=[
        'Giờ cán bộ đã dùng = mọi phiên hồ sơ + các lượt Tạm dừng toàn bộ được tính', 'Hai khoảng chồng nhau chỉ tính một lần', 'Có thể thấp hơn 510 phút vì chỉ ghi khi có phiên hoặc lượt chạy'])
    g.p('**Giờ cán bộ đã dùng** là tổng thời gian của một người trong ngày, gồm mọi phiên làm hồ sơ (phần trong lịch và phần làm thêm đủ điều kiện) và các lượt '
        'Tạm dừng toàn bộ được tính (Hoàn thiện QTTD/TSBĐ, Báo cáo, và Khác có việc gắn vào). Hai khoảng chồng nhau chỉ được tính **một lần**. Đây là con số hiện ở '
        '**Giờ làm hôm nay** và **Giờ tôi đã dùng**.')
    g.fig('hinh-2-ngay-mau')
    g.table(['Khoản', 'Phút', 'Ghi chú'], [
        ['Hồ sơ A: 07:45 – 09:15 và 13:30 – 15:00', '180', '90 + 90'],
        ['Hồ sơ B: 09:15 – 11:30 và 16:00 – 18:40', '295', '135 + 120 trong lịch + 40 làm thêm'],
        ['**Giờ xử lý hồ sơ (A + B)**', '**475**', 'Trong đó 40 phút làm thêm'],
        ['Tạm dừng toàn bộ · Báo cáo 15:00 – 16:00', '60', 'Luôn được tính'],
        ['**Giờ cán bộ đã dùng**', '**535**', 'Các khoảng nối liền nhau nên không có phần trùng'],
        ['Một ngày làm việc theo lịch', '510', 'Để so sánh'],
    ], [5, 1.2, 3.4], size=10)
    g.p('Con số có thể thấp hơn 510 phút vì hệ thống chỉ ghi thời gian **khi có phiên hoặc lượt đang chạy**. Những khoảng sau không có phiên nên không được tính: '
        'lúc giữa hai hồ sơ mà chưa bấm Làm ngay / Làm tiếp; hồ sơ đang Chờ bắt đầu hoặc Chờ làm tiếp; hồ sơ đang Tạm dừng hoặc Đang hẹn khách ký (chờ khách); '
        'việc làm ngoài hệ thống (họp, gọi điện, scan, sắp xếp kho…) nếu không ghi qua Tạm dừng toàn bộ hoặc Ghi việc khác; nghỉ trưa.')

    g.h2('10.11 Xem số liệu ở đâu', bullets=[
        'Cán bộ LS: Việc của tôi, chi tiết hồ sơ, Dashboard cá nhân, Thời gian của tôi', 'Kiểm soát/Quản lý: Quản lý hồ sơ, Báo cáo Thời gian & SLA, Kết quả thực hiện', 'Phòng/PGD: cột Hạn xử lý, không có số giờ xử lý'])
    g.table(['Vai trò', 'Màn hình', 'Số liệu'], [
        ['**Cán bộ LS**', 'Việc của tôi', 'Cột Giờ xử lý KH; trạng thái Đang làm / Chờ bắt đầu / Chờ làm tiếp; cảnh báo "N việc đã quá hạn xử lý"'],
        ['', 'Chi tiết hồ sơ', 'Giờ LS tiếp nhận; Giờ xử lý (trừ tạm dừng, chờ khách); Từ LS nhận đến hoàn thành'],
        ['', 'Dashboard cá nhân', 'Giờ làm hôm nay; Hoàn thành hôm nay; Đã chậm hôm nay; Kết quả thực hiện của riêng bạn'],
        ['', 'Thời gian của tôi', 'Giờ tôi đã dùng; Giờ xử lý hồ sơ; Hoàn thành; Tác nghiệp khác; Giờ tác nghiệp khác; Làm thêm ngoài giờ; bảng theo ngày; Tải Excel; Rà soát mốc thời gian'],
        ['**Kiểm soát, Quản lý LS**', 'Quản lý hồ sơ', 'Cột Hạn xử lý với Còn / Quá / Dừng tính hạn; tab Quá hạn; tab Hoàn thành'],
        ['', 'Báo cáo → Thời gian & SLA', 'Giờ theo ngày, cán bộ, nghiệp vụ; Rà soát mốc thời gian'],
        ['', 'Kết quả & kế hoạch', 'Nhận hồ sơ TB, Toàn trình TB, TB xử lý / hồ sơ, tỉ lệ đúng hạn theo cán bộ'],
        ['**Quản trị, Giám sát**', 'Thời gian & SLA', 'Như trên nhưng không hiện tên sản phẩm hay thông tin khách'],
        ['**Phòng / PGD**', 'Toàn bộ hồ sơ của phòng', 'Cột Hạn xử lý với Còn / Quá / Dừng tính hạn. Không có số giờ xử lý'],
    ], [1.9, 2.4, 5.3], size=9.5)
    g.p('Màn **Thời gian của tôi**: chọn **Từ ngày**, **Đến ngày**, **Nghiệp vụ** rồi bấm **Xem báo cáo**. Dải số trên cùng gồm sáu ô như trong {hinh:ls-13-thoi-gian-sla}; bên dưới là bảng '
        '**Việc khác theo loại** (số lượng và thời gian), biểu đồ **Tổng thời gian mỗi ngày** (Giờ tôi đã dùng so với Giờ xử lý hồ sơ) và bảng số liệu theo ngày / nghiệp vụ / '
        'sản phẩm với các cột Giờ hồ sơ, Giờ của tôi trong nhóm, Hoàn thành, SLA nhận→xong TB, Toàn trình tạo→xong TB, Đúng hạn. Trong ảnh, 5 giờ 52 phút giờ xử lý '
        'cộng 35 phút tác nghiệp khác cho ra 6 giờ 27 phút giờ đã dùng.')
    g.p('Các chỉ số trung bình trên **Kết quả thực hiện**: **TB xử lý / hồ sơ** là trung bình giờ xử lý của các hồ sơ đã hoàn thành trong kỳ (hồ sơ chưa đo được không đưa vào trung bình); '
        '**Nhận hồ sơ TB** là trung bình khoảng Tiếp nhận; **Toàn trình TB** là trung bình khoảng Toàn trình; **Đúng hạn** là số hồ sơ hoàn thành không muộn hơn hạn chia cho số hồ sơ hoàn thành. '
        'File **Tải Excel** của báo cáo giờ giữ đơn vị giờ dạng số thập phân (1,25 giờ là 75 phút); Sheet tháng của kỳ có bốn bảng: Thời gian hồ sơ, Phiên xử lý, Thời gian theo ngày, Tổng hợp thời gian.')

    g.h2('10.12 Sửa và rà soát thời gian', bullets=[
        'Ghi / sửa giờ LS nhận đủ trong chi tiết hồ sơ', 'Ai sửa được: cán bộ giữ hồ sơ, Kiểm soát, Quản lý', 'Rà soát mốc thời gian trong báo cáo giờ'])
    g.p('Nút **Ghi / sửa giờ LS nhận đủ** trong chi tiết hồ sơ (và giờ hoàn thành với hồ sơ đã xong) mở hộp thoại **Sửa thời gian hồ sơ**. Người dùng được: cán bộ đang giữ hồ sơ, '
        'Kiểm soát LS, Quản lý LS. Bắt buộc ghi lý do; thao tác được lưu vào nhật ký. Giờ nhận hồ sơ phải trước các phiên đã ghi nhận và không ở tương lai; giờ hoàn thành phải sau giờ nhận. '
        'Một người không được tính hai lần cùng một lúc: khi sửa, phần phiên trùng với hồ sơ khác của cùng người đó bị cắt bớt.')
    g.p('Nút **Rà soát mốc thời gian** (trong báo cáo giờ) liệt kê hồ sơ có vấn đề: thiếu giờ nhận hồ sơ, thiếu giờ hoàn thành, chưa rõ người xử lý, mốc chưa hợp lệ. Mỗi dòng có '
        'gợi ý lấy từ nhật ký và nút **Xác nhận mốc** hoặc **Người xử lý phiên cũ**. Dữ liệu cũ chưa biết ai làm thì hệ thống để trống chứ không đoán. Khi còn hồ sơ như vậy, báo cáo '
        'hiện dòng cảnh báo **Dữ liệu cần xác nhận**: số của kỳ vẫn hiện nhưng cần xác nhận trước khi dùng để đánh giá.')

    g.h2('10.13 Để thời gian được ghi nhận sát thực tế', bullets=[
        'Luôn để một hồ sơ Đang làm khi làm hồ sơ', 'Việc ngoài hồ sơ: Tạm dừng toàn bộ rồi ghi việc đã làm', 'Đóng phiên trước khi rời chỗ'])
    g.li('Luôn để một hồ sơ ở **Đang làm** khi bạn đang làm hồ sơ; chuyển hồ sơ bằng Làm ngay / Làm tiếp, không để khoảng trống.',
         'Việc ngoài hồ sơ (họp, báo cáo, hoàn thiện QTTD/TSBĐ, scan, sắp xếp kho…) thì **Tạm dừng toàn bộ** và ghi việc đã làm khi kết thúc.',
         'Khách chưa tới, đang chờ cấp phê duyệt thì **Tạm dừng** hồ sơ (hạn dừng, giờ xử lý dừng).',
         'Trước khi rời chỗ hoặc hết ngày, bấm **Hoàn thành**, **Tạm dừng**, **Hẹn khách ký** hoặc **Tạm dừng toàn bộ** để đóng phiên.',
         'Tiếp nhận hồ sơ chỉ khi đã cầm đủ hồ sơ: giờ nhận là lúc bắt đầu tính hạn.')

    # ============================================================ PHẦN 11
    g.h1('Phần 11. Cách ghi nhận việc tồn')
    g.p('Việc tồn cho biết còn bao nhiêu hồ sơ **chưa hết phần việc** của LS để không bỏ sót việc đọng từ hôm trước. Việc tồn không do người dùng nhập: '
        'hệ thống tự lập từ trạng thái hồ sơ và các ô tick, và đưa ra cùng một con số ở Dashboard cá nhân, bảng Kết quả thực hiện và các màn của Kiểm soát/Quản lý.')

    g.h2('11.1 Việc tồn là gì', bullets=[
        'Việc tồn: hồ sơ còn mở của bạn, kèm phần việc còn thiếu', 'Tồn soạn hiện nay: dòng trong bảng Kết quả thực hiện', 'Tồn cuối kỳ: ảnh chụp trong báo cáo kỳ'])
    g.p('Chữ "tồn" xuất hiện ở ba nơi, cùng một ý (còn dang dở) nhưng khác phạm vi:')
    g.table(['Tên', 'Ở đâu', 'Đếm cái gì'], [
        ['**Việc tồn**', 'Dashboard cá nhân của cán bộ LS', 'Mọi hồ sơ còn mở được giao cho bạn (kể cả chưa tiếp nhận), mỗi hồ sơ kèm các **thẻ phần việc** còn thiếu'],
        ['**Tồn soạn hiện nay** (Còn soạn HĐ thế chấp, Còn soạn HĐ tín dụng)', 'Bảng Kết quả thực hiện (Dashboard cá nhân, Kết quả & kế hoạch)', 'Số hồ sơ còn mở mà HĐ thế chấp / HĐ tín dụng chưa soạn xong; cùng số với thẻ HĐTC / HĐTD của Việc tồn'],
        ['**Tồn cuối kỳ**', 'Báo cáo nhiều kỳ (ô Tồn cuối kỳ và các bảng theo đơn vị, loại việc, cán bộ)', 'Số việc còn mở tại thời điểm chốt kỳ, kể cả hồ sơ đã sinh dòng chuyển tiếp ở kỳ sau'],
    ], [3, 3, 3.6], size=9.5)

    g.h2('11.2 Hồ sơ vào Việc tồn khi nào', bullets=[
        'Từ lúc được giao cho bạn', 'Còn mở: chưa Hoàn thành, chưa Hủy, chưa chuyển sang kỳ sau', 'Mỗi hồ sơ thuộc nhóm Hôm nay hoặc Tồn các ngày trước'])
    g.p('Một hồ sơ nằm trong Việc tồn của bạn từ lúc **được giao** cho đến khi hồ sơ **Hoàn thành** hoặc **Đã hủy**, hoặc bị chuyển người, chuyển kỳ. Hồ sơ Đang hẹn khách ký '
        'và Tạm dừng vẫn là hồ sơ còn mở nên vẫn nằm trong Việc tồn. Hồ sơ chưa tiếp nhận có thẻ **Chưa nhận HS** nên chưa tính vào tồn soạn.')
    g.p('Việc tồn chia hai nhóm theo **ngày được giao**:')
    g.li('**Hôm nay:** hồ sơ được giao cho bạn trong ngày.',
         '**Tồn các ngày trước:** hồ sơ được giao từ ngày trước mà vẫn còn mở. Hồ sơ giao hôm qua, hôm nay mới tiếp nhận vẫn thuộc nhóm này.')
    g.p('Mỗi nhóm hiện số hồ sơ, các thẻ đếm theo phần việc và thẻ đỏ **n quá hạn** nếu có hồ sơ đã trễ hạn. Thẻ HĐTD và HĐTC luôn hiện (kể cả 0) để đối chiếu với '
        'dòng Tồn soạn của bảng kết quả; các thẻ khác chỉ hiện khi có hồ sơ.')

    g.h2('11.3 Các thẻ phần việc', bullets=[
        'HĐTD, HĐTC, Kho TSĐB, RLOS: phần việc còn thiếu', 'Chưa nhận HS, Dời ngày: chưa tính vào tồn soạn', 'Khác: còn mở nhưng không còn phần soạn nào'])
    g.table(['Thẻ', 'Nghĩa', 'Vào tồn khi', 'Hết tồn khi'], [
        ['**HĐTD**', 'Còn soạn hợp đồng tín dụng', 'Hồ sơ vay (Món, HM SXKD, Thấu chi, Thẻ tín dụng) đã tiếp nhận, chưa ghi nhận soạn xong HĐ tín dụng', 'Hẹn khách ký, hoặc bấm **Xong HĐTD**, hoặc Hoàn thành'],
        ['**HĐTC**', 'Còn soạn hợp đồng thế chấp', 'Việc TSĐB mới / phụ lục TSĐB đã tiếp nhận (và hồ sơ vay có tài sản bảo đảm theo loại việc) chưa tick soạn xong', 'Tick **Đã soạn xong HĐ thế chấp**'],
        ['**Kho TSĐB**', 'Còn nhập hoặc xuất kho TSĐB', 'Việc TSĐB có ô nhập/xuất kho chưa tick', 'Tick **Đã nhập kho TSĐB** / **Đã xuất kho TSĐB**'],
        ['**RLOS**', 'Còn giao dịch trên Rlos', 'Hồ sơ vay chưa ghi nhận giao dịch trên Rlos', 'Tick **Đã làm giao dịch trên Rlos** khi Hoàn thành (hoặc sửa ghi nhận kết quả)'],
        ['**Chưa nhận HS**', 'Chưa tiếp nhận hồ sơ', 'Hồ sơ Đã phân công mà bạn chưa bấm Tiếp nhận', 'Bấm **Tiếp nhận** (hoặc Tiếp nhận tất cả)'],
        ['**Dời ngày**', 'Phòng/PGD đã dời ngày phát sinh sang sau hôm nay', 'Ngày phát sinh của hồ sơ lớn hơn hôm nay', 'Đến ngày phát sinh mới thì tính lại như bình thường'],
        ['**Khác**', 'Hồ sơ còn mở nhưng không còn phần soạn, kho hay Rlos nào để theo dõi', 'Ví dụ hồ sơ đang chờ khách ký, loại việc khác', 'Hoàn thành, Hủy'],
    ], [1.5, 2.3, 3.2, 3], size=9.5)
    g.p('**Thứ tự xét thẻ:** Chưa nhận HS trước, rồi Dời ngày, rồi các phần việc HĐTD / HĐTC / Kho TSĐB / RLOS (một hồ sơ có thể còn nhiều phần), cuối cùng mới đến Khác. '
        'Vì vậy hồ sơ chưa nhận hoặc đã dời ngày chỉ có một thẻ riêng và chưa tính vào tồn soạn.')
    g.p('Mở **Chi tiết việc** của một nhóm ({hinh:ls-01a-viec-ton-chi-tiet}) để thấy từng hồ sơ: cột **Phần tồn** nói rõ còn thiếu gì và cách xóa tồn (ví dụ "HĐTC hết tồn khi tick Đã soạn xong HĐ thế chấp"), '
        'cột **Tiến độ** cho biết hồ sơ đang ở đâu, kèm nút thao tác ngay trên dòng.')

    g.h2('11.4 Hồ sơ vay kèm TSĐB mới', bullets=[
        'Hồ sơ vay giữ HĐTD và RLOS', 'HĐ thế chấp nằm ở việc TSĐB đi kèm', 'Việc kèm chưa nhận thì HĐTC chưa vào tồn'])
    g.p('Khách vay có **TSBĐ mới** có hai việc: hồ sơ vay và **việc kèm TSĐB**. HĐ thế chấp chỉ tính một lần, ở **việc TSĐB**: hồ sơ vay chỉ giữ HĐTD và RLOS, kèm dòng '
        'nhắc "HĐTC tính ở việc kèm …". Nếu việc kèm chưa được tiếp nhận thì dòng nhắc ghi "chưa tiếp nhận nên chưa vào tồn" để bạn khỏi tưởng số HĐTC bị thiếu.')
    g.p('Khi bạn tiếp nhận hồ sơ vay, việc kèm TSĐB đã giao cho chính bạn được tiếp nhận luôn (vào danh sách chờ), để HĐ thế chấp vào tồn soạn ngay và bạn khỏi bấm lần hai. '
        'Hình dưới là ví dụ: một khách có hồ sơ Món và việc TSĐB đi kèm, qua các bước từ lúc được giao đến khi hết tồn.')
    g.fig('hinh-4-vong-doi-ton')
    g.table(['Bước', 'Bạn làm', 'Việc tồn thay đổi'], [
        ['1', 'Được Kiểm soát giao hai việc', 'Cả hai hồ sơ có thẻ Chưa nhận HS'],
        ['2', 'Tiếp nhận hồ sơ vay (việc TSĐB kèm được nhận cùng lúc)', 'Món: HĐTD + RLOS. TSĐB: HĐTC + Kho TSĐB'],
        ['3', 'Hẹn khách ký hoặc bấm Xong HĐTD', 'Món hết HĐTD, còn RLOS'],
        ['4', 'Tick Đã soạn xong HĐ thế chấp ở việc TSĐB', 'TSĐB hết HĐTC, còn Kho TSĐB'],
        ['5', 'Tick Đã nhập kho TSĐB, Hoàn thành việc TSĐB; Hoàn thành hồ sơ vay với ô Rlos được tick', 'Hết thẻ; hai hồ sơ rời Việc tồn'],
    ], [0.8, 5.2, 3.6], size=9.5)

    g.h2('11.5 Việc tồn trong bảng Kết quả thực hiện', bullets=[
        'Kết quả đếm theo ngày tick hoặc ngày hoàn thành', 'Tồn soạn hiện nay là trạng thái hiện tại, không phải số của ngày đã chọn', 'Hồ sơ dời sang sau ngày xem thì chưa tính tồn'])
    g.p('Bảng **Kết quả thực hiện** (Dashboard cá nhân và Kết quả & kế hoạch) có hai loại dòng:')
    g.li('**Kết quả** (Soạn thảo HĐ thế chấp, Soạn thảo HĐ tín dụng, Nhập kho / Xuất kho TSĐB, Giao dịch trên Rlos, Khác): đếm theo **ngày** cán bộ tick phần việc, hoặc ngày hoàn thành '
         'với các ô kết quả tick lúc Hoàn thành; mỗi phần việc chỉ tính cho người đã làm.',
         '**Tồn soạn hiện nay** (Còn soạn HĐ thế chấp, Còn soạn HĐ tín dụng): số hồ sơ còn mở mà HĐ chưa soạn xong **tại thời điểm xem**. Hồ sơ đã hoàn thành trong kỳ không tính tồn; '
         'hồ sơ Phòng/PGD đã dời sang sau ngày xem (hoặc sau hôm nay) chưa tính, vì nó thuộc ngày phát sinh mới.')
    g.p('Vì vậy chọn một ngày cũ thì phần Kết quả đổi theo ngày đó, còn hai dòng Tồn soạn luôn là số còn lại hiện nay. Kế hoạch của hai dòng Tồn là **mức tồn mong muốn**, không nhân '
        'với số ngày làm việc. Hồ sơ vay kèm TSĐB mới chỉ tính HĐ thế chấp ở việc TSĐB, không tính hai lần.')
    g.p('Minh họa trên màn hình: {hinh:ls-01b-dashboard-cuoi-ngay} và {hinh:ls-01f-viec-ton-cuoi-ngay} (Việc tồn cuối ngày), {hinh:ls-01c-ket-qua-thuc-hien} (bảng kết quả), '
        '{hinh:ls-01d-khac-bung} (dòng Khác bung ra).')

    g.h2('11.6 Khi hồ sơ đổi ngày, đổi người hoặc đổi trạng thái', bullets=[
        'Đổi ngày phát sinh: thẻ Dời ngày, việc kèm dời theo', 'Đổi người: phần đã làm xong giữ cho người cũ', 'Tạm dừng, Hẹn khách ký vẫn là việc mở'])
    g.table(['Sự kiện', 'Việc tồn thay đổi thế nào'], [
        ['Phòng/PGD đổi **Ngày phát sinh** sang ngày sau', 'Hồ sơ mang thẻ **Dời ngày** và chưa tính vào tồn soạn cho tới ngày mới. Việc kèm còn mở đang cùng ngày cũ dời theo. Hạn xử lý và mốc nhận không đổi.'],
        ['Phòng/PGD sửa nội dung khác của việc đã giao', 'Chờ Kiểm soát/Quản lý duyệt; trong lúc chờ hồ sơ giữ nguyên trong tồn.'],
        ['Kiểm soát **Đổi người**', 'Hồ sơ chuyển sang Việc tồn của người nhận. Phần đã làm xong (Soạn HĐ tín dụng, HĐ thế chấp, Rlos) tick lúc đổi người giữ kết quả cho người cũ; người mới chỉ phải làm phần còn lại.'],
        ['**Tạm dừng** / **Đang hẹn khách ký**', 'Vẫn là hồ sơ mở nên vẫn trong Việc tồn; phần việc nào còn thiếu thì còn thẻ tương ứng, nếu không còn thì thẻ Khác. Hạn dừng nhưng tồn không dừng.'],
        ['Trả về Phòng/PGD (**Chưa giao hồ sơ**)', 'Hồ sơ không còn trong Việc tồn của cán bộ cho đến khi Phòng/PGD gửi lại và được phân công lại.'],
        ['**Hoàn thành**', 'Hồ sơ ra khỏi tồn; kết quả đã tick đi vào bảng ngày. Kiểm soát/Quản lý còn sửa được ghi nhận kết quả.'],
        ['**Hủy** hoặc chuyển sang kỳ sau', 'Hồ sơ ra khỏi tồn; bản chuyển tiếp ở kỳ sau tính là "Chuyển tiếp vào" của kỳ đó.'],
        ['**Mở lại việc**', 'Hồ sơ trở lại Việc tồn của người xử lý với các phần việc chưa tick.'],
    ], [3.2, 6.4], size=9.5)

    g.h2('11.7 Xem việc tồn ở các màn khác', bullets=[
        'Kiểm soát/Quản lý: Xem việc (n) của từng cán bộ', 'Phòng/PGD: cảnh báo và Xem cả việc tồn', 'Báo cáo: Tồn cuối kỳ, Chuyển tiếp vào'])
    g.li('**Kiểm soát / Quản lý LS:** ở bảng **Tải việc theo cán bộ LS** (Kết quả & kế hoạch) bấm **Xem việc (n)** để xem các hồ sơ đang mở của một cán bộ, kèm phần việc còn tồn '
         'và tiến độ, rồi cân tải hoặc đổi người.',
         '**Phòng / PGD:** màn Toàn bộ phòng cảnh báo số việc còn mở ở ngày trước kỳ đang xem và có nút **Xem cả việc tồn** để mở rộng kỳ xem về ngày sớm nhất còn việc.',
         '**Báo cáo nhiều kỳ:** các cột **Phát sinh**, **Chuyển tiếp vào**, **Hoàn thành**, **Quá hạn**, **Hủy**, **Tồn cuối kỳ** cho từng đơn vị, loại việc, cán bộ.',
         '**Điểm vận hành** (Quản trị): cột Tồn quá hạn đếm hồ sơ mở đã quá hạn, không gồm hồ sơ Không tính quá hạn (HĐTC).')
    g.p('Màn Việc được giao của một cán bộ: {hinh:ks-14c-viec-cua-can-bo}.')

    g.h2('11.8 Việc tồn khác với quá hạn', bullets=[
        'Tồn: còn phần việc dang dở', 'Quá hạn: vượt hạn SLA', 'Hồ sơ HĐTC có thể tồn nhưng không bị tính quá hạn'])
    g.p('**Tồn** nói về phần việc còn dang dở; **quá hạn** nói về việc vượt hạn SLA. Một hồ sơ có thể tồn mà chưa quá hạn (mới nhận hôm nay), hoặc quá hạn mà không còn phần soạn nào '
        '(chỉ chờ Hoàn thành). Hồ sơ có phần soạn HĐ thế chấp thì mang nhãn **Không tính quá hạn (HĐTC)**: vẫn nằm trong Việc tồn cho tới khi tick đủ, nhưng không bị tính quá hạn.')
    g.note('**Cuối ngày, để Việc tồn sạch:** xem nhóm Hôm nay trước, rồi Tồn các ngày trước. Hồ sơ còn Chưa nhận HS thì Tiếp nhận khi đã cầm đủ hồ sơ; còn HĐTD thì bấm Xong HĐTD '
           'hoặc Hẹn khách ký ngay khi soạn xong; còn HĐTC / Kho TSĐB thì tick phần việc ở việc TSĐB; còn RLOS thì ghi nhận giao dịch khi Hoàn thành. Tick đúng và tick ngay sau khi làm xong '
           'để số kết quả rơi đúng ngày.')
