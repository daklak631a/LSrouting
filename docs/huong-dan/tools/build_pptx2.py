#!/usr/bin/env python
"""Dựng lại HUONG_DAN_SU_DUNG_LS_ROUTING.pptx bản 07/10/2026 (GAS v116).

Nguồn: bản PowerPoint 01/10 (ban-cu-01-10-2026/) + docx mới do build_docs2.py dựng. Mọi slide hình của sáu vai trò được dựng lại từ
docx bằng cùng khuôn của build_pptx.py (nhãn bước, tiêu đề, "Cách làm", chú giải, ảnh, ghi chú). Phần Phòng/PGD thêm 2 slide, Cán bộ
LS thêm 4 slide, Quản lý LS bớt 1 slide; slide câu hỏi thường gặp chia theo chiều cao bảng.

Chạy:  py build_pptx2.py [thư mục làm việc]
Cần bộ công cụ pptx của Claude (add_slide.py, clean.py, validate.py); đặt biến PPTX_SKILL nếu đường dẫn khác mặc định.
"""
import copy
import os
import re
import shutil
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_pptx as bp  # noqa: E402
from build_pptx import (qa, qp, qr, load, save, by_name, set_first_run, set_paragraphs, lines_for,  # noqa: E402
                        legend_items, strip_caption, notes_text, set_image, set_notes, TITLE_SHORT, Protos, render_slide)

BASE = os.path.dirname(HERE)
SRC = os.path.join(BASE, 'ban-cu-01-10-2026', 'HUONG_DAN_SU_DUNG_LS_ROUTING.pptx')
SRC30 = os.path.join(BASE, 'ban-cu-30-09-2026', 'HUONG_DAN_SU_DUNG_LS_ROUTING.pptx')
WORK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'ls_pptx_work2')
bp.SRC = SRC
bp.WORK = WORK
bp.UN = os.path.join(WORK, 'un')
UN30 = os.path.join(WORK, 'un30')

PART_BY_LABEL = {'PHÒNG / PGD': 'Phần 2', 'KIỂM SOÁT LS': 'Phần 3', 'CÁN BỘ LS': 'Phần 4', 'QUẢN LÝ LS': 'Phần 5',
                 'QUẢN TRỊ HỆ THỐNG': 'Phần 6', 'GIÁM SÁT': 'Phần 7'}

