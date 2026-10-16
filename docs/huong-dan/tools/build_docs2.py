"""Cập nhật bộ hướng dẫn LS-Routing lên bản 07/10/2026 (GAS v116).

    py docs/huong-dan/tools/build_docs2.py

- Nguồn: docs/huong-dan/ban-cu-01-10-2026/HUONG_DAN_SU_DUNG_LS_ROUTING.docx (bản 01/10/2026 đã dựng bằng build_docs.py).
- Ảnh: docs/huong-dan/anh/*.png (do tools/capture.py chụp lại trên bản demo 07/10/2026).
- Ra: HUONG_DAN_SU_DUNG_LS_ROUTING.docx cạnh thư mục `tools`; sau đó chạy build_html.py và build_pptx2.py.

Cách sửa: tìm khối theo chữ đầu (không theo số thứ tự cố định) rồi thay đoạn, bước hoặc bảng; khối không đụng tới giữ nguyên
XML gốc nên định dạng không đổi. Ảnh luôn được thay bằng bản chụp mới theo tên.
"""
import copy
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_docs as bd  # noqa: E402
import guide_model as gm  # noqa: E402
from guide_model import NS, text_of  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
bd.SRC = os.path.join(ROOT, 'ban-cu-01-10-2026', 'HUONG_DAN_SU_DUNG_LS_ROUTING.docx')
bd.VERSION_DATE = '07/10/2026'


class Doc:
    """Truy cập khối theo chữ đầu, thay khối bằng đoạn mới."""

    def __init__(self, blocks):
        self.blocks = blocks

    def text(self, b):
        if b.kind in ('p', 'li'):
            return ''.join(r[0] for r in b.runs)
        if b.kind in ('h1', 'h2', 'h3'):
            return b.text
        if b.kind == 'fig':
            return b.name
        return ''

    def find(self, kind, prefix, after=0, before=None):
        end = len(self.blocks) if before is None else before
        for i in range(after, end):
            b = self.blocks[i]
            if b.kind == kind and self.text(b).startswith(prefix):
                return i
        raise KeyError('%s %r' % (kind, prefix))

    def span(self, h2_prefix, until_prefix=None, after=0):
        """Chỉ số từ tiêu đề bước đến hết khối cuối của bước (trước h2/h1/h3 kế tiếp)."""
        start = self.find('h2', h2_prefix, after)
        end = start + 1
        while end < len(self.blocks) and self.blocks[end].kind not in ('h1', 'h2', 'h3'):
            end += 1
        end -= 1
        # Lưu ý, dòng trống và ngắt trang cuối bước không thuộc nội dung bước nên giữ nguyên.
        while end > start and self.blocks[end].kind in ('note', 'empty', 'pagebreak'):
            end -= 1
        return start, end


