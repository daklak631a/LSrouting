#!/usr/bin/env python
"""Dựng lại HUONG_DAN_SU_DUNG_LS_ROUTING.pptx (phiên bản 01/10/2026).

Nguồn: bản PowerPoint 30/09 (ban-cu-30-09-2026/) + docx mới. Giữ nguyên cấu trúc slide của bản gốc (pptxgenjs):
  * slide hình của Phòng/PGD, Cán bộ LS, Quản trị, Giám sát: chỉ thay ảnh và ghi chú, trừ hai slide có chú giải đổi;
  * phần Kiểm soát LS (9 → 12 bước, 21 slide hình) và Quản lý LS (3 → 4 bước, 7 slide hình): dựng lại từ docx;
  * slide mở đầu, vai trò, trang đầu phần, câu hỏi thường gặp (tách thành 2 slide) được sửa chữ.

Chạy:  py build_pptx.py [thư mục làm việc]
"""
import copy
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import guide_model as gm  # noqa: E402

BASE = os.path.dirname(HERE)
SRC = os.path.join(BASE, 'ban-cu-30-09-2026', 'HUONG_DAN_SU_DUNG_LS_ROUTING.pptx')
DOCX = os.path.join(BASE, 'HUONG_DAN_SU_DUNG_LS_ROUTING.docx')
ANH = os.path.join(BASE, 'anh')
OUT = os.path.join(BASE, 'HUONG_DAN_SU_DUNG_LS_ROUTING.pptx')
SKILL = os.environ.get('PPTX_SKILL', r'C:\Users\DELL\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin'
                       r'\53131479-4673-4fe9-85e6-792e7bf6fdee\87cb8f87-758e-4961-b4c6-1287f51c18d3\skills\pptx')
WORK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'ls_pptx_work')

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
UN = os.path.join(WORK, 'un')


def qa(t): return '{%s}%s' % (A, t)
def qp(t): return '{%s}%s' % (P, t)
def qr(t): return '{%s}%s' % (R, t)


# ---------------------------------------------------------------- tiện ích XML / tệp
def slide_path(n): return os.path.join(UN, 'ppt', 'slides', 'slide%d.xml' % n)
def rels_path(n): return os.path.join(UN, 'ppt', 'slides', '_rels', 'slide%d.xml.rels' % n)


def load(path): return etree.parse(path)


def save(tree, path):
    tree.write(path, xml_declaration=True, encoding='UTF-8', standalone=True)


def run_script(name, *args):
    subprocess.run([sys.executable, os.path.join(SKILL, 'scripts', name), *args], check=True)


def para_texts(el):
    out = []
    for p in el.iter(qa('p')):
        t = ''.join(x.text or '' for x in p.iter(qa('t')))
        if t:
            out.append(t)
    return out


def by_name(root, name):
    for el in root.find('.//' + qp('spTree')):
        c = el.find('.//' + qp('cNvPr'))
        if c is not None and c.get('name') == name:
            return el
    return None


def xfrm(el):
    off, ext = el.find('.//' + qa('off')), el.find('.//' + qa('ext'))
    return off, ext


def place(el, x=None, y=None, w=None, h=None):
    off, ext = xfrm(el)
    if x is not None: off.set('x', str(int(x)))
    if y is not None: off.set('y', str(int(y)))
    if w is not None: ext.set('cx', str(int(w)))
    if h is not None: ext.set('cy', str(int(h)))


def set_first_run(el, text):
    """Đặt chữ cho đoạn đầu của hình; giữ định dạng của run đầu, bỏ các run còn lại."""
    p = el.find('.//' + qa('p'))
    runs = p.findall(qa('r'))
    runs[0].find(qa('t')).text = text
    for extra in runs[1:]:
        p.remove(extra)


