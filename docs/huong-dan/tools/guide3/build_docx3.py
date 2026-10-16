"""Dựng HUONG_DAN_SU_DUNG_LS_ROUTING.docx từ mô hình nội dung (content_*.py) bằng python-docx.

    py tools/guide3/build_docx3.py            # ra docs/huong-dan/HUONG_DAN_SU_DUNG_LS_ROUTING.docx
    py tools/guide3/finish_docx3.py           # Word cập nhật mục lục và số trang

Kiểu chữ, bảng, khung lưu ý dùng lại bộ dựng của tài liệu Cách tính giờ (tinh-gio/docx_kit.py) để hai tài liệu đồng bộ.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tinh-gio'))

from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Cm, Pt, Twips  # noqa: E402
from PIL import Image  # noqa: E402

import docx_kit  # noqa: E402
from docx_kit import CONTENT_W, Kit, add_runs, cell_margins, fixed_layout  # noqa: E402
from content_all import build_guide  # noqa: E402
from model import ANH  # noqa: E402

OUT = os.path.join(ROOT, 'HUONG_DAN_SU_DUNG_LS_ROUTING.docx')
VERSION = 'Phiên bản 15/10/2026'
SAMPLE_NOTE = 'Ảnh minh họa chụp trên môi trường thử nghiệm; tên khách hàng và số liệu là dữ liệu mẫu.'
HOW = ('Cách đọc: mỗi bước có ảnh chụp màn hình thật. Khung đỏ đánh số trên ảnh khớp với chú giải (1), (2)... ngay dưới ảnh. '
       'Tên nút và mục được in đậm.')


def fit(weights):
    total = float(sum(weights))
    widths = [int(CONTENT_W * w / total) for w in weights]
    widths[-1] += CONTENT_W - sum(widths)
    return widths


MAX_H_CM = 12.5


def image_width_cm(path):
    """Ảnh màn hình lớn rộng hết khổ, hộp thoại nhỏ thu theo kích thước thật để chữ không bị phình;
    ảnh cao quá khổ được thu theo chiều cao để không để lại nửa trang trống."""
    w, h = Image.open(path).size
    width = max(9.0, min(16.6, w * 0.0205))
    if width * h / w > MAX_H_CM:
        width = MAX_H_CM * w / h
    return width


def add_legend(kit, legend):
    para = kit.doc.add_paragraph()
    para.paragraph_format.space_after = Pt(10)
    para.paragraph_format.keep_together = True
    for n, text in enumerate(legend, 1):
        if n > 1:
            add_runs(para, '   ', size=10)
        add_runs(para, '(%d) ' % n, size=10, color=docx_kit.RED, bold=True)
        add_runs(para, text, size=10)
    return para


def add_figure(kit, f):
    path = os.path.join(ANH, f.name + '.png')
    para = kit.doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.paragraph_format.keep_with_next = True
    para.paragraph_format.space_after = Pt(2)
    pic = para.add_run().add_picture(path, width=Cm(image_width_cm(path)))
    pic._inline.docPr.set('name', f.name)
    pic._inline.docPr.set('descr', f.alt)
    cap = kit.doc.add_paragraph(style='Caption')
    add_runs(cap, 'Hình %d. %s' % (f.no, f.caption))
    if f.legend:
        cap.paragraph_format.keep_with_next = True
        cap.paragraph_format.space_after = Pt(2)
        add_legend(kit, f.legend)


def add_phones(kit, figs):
    t = kit.doc.add_table(rows=1, cols=len(figs))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for cell, f in zip(t.rows[0].cells, figs):
        cell_margins(cell, 60, 60, 80, 80)
        para = cell.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.paragraph_format.keep_with_next = True
        pic = para.add_run().add_picture(os.path.join(ANH, f.name + '.png'), width=Cm(5.0))
        pic._inline.docPr.set('name', f.name)
        pic._inline.docPr.set('descr', f.alt)
        cap = cell.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_runs(cap, 'Hình %d. %s' % (f.no, f.caption), size=9.5, color=docx_kit.MUTED, italic=True)
    fixed_layout(t, fit([1] * len(figs)))
    gap = kit.doc.add_paragraph()
    gap.paragraph_format.space_after = Pt(4)


def add_note(kit, text):
    m = re.match(r'^\*\*(.+?)\*\*\s*(.*)$', text, re.S)
    if m:
        title, body = m.group(1).strip().rstrip('.'), m.group(2).strip()
    else:
        title, body = 'Lưu ý', text
    kit.callout('note', title, body or title)


def build():
    g = build_guide()
    kit = Kit()
    kit.header_footer('LS-Routing · Hướng dẫn sử dụng')
    kit.cover('L S - R O U T I N G', 'Hướng dẫn sử dụng', 'Tài liệu dành cho từng vai trò',
              'Tài liệu dành cho',
              ['Phòng / PGD', 'Kiểm soát LS', 'Cán bộ LS', 'Quản lý LS', 'Quản trị hệ thống', 'Giám sát'],
              VERSION, SAMPLE_NOTE)
    kit.toc()
    first = True
    pending_list = []
    for b in g.blocks:
        k = b.kind
        if k == 'h1':
            kit.h1(b.text, page_break=True)
            if first:
                kit.p(HOW, size=10, color=docx_kit.MUTED, italic=True)
                first = False
        elif k == 'h2':
            kit.h2(b.text)
        elif k == 'h3':
            kit.h3(b.text)
        elif k == 'p':
            kit.p(b.text)
        elif k == 'li':
            kit.bullets([b.text])
        elif k == 'note':
            add_note(kit, b.text)
        elif k == 'table':
            kit.table(b.headers, b.rows, fit(b.weights), size=b.size or 10)
        elif k == 'fig':
            add_figure(kit, b)
        elif k == 'phones':
            add_phones(kit, b.figs)
        elif k == 'pagebreak':
            kit.page_break()
        else:
            raise ValueError('Khối lạ: ' + k)
    kit.save(OUT)
    print('docx:', OUT, '| %d hình' % g.figure_no)
    unused = sorted(n for n in g.manifest if n not in set(g.used))
    if unused:
        print('Ảnh có trong manifest nhưng chưa dùng:', ', '.join(unused))


if __name__ == '__main__':
    build()