# "Cách làm" của các bước mới hoặc đổi nội dung (bước giữ nguyên lấy từ slide cũ).
NEW_BULLETS = {
    'Phần 2': {
        'Chọn loại việc, sản phẩm và gửi sang LS': [
            'Chọn Loại việc và Sản phẩm', 'Việc có TSBĐ: chọn Tình trạng TSBĐ, nhập Số HĐ thế chấp cần soạn',
            'Ngày phát sinh mặc định hôm nay; chọn nhanh theo thứ', 'Bấm Gửi sang LS'],
        'Gửi lại khi hồ sơ Chưa giao hồ sơ': [
            'Hồ sơ Chưa giao hồ sơ có nút Gửi lại', 'Chỉ người tạo đề nghị gửi lại được',
            'Chọn ngày KH đề nghị gửi lại rồi xác nhận'],
        'Hủy việc, tạm dừng và đề nghị sửa': [
            'Hủy việc trực tiếp: chọn lý do, xác nhận', 'Tạm dừng việc của mình khi chờ khách',
            'Việc đã giao LS: gửi đề nghị sửa, chờ duyệt'],
    },
    'Phần 3': {
        'Mở Hàng chờ': ['Hàng chờ có hồ sơ chưa giao cán bộ', 'Lọc theo phòng; hồ sơ hôm nay và T+1 xếp trước',
                        'Nút Phân công nằm ngay trên dòng'],
        'Trả Phòng/PGD bổ sung': ['Mở chi tiết → Trả Phòng/PGD bổ sung', 'Chọn lý do (hoặc ghi diễn giải)',
                                  'Hồ sơ sang Chưa giao hồ sơ, chờ Phòng gửi lại'],
        'Hồ sơ Chưa giao hồ sơ': ['Hồ sơ vừa trả về vẫn ở Hàng chờ, nhãn Chưa giao hồ sơ', 'Không có nút Phân công',
                                  'Chỉ Phòng/PGD tạo đề nghị mới gửi lại được'],
        'Duyệt đề nghị sửa': ['Khối Đề nghị sửa chờ duyệt ở đầu Hàng chờ', 'Xem giá trị cũ, giá trị mới và lý do',
                              'Bấm Duyệt hoặc Từ chối'],
        'Kết quả & kế hoạch: giao kế hoạch': ['Bảng Kết quả thực hiện có 9 dòng (thêm Nhập/Xuất kho TSĐB)',
                                              'Giao kế hoạch: kế hoạch ngày, chỉ tiêu tháng',
                                              'Hiện kế hoạch / % để so với kết quả'],
    },
    'Phần 4': {
        'Mở Việc của tôi': ['Tab: Đang mở, Đang làm, Chờ bắt đầu, Chờ làm tiếp, Chờ khách / Tạm dừng',
                            'Hồ sơ mới giao có nút Tiếp nhận ngay trên dòng',
                            'Giờ xử lý KH tính bằng phút, chỉ chạy khi Đang làm'],
        'Tiếp nhận hồ sơ': ['Bấm Tiếp nhận, chọn Làm hồ sơ này ngay hoặc Nhận vào danh sách chờ',
                            'Chờ bắt đầu / Chờ làm tiếp: bấm Làm ngay / Làm tiếp', 'Chỉ cán bộ được giao mới tiếp nhận được'],
        'Xem chi tiết, nhóm việc và việc kèm': ['Mở chi tiết bằng biểu tượng con mắt', 'Tích nhóm Việc phải làm; việc TSĐB tick Phần việc',
                                                'Việc kèm: thêm hồ sơ TSĐB mới đi kèm'],
        'Hoàn thành hồ sơ': ['Bấm Hoàn thành, ghi kết quả', 'Kiểm tra Kết quả ghi nhận (HĐ thế chấp, Rlos)',
                             'Việc TSĐB: tick đủ phần việc (soạn HĐ, nhập/xuất kho)', 'Chọn cách thông báo Phòng/PGD'],
        'Tạm dừng và tiếp tục': ['Bấm Tạm dừng ngay trên dòng, xác nhận', 'SLA và giờ xử lý dừng',
                                 'Tiếp tục xử lý khi làm tiếp; Đổi hạn nếu cần'],
        'Tạm dừng toàn bộ khi làm việc khác': ['Dùng khi họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ',
                                               'Chọn công việc rồi Bắt đầu tạm dừng', 'Hồ sơ đang làm sang Chờ làm tiếp',
                                               'Xong bấm Kết thúc tạm dừng'],
        'Phân giao phòng': ['Màn hình chỉ xem', 'Chọn tuần, cán bộ, trạng thái hoặc tìm khách',
                            'Không hiện điện thoại, email, ghi chú của khách'],
        'Thời gian của tôi và Nhật ký': ['Thời gian của tôi: số phút theo ngày, nghiệp vụ', 'Có tác nghiệp khác và tỷ lệ đúng hạn',
                                         'Nhật ký: mỗi trang 100 dòng, bấm Xem thêm'],
    },
    'Phần 5': {
        'Cân tải: đổi người xử lý': ['Quản lý hồ sơ → Đang xử lý → Đổi người', 'Tích chọn cán bộ mới; tick phần cán bộ cũ đã làm xong',
                                     'Ghi lý do bắt buộc'],
        'Duyệt đề nghị sửa': ['Khối Đề nghị sửa chờ duyệt ở đầu Hàng chờ', 'Duyệt để áp dụng hoặc Từ chối',
                              'Việc hủy do Phòng/PGD, cán bộ LS tự hủy'],
    },
}
NOTES_BY_STEP = {  # hộp "Lưu ý" của slide đầu mỗi bước, lấy từ slide cũ
    ('Phần 2', 'Tạo việc mới: nhập thông tin khách hàng'),
    ('Phần 4', 'Tiếp nhận hồ sơ'),
    ('Phần 4', 'Hẹn khách ký hồ sơ'),
}