def set_paragraphs(el, texts, template_p=None):
    """Thay các đoạn của hộp chữ bằng các đoạn nhân bản từ đoạn mẫu."""
    body = el.find(qp('txBody'))
    ps = body.findall(qa('p'))
    tpl = copy.deepcopy(template_p if template_p is not None else ps[0])
    for p in ps:
        body.remove(p)
    for t in texts:
        p = copy.deepcopy(tpl)
        runs = p.findall(qa('r'))
        runs[0].find(qa('t')).text = t
        for extra in runs[1:]:
            p.remove(extra)
        body.append(p)


# ---------------------------------------------------------------- dữ liệu từ docx
def read_docx():
    _, _, _, blocks = gm.parse(DOCX)
    parts, cur, step = [], None, None
    for b in blocks:
        if b.kind == 'h1':
            cur = {'title': b.text, 'steps': []}; parts.append(cur); step = None
        elif b.kind == 'h2':
            step = {'title': re.sub(r'^Bước \d+\.\s*', '', b.text), 'paras': [], 'figs': []}
            cur['steps'].append(step)
        elif b.kind == 'p' and step is not None:
            step['paras'].append(b.text)
        elif b.kind == 'fig' and step is not None:
            step['figs'].append(b)
        elif b.kind == 'h3':
            pass
    return parts, blocks


def legend_items(fig):
    if not fig.legend:
        return []
    t = ''.join(r[0] for r in fig.legend)
    return [i.strip() for i in re.split(r'\(\d+\)\s', t)[1:]]


def strip_caption(fig):
    return re.sub(r'^Hình \d+\.\s*', '', fig.caption or '')


def notes_text(step, fig, first):
    if first:
        return '\n\n'.join(step['paras'])
    cap = strip_caption(fig)
    items = legend_items(fig)
    return '\n'.join([cap] + ['(%d) %s' % (i + 1, t) for i, t in enumerate(items)])


