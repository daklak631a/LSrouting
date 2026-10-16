"""Dựng lại bộ hướng dẫn LS-Routing (docx + html) từ bản docx gốc và ảnh chụp mới.

    py docs/huong-dan/tools/build_docs.py

- Nguồn: docs/huong-dan/ban-cu-30-09-2026/HUONG_DAN_SU_DUNG_LS_ROUTING_capnhat.docx (bản trước khi đổi giao diện).
- Ảnh: docs/huong-dan/anh/*.png (do tools/capture.py chụp).
- Ra: HUONG_DAN_SU_DUNG_LS_ROUTING.docx và .html cạnh thư mục `tools`.
Các khối không đổi nội dung giữ nguyên XML gốc; khối đổi được dựng mới bằng cách nhân bản khối mẫu của chính tài liệu.
"""
import copy
import io
import os
import re
import sys
import zipfile
from lxml import etree
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import guide_model as gm
from guide_model import NS, q, text_of

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(ROOT, 'ban-cu-30-09-2026', 'HUONG_DAN_SU_DUNG_LS_ROUTING_capnhat.docx')
ANH = os.path.join(ROOT, 'anh')
OUT_DOCX = os.path.join(ROOT, 'HUONG_DAN_SU_DUNG_LS_ROUTING.docx')
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
VERSION_DATE = '01/10/2026'


# ---------------------------------------------------------------- tiện ích dựng XML

def md_runs(text):
    """'a **b** c' -> [(a, False), (b, True), (c, False)]."""
    out = []
    for i, part in enumerate(re.split(r'\*\*', text)):
        if part:
            out.append((part, i % 2 == 1))
    return out


class Factory:
    def __init__(self, blocks):
        self.blocks = blocks
        by = lambda i: copy.deepcopy(blocks[i].xml)
        self.p_proto = by(105)          # đoạn thường một run
        self.li_proto = by(96)          # dòng danh sách
        self.h2_proto = by(107)         # tiêu đề bước
        self.fig_proto = blocks[106]    # ảnh có chú giải
        self.fig_nolegend_proto = blocks[122]
        self.run_n = copy.deepcopy(self.p_proto.find('w:r', NS))
        self.run_b = copy.deepcopy(self.run_n)
        rpr = self.run_b.find('w:rPr', NS)
        fonts = rpr.find('w:rFonts', NS)
        for tag in ('w:bCs', 'w:b'):
            e = etree.Element(q(tag))
            fonts.addnext(e)
        legend = self.fig_proto.legend_xml
        self.leg_num = copy.deepcopy(legend.findall('w:r', NS)[0])
        self.leg_txt = copy.deepcopy(legend.findall('w:r', NS)[1])
        self.next_docpr = 1 + max(int(d.get('id')) for d in blocks[0].xml.getroottree().getroot().iter(q('wp:docPr')))
        self.new_media = []   # (name, rid, bytes)

    def _fill(self, p, runs, proto_n, proto_b):
        for r in p.findall('w:r', NS):
            p.remove(r)
        for text, bold in runs:
            r = copy.deepcopy(proto_b if bold else proto_n)
            t = r.find('w:t', NS)
            t.text = text
            t.set(XML_SPACE, 'preserve')
            p.append(r)
        return p

    def para(self, md):
        return self._fill(copy.deepcopy(self.p_proto), md_runs(md), self.run_n, self.run_b)

    def li(self, md):
        li = copy.deepcopy(self.li_proto)
        return self._fill(li, md_runs(md), self.run_n, self.run_b)

    def h2(self, text):
        p = copy.deepcopy(self.h2_proto)
        r = p.find('w:r', NS)
        r.find('w:t', NS).text = text
        return p

    def legend(self, items):
        p = copy.deepcopy(self.fig_proto.legend_xml)
        for r in p.findall('w:r', NS):
            p.remove(r)
        for n, txt in enumerate(items, 1):
            a = copy.deepcopy(self.leg_num); a.find('w:t', NS).text = '(%d) ' % n; a.find('w:t', NS).set(XML_SPACE, 'preserve')
            b = copy.deepcopy(self.leg_txt)
            b.find('w:t', NS).text = txt + ('   ' if n < len(items) else '')
            b.find('w:t', NS).set(XML_SPACE, 'preserve')
            p.append(a); p.append(b)
        return p

    def fig(self, name, title, legend=None, alt=None, existing=None):
        """Ảnh + chú thích (+ chú giải). `existing` là khối fig cũ khi giữ nguyên quan hệ ảnh."""
        proto = self.fig_proto
        pic_p = copy.deepcopy(proto.xml)
        cap = copy.deepcopy(proto.caption_xml)
        dp = pic_p.find('.//wp:docPr', NS)
        dp.set('id', str(self.next_docpr)); self.next_docpr += 1
        dp.set('name', name); dp.set('descr', alt or title); dp.set('title', alt or title)
        # tỉ lệ ảnh thật
        w, h = Image.open(os.path.join(ANH, name + '.png')).size
        cx = proto.cx
        cy = int(round(cx * h / w))
        for ext in pic_p.iter(q('wp:extent')):
            ext.set('cx', str(cx)); ext.set('cy', str(cy))
        for ext in pic_p.iter(q('a:ext')):
            ext.set('cx', str(cx)); ext.set('cy', str(cy))
        blip = pic_p.find('.//a:blip', NS)
        if existing is not None:
            blip.set(q('r:embed'), existing.rid)
        else:
            blip.set(q('r:embed'), '@NEW:' + name)    # gán rId thật khi ghi
        cap.find('.//w:t', NS).text = 'Hình 0. ' + title
        out = [pic_p, cap]
        if legend:
            out.append(self.legend(legend))
        return out