TEXT_EDITS = {
    'role_cards': {'Text 5': 'Tạo việc, gửi lại, hủy việc, theo dõi hồ sơ của phòng',
                   'Text 9': 'Phân công (kể cả nhanh), trả về, đổi người, giao kế hoạch',
                   'Text 13': 'Tiếp nhận, làm hồ sơ, hẹn khách ký, hoàn thành'},
    'rules': {'Text 3': 'SLA bắt đầu khi cán bộ LS bấm Tiếp nhận hồ sơ (không tính từ lúc tạo hay lúc phân công) và được tính theo giờ làm việc đã cấu hình.',
              'Text 6': 'SLA tạm dừng khi hồ sơ ở Tạm dừng, Đang hẹn khách ký hoặc Chưa giao hồ sơ; ra khỏi các trạng thái này hạn được lùi đúng thời gian đã chờ.',
              'Text 9': 'Chỉ khi hồ sơ Đang làm thì giờ xử lý mới chạy; Chờ bắt đầu, Chờ làm tiếp và Tạm dừng thì dừng. Thời lượng hiển thị bằng phút.',
              'Text 12': 'Đổi người phụ trách không làm mất mốc nhận hồ sơ và không đặt lại SLA.',
              'Text 15': 'Hoàn thành cần: Hẹn khách ký (nếu loại việc cần), tích đủ Việc phải làm; việc TSĐB tick đủ phần việc (soạn HĐ, nhập/xuất kho).',
              'Text 18': 'Mọi thao tác quan trọng đều ghi vào Nhật ký (người làm, thời điểm, lý do).'},
    'flow': {'Text 52': 'Trả về Phòng/PGD',
             'Text 53': 'Kiểm soát (hoặc hệ thống) trả về: Chưa giao hồ sơ, SLA dừng; Phòng chọn ngày rồi Gửi lại',
             'Text 61': 'Hủy việc',
             'Text 62': 'Phòng/PGD, cán bộ LS, Kiểm soát/Quản lý hủy trực tiếp, chọn lý do, không chờ duyệt'},
}
STATUS_ROWS = {  # slide 4: (hàng, cột) -> chữ
    (1, 3): 'Phân công · Trả về Phòng/PGD · Hủy',
    (2, 0): 'Chưa giao hồ sơ',
    (2, 1): 'Kiểm soát trả về hoặc hệ thống tự trả (quá ngày chưa tiếp nhận); SLA dừng',
    (2, 2): 'Phòng / PGD (người tạo đề nghị)',
    (2, 3): 'Chọn ngày và Gửi lại LS · Hủy',
    (4, 1): 'Cán bộ đã nhận hồ sơ; SLA chạy. Tiến độ: Chờ bắt đầu, Đang làm, Chờ làm tiếp',
    (4, 3): 'Làm ngay / Làm tiếp · Hẹn ký · Hoàn thành · Tạm dừng',
}
PART_INTROS = {  # trang đầu phần: ô chữ -> đoạn
    6: {'Text 5': ['Tạo việc mới cho khách hàng, một hồ sơ có thể có nhiều việc.',
                   'Theo dõi trạng thái từng hồ sơ của phòng mình và cán bộ đang xử lý.',
                   'Chọn ngày và Gửi lại khi hồ sơ ở Chưa giao hồ sơ.',
                   'Hủy việc trực tiếp, tạm dừng việc của mình, đổi hạn; đề nghị sửa việc đã giao LS.',
                   'Xem toàn bộ hồ sơ, dashboard và nhật ký của phòng.'],
        'Text 7': ['1. Tạo việc mới', '2. Theo dõi hồ sơ đã gửi', '3. Gửi lại khi Chưa giao hồ sơ']},
    20: {'Text 5': ['Phân công ở Hàng chờ: từng hồ sơ, hàng loạt hoặc Phân công nhanh theo quy tắc.',
                    'Trả hồ sơ về Phòng/PGD khi thiếu thông tin (Chưa giao hồ sơ).',
                    'Theo dõi hồ sơ đã giao theo từng phòng; Đổi người, duyệt đề nghị sửa.',
                    'Đăng ký hộ phòng khi nhận hồ sơ qua điện thoại hoặc giấy.',
                    'Giao kế hoạch ngày, chỉ tiêu tháng; cấu hình Phân công nhanh, xem báo cáo; tiện ích Firefox.']},
    36: {'Text 5': ['Xem việc được giao, bấm Tiếp nhận rồi làm ngay hoặc nhận vào danh sách chờ.',
                    'Chuyển hồ sơ giữa Đang làm và Chờ làm tiếp (Làm ngay / Làm tiếp).',
                    'Hẹn khách ký hồ sơ và báo khách qua Email, Zalo hoặc SMS.',
                    'Hoàn thành việc (việc TSĐB tick phần việc) và báo cho Phòng/PGD.',
                    'Tạm dừng, Tạm dừng toàn bộ, việc kèm, đổi hạn; xem Phân giao phòng, thời gian và nhật ký.']},
    50: {'Text 2': ['Điều hành bộ phận LS: dùng các màn hình như Kiểm soát (không có Đăng ký hộ phòng) và bắt đầu từ Kết quả & kế hoạch.'],
         'Text 5': ['Làm các việc của Kiểm soát LS: phân công (kể cả Phân công nhanh), trả về Phòng/PGD, đổi người, duyệt đề nghị sửa '
                    '(riêng Đăng ký hộ phòng chỉ Kiểm soát làm).',
                    'Xem Kết quả & kế hoạch theo ngày, cán bộ, loại việc, đơn vị gửi và giao kế hoạch.',
                    'Theo dõi hồ sơ đã giao theo từng phòng ở Quản lý hồ sơ; xem báo cáo và nhật ký.'],
         'Text 7': ['1. Theo dõi Kết quả & kế hoạch', '2. Đổi người khi cần cân tải', '3. Xem và sửa kết quả hồ sơ hoàn thành',
                    '4. Duyệt đề nghị sửa']},
}