# ---------------------------------------------------------------- nội dung viết tay
KS_BULLETS = {
    'Mở Hàng chờ': ['Hàng chờ chỉ có hồ sơ chưa giao cán bộ', 'Lọc theo phòng bằng các nút phía trên bảng',
                    'Nút Phân công nằm ngay trên dòng'],
    'Phân công từng hồ sơ': ['Tích chọn cán bộ trên bảng (xem tải công việc)',
                             'Cán bộ theo quy tắc được tick sẵn', 'Bấm Phân công cán bộ LS; chạy nền, đóng ngay'],
    'Phân công hàng loạt': ['Tích chọn nhiều hồ sơ', 'Chọn cán bộ hoặc Theo quy tắc Phân công nhanh',
                            'Bấm Phân công (tối đa 100 hồ sơ/lần)'],
    'Trả Phòng/PGD bổ sung': ['Mở chi tiết → Trả Phòng/PGD bổ sung', 'Chọn lý do (hoặc ghi diễn giải)',
                              'Hồ sơ sang Cần bổ sung, chờ Phòng gửi lại'],
    'Theo dõi hồ sơ đang chờ bổ sung': ['Cần bổ sung hiện nhãn đỏ', 'Có nút Gửi lại trên dòng'],
    'Đăng ký hộ phòng': ['Bấm Đăng ký hộ phòng', 'Chọn Phòng / PGD gửi hồ sơ', 'Nhập khách và việc như bình thường'],
    'Cấu hình Phân công nhanh': ['Quy tắc: phòng → cán bộ phụ trách', 'Cầm cố tick sẵn; tick thêm sản phẩm hoặc cả nhóm',
                                 'Tích Tự động giao khi tạo hồ sơ nếu cần'],
    'Phân công nhanh': ['Bấm Phân công nhanh ở đầu Hàng chờ', 'Hồ sơ khớp quy tắc được tick sẵn',
                        'Bấm Giao các hồ sơ đã chọn'],
    'Quản lý hồ sơ: theo dõi hồ sơ đã giao, theo từng phòng': [
        'Chỉ hồ sơ đã giao; hồ sơ chờ nằm ở Hàng chờ', 'Tab theo tiến độ; Đã hủy là tab riêng cuối hàng',
        'Bấm tên phòng để xem riêng; Đổi người trên dòng'],
    'Duyệt đề nghị sửa / hủy': ['Khối Đề nghị sửa / hủy chờ duyệt ở đầu Hàng chờ', 'Duyệt hủy: xác nhận lý do rồi Hủy việc',
                                'Hoặc Từ chối'],
    'Kết quả & kế hoạch: giao kế hoạch': ['Bảng Kết quả thực hiện có 7 dòng', 'Giao kế hoạch: kế hoạch ngày, chỉ tiêu tháng',
                                          'Hiện kế hoạch / % để so với kết quả'],
    'Báo cáo: nhiều kỳ, Thời gian & SLA, Kế hoạch tháng': [
        'Nhiều kỳ: chọn kỳ, Chạy báo cáo, tải Excel', 'Thời gian & SLA: giờ xử lý, tỷ lệ đúng hạn',
        'Kế hoạch tháng: kỳ đang chạy và lịch sử'],
}
QL_BULLETS = {
    'Kết quả & kế hoạch': ['Chọn kỳ, cán bộ, đơn vị rồi bấm Xem', 'Các tab: cán bộ, loại việc, đơn vị gửi',
                           'Giao kế hoạch; Tải ảnh / Tải Excel'],
    'Cân tải: đổi người xử lý': ['Quản lý hồ sơ → Đang xử lý → Đổi người', 'Tích chọn cán bộ mới theo bảng tải',
                                 'Ghi lý do bắt buộc'],
    'Xem và sửa kết quả ghi nhận của hồ sơ đã hoàn thành': [
        'Quản lý hồ sơ → tab Hoàn thành → biểu tượng con mắt', 'Dòng Kết quả ghi nhận: HĐ thế chấp, Rlos',
        'Tick nhầm: bấm Sửa ghi nhận kết quả'],
    'Duyệt đề nghị hủy hoặc sửa': ['Khối Đề nghị sửa / hủy chờ duyệt', 'Duyệt hủy: xác nhận lý do rồi Hủy việc',
                                   'Hoặc Từ chối'],
}
# Tiêu đề slide cao 1 dòng (khoảng 46 ký tự), nên rút gọn tiêu đề dài của docx
TITLE_SHORT = {
    'Quản lý hồ sơ: theo dõi hồ sơ đã giao, theo từng phòng': 'Quản lý hồ sơ: theo dõi hồ sơ đã giao',
    'Báo cáo: nhiều kỳ, Thời gian & SLA, Kế hoạch tháng': 'Báo cáo: nhiều kỳ, SLA, Kế hoạch tháng',
    'Xem và sửa kết quả ghi nhận của hồ sơ đã hoàn thành': 'Xem và sửa kết quả ghi nhận',
}
LS_COMPLETE_BULLETS = ['Bấm Hoàn thành, ghi kết quả', 'Kiểm tra Kết quả ghi nhận (tick HĐ thế chấp, Rlos)',
                       'Chọn cách thông báo Phòng/PGD', 'Hồ sơ hoàn tất, không cần duyệt thêm']

SECTIONS = {  # phần của docx -> các số hiệu slide thuộc phần (đánh số theo bản gốc + slide thêm mới)
    'Phần 2': set(range(7, 20)),
    'Phần 3': set(range(21, 36)) | set(range(75, 81)),
    'Phần 4': set(range(37, 50)),
    'Phần 5': set(range(51, 57)) | {81},
    'Phần 6': set(range(58, 68)),
    'Phần 7': set(range(69, 72)),
}

# ---------------------------------------------------------------- dựng một slide hình
SLIDE_H = 5143500
LIMIT = 4914900
LINE_BULLET = 201168
BULLET_GAP = 79248
CAPTION_PAD = 109728


