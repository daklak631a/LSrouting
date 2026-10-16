"""Dựng tài liệu "Cách tính giờ trong LS-Routing" (docx).

    py docs/huong-dan/tinh-gio/make_figures.py
    py docs/huong-dan/tinh-gio/build_tinh_gio.py

Ra: docs/huong-dan/CACH_TINH_GIO_LS_ROUTING.docx (mục lục được Word cập nhật ở bước finish_tinh_gio.py).
Công thức và số liệu ví dụ lấy từ LSTiming (js/core.js) và Code.gs; ví dụ đã chạy lại bằng đúng engine đó.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from docx_kit import CONTENT_W, Kit  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', 'CACH_TINH_GIO_LS_ROUTING.docx'))


def fit(*weights):
    total = sum(weights)
    widths = [int(CONTENT_W * w / total) for w in weights]
    widths[-1] += CONTENT_W - sum(widths)
    return widths


def fig(name):
    return os.path.join(HERE, name)


k = Kit()
k.header_footer('LS-Routing · Cách tính giờ')

# =============================================================== bìa
k.cover(
    'L S - R O U T I N G',
    'Cách tính giờ',
    'Giờ làm việc, hạn xử lý, giờ xử lý hồ sơ và giờ làm thêm',
    'Tài liệu dành cho',
    ['Cán bộ LS', 'Kiểm soát LS và Quản lý LS', 'Phòng / PGD', 'Quản trị hệ thống và Giám sát'],
    'Phiên bản tài liệu 15/10/2026',
    'Mô tả cách tính của bản đang chạy (có giờ làm thêm ngoài giờ, Ghi việc khác và tiếp nhận một chạm). '
    'Mọi số trong ví dụ đã được chạy lại bằng đúng công thức của hệ thống, theo lịch làm việc chuẩn.')
k.toc()

# =============================================================== 1
k.h1('1. Tóm tắt', page_break=True)
k.p('LS-Routing đo thời gian theo bốn cách. Mỗi cách trả lời một câu hỏi khác nhau, vì vậy không đặt số của cách này cạnh số của cách kia để so.')
k.table(
    ['Con số', 'Trả lời câu hỏi', 'Bắt đầu tính', 'Dừng khi', 'Ngoài giờ làm việc'],
    [
        ['**Hạn xử lý (SLA)**', 'Hồ sơ phải xong trước thời điểm nào?', 'LS bấm **Tiếp nhận hồ sơ**',
         'Hồ sơ vào trạng thái chờ bên ngoài: Tạm dừng, Đang hẹn khách ký, Chưa giao hồ sơ', 'Không tính. Chỉ đếm giờ làm việc'],
        ['**Giờ xử lý hồ sơ**', 'Cán bộ đã làm hồ sơ này bao nhiêu phút?', 'Cán bộ bấm **Làm ngay** hoặc **Làm tiếp**',
         'Chuyển sang hồ sơ khác, Tạm dừng toàn bộ, Tạm dừng, Hẹn khách ký, Hoàn thành', 'Tính nếu phiên đã đóng trong cùng ngày, tối đa 4 giờ mỗi phiên'],
        ['**Giờ cán bộ đã dùng**', 'Một người đã dùng bao nhiêu phút trong ngày?', 'Cộng mọi phiên làm hồ sơ và các lượt Tạm dừng toàn bộ có ghi nhận',
         'Mỗi khoảng thời gian chỉ tính một lần', 'Tính như giờ xử lý hồ sơ'],
        ['**Khoảng chờ giữa các mốc**', 'Hồ sơ nằm chờ bao lâu ở từng bước?', 'Từ một mốc đến mốc kế (gửi, phân công, nhận, hoàn thành)',
         'Đến mốc kế', 'Không tính'],
    ],
    fit(1.45, 1.6, 1.6, 2.0, 1.45), size=9.5)
k.h2('Ba điều cần nhớ')
k.bullets([
    '**Mọi số đo bằng phút giờ làm việc.** Đêm, cuối tuần, ngày lễ và nghỉ trưa không chạy. Ngoại lệ duy nhất là phần làm thêm đã đóng trong ngày (mục 7).',
    '**Hạn xử lý thuộc về hồ sơ, giờ xử lý thuộc về cán bộ.** Mỗi cán bộ chỉ có một hồ sơ ở trạng thái Đang làm tại một thời điểm.',
    '**Đóng phiên đúng lúc thì giờ mới đúng.** Bấm Hoàn thành, Tạm dừng hoặc Tạm dừng toàn bộ trước khi rời vị trí; phiên bỏ mở qua đêm không được cộng phần ngoài giờ.',
])
k.callout('tip', 'Đọc nhanh theo vai trò',
          'Cán bộ LS: mục 5, 6, 7, 8.\nKiểm soát và Quản lý LS: mục 3, 4, 9, 10.\nPhòng / PGD: mục 2, 3, 4 (các số giờ xử lý không hiện ở màn Phòng / PGD).\nQuản trị: mục 2 và phụ lục B.')

# =============================================================== 2
k.h1('2. Lịch làm việc và cách hiển thị')
k.h2('2.1 Lịch chuẩn')
k.p('Mọi phép tính giờ dựa trên một lịch duy nhất. Lịch chuẩn đang dùng:', keep_next=True)
k.table(
    ['Hạng mục', 'Giá trị'],
    [['Ngày làm việc', 'Thứ Hai đến thứ Sáu'],
     ['Buổi sáng', '07:30 – 11:30 (240 phút)'],
     ['Nghỉ trưa', '11:30 – 13:30 (không tính)'],
     ['Buổi chiều', '13:30 – 18:00 (270 phút)'],
     ['Một ngày làm việc', '**510 phút** (8,5 giờ)'],
     ['Ngày lễ', 'Do Quản trị khai báo, tính như ngày nghỉ'],
     ['Múi giờ', 'Việt Nam (UTC+7), hiển thị 24 giờ']],
    fit(2, 5))
k.figure(fig('hinh-1-lich-ngay.png'), 'Lịch làm việc chuẩn trong một ngày',
         'Thanh thời gian từ 06:00 đến 20:00: sáng 07:30 đến 11:30, nghỉ trưa 11:30 đến 13:30, chiều 13:30 đến 18:00; phần còn lại là ngoài giờ')
k.callout('note', 'Lịch do Quản trị đặt',
          'Quản trị hệ thống → Lịch làm việc: ngày làm việc, giờ mở cửa, giờ đóng cửa, nghỉ trưa và ngày lễ. Nếu phòng chốt giờ khác, ví dụ đóng cửa 17:30, ngày chuẩn là 480 phút và mọi công thức bên dưới tự đổi theo.\n'
          'Báo cáo giờ luôn tính theo lịch hiện hành mỗi lần xem. Hạn xử lý của một hồ sơ được tính lại mỗi lần hồ sơ đổi trạng thái.')
k.h2('2.2 Cách hiển thị con số')
k.table(
    ['Hiển thị', 'Ý nghĩa'],
    [['**45 phút**', 'Thời lượng dưới một giờ ghi bằng phút.'],
     ['**2 giờ 15 phút**', 'Từ 60 phút trở lên ghi giờ và phút (tròn giờ thì chỉ ghi “2 giờ”). Số lớn có dấu chấm ngăn nghìn.'],
     ['**<1 phút**', 'Đã làm nhưng chưa đủ một phút.'],
     ['**—**', 'Chưa đo được: chưa có phiên làm nào, hoặc dữ liệu cũ thiếu mốc.'],
     ['**0 phút**', 'Đã có phiên nhưng phần tính được bằng không: phiên rơi hết vào nghỉ trưa, hoặc làm ngoài giờ mà chưa đóng trong ngày.'],
     ['**Hạn: 16:00 07/10/2026**', 'Thời điểm hạn đã tính bằng giờ làm việc, hiện theo giờ đồng hồ thật.'],
     ['**Còn 90 phút**', 'Còn chưa tới 2 giờ đồng hồ là đến hạn (nhãn vàng).'],
     ['**Quá 3 giờ**', 'Đã qua hạn. Dưới 60 phút ghi phút, dưới 48 giờ ghi giờ, từ đó trở lên ghi ngày (ví dụ Quá 2 ngày).'],
     ['**Dừng tính hạn**', 'Hồ sơ đang ở trạng thái chờ bên ngoài, hạn đứng yên và không tính quá hạn.']],
    fit(2.4, 5))
k.p('Lưu ý: **Còn** và **Quá** là khoảng cách đồng hồ thật tới mốc hạn, nên qua đêm hay cuối tuần con số vẫn tăng. Bản thân mốc hạn mới là kết quả tính bằng giờ làm việc.', size=10.5)

# =============================================================== 3
k.h1('3. Các mốc của một hồ sơ')
k.p('Một hồ sơ đi qua sáu bước. Mỗi bước để lại một mốc giờ; mọi khoảng đo đều lấy từ các mốc này.', keep_next=True)
k.table(
    ['Bước', 'Ai làm', 'Mốc ghi nhận', 'Ảnh hưởng đến giờ'],
    [['1', 'Phòng / PGD gửi hồ sơ', 'Giờ gửi', 'Bắt đầu đo khoảng chờ phân công. Chưa có hạn.'],
     ['2', 'Kiểm soát phân công cho cán bộ', 'Giờ phân công (lần đầu)', 'Bắt đầu đo khoảng chờ tiếp nhận. **Chưa bắt đầu SLA.**'],
     ['3', 'Cán bộ LS bấm **Tiếp nhận hồ sơ**', 'Giờ nhận hồ sơ đủ', '**SLA bắt đầu**, hạn được tính. Bấm một chạm: chưa làm hồ sơ nào thì hồ sơ vào Đang làm, đang làm hồ sơ khác thì vào Chờ bắt đầu.'],
     ['4', 'Cán bộ LS làm hồ sơ', 'Các phiên làm việc', 'Cộng dồn thành giờ xử lý hồ sơ.'],
     ['5', 'Cán bộ LS hẹn khách ký', 'Lịch hẹn ký', 'Dừng hạn và dừng giờ xử lý.'],
     ['6', 'Cán bộ LS bấm Hoàn thành', 'Giờ hoàn thành', 'Chốt hạn, giờ xử lý và các khoảng đo.']],
    fit(0.7, 2.4, 2.4, 4.3), size=9.5)
k.h2('Các khoảng đo giữa các mốc')
k.p('Tất cả tính bằng giờ làm việc của lịch chuẩn.', keep_next=True)
k.table(
    ['Khoảng', 'Từ', 'Đến', 'Trừ khoảng dừng tính hạn?', 'Xem ở đâu'],
    [['Phân công', 'Phòng / PGD gửi', 'Phân công lần đầu', 'Không', 'Sheet tháng (Thời gian hồ sơ)'],
     ['Tiếp nhận', 'Phân công lần đầu', 'LS tiếp nhận', 'Không', '“Nhận hồ sơ TB” ở Kết quả thực hiện'],
     ['Nhận → xong', 'LS tiếp nhận', 'Hoàn thành (hoặc hiện tại)', 'Không, gồm cả lúc chờ khách', '“Từ LS nhận đến hoàn thành” trong chi tiết hồ sơ'],
     ['Toàn trình', 'Phòng / PGD gửi', 'Hoàn thành (hoặc hiện tại)', 'Có', '“Toàn trình TB” ở Kết quả thực hiện'],
     ['SLA đã dùng', 'LS tiếp nhận', 'Hoàn thành (hoặc hiện tại)', 'Có', 'Sheet tháng, “SLA TB” ở báo cáo giờ']],
    fit(1.4, 1.7, 1.9, 1.9, 2.8), size=9.5)
k.callout('note', 'Phân công không chạy đồng hồ',
          'Hồ sơ vừa được giao mà LS chưa bấm Tiếp nhận hồ sơ thì chưa có hạn. Nếu hồ sơ phát sinh ở ngày làm việc trước mà đến đầu ngày làm việc kế tiếp LS vẫn chưa tiếp nhận, hệ thống tự trả hồ sơ về Phòng / PGD để chọn lại ngày gửi.')
k.p('Đổi **ngày phát sinh** (khi khách dời lịch) không đổi hạn, không đổi mốc nhận và không đổi các phiên đã làm. Nó chỉ đổi ngày hồ sơ được tính vào báo cáo và vào “Hồ sơ tồn”.', size=10.5)

# =============================================================== 4
k.h1('4. Hạn xử lý (SLA)')
k.h2('4.1 Cách tính hạn')
k.p('Mỗi loại việc có số giờ SLA, mặc định **8 giờ làm việc** (Quản trị chỉnh ở danh mục Loại việc). Hạn là thời điểm mà, kể từ lúc LS tiếp nhận, đã trôi qua đủ số giờ SLA, **chỉ đếm giờ làm việc**, cộng thêm số giờ làm việc đã nằm trong các lần dừng tính hạn.')
k.table(
    ['LS tiếp nhận lúc', 'Cách đếm (SLA 8 giờ = 480 phút)', 'Hạn'],
    [['Thứ Ba 09:00', 'Thứ Ba còn 420 phút (150 phút sáng + 270 phút chiều). Thiếu 60 phút nên sang thứ Tư 07:30 cộng 60 phút.', '**Thứ Tư 08:30**'],
     ['Thứ Sáu 16:00', 'Thứ Sáu còn 120 phút. Thứ Hai sáng 240 phút. Còn thiếu 120 phút, thứ Hai chiều 13:30 cộng 120 phút.', '**Thứ Hai 15:30**'],
     ['Thứ Bảy 09:00', 'Ngày nghỉ nên đếm từ thứ Hai 07:30: sáng 240 phút, chiều 240 phút.', '**Thứ Hai 17:30**']],
    fit(1.7, 5.2, 1.6))
k.h2('4.2 Khi nào hạn dừng')
k.p('Hạn dừng khi hồ sơ ở một trong các trạng thái chờ bên ngoài: **Tạm dừng**, **Đang hẹn khách ký**, **Chưa giao hồ sơ** (hồ sơ trả về Phòng / PGD để bổ sung hoặc chọn lại ngày). Khi hồ sơ quay lại xử lý, hạn được **lùi đúng số phút giờ làm việc đã chờ**.')
k.figure(fig('hinh-3-han-sla.png'), 'Hạn lùi khi hồ sơ dừng tính hạn',
         'Hai dòng thứ Ba và thứ Tư: nhận 09:00 thứ Ba, đang hẹn khách từ 14:00 đến 09:00 thứ Tư, hạn lùi tới 16:00 thứ Tư')
k.table(
    ['Trạng thái hồ sơ', 'Hạn xử lý', 'Giờ xử lý của cán bộ'],
    [['Đã phân công, chưa tiếp nhận', 'Chưa có hạn', 'Không chạy'],
     ['Đã tiếp nhận hồ sơ, đang ở **Đang làm**', 'Chạy', '**Chạy**'],
     ['Đã tiếp nhận hồ sơ, ở **Chờ bắt đầu** hoặc **Chờ làm tiếp**', 'Chạy', 'Không chạy'],
     ['Tạm dừng', 'Dừng', 'Dừng'],
     ['Đang hẹn khách ký', 'Dừng', 'Dừng'],
     ['Chưa giao hồ sơ (trả về Phòng / PGD)', 'Dừng', 'Dừng'],
     ['Đổi người xử lý sau khi đã tiếp nhận', 'Chạy tiếp, mốc nhận giữ nguyên', 'Không chạy tới khi người mới bấm làm'],
     ['Hoàn thành, Đã hủy', 'Kết thúc', 'Kết thúc']],
    fit(4, 2.2, 2.6), size=9.5)
k.callout('warn', 'Tạm dừng toàn bộ không dừng hạn',
          'Nút **Tạm dừng toàn bộ** chỉ dừng đồng hồ giờ xử lý của cán bộ để ghi việc ngoài hồ sơ. Hạn của hồ sơ vẫn chạy. Muốn dừng hạn vì chờ khách, dùng **Tạm dừng** của hồ sơ hoặc **Hẹn khách ký**.')
k.h2('4.3 Đổi hạn')
k.p('Hồ sơ đã được LS tiếp nhận có thể đổi hạn. Người đổi là cán bộ LS đang giữ hồ sơ, hoặc cán bộ Phòng / PGD đã tạo đề nghị đó. Chọn **ngày hạn mới**, hệ thống giữ nguyên giờ trong hạn hiện tại; bắt buộc ghi lý do. Hạn đổi tay được giữ nguyên, hệ thống không tự tính lại.')
k.h2('4.4 Những việc không đổi hạn')
k.bullets([
    'Đổi người xử lý. Đồng hồ SLA thuộc về hồ sơ; mốc nhận đủ giữ nguyên.',
    'Đổi ngày phát sinh (khách dời lịch).',
    'Tạm dừng toàn bộ và Ghi việc khác.',
    'Mở lại hồ sơ đã hoàn thành: hệ thống giữ SLA toàn trình và lịch sử các phiên.',
    'Giờ làm thêm ngoài giờ: hạn, “Nhận → xong” và toàn trình vẫn tính theo lịch.',
])

# =============================================================== 5
k.h1('5. Giờ xử lý hồ sơ')
k.p('Giờ xử lý cho biết cán bộ **thực sự làm** hồ sơ bao nhiêu phút. Nó không phải khoảng từ lúc nhận đến lúc xong: lúc chờ khách, chờ làm tiếp hay ngoài giờ không nằm trong đó.')
k.h2('5.1 Ba trạng thái làm việc')
k.table(
    ['Trạng thái', 'Nghĩa', 'Vào bằng', 'Ra bằng'],
    [['**Chờ bắt đầu**', 'Đã tiếp nhận nhưng chưa làm', 'Tiếp nhận khi đang làm hồ sơ khác; Tiếp nhận tất cả (hồ sơ thứ hai trở đi)', 'Làm ngay'],
     ['**Đang làm**', 'Đồng hồ giờ xử lý chạy', 'Làm ngay, Làm tiếp, Tiếp nhận khi chưa làm hồ sơ nào, hoặc Kết thúc tạm dừng toàn bộ', 'Chuyển sang hồ sơ khác, Tạm dừng toàn bộ, Tạm dừng, Hẹn khách ký, Hoàn thành'],
     ['**Chờ làm tiếp**', 'Đã từng làm, đang bị dừng', 'Bị chuyển sang hồ sơ khác hoặc Tạm dừng toàn bộ', 'Làm tiếp']],
    fit(1.5, 2, 3, 3), size=9.5)
k.h2('5.2 Mỗi lúc chỉ một hồ sơ đang làm')
k.p('Khi bạn bấm **Làm ngay** ở hồ sơ B trong lúc đang làm hồ sơ A, hệ thống đổi cả hai trong cùng một giây: A sang **Chờ làm tiếp**, B sang **Đang làm**. Vì vậy không có khoảng hở và không có khoảng trùng giữa hai hồ sơ. Khi đang trong một lượt Tạm dừng toàn bộ, hệ thống không cho bắt đầu hồ sơ; hãy kết thúc tạm dừng trước.')
k.h2('5.3 Phiên và công thức')
k.p('Mỗi lần hồ sơ chạy từ Đang làm đến lúc dừng tạo ra một **phiên**: người làm, giờ bắt đầu, giờ kết thúc. Một hồ sơ có thể có nhiều phiên và nhiều người.')
k.p('**Giờ xử lý hồ sơ = tổng phần nằm trong giờ làm việc của mọi phiên**, cộng phần làm thêm nếu phiên đủ điều kiện (mục 7).', after=4)
k.table(
    ['Ví dụ (lịch chuẩn)', 'Cách tính', 'Giờ xử lý'],
    [['Một phiên 10:00 – 15:00', '10:00 – 11:30 là 90 phút, 13:30 – 15:00 là 90 phút; nghỉ trưa 120 phút bị loại', '**3 giờ**'],
     ['Hai phiên 09:00 – 09:30 (LS1) và 10:00 – 10:20 (LS2)', 'Cả hồ sơ cộng hai phiên', '**50 phút** (LS1: 30, LS2: 20)'],
     ['Phiên 16:00 hôm trước đến 08:00 hôm sau, không đóng giữa chừng', '120 phút chiều hôm trước + 30 phút sáng hôm sau. Đêm không tính', '**2 giờ 30 phút**']],
    fit(3, 4.4, 1.6), size=9.5)
k.h2('5.4 Điều gì đóng một phiên')
k.table(
    ['Thao tác', 'Phiên', 'Hạn xử lý'],
    [['Làm ngay một hồ sơ khác', 'Đóng, hồ sơ cũ sang Chờ làm tiếp', 'Không đổi'],
     ['Tạm dừng toàn bộ', 'Đóng, hồ sơ sang Chờ làm tiếp', 'Không đổi'],
     ['Tạm dừng hồ sơ', 'Đóng', 'Dừng'],
     ['Hẹn khách ký', 'Đóng', 'Dừng'],
     ['Hoàn thành', 'Đóng đúng giờ hoàn thành', 'Kết thúc'],
     ['Đổi người xử lý', 'Đóng, người mới tính từ lúc họ bắt đầu', 'Không đổi']],
    fit(3.2, 3.6, 2.2), size=9.5)
k.h2('5.5 Số hiện ở đâu')
k.bullets([
    'Bảng **Việc được giao**: cột **Giờ xử lý KH** của từng hồ sơ.',
    'Chi tiết hồ sơ: **Giờ xử lý (trừ tạm dừng, chờ khách)** và **Từ LS nhận đến hoàn thành**.',
    'Hồ sơ đang làm: con số cập nhật mỗi giây nhưng chỉ đổi khi sang phút mới.',
])
k.p('Hai cán bộ không bao giờ “cùng làm một giờ” theo nghĩa cộng đôi: giờ của **một người** trên nhiều hồ sơ được gộp trùng ở mức Giờ cán bộ đã dùng (mục 8).', size=10.5)

# =============================================================== 6
k.h1('6. Tạm dừng toàn bộ và Ghi việc khác')
k.p('Không phải việc nào cũng là hồ sơ. Hai nút ở đầu màn hình của cán bộ LS ghi nhận phần việc còn lại: **Tạm dừng toàn bộ** ghi **giờ**, **Ghi việc khác** ghi **số lượng**. Hai nút liên thông với nhau.')
k.h2('6.1 Tạm dừng toàn bộ')
k.p('Bấm **Tạm dừng toàn bộ**, chọn một trong ba loại: **Hoàn thiện hồ sơ QTTD/TSBĐ**, **Báo cáo**, **Khác**. Hồ sơ đang làm chuyển sang Chờ làm tiếp, đồng hồ giờ xử lý của hồ sơ dừng, hạn của hồ sơ **vẫn chạy**. Khi bấm **Kết thúc tạm dừng**, hệ thống hiện bảng việc khác để bạn ghi những gì đã làm trong lượt, rồi đưa hồ sơ đang làm trước đó trở lại Đang làm.')
k.table(
    ['Loại lượt', 'Tính vào Giờ cán bộ đã dùng?'],
    [['Hoàn thiện hồ sơ QTTD/TSBĐ', 'Có, toàn bộ lượt'],
     ['Báo cáo', 'Có, toàn bộ lượt'],
     ['Khác', 'Chỉ khi bạn ghi ít nhất một việc khác có số phút gắn vào lượt. Không ghi việc nào thì chỉ là thời gian dừng, không tính vào giờ']],
    fit(3.2, 5.8), size=10)
k.h2('6.2 Sáu việc khác và đơn vị số lượng')
k.table(
    ['Việc', 'Đơn vị', 'Ghi chú'],
    [['Họp đầu ngày', 'lần', 'Cố định 15 phút mỗi lần'],
     ['Xem văn bản', 'văn bản', ''],
     ['Sắp xếp kho hồ sơ', 'hồ sơ', ''],
     ['Scan hoàn thiện hồ sơ', 'hồ sơ', ''],
     ['Định giá lại TSBĐ', 'tài sản', ''],
     ['Xuất kho, thu nợ cầm cố', 'khoản', '']],
    fit(3.4, 1.6, 4), size=10)
k.p('Hộp thoại luôn hiện đủ sáu dòng; mỗi dòng một ô số lượng từ 0 đến 999. Để trống hoặc 0 là không làm việc đó.', size=10.5)
k.h2('6.3 Chia phút của lượt tạm dừng cho các việc')
k.p('Khi kết thúc tạm dừng, số phút giờ làm việc của lượt được chia cho các việc đã ghi theo bốn quy tắc, theo thứ tự:', keep_next=True)
k.bullets([
    '**Họp đầu ngày** lấy 15 phút mỗi lần, nhưng không vượt quá số phút của lượt.',
    'Phần còn lại **chia đều cho từng loại việc** có ghi, không chia theo số lượng.',
    'Trong cùng một loại, chia theo tỉ lệ số lượng.',
    'Phút lẻ dồn về loại đứng trước trong danh sách ở mục 6.2.',
])
k.table(
    ['Lượt tạm dừng', 'Việc đã ghi', 'Kết quả chia'],
    [['60 phút', 'Họp ×1, Xem văn bản ×5, Scan ×2', 'Họp 15 · Xem văn bản 23 · Scan 22 (cộng đủ 60)'],
     ['10 phút', 'Họp ×1, Xem văn bản ×5, Scan ×2', 'Họp 10 · Xem văn bản 0 · Scan 0 (họp lấy hết)'],
     ['120 phút', 'Họp ×2, Xem văn bản ×2, Sắp xếp ×6, Định giá ×2', 'Họp 30 · Xem văn bản 30 · Sắp xếp 30 · Định giá 30'],
     ['60 phút', 'Chỉ Họp ×1', 'Họp 15 (45 phút còn lại không gán cho việc nào)']],
    fit(1.6, 3.6, 3.8), size=9.5)
k.callout('note', 'Số phút lấy theo giờ làm việc',
          'Lượt tạm dừng được tính như mọi khoảng khác: nghỉ trưa không tính; lượt kéo qua đêm không có phần làm thêm. Lượt đóng trong cùng ngày mà kéo ra ngoài giờ thì phần làm thêm được cộng vào số phút đem chia (mục 7).')
k.h2('6.4 Ghi việc khác ngoài lượt tạm dừng')
k.p('Nút **Ghi việc khác** dùng được lúc nào cũng được. Nếu bạn không đang tạm dừng, lượt ghi chỉ có **số lượng và 0 phút**, không dừng đồng hồ hồ sơ. Số lượng cộng vào dòng **Khác** của bảng Kết quả thực hiện; bấm mũi tên cạnh chữ Khác để xem từng loại. Bạn hủy được lượt do chính mình ghi **trong ngày hôm nay**; giờ của lượt bị hủy không được chia lại cho các việc còn lại.')

# =============================================================== 7
k.h1('7. Làm thêm ngoài giờ')
k.p('Nếu bạn vẫn làm hoặc bấm **Hoàn thành** sau giờ đóng cửa, phần thời gian ngoài lịch cũng được ghi cho chính bạn. Điều kiện là phiên (hoặc lượt Tạm dừng toàn bộ) **đã đóng trong cùng một ngày**.')
k.h2('7.1 Quy tắc')
k.bullets([
    '**Được tính:** phần trước giờ mở cửa và sau giờ đóng cửa của ngày làm việc; cả phiên nếu rơi vào ngày nghỉ hoặc ngày lễ.',
    '**Không tính:** nghỉ trưa; phiên còn mở (chưa đóng); phiên kéo qua nửa đêm (thường là do quên tạm dừng).',
    '**Giới hạn:** tối đa 4 giờ ngoài lịch cho mỗi phiên hoặc mỗi lượt tạm dừng, lấy từ đầu khoảng ngoài giờ.',
    '**Không đổi:** hạn xử lý, “Nhận → xong” và toàn trình vẫn tính theo lịch.',
])
k.h2('7.2 Ví dụ')
k.table(
    ['Tình huống (lịch chuẩn)', 'Giờ xử lý', 'Trong đó làm thêm'],
    [['Làm 17:30 – 18:45, bấm Hoàn thành lúc 18:45', '**1 giờ 15 phút**', '45 phút (18:00 – 18:45)'],
     ['Làm 06:50 – 08:00 rồi hoàn thành', '**1 giờ 10 phút**', '40 phút (06:50 – 07:30)'],
     ['Làm 18:00 – 23:30 rồi hoàn thành', '**4 giờ**', '4 giờ (đạt giới hạn)'],
     ['Làm thứ Bảy 09:00 – 10:00 rồi hoàn thành', '**1 giờ**', '60 phút (ngày nghỉ)'],
     ['Làm 10:00 – 15:00', '**3 giờ**', '0 (nghỉ trưa 120 phút không tính)'],
     ['Mở phiên 16:00, quên đóng, hôm sau 08:00 mới Hoàn thành', '**150 phút**', '0 (phiên qua đêm: chỉ phần trong lịch)'],
     ['Thứ Sáu 17:00 đến thứ Hai 08:00 không đóng', '**1 giờ 30 phút**', '0 (phiên qua nhiều ngày)'],
     ['Đang làm từ 17:00, lúc 21:00 vẫn chưa đóng', '**1 giờ**', '0 (chưa đóng nên chưa tính ngoài giờ)']],
    fit(4.6, 1.6, 2.8), size=9.5)
k.p('Với phiên 17:30 – 18:45 ở dòng đầu, khoảng “Nhận → xong” của hồ sơ chỉ là 30 phút (phần trong lịch), còn giờ xử lý là 1 giờ 15 phút. Hai con số trả lời hai câu hỏi khác nhau (mục 1).', size=10.5)
k.h2('7.3 Hiện ở đâu')
k.bullets([
    'Giờ xử lý của hồ sơ, cột **Giờ tôi làm** trong Báo cáo việc đã hoàn thành.',
    '**Giờ làm hôm nay** và biểu đồ Giờ làm 7 ngày ở Dashboard cá nhân.',
    'Chỉ số **Làm thêm ngoài giờ** trong báo cáo giờ (chỉ hiện khi lớn hơn 0) và dòng “Giờ làm thêm ngoài giờ” trong file Excel.',
])
k.callout('tip', 'Cách để giờ làm thêm được ghi',
          'Trước khi rời vị trí, hãy bấm Hoàn thành, Tạm dừng, Hẹn khách ký hoặc Tạm dừng toàn bộ. Phiên bỏ mở qua đêm chỉ ghi phần trong lịch.')

# =============================================================== 8
k.h1('8. Giờ cán bộ đã dùng trong ngày')
k.h2('8.1 Công thức')
k.p('**Giờ cán bộ đã dùng** là tổng thời gian của một người trong ngày, gồm:', keep_next=True)
k.bullets([
    'mọi phiên làm hồ sơ (phần trong lịch và phần làm thêm đủ điều kiện);',
    'các lượt Tạm dừng toàn bộ được tính (Hoàn thiện QTTD/TSBĐ, Báo cáo, và Khác có việc gắn vào).',
])
k.p('Hai khoảng chồng nhau chỉ được tính **một lần**. Đây là con số hiện ở “Giờ làm hôm nay” và “Giờ tôi đã dùng”.')
k.h2('8.2 Một ngày mẫu')
k.figure(fig('hinh-2-ngay-mau.png'), 'Một ngày mẫu của một cán bộ',
         'Bốn dòng: hồ sơ A, hồ sơ B, lượt tạm dừng Báo cáo và tổng giờ cán bộ đã dùng, kèm phần làm thêm màu vàng sau 18:00')
k.table(
    ['Khoản', 'Phút', 'Ghi chú'],
    [['Hồ sơ A: 07:45 – 09:15 và 13:30 – 15:00', '180', '90 + 90'],
     ['Hồ sơ B: 09:15 – 11:30 và 16:00 – 18:40', '295', '135 + 120 trong lịch + 40 làm thêm'],
     ['**Giờ xử lý hồ sơ (A + B)**', '**475**', 'Trong đó 40 phút làm thêm'],
     ['Tạm dừng toàn bộ · Báo cáo 15:00 – 16:00', '60', 'Luôn được tính'],
     ['**Giờ cán bộ đã dùng**', '**535**', 'Các khoảng nối liền nhau nên không có phần trùng'],
     ['Một ngày làm việc theo lịch', '510', 'Để so sánh']],
    fit(4.4, 1.0, 3.6), size=10, align=['l', 'r', 'l'])
k.h2('8.3 Vì sao con số có thể thấp hơn 510 phút')
k.p('Hệ thống chỉ ghi thời gian **khi có phiên hoặc lượt đang chạy**. Những khoảng sau không có phiên nên không được tính:', keep_next=True)
k.bullets([
    'Lúc giữa hai hồ sơ mà chưa bấm Làm ngay hoặc Làm tiếp.',
    'Hồ sơ đang Chờ bắt đầu hoặc Chờ làm tiếp.',
    'Hồ sơ đang Tạm dừng hoặc Đang hẹn khách ký (chờ khách).',
    'Việc làm ngoài hệ thống: họp, gọi điện, scan, sắp xếp kho… nếu không ghi qua Tạm dừng toàn bộ hoặc Ghi việc khác.',
    'Nghỉ trưa.',
])
k.callout('tip', 'Để số ghi nhận sát với thực tế',
          'Luôn để một hồ sơ ở Đang làm khi bạn làm hồ sơ. Việc ngoài hồ sơ thì dùng Tạm dừng toàn bộ và ghi việc đã làm khi kết thúc. Đóng phiên trước khi rời vị trí.')

# =============================================================== 9
k.h1('9. Xem số liệu ở đâu')
k.table(
    ['Vai trò', 'Màn hình', 'Số liệu'],
    [['**Cán bộ LS**', 'Việc được giao', 'Cột Giờ xử lý KH; trạng thái Đang làm / Chờ bắt đầu / Chờ làm tiếp; cảnh báo “N việc đã quá hạn xử lý” và dòng quá hạn hoặc sắp hết hạn được tô màu'],
     ['', 'Chi tiết hồ sơ', 'Giờ xử lý (trừ tạm dừng, chờ khách); Từ LS nhận đến hoàn thành'],
     ['', 'Dashboard cá nhân', 'Giờ làm hôm nay; Giờ làm 7 ngày; Giờ tôi làm cho từng hồ sơ hoàn thành; bảng Kết quả thực hiện của riêng bạn'],
     ['', 'Thời gian của tôi', 'Giờ tôi đã dùng; Giờ xử lý hồ sơ; Làm thêm ngoài giờ; Việc khác theo loại (số lượng và phút); bảng theo ngày; Tải Excel; Rà soát mốc thời gian'],
     ['**Kiểm soát, Quản lý LS**', 'Quản lý hồ sơ', 'Cột Hạn xử lý với Còn / Quá / Dừng tính hạn; tab Quá hạn; tab Hoàn thành hiện Giờ xử lý KH'],
     ['', 'Báo cáo → Thời gian & SLA', 'Giờ theo ngày, cán bộ, nghiệp vụ; lọc theo cán bộ hoặc nghiệp vụ; Rà soát mốc thời gian'],
     ['', 'Kết quả thực hiện', 'Nhận hồ sơ TB, Toàn trình TB, TB xử lý / hồ sơ, tỉ lệ đúng hạn theo từng cán bộ'],
     ['**Quản trị, Giám sát**', 'Thời gian & SLA', 'Như trên nhưng không hiện tên sản phẩm hay thông tin khách'],
     ['**Phòng / PGD**', 'Toàn bộ hồ sơ của phòng', 'Cột Hạn xử lý với Còn / Quá / Dừng tính hạn'],
     ['', 'Đề nghị & hồ sơ đã gửi', 'Ngày phát sinh và trạng thái. Không có số giờ xử lý']],
    fit(1.7, 2.2, 5.1), size=9.5)
k.h2('Các chỉ số trung bình trên Kết quả thực hiện')
k.bullets([
    '**TB xử lý / hồ sơ:** trung bình giờ xử lý của các hồ sơ đã hoàn thành trong kỳ. Hồ sơ **0 phút** (chưa đo được) không đưa vào trung bình.',
    '**Nhận hồ sơ TB** (cột TB nhận): trung bình khoảng Tiếp nhận (mục 3).',
    '**Toàn trình TB** (cột TB toàn trình): trung bình khoảng Toàn trình (mục 3).',
    '**Đúng hạn:** hồ sơ hoàn thành không muộn hơn hạn, chia cho số hồ sơ hoàn thành.',
])
k.h2('File Excel và Sheet tháng')
k.p('File **Tải Excel** của báo cáo giờ giữ đơn vị **giờ dạng số thập phân** (1,25 giờ là 75 phút). Sheet tháng của kỳ có bốn bảng: **Thời gian hồ sơ** (một dòng mỗi hồ sơ), **Phiên xử lý** (từng phiên), **Thời gian theo ngày**, **Tổng hợp thời gian**. Bảng Phiên xử lý cộng cả phần làm thêm của phiên đã đóng trong ngày.')

# =============================================================== 10
k.h1('10. Sửa và rà soát thời gian')
k.h2('10.1 Sửa giờ nhận đủ và giờ hoàn thành')
k.p('Nút **Ghi / sửa giờ LS nhận đủ** trong chi tiết hồ sơ mở hộp thoại **Sửa thời gian hồ sơ**. Người dùng được: cán bộ đang giữ hồ sơ, Kiểm soát LS, Quản lý LS. Bắt buộc ghi lý do; thao tác được lưu vào nhật ký.')
k.bullets([
    'Giờ nhận hồ sơ phải trước các phiên đã ghi nhận và không ở tương lai.',
    'Giờ hoàn thành (chỉ với hồ sơ đã xong) phải sau giờ nhận.',
    'Một người không được tính hai lần cùng một lúc: khi sửa, phần phiên trùng với hồ sơ khác của cùng người đó bị cắt bớt.',
    'Sau khi sửa, nguồn mốc của hồ sơ ghi là đã sửa.',
])
k.h2('10.2 Rà soát mốc thời gian')
k.p('Nút **Rà soát mốc thời gian** (trong báo cáo giờ) liệt kê hồ sơ có vấn đề: thiếu giờ nhận hồ sơ, thiếu giờ hoàn thành, chưa rõ người xử lý, mốc chưa hợp lệ. Mỗi dòng có gợi ý lấy từ nhật ký và nút **Xác nhận mốc** hoặc **Người xử lý phiên cũ**. Dữ liệu cũ chưa biết ai làm thì hệ thống để trống chứ không đoán.')
k.h2('10.3 Cảnh báo “Dữ liệu cần xác nhận”')
k.p('Báo cáo giờ có thể hiện dòng cảnh báo: số hồ sơ thiếu giờ nhận, số phiên chưa rõ người xử lý, hoặc nhật ký tác nghiệp khác vượt giới hạn quét. Số của kỳ đó vẫn hiện nhưng cần được xác nhận trước khi dùng để đánh giá.')

# =============================================================== 11
k.h1('11. Câu hỏi thường gặp')
faq = [
    ('Tôi làm cả ngày mà “Giờ làm hôm nay” thấp hơn nhiều?',
     'Hệ thống chỉ cộng khi có phiên hoặc lượt đang chạy. Xem mục 8.3: lúc giữa hai hồ sơ, hồ sơ chờ làm tiếp, chờ khách, hoặc việc ngoài hệ thống chưa ghi đều không có phiên.'),
    ('Giờ xử lý của hồ sơ hiện “—” hay “0 phút” nghĩa là gì?',
     '“—” là chưa đo được vì chưa có phiên nào. “0 phút” là có phiên nhưng phần tính được bằng không: phiên rơi vào nghỉ trưa, hoặc làm ngoài giờ mà chưa đóng trong ngày.'),
    ('Tôi hoàn thành hồ sơ lúc 19:00, giờ làm thêm có được tính không?',
     'Có, nếu phiên bắt đầu và đóng trong cùng ngày. Từ 18:00 đến 19:00 là 60 phút (1 giờ) làm thêm. Hạn và khoảng “Nhận → xong” không đổi.'),
    ('Tôi quên đóng phiên, sáng hôm sau mới bấm Hoàn thành?',
     'Phần đêm không được tính. Chỉ phần trong lịch của chiều hôm trước và sáng hôm sau được cộng (ví dụ 16:00 → 08:00 là 150 phút).'),
    ('Tạm dừng toàn bộ có làm hạn xử lý dừng không?',
     'Không. Hạn vẫn chạy. Muốn dừng hạn vì chờ khách, dùng Tạm dừng hồ sơ hoặc Hẹn khách ký.'),
    ('Hẹn khách ký có tính giờ xử lý không?',
     'Không. Trong lúc Đang hẹn khách ký, cả hạn lẫn giờ xử lý đều dừng.'),
    ('Họp đầu ngày chỉ kéo dài 10 phút nhưng tôi ghi một cuộc họp?',
     'Lượt chỉ có 10 phút nên Họp nhận 10 phút. Họp lấy tối đa 15 phút mỗi lần và không vượt số phút của lượt.'),
    ('Ghi việc khác ngoài lúc tạm dừng có tính giờ không?',
     'Không. Chỉ ghi số lượng vào bảng Kết quả thực hiện; số phút là 0.'),
    ('Tạm dừng toàn bộ loại Khác mà tôi không ghi việc nào?',
     'Lượt đó chỉ là thời gian dừng, không cộng vào Giờ cán bộ đã dùng.'),
    ('Làm thứ Bảy hoặc ngày lễ có được tính không?',
     'Có, nếu phiên mở và đóng trong cùng ngày nghỉ. Cả phiên được tính là làm thêm, tối đa 4 giờ.'),
    ('Phòng đổi ngày phát sinh thì hạn đổi theo không?',
     'Không. Hạn tính từ lúc LS tiếp nhận. Ngày phát sinh chỉ đổi ngày hồ sơ được tính vào báo cáo và “Hồ sơ tồn”.'),
    ('Hồ sơ nhận chiều thứ Sáu, hạn là bao giờ?',
     'Hạn đếm bằng giờ làm việc nên qua cuối tuần. Nhận thứ Sáu 16:00, SLA 8 giờ thì hạn là thứ Hai 15:30.'),
    ('Có thể có hai hồ sơ cùng chạy giờ xử lý không?',
     'Không, mỗi cán bộ chỉ có một hồ sơ Đang làm. Nếu dữ liệu cũ có phiên chồng nhau, Giờ cán bộ đã dùng chỉ tính phần chồng một lần.'),
    ('Quản trị đổi lịch làm việc thì số cũ có đổi?',
     'Báo cáo giờ tính theo lịch hiện hành mỗi lần xem nên số có thể đổi. Hạn của một hồ sơ được tính lại ở lần đổi trạng thái kế tiếp.'),
    ('Số trong file Excel khác số trên màn hình?',
     'Excel giữ đơn vị giờ dạng thập phân (1,25 giờ là 75 phút), và Sheet tháng chỉ tính trong khoảng ngày của kỳ.'),
]
for q, a in faq:
    h = k.h3(q)
    k.p(a)

# =============================================================== phụ lục
k.h1('Phụ lục A. Thuật ngữ')
k.table(
    ['Thuật ngữ', 'Nghĩa'],
    [['Giờ làm việc', 'Khoảng thời gian trong lịch chuẩn: ngày làm việc, trừ nghỉ trưa và ngày lễ.'],
     ['Mốc nhận hồ sơ đủ', 'Lúc cán bộ LS bấm Tiếp nhận hồ sơ. SLA bắt đầu từ mốc này.'],
     ['SLA, hạn xử lý', 'Số giờ làm việc cho phép của loại việc, đổi ra một thời điểm hạn cụ thể.'],
     ['Dừng tính hạn', 'Hồ sơ ở trạng thái chờ bên ngoài, hạn đứng yên rồi lùi khi hồ sơ quay lại.'],
     ['Phiên', 'Một lần cán bộ làm hồ sơ liên tục, từ Đang làm đến lúc dừng.'],
     ['Đang làm, Chờ bắt đầu, Chờ làm tiếp', 'Ba trạng thái làm việc của hồ sơ đã tiếp nhận.'],
     ['Lượt tạm dừng toàn bộ', 'Khoảng từ lúc bấm Tạm dừng toàn bộ đến Kết thúc tạm dừng.'],
     ['Việc khác', 'Sáu loại việc ngoài hồ sơ, ghi kèm số lượng.'],
     ['Làm thêm ngoài giờ', 'Phần phiên hoặc lượt đã đóng trong ngày nằm ngoài lịch chuẩn.'],
     ['Giờ cán bộ đã dùng', 'Tổng thời gian một người trong ngày, mỗi khoảng chỉ tính một lần.'],
     ['Hồ sơ tồn', 'Hồ sơ LS đã nhận, còn mở, phần hợp đồng chưa soạn xong; tính theo ngày phát sinh không muộn hơn ngày xem.']],
    fit(2.8, 6.2), size=10)

k.h1('Phụ lục B. Tham số cấu hình', page_break=False)
k.table(
    ['Tham số', 'Giá trị chuẩn', 'Ai đổi, ở đâu'],
    [['Ngày làm việc', 'Thứ Hai – thứ Sáu', 'Quản trị, Lịch làm việc'],
     ['Giờ mở cửa, đóng cửa', '07:30 và 18:00', 'Quản trị, Lịch làm việc'],
     ['Nghỉ trưa', '11:30 – 13:30', 'Quản trị, Lịch làm việc'],
     ['Ngày lễ', 'Theo danh sách khai báo', 'Quản trị, Lịch làm việc'],
     ['SLA của từng loại việc', '8 giờ làm việc', 'Quản trị, Loại việc'],
     ['Giới hạn làm thêm', '4 giờ mỗi phiên hoặc lượt', 'Cố định trong hệ thống'],
     ['Họp đầu ngày', '15 phút mỗi lần', 'Cố định trong hệ thống'],
     ['Số lượng tối đa mỗi việc khác', '999', 'Cố định trong hệ thống'],
     ['Tự trả hồ sơ chưa tiếp nhận', 'Đầu ngày làm việc kế tiếp', 'Hệ thống']],
    fit(3.2, 2.8, 3), size=10)

k.h1('Phụ lục C. Công thức tóm tắt', page_break=False)
k.table(
    ['Đại lượng', 'Công thức'],
    [['Hạn xử lý', 'Mốc LS tiếp nhận + (số giờ SLA + số giờ làm việc đã dừng tính hạn), đếm theo lịch làm việc'],
     ['Giờ xử lý hồ sơ', 'Tổng các phiên: phần trong lịch + phần làm thêm nếu phiên đã đóng trong cùng ngày (tối đa 4 giờ)'],
     ['Giờ cán bộ đã dùng trong ngày', 'Hợp các phiên và các lượt tạm dừng được tính, mỗi khoảng một lần'],
     ['Phút chia cho việc khác', 'Họp = min(15 × số lần, số phút của lượt); phần còn lại chia đều theo loại, trong loại theo số lượng, phút lẻ về loại đứng trước'],
     ['Nhận → xong', 'Giờ làm việc từ LS tiếp nhận đến hoàn thành, không trừ khoảng dừng'],
     ['Toàn trình', 'Giờ làm việc từ Phòng / PGD gửi đến hoàn thành, trừ các khoảng dừng tính hạn']],
    fit(2.6, 6.4), size=10)

k.save(OUT)
print('saved', OUT)