def unpack(path, dest):
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    zipfile.ZipFile(path).extractall(dest)


def labels_by_slide(order):
    out = {}
    for n in order:
        r = load(bp.slide_path(n)).getroot()
        t1, t2 = by_name(r, 'Text 1'), by_name(r, 'Text 2')
        if t1 is not None and t2 is not None:
            a, b = bp.para_texts(t1), bp.para_texts(t2)
            if a and b and a[0] in PART_BY_LABEL and b[0].startswith('Bước'):
                out[n] = PART_BY_LABEL[a[0]]
    return out


def part_slides(order, labels):
    parts = {}
    for n in order:
        if n in labels:
            parts.setdefault(labels[n], []).append(n)
    return parts


def add_after(last):
    before = set(os.listdir(os.path.join(bp.UN, 'ppt', 'slides')))
    bp.run_script('add_slide.py', bp.UN, 'slide%d.xml' % last, '--after', 'slide%d.xml' % last)
    new = [f for f in os.listdir(os.path.join(bp.UN, 'ppt', 'slides')) if f.endswith('.xml') and f not in before]
    assert len(new) == 1, new
    return int(re.search(r'(\d+)', new[0]).group(1))


def drop_slide(n):
    pres_path = os.path.join(bp.UN, 'ppt', 'presentation.xml')
    pres = load(pres_path)
    rels = load(os.path.join(bp.UN, 'ppt', '_rels', 'presentation.xml.rels')).getroot()
    rid = {r.get('Id'): r.get('Target') for r in rels}
    lst = pres.getroot().find(qp('sldIdLst'))
    for s in list(lst):
        if re.search(r'slide(\d+)\.xml', rid[s.get(qr('id'))]).group(1) == str(n):
            lst.remove(s)
    save(pres, pres_path)


def cell_text(tc):
    return ''.join(x.text or '' for x in tc.iter(qa('t')))


def set_cell(tc, text):
    p = tc.find('.//' + qa('p'))
    runs = p.findall(qa('r'))
    runs[0].find(qa('t')).text = text
    for extra in runs[1:]:
        p.remove(extra)


def step_key(title, table):
    """Khóa tìm "Cách làm" cũ: tiêu đề docx hoặc dạng rút gọn."""
    return title if title in table else TITLE_SHORT.get(title, title)


def fill_faq(slide_no, rows):
    t = load(bp.slide_path(slide_no))
    table = t.getroot().find('.//' + qa('tbl'))
    trs = table.findall(qa('tr'))
    tpl = [copy.deepcopy(trs[1]), copy.deepcopy(trs[2])]
    for row in trs[1:]:
        table.remove(row)
    total = 0
    for i, (a, b) in enumerate(rows):
        row = copy.deepcopy(tpl[i % 2])
        cells = row.findall(qa('tc'))
        for tc, text in zip(cells, (a, b)):
            set_cell(tc, text)
        h = max(457200, max(lines_for(a, 28), lines_for(b, 90)) * 167640 + 146304)
        row.set('h', str(h))
        total += h
        table.append(row)
    save(t, bp.slide_path(slide_no))
    return total