class Protos:
    """Hình mẫu lấy từ các slide gốc còn nguyên (đọc trước khi sửa bất cứ slide nào)."""

    def __init__(self):
        s21 = load(slide_path(21)).getroot()
        s8 = load(slide_path(8)).getroot()
        s42 = load(slide_path(42)).getroot()
        self.bullets_box = copy.deepcopy(by_name(s21, 'Text 5'))
        self.bullet_p = copy.deepcopy(self.bullets_box.find(qp('txBody')).find(qa('p')))
        self.caption_box = copy.deepcopy(by_name(s8, 'Text 5'))
        self.legend_head = copy.deepcopy(by_name(s21, 'Text 6'))
        self.dot = copy.deepcopy(by_name(s21, 'Shape 7'))
        self.num = copy.deepcopy(by_name(s21, 'Text 8'))
        self.leg = copy.deepcopy(by_name(s21, 'Text 9'))
        self.note_box = copy.deepcopy(by_name(s42, 'Shape 19'))
        self.note_text = copy.deepcopy(by_name(s42, 'Text 20'))


def lines_for(text, cpl):
    return max(1, math.ceil(len(text) / cpl))


def old_spec(n):
    """Đọc nội dung của slide gốc để dựng lại với chú giải mới."""
    r = load(slide_path(n)).getroot()
    spec = {'label': para_texts(by_name(r, 'Text 2'))[0], 'title': para_texts(by_name(r, 'Text 3'))[0],
            'heading': para_texts(by_name(r, 'Text 4'))[0], 'paras': para_texts(by_name(r, 'Text 5')), 'note': None}
    for el in r.find('.//' + qp('spTree')):
        c = el.find('.//' + qp('cNvPr'))
        if c is not None and el.find('.//' + qa('t')) is not None:
            runs = [x.text for x in el.iter(qa('t'))]
            if runs and runs[0].startswith('Lưu ý') and len(runs) > 1:
                spec['note'] = (runs[0], ''.join(runs[1:]))
    return spec