def elements(b):
    els = [b.xml]
    for attr in ('caption_xml', 'legend_xml'):
        e = getattr(b, attr, None)
        if e is not None:
            els.append(e)
    return els


def replace_range(blocks, start, end, new_elements):
    """Thay các khối start..end (gồm cả) bằng new_elements, trả về True nếu xong."""
    first = elements(blocks[start])[0]
    anchor = first.getprevious()
    parent = first.getparent()
    for b in blocks[start:end + 1]:
        for e in elements(b):
            if e.getparent() is not None:
                e.getparent().remove(e)
    for e in reversed(new_elements):
        anchor.addnext(e)


def set_runs_text(p, text):
    """Đặt chữ cho đoạn có một run (giữ định dạng run đầu)."""
    runs = p.findall('w:r', NS)
    for extra in runs[1:]:
        p.remove(extra)
    t = runs[0].find('w:t', NS)
    t.text = text
    t.set(XML_SPACE, 'preserve')


def fig_of(blocks, name):
    for b in blocks:
        if b.kind == 'fig' and b.name == name:
            return b
    return None


# ---------------------------------------------------------------- nội dung mới

def build():
    z, root, body, blocks = gm.parse(SRC)
    F = Factory(blocks)
    B = lambda i: blocks[i]
    old_names = {b.name for b in blocks if b.kind == 'fig'}
    keep = {n: fig_of(blocks, n) for n in old_names}
    fig = lambda name, title, legend=None, alt=None: F.fig(name, title, legend, alt, existing=keep.get(name))

    # ---- Bìa và Phần 1
    set_runs_text(B(11).xml, 'Phiên bản ' + VERSION_DATE)
    t_roles = B(31).xml
    gm.set_cell_text(t_roles, 2, 1, 'Nhận hồ sơ, phân công (từng hồ sơ, hàng loạt, Phân công nhanh), trả bổ sung, đổi người, duyệt đề nghị, giao kế hoạch')
    gm.set_cell_text(t_roles, 4, 1, 'Như Kiểm soát; bắt đầu từ Kết quả & kế hoạch')

    # ---- Phần 4: bước Hoàn thành của cán bộ LS (sau Phần 5/3 để chỉ số khối không đổi, làm trước khi thay khối)
    new_ls_done = [
        F.h2('Bước 6. Hoàn thành hồ sơ'),
        F.para('Sau khi khách đã ký, bấm **Hoàn thành**. Ghi tóm tắt kết quả xử lý (không bắt buộc), kiểm tra **Kết quả ghi nhận vào bảng ngày** và chọn cách thông báo: Không gửi, Chỉ báo trong app, hoặc Email Phòng/PGD và báo trong app (mặc định). Hộp thoại hiển thị email nhận và lịch hẹn khách để bạn kiểm tra trước khi bấm Hoàn thành.'),
        F.para('**Kết quả ghi nhận** là những ô tick được cộng thẳng vào bảng Kết quả thực hiện của phòng LS. Hồ sơ vay (Món, HM SXKD, Thấu chi, Thẻ tín dụng) có hai ô: **Đã soạn HĐ thế chấp** (tick sẵn khi vay có tài sản bảo đảm) và **Đã làm giao dịch trên Rlos** (tick sẵn). Việc TSĐB chỉ có ô **Đã soạn HĐ thế chấp**: làm TSĐB mới hoặc phụ lục TSĐB thì tick sẵn; xuất TSĐB, xóa thế chấp, mượn TSĐB không tick và được tính vào dòng Khác. Bỏ tick nếu hồ sơ không có kết quả đó, tick thêm nếu có. Tick nhầm thì Kiểm soát/Quản lý sửa lại ở Quản lý hồ sơ.'),
        F.para('Hồ sơ rời danh sách việc đang mở, chỉ số Hoàn thành tăng và Phòng/PGD nhận thông báo. Không có bước trình hay duyệt thêm. Thao tác chạy nền: hộp thoại đóng ngay và hồ sơ coi như đã xong.'),
    ] + fig('ls-08-hoan-thanh', 'Hoàn thành hồ sơ', ['Ghi chú kết quả', 'Kết quả ghi nhận vào bảng ngày', 'Cách thông báo', 'Hoàn thành']) \
      + fig('ls-09-sau-hoan-thanh', 'Sau khi hoàn thành')

    # ---- Phần 6: Quản trị (bước 5)
    admin_p = F.para('Lịch làm việc: ngày làm việc, giờ bắt đầu/kết thúc, giờ nghỉ trưa và ngày nghỉ lễ; SLA và giờ xử lý tính theo lịch này. **Cấu hình chung**: tên ngân hàng, múi giờ, Nơi ký hồ sơ mặc định (hiện trong hộp thoại hẹn khách), ngưỡng cảnh báo và cổng gửi tin ngoài. Kế hoạch ngày và chỉ tiêu tháng không đặt ở đây: do Kiểm soát / Quản lý LS giao ở Kết quả & kế hoạch. **Phân công nhanh**: xem và sửa các quy tắc (phòng → cán bộ phụ trách, kèm các sản phẩm đi theo) như ở phần Kiểm soát.')

    # ---- Phần 9: hỏi đáp
    faq = B(258).xml
    for who, how in [
        ('Giao kế hoạch ngày ở đâu?', 'Kiểm soát/Quản lý LS: vào Kết quả & kế hoạch, bấm Giao kế hoạch, nhập kế hoạch mỗi ngày cho từng dòng của bảng kết quả và chỉ tiêu hoàn thành tháng, rồi Lưu kế hoạch. Bấm Hiện kế hoạch / % để so với kết quả.'),
        ('Hồ sơ TSĐB tính vào dòng nào của bảng kết quả ngày?', 'Làm TSĐB mới hoặc phụ lục TSĐB tính vào Soạn thảo HĐ thế chấp; xuất TSĐB, xóa thế chấp, mượn TSĐB, thủ tục khác tính vào Khác. Cán bộ tick khi Hoàn thành; Kiểm soát/Quản lý sửa lại ở Quản lý hồ sơ, tab Hoàn thành, nút Sửa ghi nhận kết quả.'),
        ('Phân công nhanh giao những hồ sơ nào?', 'Theo quy tắc đã cấu hình: phòng do cán bộ nào phụ trách thì hồ sơ cầm cố của phòng về cán bộ đó (tick sẵn khi thêm quy tắc), sản phẩm khác tick thêm trong quy tắc. Hồ sơ chưa có quy tắc không tick sẵn để Kiểm soát tự chọn người.'),
        ('Bấm xong không thấy máy chủ báo gì?', 'Mọi thao tác ghi chạy nền: hộp thoại đóng ngay và màn hình đổi ngay. Chỉ khi hệ thống từ chối mới có thông báo lỗi và hồ sơ trở lại như cũ. Nếu có nhãn Đang lưu ở cuối màn hình thì chờ nó tắt rồi hãy đóng trang.'),
    ]:
        gm.add_table_row(faq, [who, how])

    # ---- Phần 5: Quản lý LS
    ql_new = [
        F.para('**Điều hành bộ phận LS: dùng các màn hình như Kiểm soát (không có Đăng ký hộ phòng) và bắt đầu từ Kết quả & kế hoạch.**'),
    ]
    ql_blocks = [
        F.h2('Bước 1. Kết quả & kế hoạch'),
        F.para('Màn hình đầu tiên là **Kết quả & kế hoạch**. Chọn Kỳ, ngày, Cán bộ LS và Đơn vị gửi rồi bấm Xem. Bảng **Kết quả thực hiện** có các dòng Soạn thảo HĐ thế chấp, Soạn thảo HĐ tín dụng, Giao dịch trên Rlos, Hồ sơ tồn và Khác theo từng cán bộ; nút **Giao kế hoạch** để đặt kế hoạch (xem Phần 3, Bước 11). Các tab Theo cán bộ, Theo loại việc, Theo đơn vị gửi cho các góc nhìn khác; có **Tải ảnh** và **Tải Excel**. Việc quá hạn và trạng thái hồ sơ xem ở Quản lý hồ sơ.'),
    ] + fig('ql-01-tong-hop', 'Kết quả & kế hoạch', ['Các tab góc nhìn', 'Nút Giao kế hoạch']) \
      + fig('ql-02-theo-can-bo', 'Kết quả theo cán bộ', ['Tab Theo cán bộ']) + [
        F.h2('Bước 2. Cân tải: đổi người xử lý'),
        F.para('Vào **Quản lý hồ sơ**, tab Đang xử lý và bấm **Đổi người** trên dòng hồ sơ. Tích chọn cán bộ mới dựa vào bảng tải (Đang mở, Quá hạn, Đã xong) và ghi lý do bắt buộc rồi bấm **Chuyển người khác**. Cán bộ mới nhận thông báo; mốc nhận hồ sơ và SLA không đổi.'),
    ] + fig('ql-03-dang-xu-ly-doi-nguoi', 'Nút Đổi người', ['Đổi người']) \
      + fig('ql-04-doi-nguoi', 'Chuyển người khác', ['Bảng cán bộ: tích chọn người mới', 'Lý do (bắt buộc)', 'Chuyển người khác']) + [
        F.h2('Bước 3. Xem và sửa kết quả ghi nhận của hồ sơ đã hoàn thành'),
        F.para('Vào **Quản lý hồ sơ**, tab Hoàn thành, bấm biểu tượng con mắt: dòng **Kết quả ghi nhận** cho biết HĐ thế chấp và Rlos mà cán bộ đã tick khi hoàn thành. Bấm **Sửa ghi nhận kết quả** để chỉnh khi cán bộ tick nhầm; thao tác được lưu vào Nhật ký.'),
    ] + fig('ql-07-chi-tiet-hoan-thanh', 'Chi tiết hồ sơ đã hoàn thành', ['Kết quả ghi nhận', 'Sửa ghi nhận kết quả']) + [
        F.h2('Bước 4. Duyệt đề nghị hủy hoặc sửa'),
        F.para('Đề nghị của Phòng/PGD hoặc cán bộ LS hiện ở khối **Đề nghị sửa / hủy chờ duyệt** đầu Hàng chờ. Bấm **Duyệt hủy** để mở hộp thoại **Hủy việc** (lý do đã điền sẵn từ đề nghị) rồi xác nhận, hoặc Từ chối. Đề nghị sửa có nút Duyệt và Từ chối, người đề nghị được báo kết quả.'),
    ] + fig('ql-05-duyet-huy', 'Đề nghị hủy chờ duyệt', ['Duyệt hủy']) \
      + fig('ql-06-hop-thoai-huy', 'Xác nhận hủy việc', ['Lý do (điền sẵn)', 'Hủy việc'])

    # QL: danh sách "Bạn làm được gì" và bảng bước
    ql_li = [
        F.li('Làm các việc của Kiểm soát LS: phân công (kể cả **Phân công nhanh**), trả bổ sung, đổi người, duyệt đề nghị (riêng **Đăng ký hộ phòng** chỉ Kiểm soát làm).'),
        F.li('Xem **Kết quả & kế hoạch**: kết quả theo ngày, cán bộ, loại việc, đơn vị gửi và **giao kế hoạch** ngày, chỉ tiêu tháng.'),
        F.li('Theo dõi hồ sơ đã giao theo từng phòng ở **Quản lý hồ sơ**; **xem báo cáo** nhiều kỳ, thời gian & SLA, kỳ tháng và nhật ký toàn bộ.'),
    ]
    t_ql = B(196).xml
    gm.set_cell_text(t_ql, 1, 1, 'Theo dõi Kết quả & kế hoạch'); gm.set_cell_text(t_ql, 1, 2, 'Kết quả theo kỳ, kế hoạch')
    gm.set_cell_text(t_ql, 2, 1, 'Đổi người ở Quản lý hồ sơ khi cần cân tải')
    gm.set_cell_text(t_ql, 3, 2, 'Đã hủy / cập nhật')

    # ---- Phần 3: Kiểm soát LS
    t_ks = B(102).xml
    gm.set_cell_text(t_ks, 1, 1, 'Nhận hồ sơ ở Hàng chờ')
    gm.set_cell_text(t_ks, 2, 1, 'Phân công cho cán bộ LS: tích chọn, hàng loạt hoặc Phân công nhanh')
    gm.set_cell_text(t_ks, 3, 1, 'Theo dõi ở Quản lý hồ sơ, giao kế hoạch')
    gm.set_cell_text(t_ks, 3, 2, 'Đã phân công → Hoàn thành')
    ks_li = [
        F.li('Xem **Hàng chờ** và phân công hồ sơ cho cán bộ LS: từng hồ sơ, hàng loạt hoặc **Phân công nhanh** theo quy tắc.'),
        F.li('Trả hồ sơ về Phòng/PGD khi thiếu thông tin.'),
        F.li('Theo dõi tiến độ hồ sơ đã giao ở **Quản lý hồ sơ**, xem theo từng phòng; **Đổi người** xử lý, duyệt đề nghị sửa/hủy của Phòng/PGD và cán bộ.'),
        F.li('**Đăng ký hộ phòng** khi nhận hồ sơ qua điện thoại hoặc giấy.'),
        F.li('**Giao kế hoạch** ngày và chỉ tiêu tháng cho phòng LS, xem kết quả so với kế hoạch.'),
        F.li('Cấu hình phân công nhanh, xem báo cáo, thời gian và SLA.'),
    ]
    ks_steps = [
        F.h2('Bước 1. Mở Hàng chờ'),
        F.para('**Hàng chờ** chỉ có hồ sơ chưa giao cho cán bộ (Chờ phân công và Cần bổ sung). Thanh trên cùng đếm Chờ phân công, Cần bổ sung, Phát sinh hôm nay. Khối **Đề nghị sửa / hủy chờ duyệt** (nếu có) nằm trên cùng để bạn xử lý trước. Hàng nút theo phòng giúp lọc nhanh hồ sơ của một phòng; hồ sơ phát sinh hôm nay và ngày làm việc kế tiếp được xếp lên trước.'),
        F.para('Mỗi hồ sơ có nút **Phân công** ngay trên dòng. Đầu khối có ba nút: **Phân công nhanh** (giao theo quy tắc), **Đăng ký hộ phòng** (chỉ Kiểm soát) và **Cấu hình phân công nhanh**. Hồ sơ đã giao không còn ở đây: theo dõi ở Quản lý hồ sơ.'),
    ] + fig('ks-01-hang-cho', 'Hàng chờ của Kiểm soát LS', ['Nút Phân công nhanh', 'Hồ sơ Phòng/PGD vừa gửi', 'Nút Phân công']) + [
        F.h2('Bước 2. Phân công từng hồ sơ'),
        F.para('Bấm **Phân công** trên dòng hồ sơ. Hộp thoại liệt kê các cán bộ kèm số việc Đang mở, Quá hạn, Đã xong để bạn chia tải hợp lý: **tích chọn ngay trên dòng của cán bộ** (bấm chỗ nào trên dòng cũng được). Nếu đã có quy tắc phân công nhanh cho phòng và sản phẩm đó, cán bộ theo quy tắc được tick sẵn và có nhãn **Theo quy tắc**; có thể tích người khác. Đánh dấu Ưu tiên xử lý cho cán bộ LS nếu hồ sơ cần làm trước, rồi bấm **Phân công cán bộ LS**.'),
        F.para('Hồ sơ chuyển sang Đã phân công và cán bộ nhận thông báo. Phân công không tính SLA: đồng hồ chỉ chạy khi cán bộ bấm **Tiếp nhận hồ sơ**. Thao tác chạy nền: hộp thoại đóng ngay, hồ sơ rời Hàng chờ và sang Quản lý hồ sơ.'),
    ] + fig('ks-02-hop-thoai-phan-cong', 'Hộp thoại phân công', ['Bảng cán bộ: tích chọn người phụ trách', 'Ưu tiên xử lý', 'Phân công cán bộ LS']) + [
        F.h2('Bước 3. Phân công hàng loạt'),
        F.para('Khi có nhiều hồ sơ cùng giao một người, tích chọn ở cột đầu của từng dòng (hoặc tích ô đầu bảng để chọn cả trang). Thanh **Đã chọn N hồ sơ** hiện ở cuối màn hình: chọn một cán bộ, hoặc chọn **Theo quy tắc Phân công nhanh** để hệ thống tự chọn người theo quy tắc, tùy chọn Ưu tiên LS, rồi bấm Phân công. Mỗi lần tối đa 100 hồ sơ.'),
    ] + fig('ks-03-phan-cong-hang-loat', 'Phân công nhiều hồ sơ cùng lúc', ['Tích chọn các hồ sơ', 'Thanh phân công hàng loạt']) + [
        F.h2('Bước 4. Trả Phòng/PGD bổ sung'),
        F.para('Nếu hồ sơ thiếu thông tin, mở chi tiết (biểu tượng con mắt) rồi bấm **Trả Phòng/PGD bổ sung**. Chọn lý do có sẵn (ví dụ Thiếu giấy tờ tùy thân) hoặc chọn Lý do khác và ghi diễn giải, sau đó xác nhận.'),
        F.para('Hồ sơ chuyển sang Cần bổ sung, SLA dừng, Phòng/PGD nhận thông báo. Khi Phòng gửi lại, hồ sơ quay về Chờ phân công.'),
    ] + fig('ks-04-chi-tiet-tra-bo-sung', 'Nút Trả Phòng/PGD bổ sung trong chi tiết hồ sơ', ['Trả Phòng/PGD bổ sung']) \
      + fig('ks-05-ly-do-bo-sung', 'Chọn lý do trả bổ sung', ['Lý do', 'Xác nhận trả về']) + [
        F.h2('Bước 5. Theo dõi hồ sơ đang chờ bổ sung'),
        F.para('Hồ sơ đang Cần bổ sung vẫn hiện trong **Hàng chờ** với nhãn đỏ và nút Gửi lại (Kiểm soát cũng gửi lại giúp Phòng được khi cần). Hồ sơ này chưa chọn để phân công hàng loạt được.'),
    ] + fig('ks-06-hang-cho-con-lai', 'Hồ sơ Cần bổ sung trong Hàng chờ', ['Các nút lọc theo phòng', 'Hồ sơ còn lại trong Hàng chờ']) + [
        F.h2('Bước 6. Đăng ký hộ phòng'),
        F.para('Khi nhận hồ sơ qua điện thoại hoặc giấy, bấm **Đăng ký hộ phòng** ở đầu khối **Hàng chờ**. Chọn Phòng / PGD gửi hồ sơ (bắt buộc), rồi nhập khách hàng và việc như khi Phòng tự tạo. Hồ sơ được ghi vào đúng phòng đã chọn.'),
    ] + fig('ks-08-dang-ky-ho-phong', 'Đăng ký hộ phòng', ['Chọn Phòng / PGD gửi hồ sơ']) + [
        F.h2('Bước 7. Cấu hình Phân công nhanh'),
        F.para('Bấm **Cấu hình phân công nhanh** ở đầu Hàng chờ để xem các quy tắc; bấm **Quay lại hàng chờ** để trở về. Mỗi quy tắc nói: **phòng nào do cán bộ nào phụ trách** và **sản phẩm nào đi theo**. Bấm **Thêm quy tắc**, chọn Phòng / PGD (bỏ trống là mọi phòng), Cán bộ LS phụ trách và Thứ tự (số nhỏ được xét trước).'),
        F.para('Hồ sơ **cầm cố** của phòng được tick sẵn: phòng đó có cán bộ phụ trách thì mặc định cầm cố về cán bộ ấy. Sản phẩm hoặc cấu phần khác thì **tick thêm** vào quy tắc (tick cả nhóm bằng ô ở đầu nhóm, hoặc chọn **Mọi sản phẩm**). Tích **Tự động giao khi tạo hồ sơ** nếu muốn hệ thống giao ngay không cần Kiểm soát; tích **Đánh dấu ưu tiên** để hồ sơ theo quy tắc mang nhãn ưu tiên. Quy tắc cụ thể (có sản phẩm) được xét trước quy tắc chung cả phòng. Cán bộ đang nghỉ được bỏ qua và việc chuyển cho người thay thế đã khai báo.'),
    ] + fig('ks-09-quy-tac-phan-cong', 'Cấu hình Phân công nhanh trong Hàng chờ', ['Thêm quy tắc']) \
      + fig('ks-09a-them-quy-tac', 'Thêm quy tắc phân công', ['Phòng / PGD', 'Cán bộ LS phụ trách', 'Hồ sơ cầm cố tick sẵn', 'Tick thêm sản phẩm hoặc cả nhóm', 'Lưu quy tắc']) \
      + fig('ks-09b-quy-tac-da-luu', 'Quy tắc đã lưu', ['Bảng quy tắc']) + [
        F.h2('Bước 8. Phân công nhanh'),
        F.para('Bấm **Phân công nhanh** ở đầu Hàng chờ để giao các hồ sơ chờ phân công theo quy tắc. Hộp thoại cho biết có bao nhiêu hồ sơ **khớp quy tắc** và bao nhiêu **chưa có quy tắc**. Hồ sơ khớp quy tắc được tick sẵn kèm cán bộ theo quy tắc; hồ sơ chưa có quy tắc không tick sẵn, chọn cán bộ nếu muốn giao. Có thể đổi cán bộ và đánh dấu Ưu tiên LS từng dòng, rồi bấm **Giao các hồ sơ đã chọn**.'),
    ] + fig('ks-03b-phan-cong-nhanh', 'Phân công nhanh theo quy tắc', ['Số hồ sơ khớp quy tắc', 'Hồ sơ được tick sẵn', 'Giao các hồ sơ đã chọn']) + [
        F.h2('Bước 9. Quản lý hồ sơ: theo dõi hồ sơ đã giao, theo từng phòng'),
        F.para('**Quản lý hồ sơ** chỉ theo dõi các hồ sơ đã phân công cho cán bộ, kể cả đã hoàn thành. Hồ sơ chờ phân công nằm ở Hàng chờ nên không hiện ở đây. Các tab: **Tất cả**, Đã phân công (cán bộ chưa tiếp nhận), Đang xử lý, Đang hẹn khách, Tạm dừng, Quá hạn, Hoàn thành; tab **Đã hủy** là tab riêng ở cuối hàng. Số trên mỗi tab là số hồ sơ đang xem.'),
        F.para('Hàng nút **theo phòng** bên dưới chia hồ sơ theo từng Phòng/PGD kèm số đếm: bấm tên phòng để chỉ xem hồ sơ phòng đó (số trên các tab đếm riêng phòng), bấm **Tất cả phòng** để quay lại. Có ô tìm, bộ lọc theo loại việc và cán bộ, và sắp xếp. Trên dòng có nút **Đổi người** để chuyển hồ sơ cho cán bộ khác (chọn người mới bằng ô tick, ghi lý do bắt buộc; mốc nhận hồ sơ và SLA giữ nguyên).'),
    ] + fig('ks-07-quan-ly-ho-so', 'Quản lý hồ sơ', ['Các tab theo tiến độ', 'Các nút lọc theo phòng', 'Danh sách hồ sơ đã giao']) \
      + fig('ks-07a-theo-phong', 'Xem hồ sơ của một phòng', ['Phòng đang xem', 'Tiêu đề nêu tên phòng']) \
      + fig('ks-07b-dang-xu-ly', 'Tab Đang xử lý với nút Đổi người', ['Tab Đang xử lý', 'Danh sách hồ sơ đang xử lý']) + [
        F.h2('Bước 10. Duyệt đề nghị sửa / hủy'),
        F.para('Đề nghị sửa hoặc hủy của Phòng/PGD và cán bộ LS hiện ở khối **Đề nghị sửa / hủy chờ duyệt** đầu Hàng chờ. Bấm **Duyệt hủy** để mở hộp thoại Hủy việc (lý do điền sẵn từ đề nghị) rồi xác nhận, hoặc Từ chối. Đề nghị sửa có nút Duyệt và Từ chối; người đề nghị được báo kết quả.'),
    ] + fig('ks-13-de-nghi-cho-duyet', 'Đề nghị hủy chờ duyệt ở đầu Hàng chờ', ['Duyệt hủy']) + [
        F.h2('Bước 11. Kết quả & kế hoạch: giao kế hoạch'),
        F.para('**Kết quả & kế hoạch** cho biết cả phòng LS và từng cán bộ đã làm được gì trong ngày, tuần, tháng hoặc khoảng ngày bất kỳ. Bảng **Kết quả thực hiện** có 7 dòng: Soạn thảo HĐ thế chấp (làm TSĐB mới hoặc phụ lục TSĐB), Soạn thảo HĐ tín dụng, Giao dịch trên Rlos, Hồ sơ tồn (Soạn HĐ thế chấp, Soạn HĐ tín dụng) và Khác. Số liệu lấy từ các ô tick của cán bộ khi hoàn thành hồ sơ.'),
        F.para('Bấm **Giao kế hoạch** để đặt **kế hoạch mỗi ngày** cho từng dòng của bảng và **chỉ tiêu hoàn thành mỗi tháng** (toàn LS và mỗi cán bộ), rồi **Lưu kế hoạch**. Kế hoạch kỳ tuần, tháng, năm tự nhân với số ngày làm việc. Bảng hiện cột **Kế hoạch ngày** và **% hoàn thành** để so với kết quả; nút Ẩn / Hiện kế hoạch điều khiển cả ảnh và Excel tải về.'),
    ] + fig('ks-14-ket-qua-ke-hoach', 'Kết quả & kế hoạch', ['Các tab góc nhìn', 'Nút Giao kế hoạch']) \
      + fig('ks-14a-giao-ke-hoach', 'Giao kế hoạch', ['Kế hoạch ngày của từng dòng', 'Chỉ tiêu hoàn thành tháng', 'Lưu kế hoạch']) \
      + fig('ks-14b-ke-hoach-va-ket-qua', 'Kế hoạch và % hoàn thành', ['Cột Kế hoạch ngày và % hoàn thành', 'Ẩn / hiện kế hoạch']) + [
        F.h2('Bước 12. Báo cáo: nhiều kỳ, Thời gian & SLA, Kế hoạch tháng'),
        F.para('**Báo cáo** gộp ba loại báo cáo thành ba tab. **Nhiều kỳ**: chọn khoảng thời gian (tháng, quý, năm hoặc tùy chọn) rồi **Chạy báo cáo**, có **Tải Excel**. **Thời gian & SLA**: chọn khoảng ngày, cán bộ, nghiệp vụ rồi **Xem báo cáo** để xem giờ xử lý theo ngày, cán bộ, nghiệp vụ và tỷ lệ đúng hạn; mục Rà soát mốc thời gian giúp phát hiện hồ sơ thiếu mốc. **Kế hoạch tháng**: kỳ kế hoạch đang chạy và lịch sử các tháng trước.'),
    ] + fig('ks-11-bao-cao', 'Báo cáo nhiều kỳ', ['Các loại báo cáo', 'Chạy báo cáo']) \
      + fig('ks-10-thoi-gian-sla', 'Thời gian & SLA', ['Các loại báo cáo', 'Xem báo cáo']) \
      + fig('ks-12-ky-thang', 'Kế hoạch tháng', ['Các loại báo cáo'])

    # ---- Ghép vào thân tài liệu (từ cuối lên đầu để chỉ số khối còn đúng)
    replace_range(blocks, 235, 235, [admin_p])                       # Quản trị bước 5: đoạn mô tả
    replace_range(blocks, 176, 180, new_ls_done)                          # LS bước 6
    replace_range(blocks, 197, 208, ql_blocks)                            # QL các bước
    replace_range(blocks, 190, 190, ql_new)                               # QL dòng giới thiệu
    replace_range(blocks, 192, 194, ql_li)                                # QL "Bạn làm được gì"
    replace_range(blocks, 103, 141, ks_steps)                             # KS các bước
    replace_range(blocks, 96, 100, ks_li)                                 # KS "Bạn làm được gì"
    return z, root, body, F, blocks