def faq_row_height(a, b):
    return max(457200, max(lines_for(a, 28), lines_for(b, 90)) * 167640 + 146304)


def faq_rows():
    _, _, _, blocks = bp.gm.parse(bp.DOCX)
    tbl = [b for b in blocks if b.kind == 'table' and b.rows and b.rows[0] and b.rows[0][0] and
           ''.join(r[0] for r in b.rows[0][0][0]) == 'Tình huống'][0]
    return [(''.join(r[0] for r in c[0][0]), ''.join(r[0] for r in c[1][0])) for c in tbl.rows[1:]]


def faq_chunks(rows):
    """Chia các hàng câu hỏi thành các slide theo chiều cao bảng."""
    t73 = load(bp.slide_path(73)).getroot()
    gf = t73.find('.//' + qp('graphicFrame'))
    top = int(gf.find('.//' + qa('off')).get('y'))
    room = bp.LIMIT - top - 380000   # chừa dòng tiêu đề bảng
    chunks, cur, used = [], [], 0
    for row in rows:
        h = faq_row_height(*row)
        if cur and used + h > room:
            chunks.append(cur); cur, used = [], 0
        cur.append(row)
        used += h
    chunks.append(cur)
    if len(chunks) > 1:
        # chia đều các slide: ngưỡng quanh trung bình, vẫn không vượt chiều cao cho phép
        heights = [faq_row_height(*r) for r in rows]
        limit = min(room, sum(heights) // len(chunks) + max(heights) * 6 // 10)
        balanced, cur, used = [], [], 0
        for row, h in zip(rows, heights):
            if cur and used + h > limit:
                balanced.append(cur); cur, used = [], 0
            cur.append(row)
            used += h
        balanced.append(cur)
        if len(balanced) == len(chunks):
            chunks = balanced
    return chunks


def main():
    unpack(SRC, bp.UN)
    unpack(SRC30, UN30)
    # khuôn dựng slide lấy từ bản gốc 30/09 (tên hình còn đúng như pptxgenjs sinh ra)
    keep_un = bp.UN
    bp.UN = UN30
    pr = Protos()
    bp.UN = keep_un

    order = bp.slide_order()
    assert len(order) == 82, len(order)
    labels = labels_by_slide(order)
    sections = part_slides(order, labels)

    docparts, _ = bp.read_docx()
    docpart = {p['title'][:6]: p for p in docparts if p['title'].startswith('Phần')}

    # "Cách làm" và ghi chú cũ theo (phần, tiêu đề bước)
    old_bullets, old_notes_box = {}, {}
    for part, slides in sections.items():
        old_bullets[part], old_notes_box[part] = {}, {}
        for n in slides:
            spec = bp.old_spec(n)
            if spec['heading'] == 'Cách làm':
                old_bullets[part][spec['title']] = spec['paras']
                if spec['note']:
                    old_notes_box[part][spec['title']] = spec['note']
    old_slide_notes = {n: bp.get_notes(n) for n in order}

    # 1. cấu trúc: thêm/bớt slide cho từng phần (làm trước khi sửa nội dung)
    flat_by_part, fig_total = {}, {}
    for part, slides in sections.items():
        dp = docpart[part]
        steps = [s for s in dp['steps'] if s['figs']]
        flat = [(si, fi, st, fg) for si, st in enumerate(steps) for fi, fg in enumerate(st['figs'])]
        flat_by_part[part], fig_total[part] = flat, len(steps)
        need, have = len(flat), len(slides)
        while have < need:
            slides.append(add_after(slides[-1]))
            have += 1
            print('  %s: thêm slide %d' % (part, slides[-1]))
        while have > need:
            n = slides.pop()
            drop_slide(n)
            have -= 1
            print('  %s: bỏ slide %d' % (part, n))
    rows = faq_rows()
    chunks = faq_chunks(rows)
    faq_slides = [73, 82]
    while len(faq_slides) < len(chunks):
        faq_slides.append(add_after(faq_slides[-1]))
        print('  FAQ: thêm slide %d' % faq_slides[-1])
    assert len(chunks) <= len(faq_slides), 'bớt slide câu hỏi chưa hỗ trợ'
    order = bp.slide_order()

    # 2. dựng từng slide hình
    for part, slides in sections.items():
        flat = flat_by_part[part]
        bullets_new = NEW_BULLETS.get(part, {})
        bullets_old = old_bullets[part]
        steps_total = fig_total[part]
        for (si, fi, step, fig), n in zip(flat, slides):
            m = len(step['figs'])
            title = step['title']
            label = 'Bước %d/%d' % (si + 1, steps_total) + ('  ·  Ảnh %d/%d' % (fi + 1, m) if m > 1 else '')
            caption = strip_caption(fig)
            if fi == 0:
                if title in bullets_new:
                    paras = bullets_new[title]
                elif title in bullets_old:
                    paras = bullets_old[title]
                elif TITLE_SHORT.get(title) in bullets_old:
                    paras = bullets_old[TITLE_SHORT[title]]
                elif part == 'Phần 3' and title in bp.KS_BULLETS:
                    paras = bp.KS_BULLETS[title]
                elif part == 'Phần 5' and title in bp.QL_BULLETS:
                    paras = bp.QL_BULLETS[title]
                else:
                    raise KeyError('thiếu "Cách làm" cho %s / %s' % (part, title))
            else:
                paras = [caption]
            note = old_notes_box[part].get(TITLE_SHORT.get(title, title)) or old_notes_box[part].get(title)
            spec = {'label': label, 'title': TITLE_SHORT.get(title, title), 'heading': 'Cách làm' if fi == 0 else 'Hình này',
                    'paras': paras, 'legend': legend_items(fig), 'note': note if fi == 0 and (part, title) in NOTES_BY_STEP else None,
                    'caption': caption}
            render_slide(pr, n, spec)
            set_image(n, os.path.join(bp.ANH, fig.name + '.png'))
            set_notes(n, notes_text(step, fig, fi == 0))
        print('%s: %d slide hình' % (part, len(slides)))

    # 3. ảnh điện thoại
    for i, nm in enumerate(('mobile-01-viec-cua-toi', 'mobile-02-tiep-nhan', 'mobile-03-chi-tiet')):
        shutil.copyfile(os.path.join(bp.ANH, nm + '.png'), os.path.join(bp.UN, 'ppt', 'media', 'image-72-%d.png' % (i + 1)))

    # 4. slide chữ
    t = load(bp.slide_path(1)); bp.replace_in(t.getroot(), '01/10/2026', '07/10/2026'); save(t, bp.slide_path(1))
    t = load(bp.slide_path(2)); r = t.getroot()
    for name, text in TEXT_EDITS['role_cards'].items():
        set_first_run(by_name(r, name), text)
    save(t, bp.slide_path(2))
    t = load(bp.slide_path(3)); r = t.getroot()
    for name, text in TEXT_EDITS['flow'].items():
        set_first_run(by_name(r, name), text)
    save(t, bp.slide_path(3))
    t = load(bp.slide_path(4)); r = t.getroot()
    trs = r.find('.//' + qa('tbl')).findall(qa('tr'))
    for (ri, ci), text in STATUS_ROWS.items():
        set_cell(trs[ri].findall(qa('tc'))[ci], text)
    save(t, bp.slide_path(4))
    t = load(bp.slide_path(5)); r = t.getroot()
    for name, text in TEXT_EDITS['rules'].items():
        set_first_run(by_name(r, name), text)
    save(t, bp.slide_path(5))
    for n, boxes in PART_INTROS.items():
        t = load(bp.slide_path(n)); r = t.getroot()
        for name, paras in boxes.items():
            el = by_name(r, name)
            if len(paras) == 1 and name == 'Text 2':
                set_first_run(el, paras[0])
            else:
                set_paragraphs(el, paras)
        save(t, bp.slide_path(n))

    # 5. câu hỏi thường gặp
    for i, (n, chunk) in enumerate(zip(faq_slides, chunks)):
        fill_faq(n, chunk)
        if i:
            t = load(bp.slide_path(n))
            set_first_run(by_name(t.getroot(), 'Text 0'), 'Câu hỏi thường gặp (tiếp)' if i == 1 else 'Câu hỏi thường gặp (tiếp %d)' % i)
            save(t, bp.slide_path(n))
            set_notes(n, 'Câu hỏi thường gặp (tiếp)' if i == 1 else 'Câu hỏi thường gặp (tiếp %d)' % i)
    print('FAQ: %s hàng trên các slide %s' % ([len(c) for c in chunks], faq_slides))

    bp.finish(order)


if __name__ == '__main__':
    main()