def render_slide(pr, n, spec):
    """Dựng lại phần thân của slide n theo spec:
    label, title, heading ('Cách làm' | 'Hình này'), paras (gạch đầu dòng hoặc chú thích), legend [str], note (đậm, chữ), caption."""
    tree = load(slide_path(n))
    root = tree.getroot()
    sp_tree = root.find('.//' + qp('spTree'))
    keep = {k: by_name(root, k) for k in ('Shape 0', 'Text 1', 'Text 2', 'Text 3', 'Text 4')}
    pic = sp_tree.find(qp('pic'))
    frame = None
    caption_el = None
    for el in sp_tree:
        if etree.QName(el).localname != 'sp':
            continue
        off = el.find('.//' + qa('off'))
        if (off.get('x'), off.get('y')) == ('3584448', '1161288'):
            frame = el
        if (off.get('x'), off.get('y')) == ('3611880', '4451985'):
            caption_el = el
    assert frame is not None and pic is not None and caption_el is not None, 'slide %d thiếu khung ảnh' % n

    set_first_run(keep['Text 2'], spec['label'])
    set_first_run(keep['Text 3'], spec['title'])
    set_first_run(keep['Text 4'], spec['heading'])

    bullets = spec['heading'] == 'Cách làm'
    box = copy.deepcopy(pr.bullets_box if bullets else pr.caption_box)
    paras = spec['paras']
    if bullets:
        set_paragraphs(box, paras, pr.bullet_p)
        total = sum(lines_for(t, 27) for t in paras)
        h = total * LINE_BULLET + len(paras) * BULLET_GAP
    else:
        set_paragraphs(box, paras)
        total = sum(lines_for(t, 27) for t in paras)
        h = total * LINE_BULLET + CAPTION_PAD
    place(box, y=1444752, h=h)

    new = [keep['Shape 0'], keep['Text 1'], keep['Text 2'], keep['Text 3'], keep['Text 4'], box]
    legend = spec['legend']
    note = spec.get('note')
    y = 1444752 + h + 137160
    if legend:
        head = copy.deepcopy(pr.legend_head)
        place(head, y=y)
        new.append(head)
        first_row = y + 283464
        note_h = 45720 + 594360 if note else 0

        def layout(roomy):
            rows, yy = [], first_row
            for t in legend:
                ln = lines_for(t, 38)
                th = (219456 if roomy else 192024) + (ln - 1) * 173736
                rows.append((yy, th))
                yy += th + (64008 if roomy else 27432)
            return rows, yy
        rows, end = layout(True)
        if end + note_h > LIMIT:
            rows, end = layout(False)
            if end + note_h > LIMIT:
                print('  ! slide %d: chú giải vượt giới hạn (%d)' % (n, end + note_h))
        for i, (yy, th) in enumerate(rows):
            d, nm, lg = copy.deepcopy(pr.dot), copy.deepcopy(pr.num), copy.deepcopy(pr.leg)
            place(d, y=yy); place(nm, y=yy); place(lg, y=yy - 9144, h=th)
            set_first_run(nm, str(i + 1)); set_first_run(lg, legend[i])
            new += [d, nm, lg]
        y = end
    if note:
        nb, nt = copy.deepcopy(pr.note_box), copy.deepcopy(pr.note_text)
        ny = y + 45720 if legend else y
        place(nb, y=ny, h=594360)
        place(nt, y=ny + 45720, h=502920)
        runs = nt.findall('.//' + qa('t'))
        runs[0].text = note[0]
        runs[1].text = note[1]
        new += [nb, nt]
    set_first_run(caption_el, spec['caption'])
    new += [frame, pic, caption_el]

    for el in list(sp_tree):
        if etree.QName(el).localname not in ('nvGrpSpPr', 'grpSpPr'):
            sp_tree.remove(el)
    k = 0
    for i, el in enumerate(new):
        c = el.find('.//' + qp('cNvPr'))
        c.set('id', str(i + 2))
        if etree.QName(el).localname == 'sp':
            c.set('name', ('Text %d' if el.find(qp('nvSpPr')).find(qp('cNvSpPr')).get('txBox') else 'Shape %d') % k)
            k += 1
        sp_tree.append(el)
    pic.find('.//' + qp('cNvPr')).set('descr', spec['caption'])
    save(tree, slide_path(n))


def set_image(n, src_png):
    """Ghi ảnh của slide n vào image-n-1.png và trỏ quan hệ của slide tới đó."""
    rp = rels_path(n)
    t = load(rp)
    target = None
    for r in t.getroot():
        if r.get('Type').endswith('/image'):
            r.set('Target', '../media/image-%d-1.png' % n)
            target = r
    assert target is not None, 'slide %d không có ảnh' % n
    save(t, rp)
    shutil.copyfile(src_png, os.path.join(UN, 'ppt', 'media', 'image-%d-1.png' % n))


# ---------------------------------------------------------------- ghi chú của slide
def notes_file_for(n):
    for r in load(rels_path(n)).getroot():
        if r.get('Type').endswith('/notesSlide'):
            return os.path.normpath(os.path.join(UN, 'ppt', 'slides', r.get('Target')))
    return None