def renumber_figures(root):
    n = 0
    for p in root.iter(q('w:p')):
        t = text_of(p)
        m = re.match(r'^Hình \d+\. (.*)$', t)
        if m:
            n += 1
            runs = [r for r in p.findall('w:r', NS) if r.find('w:t', NS) is not None]
            runs[0].find('w:t', NS).text = 'Hình %d. %s' % (n, m.group(1))
            for extra in runs[1:]:
                p.remove(extra)
    return n


def main():
    z, root, body, F, blocks = build()
    figures = renumber_figures(root)

    # ---- quan hệ ảnh: gán rId cho ảnh mới, cập nhật mọi ảnh bằng bản chụp mới
    rels = etree.fromstring(z.read('word/_rels/document.xml.rels'))
    ct = etree.fromstring(z.read('[Content_Types].xml'))
    rid_target = {r.get('Id'): r.get('Target') for r in rels}
    next_id = 1 + max(int(re.sub(r'\D', '', r.get('Id')) or 0) for r in rels)
    media = {}      # target -> bytes
    used_rids = set()
    new_rid = {}
    for blip in root.iter(q('a:blip')):
        key = blip.get(q('r:embed'))
        if key.startswith('@NEW:'):
            name = key[5:]
            if name not in new_rid:
                rid = 'rId%d' % next_id; next_id += 1
                target = 'media/' + name + '.png'
                rel = etree.SubElement(rels, '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')
                rel.set('Id', rid); rel.set('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'); rel.set('Target', target)
                new_rid[name] = (rid, target)
            blip.set(q('r:embed'), new_rid[name][0])
        used_rids.add(blip.get(q('r:embed')))
    # tên ảnh của mỗi rId (qua docPr name của ảnh dùng rId đó)
    rid_name = {}
    for dp in root.iter(q('wp:docPr')):
        blip = dp.getparent().find('.//a:blip', NS)
        if blip is not None:
            rid_name[blip.get(q('r:embed'))] = dp.get('name')
    # ảnh trong bảng điện thoại: docPr nằm trong w:drawing; đã gồm ở trên
    for rid in used_rids:
        target = next((r.get('Target') for r in rels if r.get('Id') == rid), None)
        name = rid_name.get(rid)
        path = os.path.join(ANH, (name or '') + '.png')
        if target and name and os.path.exists(path):
            media['word/' + target] = open(path, 'rb').read()
        else:
            print('! thiếu ảnh cho', rid, name)
    # bỏ quan hệ không còn dùng
    for r in list(rels):
        if r.get('Type', '').endswith('/image') and r.get('Id') not in used_rids:
            rels.remove(r)
    old_targets = {n for n in z.namelist() if n.startswith('word/media/')}

    # ---- ghi docx
    tmp = OUT_DOCX + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        live = {r.get('Target') for r in rels}
        for item in z.infolist():
            name = item.filename
            if name == 'word/document.xml':
                data = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
            elif name == 'word/_rels/document.xml.rels':
                data = etree.tostring(rels, xml_declaration=True, encoding='UTF-8', standalone=True)
            elif name in media:
                data = media.pop(name)
            elif name.startswith('word/media/'):
                if name[len('word/'):] not in live:
                    continue
                data = z.read(name)
            else:
                data = z.read(name)
            out.writestr(item, data)
        for name, data in media.items():
            out.writestr(name, data)
    os.replace(tmp, OUT_DOCX)
    print('docx: %d hình, %s' % (figures, OUT_DOCX))


if __name__ == '__main__':
    main()