def build():
    z, root, body, blocks = gm.parse(bd.SRC)
    D = Doc(blocks)

    # Hộp mẫu theo loại khối (không dựa số thứ tự cố định)
    first_p = D.find('p', 'Mở đường dẫn hệ thống')
    first_li = D.find('li', 'Tạo việc mới cho khách hàng')
    first_h2 = D.find('h2', 'Bước 1. Đăng nhập')
    first_fig = D.find('fig', '00-man-hinh-dang-nhap')
    F = bd.Factory.__new__(bd.Factory)
    F.blocks = blocks
    by = lambda i: copy.deepcopy(blocks[i].xml)
    F.p_proto = by(first_p)
    F.li_proto = by(first_li)
    F.h2_proto = by(first_h2)
    F.fig_proto = blocks[first_fig]
    F.fig_nolegend_proto = blocks[D.find('fig', 'pgd-09-toan-bo-phong')]
    F.run_n = copy.deepcopy(F.p_proto.find('w:r', NS))
    F.run_b = copy.deepcopy(F.run_n)
    from lxml import etree
    from guide_model import q
    rpr = F.run_b.find('w:rPr', NS)
    fonts = rpr.find('w:rFonts', NS)
    for tag in ('w:bCs', 'w:b'):
        fonts.addnext(etree.Element(q(tag)))
    legend = F.fig_proto.legend_xml
    F.leg_num = copy.deepcopy(legend.findall('w:r', NS)[0])
    F.leg_txt = copy.deepcopy(legend.findall('w:r', NS)[1])
    F.next_docpr = 1 + max(int(d.get('id')) for d in blocks[0].xml.getroottree().getroot().iter(q('wp:docPr')))
    F.new_media = []

    keep = {b.name: b for b in blocks if b.kind == 'fig'}
    fig = lambda name, title, legend=None, alt=None: F.fig(name, title, legend, alt, existing=keep.get(name))
    P = F.para
    LI = F.li
    H2 = F.h2

    def replace(i, j, new):
        bd.replace_range(blocks, i, j, new)

    def replace_block(prefix, kind, new, after=0):
        i = D.find(kind, prefix, after)
        replace(i, i, new if isinstance(new, list) else [new])
        return i

    def set_cells(table_block, edits):
        for (r, c), text in edits.items():
            gm.set_cell_text(table_block.xml, r, c, text)

    def table_after(prefix_of_first_cell, nth=0):
        n = 0
        for b in blocks:
            if b.kind == 'table' and b.rows and b.rows[0] and b.rows[0][0]:
                head = ''.join(r[0] for r in b.rows[0][0][0])
                if head == prefix_of_first_cell:
                    if n == nth:
                        return b
                    n += 1
        raise KeyError(prefix_of_first_cell)

    # ================================================================ Bìa và Phần 1
    bd.set_runs_text(blocks[D.find('p', 'Phiên bản')].xml, 'Phiên bản ' + bd.VERSION_DATE)

    replace_block('Sau khi Phòng/PGD tạo việc', 'p', P(
        'Sau khi Phòng/PGD tạo việc, hồ sơ chuyển thẳng sang Kiểm soát/Quản lý LS để phân công. Cán bộ được giao chỉ có ba việc: '
        '**Tiếp nhận hồ sơ**, **Hẹn khách ký**, **Hoàn thành**; trong lúc xử lý, cán bộ chuyển hồ sơ giữa **Đang làm** và '
        '**Chờ làm tiếp** bằng nút **Làm ngay / Làm tiếp**. Không còn các bước trung gian như bàn giao, báo soạn xong hay trình duyệt.'))

    t_roles = table_after('Vai trò')
    set_cells(t_roles, {
        (1, 1): 'Tạo việc, gửi lại khi Chưa giao hồ sơ, hủy hoặc tạm dừng việc của mình, theo dõi hồ sơ của phòng',
        (2, 1): 'Nhận hồ sơ, phân công (từng hồ sơ, hàng loạt, Phân công nhanh), trả về Phòng/PGD, đổi người, duyệt đề nghị sửa, giao kế hoạch',
        (3, 1): 'Tiếp nhận hồ sơ, làm hồ sơ (Làm ngay / Làm tiếp), hẹn khách ký, hoàn thành, xem Phân giao phòng',
        (4, 1): 'Như Kiểm soát; bắt đầu từ Kết quả & kế hoạch',
    })

    t_status = table_after('Trạng thái')
    set_cells(t_status, {
        (1, 3): 'Phân công · Trả về Phòng/PGD · Hủy',
        (2, 0): 'Chưa giao hồ sơ',
        (2, 1): 'Kiểm soát trả về Phòng/PGD, hoặc hệ thống tự trả khi quá ngày làm việc chưa tiếp nhận; SLA dừng',
        (2, 2): 'Phòng / PGD (người tạo đề nghị)',
        (2, 3): 'Chọn ngày và Gửi lại LS · Hủy',
        (4, 1): 'Cán bộ đã nhận hồ sơ; SLA chạy. Tiến độ làm việc: Chờ bắt đầu, Đang làm, Chờ làm tiếp',
        (4, 3): 'Làm ngay / Làm tiếp · Hẹn ký · Hoàn thành · Tạm dừng',
    })

    replace_block('Trả bổ sung:', 'li', LI(
        '**Trả về Phòng/PGD**: Kiểm soát trả hồ sơ thiếu thông tin về Phòng/PGD (nhãn **Chưa giao hồ sơ**, SLA dừng). Hệ thống cũng '
        'tự trả hồ sơ đã phân công của ngày làm việc liền trước nếu cán bộ LS chưa tiếp nhận. Người tạo đề nghị chọn ngày rồi '
        'bấm Gửi lại: hồ sơ quay về Chờ phân công.'))
    replace_block('Tạm dừng:', 'li', LI(
        '**Tạm dừng**: cán bộ LS (hoặc Phòng/PGD với việc do mình đề nghị) tạm dừng khi chờ khách hoặc chờ cấp phê duyệt; cán bộ '
        'LS bấm Tiếp tục xử lý để chạy lại. Làm việc khác như họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ thì dùng **Tạm dừng toàn bộ**.'))
    replace_block('Hủy / Đề nghị hủy:', 'li', [
        LI('**Hủy việc**: Phòng/PGD hủy việc còn mở của đơn vị mình, cán bộ LS hủy việc được giao, Kiểm soát/Quản lý hủy việc chưa '
           'hoàn thành. Chọn lý do rồi xác nhận, không cần chờ duyệt.'),
        LI('**Đổi hạn**: cán bộ LS được giao (hoặc Phòng/PGD đã tạo đề nghị) đổi ngày hạn xử lý của hồ sơ đã tiếp nhận, '
           'bắt buộc ghi lý do; giờ trong hạn giữ nguyên.'),
    ])
    replace_block('SLA tạm dừng khi hồ sơ ở', 'li', LI(
        'SLA tạm dừng khi hồ sơ ở Tạm dừng, Đang hẹn khách ký hoặc Chưa giao hồ sơ; ra khỏi các trạng thái này hạn được lùi đúng thời gian đã chờ.'))
    replace_block('Mọi thao tác quan trọng', 'li', [
        LI('Chỉ khi hồ sơ **Đang làm** thì đồng hồ giờ xử lý mới chạy; Chờ bắt đầu, Chờ làm tiếp và Tạm dừng thì giờ xử lý dừng. '
           'Mọi thời lượng hiển thị bằng phút.'),
        LI('Việc TSĐB phải tick đủ phần việc (soạn xong HĐ thế chấp, nhập kho hoặc xuất kho tùy loại việc) rồi mới Hoàn thành được.'),
        LI('Hồ sơ tồn trong bảng kết quả chỉ tính sau khi cán bộ LS đã tiếp nhận hồ sơ.'),
        LI('Mọi thao tác quan trọng đều ghi vào Nhật ký (người làm, thời điểm, lý do).'),
    ])

    # ================================================================ Phần 2: Phòng / PGD
    replace_block('Bổ sung thông tin khi Kiểm soát trả về', 'li',
                  LI('Chọn ngày và **Gửi lại** khi hồ sơ ở **Chưa giao hồ sơ** (Kiểm soát trả về hoặc hệ thống tự trả).'))
    replace_block('Hủy việc chưa giao', 'li', LI(
        '**Hủy việc** trực tiếp, **tạm dừng** việc của mình, **đổi hạn**; gửi **đề nghị sửa** cho việc đã giao LS.'))
    t_pgd = table_after('Bước', 0)  # bảng "Các bước chính" đầu tiên (Phần 2)
    set_cells(t_pgd, {(3, 1): 'Gửi lại khi Chưa giao hồ sơ', (3, 2): 'Chưa giao hồ sơ → Chờ phân công'})

    replace_block('Sau khi vào, màn hình Đề nghị', 'p', P(
        'Sau khi vào, màn hình **Đề nghị & hồ sơ** hiện các hồ sơ phòng bạn đã gửi. Thanh phía trên tóm tắt Đang mở, **Chưa giao hồ sơ**, '
        'Quá hạn, Hoàn thành. Thanh dọc bên trái là các mục chức năng; góc dưới có nút Thoát và tài khoản của bạn.'))

    # Bước 3: chọn việc (thêm hình TSBĐ mới)
    a, b = D.span('Bước 3. Chọn loại việc, sản phẩm')
    replace(a + 1, b, [
        P('Ở mục **Danh sách việc**, chọn **Loại việc** (Món, HM SXKD, Thấu chi, Thẻ tín dụng, TSĐB, Khác) rồi chọn **Sản phẩm**. '
          'Với việc tín dụng, chọn **Tình trạng TSBĐ**: TSBĐ có sẵn, Không có TSBĐ hoặc TSBĐ mới. TSBĐ mới và các việc TSĐB cần '
          'nhập **Số HĐ thế chấp cần soạn** (mặc định 1); việc xuất TSĐB nhập **Số bìa tài sản cần xuất**.'),
        P('**Ngày phát sinh** mặc định là hôm nay. Muốn đổi, gõ ngày DD/MM/YYYY, bấm biểu tượng lịch hoặc dùng **Chọn nhanh theo thứ**: '
          'chọn Tuần này hoặc Tuần sau rồi bấm Thứ 2 đến Thứ 6. Mỗi dòng việc chọn một ngày riêng. Khách có nhiều việc thì bấm **Thêm dòng việc**.'),
        P('Ghi chú cho LS những điều Kiểm soát cần lưu ý, rồi bấm **Gửi sang LS**. Hồ sơ vào Hàng chờ của Kiểm soát LS và hệ thống ghi giờ gửi.'),
    ] + fig('pgd-04-chon-viec', 'Chọn việc và gửi sang LS',
            ['Loại việc', 'Sản phẩm', 'Tình trạng TSBĐ', 'Ngày phát sinh', 'Chọn nhanh theo thứ', 'Gửi sang LS'])
      + fig('pgd-04a-tsbd-moi', 'Việc có TSBĐ mới: số HĐ thế chấp cần soạn',
            ['Tình trạng TSBĐ: TSBĐ mới', 'Số HĐ thế chấp cần soạn', 'Chọn nhanh theo thứ']))

    # Bước 5: gửi lại khi Chưa giao hồ sơ
    a, b = D.span('Bước 5. Bổ sung khi hồ sơ bị trả về')
    replace(a, b, [
        H2('Bước 5. Gửi lại khi hồ sơ Chưa giao hồ sơ'),
        P('Khi Kiểm soát trả hồ sơ về (thiếu thông tin) hoặc hệ thống tự trả (hồ sơ đã phân công của ngày làm việc liền trước mà cán bộ LS '
          'chưa tiếp nhận), hồ sơ chuyển sang **Chưa giao hồ sơ**: đầu màn hình có thông báo và dòng hồ sơ có nút **Gửi lại**. '
          'Mở chi tiết để đọc lý do. Chỉ người đã tạo đề nghị mới gửi lại được.'),
        P('Cần sửa thông tin thì bấm **Sửa thông tin** (sửa trực tiếp khi hồ sơ chưa giao cán bộ). Sau đó bấm **Gửi lại LS**, '
          '**chọn ngày KH đề nghị gửi lại** (không trước hôm nay; gõ DD/MM/YYYY hoặc bấm biểu tượng lịch) rồi xác nhận. '
          'Hồ sơ quay về Chờ phân công.'),
    ] + fig('pgd-07-can-bo-sung', 'Hồ sơ Chưa giao hồ sơ', ['Hồ sơ Chưa giao hồ sơ', 'Nút Gửi lại'])
      + fig('pgd-07a-chi-tiet-can-bo-sung', 'Chi tiết hồ sơ Chưa giao hồ sơ', ['Sửa thông tin', 'Gửi lại LS'])
      + fig('pgd-07b-gui-lai-ls', 'Chọn ngày và gửi lại', ['Ngày KH đề nghị gửi lại', 'Gửi lại LS']))

    # Bước 6: hủy, tạm dừng, đề nghị sửa
    a, b = D.span('Bước 6. Hủy hoặc đề nghị hủy/sửa việc')
    replace(a, b, [
        H2('Bước 6. Hủy việc, tạm dừng và đề nghị sửa'),
        P('Phòng/PGD **hủy trực tiếp** việc còn mở của đơn vị mình bằng biểu tượng cấm trên dòng hồ sơ (hoặc nút **Hủy việc** trong chi tiết): '
          'chọn lý do, ghi diễn giải nếu chọn Lý do khác rồi bấm **Hủy việc**. Không cần Kiểm soát duyệt.'),
        P('Việc do mình đề nghị đang chờ khách thì bấm **Tạm dừng** trên dòng; cán bộ LS bấm Tiếp tục xử lý khi làm lại. '
          '**Sửa thông tin** việc đã giao LS đi theo đường **đề nghị sửa**: bấm Sửa thông tin, đổi nội dung, ghi lý do rồi '
          '**Gửi đề nghị sửa**; Kiểm soát/Quản lý duyệt hoặc từ chối và bạn nhận kết quả.'),
    ] + fig('pgd-08-huy-viec', 'Hủy việc', ['Lý do', 'Diễn giải thêm', 'Hủy việc'])
      + fig('pgd-08a-de-nghi-sua', 'Gửi đề nghị sửa việc đã giao LS', ['Thay đổi cần Kiểm soát duyệt', 'Lý do sửa', 'Gửi đề nghị sửa']))

    # ================================================================ Phần 3: Kiểm soát LS
    a = D.find('li', 'Xem **Hàng chờ**'.replace('**', '')) if False else D.find('li', 'Xem Hàng chờ')
    b = D.find('li', 'Cấu hình phân công nhanh, xem báo cáo')
    replace(a, b, [
        LI('Xem **Hàng chờ** và phân công hồ sơ cho cán bộ LS: từng hồ sơ, hàng loạt hoặc **Phân công nhanh** theo quy tắc.'),
        LI('Trả hồ sơ về Phòng/PGD khi thiếu thông tin (nhãn **Chưa giao hồ sơ**).'),
        LI('Theo dõi tiến độ hồ sơ đã giao ở **Quản lý hồ sơ**, xem theo từng phòng; **Đổi người** xử lý, duyệt đề nghị sửa của Phòng/PGD.'),
        LI('**Đăng ký hộ phòng** khi nhận hồ sơ qua điện thoại hoặc giấy.'),
        LI('**Giao kế hoạch** ngày và chỉ tiêu tháng cho phòng LS, xem kết quả so với kế hoạch.'),
        LI('Cấu hình phân công nhanh, xem báo cáo, thời gian và SLA; cài tiện ích Firefox báo hồ sơ chờ phân công.'),
    ])

    replace_block('Hàng chờ chỉ có hồ sơ chưa giao', 'p', P(
        '**Hàng chờ** chỉ có hồ sơ chưa giao cho cán bộ (Chờ phân công và hồ sơ Kiểm soát vừa trả về, nhãn Chưa giao hồ sơ). Thanh trên cùng '
        'đếm Chờ phân công, Chưa giao hồ sơ, Phát sinh hôm nay. Khối **Đề nghị sửa chờ duyệt** (nếu có) nằm trên cùng để bạn xử lý trước. '
        'Hàng nút theo phòng giúp lọc nhanh hồ sơ của một phòng; hồ sơ phát sinh hôm nay và ngày làm việc kế tiếp (nhãn T+1) được xếp lên trước.'))
    replace_block('Bấm **Phân công** trên dòng hồ sơ.'.replace('**', ''), 'p', P(
        'Bấm **Phân công** trên dòng hồ sơ. Hộp thoại nêu **Ngày KH đề nghị** của hồ sơ và liệt kê các cán bộ kèm số việc Đang mở, Phân công hôm nay, '
        'Đã hoàn thành để bạn chia tải hợp lý: **tích chọn ngay trên dòng của cán bộ**. Nếu đã có quy tắc phân công nhanh cho phòng và sản phẩm đó, '
        'cán bộ theo quy tắc được tick sẵn và có nhãn **Theo quy tắc**; có thể tích người khác. Đánh dấu Ưu tiên xử lý cho cán bộ LS nếu hồ sơ cần '
        'làm trước, rồi bấm **Phân công cán bộ LS**.'))

    replace_block('Hồ sơ chuyển sang Cần bổ sung, SLA dừng', 'p', P(
        'Hồ sơ chuyển sang **Chưa giao hồ sơ**, SLA dừng, Phòng/PGD nhận thông báo. Người tạo đề nghị chọn ngày rồi Gửi lại; hồ sơ quay về Chờ phân công.'))

    a, b = D.span('Bước 5. Theo dõi hồ sơ đang chờ bổ sung')
    replace(a, b, [
        H2('Bước 5. Hồ sơ Chưa giao hồ sơ'),
        P('Hồ sơ Kiểm soát vừa trả về vẫn hiện trong **Hàng chờ** với nhãn **Chưa giao hồ sơ**, không có nút Phân công và không chọn để phân công '
          'hàng loạt được. Chỉ Phòng/PGD đã tạo đề nghị mới gửi lại được. Hồ sơ do hệ thống tự trả (quá ngày làm việc chưa tiếp nhận) '
          'nằm ở Phòng/PGD và trong **Quản lý hồ sơ**, tab Đang mở, cho đến khi gửi lại.'),
    ] + fig('ks-06-hang-cho-con-lai', 'Hồ sơ Chưa giao hồ sơ trong Hàng chờ', ['Các nút lọc theo phòng', 'Hồ sơ còn lại trong Hàng chờ']))

    a, b = D.span('Bước 10. Duyệt đề nghị sửa / hủy')
    replace(a, b, [
        H2('Bước 10. Duyệt đề nghị sửa'),
        P('Đề nghị sửa của Phòng/PGD (việc đã giao LS) hiện ở khối **Đề nghị sửa chờ duyệt** đầu Hàng chờ, kèm nội dung thay đổi (giá trị cũ gạch ngang, '
          'giá trị mới in đậm) và lý do. Bấm **Duyệt** để áp dụng hoặc **Từ chối**; người đề nghị được báo kết quả. Việc bị hủy do Phòng/PGD '
          'hoặc cán bộ LS tự hủy trực tiếp, không qua bước duyệt.'),
    ] + fig('ks-13-de-nghi-sua-cho-duyet', 'Đề nghị sửa chờ duyệt ở đầu Hàng chờ', ['Duyệt', 'Từ chối']))

    replace_block('Kết quả & kế hoạch cho biết cả phòng LS', 'p', P(
        '**Kết quả & kế hoạch** cho biết cả phòng LS và từng cán bộ đã làm được gì trong ngày, tuần, tháng hoặc khoảng ngày bất kỳ. Bảng '
        '**Kết quả thực hiện** có 9 dòng: Soạn thảo HĐ thế chấp (làm TSĐB mới hoặc phụ lục TSĐB), Soạn thảo HĐ tín dụng, **Nhập kho TSĐB**, '
        '**Xuất kho TSĐB**, Giao dịch trên Rlos, Hồ sơ tồn (Soạn HĐ thế chấp, Soạn HĐ tín dụng) và Khác. Số liệu lấy từ các ô tick của cán bộ; '
        'dòng nhập/xuất kho tính theo ngày cán bộ tick (đơn vị là tài sản). Hồ sơ tồn chỉ tính sau khi cán bộ LS đã tiếp nhận hồ sơ.'))
    replace_block('Bấm **Giao kế hoạch** để đặt'.replace('**', ''), 'p', P(
        'Bấm **Giao kế hoạch** để đặt **kế hoạch mỗi ngày** cho từng dòng của bảng (kể cả Nhập kho / Xuất kho TSĐB) và **chỉ tiêu hoàn thành '
        'mỗi tháng** (toàn LS và mỗi cán bộ), rồi **Lưu kế hoạch**. Kế hoạch kỳ tuần, tháng, năm tự nhân với số ngày làm việc. Bảng hiện cột '
        '**Kế hoạch ngày** và **% hoàn thành** để so với kết quả; nút Ẩn / Hiện kế hoạch điều khiển cả ảnh và Excel tải về.'))

    # Bước 13 mới: tiện ích Firefox (chỉ chữ), chèn sau bước 12
    a, b = D.span('Bước 12. Báo cáo: nhiều kỳ')
    ff = [
        H2('Bước 13. Tiện ích Firefox báo hồ sơ chờ phân công'),
        P('Kiểm soát LS và Quản lý LS dùng Firefox 140 trở lên có thể cài **tiện ích LS-Routing** để biết có hồ sơ mới chờ phân công khi không '
          'mở ứng dụng. Tải gói ở đường dẫn ứng dụng thêm **?download=firefox**, rồi làm theo hướng dẫn cài trên trang tải. Sau khi cài, mở hoặc '
          'tải lại LS-Routing một lần và đăng nhập.'),
        P('Tiện ích kiểm tra mỗi phút khi Firefox đang chạy, hiện số hồ sơ chờ phân công trên biểu tượng và popup khi có hồ sơ mới; bấm thông '
          'báo hoặc **Mở danh sách phân công** để vào Hàng chờ. Tiện ích không đọc mật khẩu, không nhận tên khách, CIF, điện thoại hay email. '
          'Hết phiên đăng nhập, đăng xuất hoặc Firefox đóng hoàn toàn thì dừng nhận; đăng nhập lại ứng dụng để kết nối lại.'),
    ]
    anchor = blocks[b]
    last = bd.elements(anchor)[-1]
    for e in reversed(ff):
        last.addnext(e)

    # ================================================================ Phần 4: Cán bộ LS
    a = D.find('li', 'Xem việc được giao')
    b = D.find('li', 'Xem dashboard cá nhân')
    replace(a, b, [
        LI('Xem việc được giao, bấm **Tiếp nhận** khi đã nhận hồ sơ từ Phòng/PGD và chọn nhận vào danh sách chờ hoặc làm ngay.'),
        LI('Chuyển hồ sơ giữa **Đang làm** và **Chờ làm tiếp** (Làm ngay / Làm tiếp); mỗi lúc một hồ sơ Đang làm.'),
        LI('Hẹn khách ký hồ sơ và báo khách qua Email, Zalo hoặc SMS.'),
        LI('Hoàn thành việc (việc TSĐB tick soạn xong HĐ thế chấp, nhập kho, xuất kho) và báo cho Phòng/PGD.'),
        LI('Tạm dừng, **Tạm dừng toàn bộ** khi làm việc khác, thêm việc kèm (hồ sơ TSĐB), đổi hạn và sửa giờ nhận hồ sơ khi cần.'),
        LI('Xem **Phân giao phòng** (chỉ xem), dashboard cá nhân, thời gian của tôi và nhật ký của mình.'),
    ])

    a, b = D.span('Bước 1. Dashboard cá nhân')
    replace(a + 1, b, [
        P('Dashboard cá nhân tóm tắt kết quả trong ngày: hoàn thành hôm nay, đang mở, giờ làm hôm nay (tính bằng phút) và đã chạm hôm nay, cùng '
          'biểu đồ giờ làm 7 ngày gần nhất. Mục **Chi tiết việc trong ngày** liệt kê từng hồ sơ bạn đã làm; mục **Báo cáo việc đã hoàn thành** '
          'cho chọn ngày hoàn thành để xem lại. Nút **Tạm dừng toàn bộ** ở góc phải (xem Bước 8).'),
    ] + fig('ls-01-dashboard-ca-nhan', 'Dashboard cá nhân', ['Tạm dừng toàn bộ']))

    a, b = D.span('Bước 2. Mở Việc của tôi')
    replace(a + 1, b, [
        P('**Việc của tôi** liệt kê hồ sơ đang giao cho bạn. Thanh trên cùng đếm Việc đang mở, Chờ tiếp nhận, Quá hạn, Hoàn thành. Các tab theo '
          'tiến độ làm việc: **Đang mở**, **Đang làm**, **Chờ bắt đầu**, **Chờ làm tiếp**, **Chờ khách / Tạm dừng**. Hồ sơ mới giao có trạng thái '
          'Đã phân công và nút **Tiếp nhận** ngay trên dòng; màu nền dòng thể hiện mức ưu tiên của khách (VIP, Quan trọng, Xử lý gấp). Cột '
          '**Giờ xử lý KH** hiện số phút đã xử lý, chỉ chạy khi hồ sơ Đang làm.'),
    ] + fig('ls-02-viec-cua-toi', 'Việc của tôi', ['Các tab theo tiến độ làm việc', 'Hồ sơ mới được giao', 'Nút Tiếp nhận']))

    a, b = D.span('Bước 3. Tiếp nhận hồ sơ')
    replace(a + 1, b, [
        P('Khi đã nhận hồ sơ từ Phòng/PGD, bấm **Tiếp nhận**. Ở mục **Sau khi tiếp nhận**, chọn **Làm hồ sơ này ngay** hoặc **Nhận vào danh sách '
          'chờ** (hồ sơ sang Chờ bắt đầu). Nếu đang làm hồ sơ khác, mặc định là nhận vào danh sách chờ; chọn làm ngay thì hồ sơ đang làm chuyển '
          'sang Chờ làm tiếp. Bấm **Tiếp nhận hồ sơ**: hệ thống ghi giờ tiếp nhận, tính hạn SLA từ thời điểm này và chuyển hồ sơ sang Đã '
          'tiếp nhận hồ sơ. Chỉ cán bộ được giao mới bấm được.'),
        P('Hồ sơ Chờ bắt đầu hoặc Chờ làm tiếp phải bấm **Làm ngay** / **Làm tiếp** trước khi Hẹn ký hay Hoàn thành. Hồ sơ Đang làm hiện nút '
          '**Hẹn ký** (hoặc Hoàn thành với loại việc không cần khách ký).'),
    ] + fig('ls-03-tiep-nhan-ho-so', 'Xác nhận Tiếp nhận hồ sơ', ['Sau khi tiếp nhận', 'Tiếp nhận hồ sơ'])
      + fig('ls-04-da-tiep-nhan', 'Hồ sơ sau khi tiếp nhận', ['Trạng thái Đã tiếp nhận hồ sơ và Đang làm', 'Nút Hẹn ký']))

    a, b = D.span('Bước 4. Xem chi tiết, nhóm việc và việc kèm')
    replace(a + 2, b, [
        P('Mục **Việc kèm** cho phép thêm hồ sơ TSĐB mới đi kèm việc chính, tính là một việc riêng. Nút **Hoạt động & lịch sử** xem nhật ký hồ sơ. '
          'Các nút cuối hộp thoại (Ghi / sửa giờ, Hẹn khách ký hồ sơ, Tạm dừng...) tùy trạng thái hồ sơ.'),
        P('Việc TSĐB có thêm mục **Phần việc phải tick**: tick từng phần khi làm xong (mỗi ô lưu ngay người và giờ), nhập **số HĐ thế chấp** hoặc '
          'số tài sản xuất tương ứng. Nhập kho và xuất kho chỉ tick được sau khi đã tick soạn xong HĐ thế chấp. Số liệu tính vào bảng kết quả theo '
          'ngày tick.'),
    ] + fig('ls-05-chi-tiet-da-tiep-nhan', 'Chi tiết hồ sơ sau khi tiếp nhận', ['Giờ LS tiếp nhận hồ sơ'])
      + fig('ls-05a-phan-viec-tsdb', 'Phần việc phải tick của việc TSĐB', ['Phần việc phải tick']))

    replace_block('Hệ thống gửi tin mời khách theo mẫu', 'p', P(
        'Hệ thống gửi tin mời khách theo mẫu đã duyệt (có bước xem trước và xác nhận nếu cấu hình yêu cầu). Nếu khách không có kênh liên hệ nào, '
        'tin được gửi vào nhóm nội bộ và gắn thẻ cán bộ phụ trách. Hồ sơ chuyển sang Đang hẹn khách ký; SLA tạm dừng trong thời gian chờ '
        'khách. Hẹn ký cũng ghi nhận hợp đồng đã soạn (xem **Tình trạng soạn hợp đồng** trong chi tiết hồ sơ).'))

    a, b = D.span('Bước 6. Hoàn thành hồ sơ')
    replace(a + 1, b, [
        P('Sau khi khách đã ký, bấm **Hoàn thành**. Ghi tóm tắt kết quả xử lý (không bắt buộc), kiểm tra **Tình trạng soạn hợp đồng** và **Kết quả '
          'ghi nhận vào bảng ngày**, rồi chọn cách thông báo: Không gửi, Chỉ báo trong app, hoặc Email Phòng/PGD và báo trong app (mặc định). '
          'Hộp thoại hiển thị email nhận và lịch hẹn khách để bạn kiểm tra trước khi bấm Hoàn thành.'),
        P('**Kết quả ghi nhận** là những ô tick được cộng thẳng vào bảng Kết quả thực hiện của phòng LS. Hồ sơ vay (Món, HM SXKD, Thấu chi, Thẻ '
          'tín dụng) có hai ô: **Đã soạn HĐ thế chấp** (tick sẵn khi vay có tài sản bảo đảm) và **Đã làm giao dịch trên Rlos** (tick sẵn). Bỏ tick nếu '
          'hồ sơ không có kết quả đó, tick thêm nếu có. Tick nhầm thì Kiểm soát/Quản lý sửa lại ở Quản lý hồ sơ.'),
        P('Việc TSĐB có mục **Phần việc phải tick trước khi hoàn thành**: nhập mới / nhập thêm / ĐKTC, nhập tăng, thay đổi TSĐB và việc kèm TSĐB '
          'mới cần **Đã soạn xong HĐ thế chấp** (kèm số lượng HĐ) rồi **Đã nhập kho TSĐB**; xuất giảm cần soạn xong rồi **Đã xuất kho TSĐB**; xuất '
          'TSĐB và xóa thế chấp chỉ cần **Đã xuất kho TSĐB**; mượn TSĐB và thủ tục khác không có ô. Tick ngay trong hộp thoại này hoặc từ chi tiết '
          'hồ sơ; chưa tick đủ thì chưa Hoàn thành được.'),
        P('Hồ sơ rời danh sách việc đang mở, chỉ số Hoàn thành tăng và Phòng/PGD nhận thông báo. Không có bước trình hay duyệt thêm. Thao tác chạy '
          'nền: hộp thoại đóng ngay và hồ sơ coi như đã xong.'),
    ] + fig('ls-08-hoan-thanh', 'Hoàn thành hồ sơ', ['Ghi chú kết quả', 'Kết quả ghi nhận vào bảng ngày', 'Cách thông báo', 'Hoàn thành'])
      + fig('ls-08a-hoan-thanh-tsdb', 'Hoàn thành việc TSĐB', ['Phần việc phải tick', 'Hoàn thành'])
      + fig('ls-09-sau-hoan-thanh', 'Sau khi hoàn thành'))

    a, _ = D.span('Bước 7. Tạm dừng và tiếp tục')
    _, b = D.span('Bước 8. Thời gian & SLA và Nhật ký của tôi')
    replace(a, b, [
        H2('Bước 7. Tạm dừng và tiếp tục'),
        P('Cần chờ khách bổ sung hay chờ cấp phê duyệt: bấm **Tạm dừng** ngay trên dòng hồ sơ rồi xác nhận **Tạm dừng**. SLA và giờ xử lý dừng trong '
          'thời gian tạm dừng. Khi có thể làm tiếp, bấm **Tiếp tục xử lý**. Cần đổi ngày hạn thì dùng nút **Đổi hạn** (bắt buộc ghi lý do).'),
    ] + fig('ls-11-xac-nhan-tam-dung', 'Xác nhận Tạm dừng', ['Tạm dừng']) + [
        H2('Bước 8. Tạm dừng toàn bộ khi làm việc khác'),
        P('Họp, báo cáo hoặc hoàn thiện hồ sơ QTTD/TSBĐ: bấm **Tạm dừng toàn bộ** ở Dashboard hoặc Việc của tôi, chọn **Tạm dừng để làm** (Hoàn thiện '
          'hồ sơ QTTD/TSBĐ, Báo cáo hoặc Khác) rồi **Bắt đầu tạm dừng**. Hồ sơ đang làm chuyển sang Chờ làm tiếp và thời gian được ghi là tác nghiệp '
          'khác. Xong việc, bấm **Kết thúc tạm dừng** để hồ sơ đó chạy lại.'),
    ] + fig('ls-12-tam-dung-toan-bo', 'Tạm dừng toàn bộ', ['Tạm dừng để làm (chọn công việc)', 'Bắt đầu tạm dừng'])
      + fig('ls-12a-dang-tam-dung', 'Đang tạm dừng toàn bộ', ['Kết thúc tạm dừng']) + [
        H2('Bước 9. Phân giao phòng'),
        P('**Phân giao phòng** là màn hình chỉ xem để biết ai đang làm hồ sơ nào: chọn tuần, cán bộ LS, trạng thái hồ sơ hoặc tìm theo tên khách / '
          'CIF rồi bấm **Xem**. Màn hình tổng hợp số hồ sơ đã giao, đang mở và khách có nhiều việc, kèm giờ giao và trạng thái. Không hiện điện '
          'thoại, email hay ghi chú của khách.'),
    ] + fig('ls-14-phan-giao-phong', 'Phân giao toàn phòng') + [
        H2('Bước 10. Thời gian của tôi và Nhật ký'),
        P('**Thời gian của tôi** cho biết số phút bạn đã dùng theo ngày, nghiệp vụ, sản phẩm, số lần và thời gian tác nghiệp khác, cùng tỷ lệ hồ '
          'sơ đúng hạn (chỉ hiện việc của bạn). **Nhật ký** liệt kê các thao tác do chính bạn thực hiện: Tiếp nhận hồ sơ, Hẹn khách ký, Hoàn '
          'thành...; mỗi trang 100 dòng, bấm **Xem thêm** để nối trang.'),
    ] + fig('ls-13-thoi-gian-sla', 'Thời gian của tôi', ['Xem báo cáo']) + fig('ls-15-nhat-ky', 'Nhật ký của cán bộ'))

    # ================================================================ Phần 5: Quản lý LS
    replace_block('Làm các việc của Kiểm soát LS', 'li', LI(
        'Làm các việc của Kiểm soát LS: phân công (kể cả **Phân công nhanh**), trả về Phòng/PGD, đổi người, duyệt đề nghị sửa (riêng '
        '**Đăng ký hộ phòng** chỉ Kiểm soát làm).'))
    replace_block('Màn hình đầu tiên là Kết quả & kế hoạch', 'p', P(
        'Màn hình đầu tiên là **Kết quả & kế hoạch**. Chọn Kỳ, ngày, Cán bộ LS và Đơn vị gửi rồi bấm Xem. Bảng **Kết quả thực hiện** có các dòng '
        'Soạn thảo HĐ thế chấp, Soạn thảo HĐ tín dụng, Nhập kho TSĐB, Xuất kho TSĐB, Giao dịch trên Rlos, Hồ sơ tồn và Khác theo từng cán bộ; nút '
        '**Giao kế hoạch** để đặt kế hoạch (xem Phần 3, Bước 11). Các tab Theo cán bộ, Theo loại việc, Theo đơn vị gửi cho các góc nhìn khác; có '
        '**Tải ảnh** và **Tải Excel**. Việc quá hạn và trạng thái hồ sơ xem ở Quản lý hồ sơ.'))
    replace_block('Vào Quản lý hồ sơ, tab Đang xử lý', 'p', P(
        'Vào **Quản lý hồ sơ**, tab Đang xử lý và bấm **Đổi người** trên dòng hồ sơ. Tích chọn cán bộ mới dựa vào bảng tải (Đang mở, Phân công hôm '
        'nay, Đã hoàn thành). Mục **Phần <cán bộ cũ> đã làm xong** cho tick những phần cán bộ cũ đã hoàn tất (Soạn HĐ tín dụng, Soạn HĐ thế chấp, '
        'Giao dịch trên Rlos): phần được tick tính vào kết quả ngày của người cũ, cán bộ mới chỉ được tính phần còn lại khi hoàn thành. Ghi lý do '
        'bắt buộc rồi bấm **Chuyển người khác**. Cán bộ mới nhận thông báo; mốc nhận hồ sơ và SLA không đổi.'))
    a, b = D.span('Bước 4. Duyệt đề nghị hủy hoặc sửa')
    replace(a, b, [
        H2('Bước 4. Duyệt đề nghị sửa'),
        P('Làm như Kiểm soát LS (xem Phần 3, Bước 10): đề nghị sửa của Phòng/PGD hiện ở khối **Đề nghị sửa chờ duyệt** đầu Hàng chờ. Bấm **Duyệt** '
          'để áp dụng thay đổi hoặc **Từ chối**; người đề nghị được báo kết quả. Việc hủy do Phòng/PGD hoặc cán bộ LS tự hủy trực tiếp, '
          'không qua bước duyệt.'),
    ] + fig('ks-13-de-nghi-sua-cho-duyet', 'Đề nghị sửa chờ duyệt', ['Duyệt', 'Từ chối']))

    t_ql = table_after('Bước', 3)
    set_cells(t_ql, {(3, 1): 'Duyệt đề nghị sửa', (3, 2): 'Cập nhật hồ sơ'})

    # ================================================================ Phần 9: câu hỏi thường gặp
    faq = table_after('Tình huống')
    rows = {gm.cell_text(tr.findall('w:tc', NS)[0]): tr for tr in faq.xml.findall('w:tr', NS)[1:]}

    def faq_set(question, answer, new_question=None):
        tr = rows[question]
        tcs = tr.findall('w:tc', NS)
        for tc, text in zip(tcs, (new_question or question, answer)):
            p = tc.find('w:p', NS)
            runs = p.findall('w:r', NS)
            for extra in runs[1:]:
                p.remove(extra)
            runs[0].find('w:t', NS).text = text

    faq_set('Không thấy nút Hoàn thành',
            'Loại việc cần khách ký nên phải Hẹn ký trước; hoặc chưa tích đủ Việc phải làm / Phần việc TSĐB; hoặc chưa Tiếp nhận hồ sơ; hoặc hồ sơ '
            'đang Chờ bắt đầu / Chờ làm tiếp (bấm Làm ngay / Làm tiếp trước).')
    faq_set('Gửi nhầm việc',
            'Phòng/PGD bấm Hủy việc trên dòng hồ sơ, chọn lý do và xác nhận; hủy trực tiếp, không cần duyệt (hồ sơ đã giao LS vẫn hủy được).')
    faq_set('Hồ sơ TSĐB tính vào dòng nào của bảng kết quả ngày?',
            'Làm TSĐB mới hoặc phụ lục TSĐB tính vào Soạn thảo HĐ thế chấp; nhập kho và xuất kho tính vào Nhập kho TSĐB, Xuất kho TSĐB theo ngày cán bộ '
            'tick; mượn TSĐB, thủ tục khác tính vào Khác. Kiểm soát/Quản lý sửa lại ở Quản lý hồ sơ, tab Hoàn thành, nút Sửa ghi nhận kết quả.')
    gm.add_table_row(faq.xml, [
        'Hồ sơ bỗng chuyển sang Chưa giao hồ sơ?',
        'Hồ sơ đã phân công của ngày làm việc liền trước mà cán bộ LS chưa tiếp nhận được hệ thống tự trả về Phòng/PGD lúc đầu ngày làm việc (khoảng 7h). '
        'Người tạo đề nghị chọn ngày và bấm Gửi lại.'])
    gm.add_table_row(faq.xml, [
        'Giờ xử lý chỉ thấy 0 phút?',
        'Giờ xử lý chỉ tính trong lịch làm việc đã cấu hình và chỉ khi hồ sơ Đang làm. Hồ sơ Chờ bắt đầu, Chờ làm tiếp, đang tạm dừng hoặc làm '
        'ngoài giờ làm việc cho 0 phút.'])
    gm.add_table_row(faq.xml, [
        'Hồ sơ đang làm bị chuyển sang Chờ làm tiếp?',
        'Mỗi lúc chỉ một hồ sơ Đang làm. Làm ngay hồ sơ khác hoặc bấm Tạm dừng toàn bộ thì hồ sơ đang làm sang Chờ làm tiếp; bấm Làm tiếp '
        '(hoặc Kết thúc tạm dừng) để chạy lại.'])

    return z, root, body, F, blocks


if __name__ == '__main__':
    bd.build = build
    bd.main()