def ensure_notes(n):
    """Tạo trang ghi chú cho slide mới (nhân bản trang ghi chú của slide 35)."""
    if notes_file_for(n):
        return
    name = 'notesSlide%d.xml' % n
    src = os.path.join(UN, 'ppt', 'notesSlides', 'notesSlide35.xml')
    shutil.copyfile(src, os.path.join(UN, 'ppt', 'notesSlides', name))
    rel = open(os.path.join(UN, 'ppt', 'notesSlides', '_rels', 'notesSlide35.xml.rels'), encoding='utf8').read()
    open(os.path.join(UN, 'ppt', 'notesSlides', '_rels', name + '.rels'), 'w', encoding='utf8').write(
        rel.replace('slide35.xml', 'slide%d.xml' % n))
    t = load(rels_path(n))
    root = t.getroot()
    ids = [int(r.get('Id')[3:]) for r in root]
    r = etree.SubElement(root, '{%s}Relationship' % REL)
    r.set('Id', 'rId%d' % (max(ids) + 1))
    r.set('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide')
    r.set('Target', '../notesSlides/' + name)
    save(t, rels_path(n))
    ct = os.path.join(UN, '[Content_Types].xml')
    ctt = load(ct)
    o = etree.SubElement(ctt.getroot(), '{%s}Override' % CT)
    o.set('PartName', '/ppt/notesSlides/' + name)
    o.set('ContentType', 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')
    save(ctt, ct)


def set_notes(n, text):
    ensure_notes(n)
    path = notes_file_for(n)
    t = load(path)
    for sp in t.getroot().iter(qp('sp')):
        ph = sp.find('.//' + qp('ph'))
        if ph is not None and ph.get('type') == 'body':
            sp.find('.//' + qa('t')).text = text
    save(t, path)


def get_notes(n):
    path = notes_file_for(n)
    if not path:
        return None
    for sp in load(path).getroot().iter(qp('sp')):
        ph = sp.find('.//' + qp('ph'))
        if ph is not None and ph.get('type') == 'body':
            return sp.find('.//' + qa('t')).text
    return None


# ---------------------------------------------------------------- chương trình
def slide_order():
    pres = load(os.path.join(UN, 'ppt', 'presentation.xml')).getroot()
    rels = load(os.path.join(UN, 'ppt', '_rels', 'presentation.xml.rels')).getroot()
    rid = {r.get('Id'): r.get('Target') for r in rels}
    return [int(re.search(r'slide(\d+)\.xml', rid[i.get(qr('id'))]).group(1))
            for i in pres.find(qp('sldIdLst'))]


def main():
    if os.path.exists(WORK):
        shutil.rmtree(WORK)
    os.makedirs(UN)
    zipfile.ZipFile(SRC).extractall(UN)

    # 1. cấu trúc: 6 slide KS, 1 slide QL, 1 slide câu hỏi thường gặp (làm trước khi sửa nội dung)
    for _ in range(6):
        run_script('add_slide.py', UN, 'slide35.xml', '--after', 'slide35.xml')
    run_script('add_slide.py', UN, 'slide56.xml', '--after', 'slide56.xml')
    run_script('add_slide.py', UN, 'slide73.xml', '--after', 'slide73.xml')
    order = slide_order()
    assert len(order) == 82, len(order)

    parts, _ = read_docx()
    pr = Protos()
    old_notes = {n: get_notes(n) for n in order if get_notes(n) is not None}

    # 2. slide hình theo từng phần
    for key, members in SECTIONS.items():
        part = [p for p in parts if p['title'].startswith(key)][0]
        slides = [n for n in order if n in members]
        flat = []
        for si, step in enumerate(part['steps']):
            for fi, fig in enumerate(step['figs']):
                flat.append((si, fi, step, fig))
        assert len(flat) == len(slides), '%s: %d hình, %d slide' % (key, len(flat), len(slides))
        total = len(part['steps'])
        full = key in ('Phần 3', 'Phần 5')
        bullets = KS_BULLETS if key == 'Phần 3' else QL_BULLETS
        for (si, fi, step, fig), n in zip(flat, slides):
            m = len(step['figs'])
            if full:
                label = 'Bước %d/%d' % (si + 1, total) + ('  ·  Ảnh %d/%d' % (fi + 1, m) if m > 1 else '')
                caption = strip_caption(fig)
                spec = {'label': label, 'title': TITLE_SHORT.get(step['title'], step['title']),
                        'heading': 'Cách làm' if fi == 0 else 'Hình này',
                        'paras': bullets[step['title']] if fi == 0 else [caption],
                        'legend': legend_items(fig), 'note': None, 'caption': caption}
                render_slide(pr, n, spec)
            elif n in (42, 44):
                spec = old_spec(n)
                spec['legend'] = legend_items(fig)
                spec['caption'] = strip_caption(fig)
                if n == 44:
                    spec['paras'] = LS_COMPLETE_BULLETS
                render_slide(pr, n, spec)
            set_image(n, os.path.join(ANH, fig.name + '.png'))
            text = notes_text(step, fig, fi == 0)
            if not full and old_notes.get(n) is not None and old_notes[n].strip() != text.strip():
                print('  ghi chú slide %d khác bản cũ' % n)
            set_notes(n, text)
        print('%s: %d slide hình' % (key, len(slides)))

    # 3. ảnh điện thoại (giữ nguyên nếu không đổi)
    for i, nm in enumerate(('mobile-01-viec-cua-toi', 'mobile-02-tiep-nhan', 'mobile-03-chi-tiet')):
        shutil.copyfile(os.path.join(ANH, nm + '.png'), os.path.join(UN, 'ppt', 'media', 'image-72-%d.png' % (i + 1)))

    edit_text_slides(parts)
    finish(order)


def replace_in(el, old, new):
    done = False
    for t in el.iter(qa('t')):
        if t.text and old in t.text:
            t.text = t.text.replace(old, new)
            done = True
    assert done, old


def edit_text_slides(parts):
    # slide 1: phiên bản
    t = load(slide_path(1)); replace_in(t.getroot(), '30/09/2026', '01/10/2026'); save(t, slide_path(1))

    # slide 2: thẻ vai trò
    t = load(slide_path(2)); r = t.getroot()
    set_first_run(by_name(r, 'Text 9'), 'Phân công (kể cả nhanh), trả bổ sung, đổi người, giao kế hoạch')
    set_first_run(by_name(r, 'Text 17'), 'Như Kiểm soát; bắt đầu từ Kết quả & kế hoạch')
    set_first_run(by_name(r, 'Text 21'), 'Tài khoản, danh mục, kênh gửi tin, lịch làm việc')
    save(t, slide_path(2))

    # slide 20: trang đầu phần Kiểm soát LS
    t = load(slide_path(20)); r = t.getroot()
    set_paragraphs(by_name(r, 'Text 5'), [
        'Phân công ở Hàng chờ: từng hồ sơ, hàng loạt hoặc Phân công nhanh theo quy tắc.',
        'Trả hồ sơ về Phòng/PGD khi thiếu thông tin.',
        'Theo dõi hồ sơ đã giao theo từng phòng; Đổi người, duyệt đề nghị sửa/hủy.',
        'Đăng ký hộ phòng khi nhận hồ sơ qua điện thoại hoặc giấy.',
        'Giao kế hoạch ngày, chỉ tiêu tháng; cấu hình Phân công nhanh, xem báo cáo.'])
    set_paragraphs(by_name(r, 'Text 7'), ['1. Nhận hồ sơ ở Hàng chờ', '2. Phân công: từng hồ sơ, hàng loạt, nhanh',
                                          '3. Theo dõi ở Quản lý hồ sơ, giao kế hoạch'])
    save(t, slide_path(20))

    # slide 50: trang đầu phần Quản lý LS
    t = load(slide_path(50)); r = t.getroot()
    set_first_run(by_name(r, 'Text 2'), 'Điều hành bộ phận LS: dùng các màn hình như Kiểm soát (không có Đăng ký hộ phòng) '
                                        'và bắt đầu từ Kết quả & kế hoạch.')
    set_paragraphs(by_name(r, 'Text 5'), [
        'Làm các việc của Kiểm soát LS: phân công (kể cả Phân công nhanh), trả bổ sung, đổi người, duyệt đề nghị '
        '(riêng Đăng ký hộ phòng chỉ Kiểm soát làm).',
        'Xem Kết quả & kế hoạch theo ngày, cán bộ, loại việc, đơn vị gửi và giao kế hoạch.',
        'Theo dõi hồ sơ đã giao theo từng phòng ở Quản lý hồ sơ; xem báo cáo và nhật ký.'])
    set_paragraphs(by_name(r, 'Text 7'), ['1. Theo dõi Kết quả & kế hoạch', '2. Đổi người khi cần cân tải',
                                          '3. Xem và sửa kết quả hồ sơ hoàn thành', '4. Duyệt đề nghị hủy/sửa'])
    save(t, slide_path(50))

    # slide 73 + 82: câu hỏi thường gặp tách đôi
    _, _, _, blocks = gm.parse(DOCX)
    tbl = [b for b in blocks if b.kind == 'table' and b.rows and b.rows[0][0] and
           ''.join(r[0] for r in b.rows[0][0][0]) == 'Tình huống'][0]
    rows = [(''.join(r[0] for r in c[0][0]), ''.join(r[0] for r in c[1][0])) for c in tbl.rows[1:]]
    assert len(rows) == 11, len(rows)
    t = load(slide_path(73)); r = t.getroot()
    tr = r.findall('.//' + qa('tr'))
    old_first = [tuple(''.join(x.text or '' for x in tc.iter(qa('t'))) for tc in row.findall(qa('tc'))) for row in tr[1:]]
    assert [a for a, _ in old_first] == [a for a, _ in rows[:7]], 'câu hỏi 1-7 đã đổi'
    t2 = load(slide_path(82)); r2 = t2.getroot()
    set_first_run(by_name(r2, 'Text 0'), 'Câu hỏi thường gặp (tiếp)')
    table = r2.find('.//' + qa('tbl'))
    trs = table.findall(qa('tr'))
    for row in trs[1:]:
        table.remove(row)
    for i, (a, b) in enumerate(rows[7:]):
        row = copy.deepcopy(trs[1 + (i % 2)])
        cells = row.findall(qa('tc'))
        for tc, text in zip(cells, (a, b)):
            p = tc.find('.//' + qa('p'))
            runs = p.findall(qa('r'))
            runs[0].find(qa('t')).text = text
            for extra in runs[1:]:
                p.remove(extra)
        lines = max(lines_for(a, 28), lines_for(b, 90))
        row.set('h', str(max(457200, lines * 167640 + 146304)))
        table.append(row)
    save(t2, slide_path(82))


def finish(order):
    set_notes(82, 'Câu hỏi thường gặp (tiếp)')
    # số trang trong ghi chú + docProps
    for pos, n in enumerate(order, 1):
        path = notes_file_for(n)
        if not path:
            continue
        t = load(path)
        for f in t.getroot().iter(qa('fld')):
            f.find(qa('t')).text = str(pos)
        save(t, path)
    app = os.path.join(UN, 'docProps', 'app.xml')
    x = open(app, encoding='utf8').read()
    x = re.sub(r'<Slides>\d+</Slides>', '<Slides>%d</Slides>' % len(order), x)
    x = re.sub(r'<Notes>\d+</Notes>', '<Notes>%d</Notes>' % len(order), x)
    open(app, 'w', encoding='utf8').write(x)

    run_script('clean.py', UN)
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        # [Content_Types].xml đứng đầu
        z.write(os.path.join(UN, '[Content_Types].xml'), '[Content_Types].xml')
        for folder, _, files in os.walk(UN):
            for f in sorted(files):
                full = os.path.join(folder, f)
                arc = os.path.relpath(full, UN).replace(os.sep, '/')
                if arc != '[Content_Types].xml':
                    z.write(full, arc)
    print('Đã ghi', OUT, os.path.getsize(OUT))
    subprocess.run([sys.executable, os.path.join(SKILL, 'scripts', 'office', 'validate.py'), OUT, '--original', SRC])


if __name__ == '__main__':
    main()
