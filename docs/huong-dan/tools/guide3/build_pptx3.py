"""Dựng HUONG_DAN_SU_DUNG_LS_ROUTING.pptx (16:9) bằng python-pptx từ cùng mô hình nội dung với docx và html.

    py tools/guide3/build_pptx3.py

Mỗi ảnh một slide: ảnh bên trái, bên phải "Cách làm" (các ý ngắn của bước) và Chú giải khớp số trên ảnh; lời giải thích đầy đủ
của bước nằm ở phần ghi chú của slide. Bảng dựng bằng bảng PowerPoint thật; mục chữ dài được cắt thành nhiều slide.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE  # noqa: E402
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN  # noqa: E402
from pptx.util import Emu, Inches, Pt  # noqa: E402

from content_all import build_guide  # noqa: E402
from model import ANH, plain  # noqa: E402

OUT = os.path.join(ROOT, 'HUONG_DAN_SU_DUNG_LS_ROUTING.pptx')
VERSION = 'Phiên bản 15/10/2026'

DARK, GREEN, TEAL = '083A36', '0F5C55', '2F8F83'
LIGHT, LINE, INK, MUTED = 'F6FAF9', 'CFE8E4', '1E293B', '64748B'
AMBER, AMBER_BG, AMBER_INK, RED = 'E8A317', 'FFF8E6', '9A6700', 'E11D48'
WHITE = 'FFFFFF'
FONT = 'Calibri'
SW, SH = 13.333, 7.5


def rgb(h):
    return RGBColor.from_string(h)


class Deck:
    def __init__(self):
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = Inches(SW), Inches(SH)
        self.blank = self.prs.slide_layouts[6]
        self.count = 0
        self.part = ''

    # ---- nguyên liệu ----
    def slide(self, bg=WHITE):
        s = self.prs.slides.add_slide(self.blank)
        self.count += 1
        fill = s.background.fill
        fill.solid()
        fill.fore_color.rgb = rgb(bg)
        return s

    def rect(self, s, x, y, w, h, fill, line=None, shape=MSO_SHAPE.RECTANGLE):
        r = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
        r.fill.solid()
        r.fill.fore_color.rgb = rgb(fill)
        if line:
            r.line.color.rgb = rgb(line)
            r.line.width = Pt(1)
        else:
            r.line.fill.background()
        r.shadow.inherit = False
        return r

    def text(self, s, x, y, w, h, runs_or_text, size=16, color=INK, bold=False, align=None, anchor=MSO_ANCHOR.TOP, italic=False, margin=0.05):
        tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = anchor
        tf.margin_left = tf.margin_right = Inches(margin)
        tf.margin_top = tf.margin_bottom = Inches(0.03)
        paragraphs = runs_or_text if isinstance(runs_or_text, list) else [runs_or_text]
        for k, t in enumerate(paragraphs):
            p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
            if align:
                p.alignment = align
            self.runs(p, t, size, color, bold, italic)
        return tb

    @staticmethod
    def runs(p, text, size, color, bold=False, italic=False):
        for part in re.split(r'(\*\*.+?\*\*)', text):
            if not part:
                continue
            b = part.startswith('**') and part.endswith('**')
            r = p.add_run()
            r.text = part[2:-2] if b else part
            f = r.font
            f.name = FONT
            f.size = Pt(size)
            f.bold = bool(b or bold)
            f.italic = italic
            f.color.rgb = rgb(color)

    def bullets(self, s, x, y, w, h, items, size=15, color=INK, gap=6, marker='•'):
        tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Inches(0.05)
        for k, t in enumerate(items):
            p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
            p.space_after = Pt(gap)
            self.runs(p, marker + ' ' + t if marker else t, size, color)
        return tb

    def title_bar(self, s, title, kicker=None):
        self.rect(s, 0, 0, SW, 1.0, DARK)
        self.rect(s, 0, 1.0, SW, 0.05, AMBER)
        if kicker:
            self.text(s, 0.5, 0.1, 11.5, 0.3, kicker, size=11, color=AMBER, bold=True)
        self.text(s, 0.5, 0.34 if kicker else 0.2, 12.3, 0.6, title, size=26 if len(title) < 62 else 22, color=WHITE, bold=True,
                  anchor=MSO_ANCHOR.MIDDLE)
        self.footer(s)

    def footer(self, s):
        self.text(s, 0.5, 7.12, 9, 0.3, 'LS-Routing · Hướng dẫn sử dụng · ' + VERSION, size=9, color=MUTED)
        self.text(s, 11.9, 7.12, 0.95, 0.3, str(self.count), size=9, color=MUTED, align=PP_ALIGN.RIGHT)

    def notes(self, s, text):
        if text:
            s.notes_slide.notes_text_frame.text = text

    def picture(self, s, name, x, y, w, h):
        path = os.path.join(ANH, name + '.png')
        iw, ih = Image.open(path).size
        scale = min(w / iw, h / ih)
        pw, ph = iw * scale, ih * scale
        px, py = x + (w - pw) / 2, y + (h - ph) / 2
        pic = s.shapes.add_picture(path, Inches(px), Inches(py), Inches(pw), Inches(ph))
        pic.line.color.rgb = rgb(LINE)
        pic.line.width = Pt(1)
        return px, py, pw, ph

    # ---- slide mẫu ----
    def cover(self, g):
        s = self.slide(DARK)
        self.rect(s, 0.8, 1.7, 0.12, 2.2, AMBER)
        self.text(s, 1.15, 1.6, 9, 0.5, 'L S - R O U T I N G', size=16, color=AMBER, bold=True)
        self.text(s, 1.15, 2.1, 11, 1.1, 'Hướng dẫn sử dụng', size=54, color=WHITE, bold=True)
        self.text(s, 1.15, 3.3, 11, 0.6, 'Tài liệu dành cho từng vai trò', size=22, color=LINE)
        roles = ['Phòng / PGD', 'Kiểm soát LS', 'Cán bộ LS', 'Quản lý LS', 'Quản trị hệ thống', 'Giám sát']
        x = 1.15
        for r in roles:
            w = 0.34 + 0.115 * len(r)
            self.rect(s, x, 4.5, w, 0.5, GREEN, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            self.text(s, x, 4.5, w, 0.5, r, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
            x += w + 0.18
        self.text(s, 1.15, 6.2, 11, 0.4, VERSION, size=14, color=LINE)
        self.text(s, 1.15, 6.55, 11.5, 0.4, 'Ảnh minh họa chụp trên môi trường thử nghiệm; tên khách hàng và số liệu là dữ liệu mẫu.',
                  size=12, color=LINE, italic=True)

    def agenda(self, parts):
        s = self.slide()
        self.title_bar(s, 'Nội dung')
        half = (len(parts) + 1) // 2
        for col, chunk in enumerate((parts[:half], parts[half:])):
            for k, (num, title) in enumerate(chunk):
                y = 1.5 + k * 0.82
                x = 0.7 + col * 6.2
                self.rect(s, x, y, 0.62, 0.62, GREEN, shape=MSO_SHAPE.OVAL)
                self.text(s, x, y, 0.62, 0.62, str(num), size=18, color=WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
                self.text(s, x + 0.8, y, 5.1, 0.62, title, size=17, color=INK, bold=True, anchor=MSO_ANCHOR.MIDDLE)

    def divider(self, num, title, lead):
        s = self.slide(DARK)
        self.rect(s, 0.8, 2.3, 0.12, 2.0, AMBER)
        self.text(s, 1.15, 2.2, 8, 0.6, 'PHẦN %s' % num, size=18, color=AMBER, bold=True)
        self.text(s, 1.15, 2.75, 11.4, 1.2, title, size=40, color=WHITE, bold=True)
        if lead:
            self.text(s, 1.15, 4.1, 10.8, 1.6, lead, size=20, color=LINE)
        self.footer(s)
        return s

    def figure_slide(self, title, kicker, fig, how, extra_note, notes):
        s = self.slide()
        self.title_bar(s, title, kicker)
        iw, ih = Image.open(os.path.join(ANH, fig.name + '.png')).size
        if iw / float(ih) > 1.7 and not fig.legend:
            # Ảnh rộng (sơ đồ, biểu đồ): chiếm cả bề ngang, phần chữ nằm bên dưới.
            self.picture(s, fig.name, 0.55, 1.3, 12.2, 3.85)
            self.text(s, 0.55, 5.18, 12.2, 0.35, 'Hình %d. %s' % (fig.no, fig.caption), size=11.5, color=MUTED, italic=True, align=PP_ALIGN.CENTER)
            y = 5.6
            if how:
                self.bullets(s, 0.7, y, 11.9, 1.4, how[:4], size=14, gap=3)
            if extra_note:
                self.rect(s, 0.7, 6.35, 11.9, 0.65, AMBER_BG, line=AMBER)
                self.text(s, 0.8, 6.37, 11.7, 0.6, extra_note, size=12, color=AMBER_INK, anchor=MSO_ANCHOR.MIDDLE)
            self.notes(s, notes)
            return s
        px, py, pw, ph = self.picture(s, fig.name, 0.45, 1.3, 8.35, 5.25)
        self.text(s, 0.45, 6.6, 8.35, 0.45, 'Hình %d. %s' % (fig.no, fig.caption), size=11.5, color=MUTED, italic=True, align=PP_ALIGN.CENTER)
        x, w, y = 9.05, 3.85, 1.3
        if how:
            self.text(s, x, y, w, 0.35, 'Cách làm', size=15, color=GREEN, bold=True)
            n_chars = sum(len(t) for t in how)
            size = 14 if n_chars < 190 else 13
            self.bullets(s, x, y + 0.38, w, 2.6, how, size=size, gap=4)
            y += 0.45 + sum(max(1, -(-len(t) // 33)) for t in how) * (size / 72.0 * 1.3) + len(how) * 0.07
        if fig.legend:
            y = max(y, 1.3) + 0.1
            self.text(s, x, y, w, 0.35, 'Chú giải', size=15, color=RED, bold=True)
            y += 0.4
            for k, t in enumerate(fig.legend, 1):
                lines = max(1, -(-len(t) // 36))
                if y + 0.3 > 6.55:
                    break
                self.rect(s, x, y + 0.03, 0.27, 0.27, RED, shape=MSO_SHAPE.OVAL)
                self.text(s, x, y + 0.03, 0.27, 0.27, str(k), size=10.5, color=WHITE, bold=True, align=PP_ALIGN.CENTER,
                          anchor=MSO_ANCHOR.MIDDLE, margin=0)
                self.text(s, x + 0.33, y, w - 0.33, 0.3 * lines, t, size=12.5, color=INK)
                y += 0.1 + 0.25 * lines
        if extra_note:
            ny = min(max(y + 0.1, 5.1), 6.0)
            self.rect(s, x, ny, w, 6.55 - ny, AMBER_BG, line=AMBER)
            self.text(s, x + 0.08, ny + 0.04, w - 0.16, 6.5 - ny, extra_note, size=11.5, color=AMBER_INK)
        self.notes(s, notes)
        return s

    def phones_slide(self, title, kicker, figs, how, notes):
        s = self.slide()
        self.title_bar(s, title, kicker)
        n = len(figs)
        cw = 3.7
        for k, f in enumerate(figs):
            x0 = 0.55 + k * (cw + 0.28)
            self.picture(s, f.name, x0, 1.3, cw, 4.55)
            self.text(s, x0, 5.9, cw, 0.5, 'Hình %d. %s' % (f.no, f.caption), size=11.5, color=MUTED, italic=True, align=PP_ALIGN.CENTER)
        if how:
            self.text(s, 0.55, 6.4, 12.2, 0.6, ' · '.join(how), size=12.5, color=INK)
        self.notes(s, notes)

    def text_slide(self, title, kicker, items, notes='', size=17):
        s = self.slide()
        self.title_bar(s, title, kicker)
        self.bullets(s, 0.7, 1.4, 11.9, 5.5, items, size=size, gap=9)
        self.notes(s, notes)
        return s

    def note_slide(self, title, kicker, text):
        s = self.slide()
        self.title_bar(s, title, kicker)
        h = min(4.8, 1.0 + len(plain(text)) / 95.0 * 0.5)
        self.rect(s, 0.9, 1.7, 11.5, h, AMBER_BG, line=AMBER)
        self.rect(s, 0.9, 1.7, 0.12, h, AMBER)
        self.text(s, 1.2, 1.85, 10.9, h - 0.3, text, size=20, color=AMBER_INK)
        return s

    def table_slide(self, title, kicker, headers, rows, weights, notes='', lead=''):
        s = self.slide()
        self.title_bar(s, title, kicker)
        total = float(sum(weights))
        width = 12.2
        col_w = [width * w / total for w in weights]
        top = 1.3
        if lead:
            lh = 0.15 + max(1, -(-len(plain(lead)) // 105)) * 0.3
            self.text(s, 0.55, top, width, lh, lead, size=16, color=INK)
            top += lh + 0.1
        avail = 7.0 - top
        size = pick_size(headers, rows, weights, avail)
        heights = [0.42] + [row_height(r, col_w, size) for r in rows]
        gt = s.shapes.add_table(len(rows) + 1, len(headers), Inches(0.55), Inches(top), Inches(width), Inches(sum(heights)))
        t = gt.table
        tblpr = gt._element.graphic.graphicData.tbl.tblPr
        tblpr.set('firstRow', '1')
        tblpr.set('bandRow', '0')
        for i, w in enumerate(col_w):
            t.columns[i].width = Inches(w)
        for r_i, h in enumerate(heights):
            t.rows[r_i].height = Inches(h)

        def fill_cell(cell, text, fg, bg, bold=False):
            cell.fill.solid()
            cell.fill.fore_color.rgb = rgb(bg)
            cell.margin_left = cell.margin_right = Inches(0.08)
            cell.margin_top = cell.margin_bottom = Inches(0.05)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            tf.word_wrap = True
            self.runs(tf.paragraphs[0], text, size, fg, bold)
        for i, h in enumerate(headers):
            fill_cell(t.cell(0, i), h, WHITE, GREEN, True)
        for r_i, row in enumerate(rows, 1):
            for i, c in enumerate(row):
                fill_cell(t.cell(r_i, i), c, INK, LIGHT if r_i % 2 == 0 else WHITE)
        self.notes(s, notes)
        return s


SIZES = (15, 14, 13, 12, 11)


def row_height(row, col_w, size):
    cpi = 120 / float(size) * 0.92  # ký tự trên mỗi inch ở cỡ chữ này
    n = max(max(1, -(-len(plain(c)) // max(4, int((col_w[i] - 0.18) * cpi)))) for i, c in enumerate(row))
    return n * size / 72.0 * 1.32 + 0.17


def pick_size(headers, rows, weights, avail):
    total = float(sum(weights))
    col_w = [12.2 * w / total for w in weights]
    for size in SIZES:
        if 0.42 + sum(row_height(r, col_w, size) for r in rows) <= avail:
            return size
    return SIZES[-1]


def paginate_rows(headers, rows, weights, avail=5.6):
    """Cắt các hàng bảng thành các nhóm vừa một slide (ở cỡ chữ nhỏ nhất nếu phải cắt)."""
    total = float(sum(weights))
    col_w = [12.2 * w / total for w in weights]
    if 0.42 + sum(row_height(r, col_w, SIZES[-1]) for r in rows) <= avail:
        return [rows]
    pages, cur, used = [], [], 0.42
    for r in rows:
        h = row_height(r, col_w, SIZES[-2])
        if cur and used + h > avail:
            pages.append(cur)
            cur, used = [], 0.42
        cur.append(r)
        used += h
    if cur:
        pages.append(cur)
    return pages


def chunk_texts(items, budget=2300):
    pages, cur, used = [], [], 0
    for t in items:
        n = len(plain(t)) + 40
        if cur and used + n > budget:
            pages.append(cur)
            cur, used = [], 0
        cur.append(t)
        used += n
    if cur:
        pages.append(cur)
    return pages


def short(text, limit):
    text = plain(text)
    return text if len(text) <= limit else text[:limit - 1].rsplit(' ', 1)[0] + '…'


def build():
    g = build_guide()
    d = Deck()

    # ---- gom khối theo phần / mục ----
    parts = []          # [{'num','title','sections':[{'title','bullets','blocks'}]}]
    for b in g.blocks:
        if b.kind == 'h1':
            m = re.match(r'^Phần (\d+)\.\s*(.*)$', b.text)
            parts.append({'num': m.group(1), 'title': m.group(2), 'sections': [{'title': None, 'bullets': [], 'blocks': []}]})
        elif b.kind in ('h2', 'h3'):
            parts[-1]['sections'].append({'title': b.text, 'bullets': getattr(b, 'bullets', []), 'blocks': []})
        else:
            parts[-1]['sections'][-1]['blocks'].append(b)

    d.cover(g)
    d.agenda([(p['num'], p['title']) for p in parts])

    for part in parts:
        intro = part['sections'][0]
        lead_block = next((b for b in intro['blocks'] if b.kind == 'p'), None)
        lead = short(lead_block.text, 230) if lead_block else ''
        d.divider(part['num'], part['title'], lead)
        kicker = 'Phần %s · %s' % (part['num'], part['title'])

        for sec in part['sections']:
            title = sec['title'] or part['title']
            blocks = [b for b in sec['blocks'] if b is not lead_block]
            if not blocks:
                continue
            has_figs = any(b.kind in ('fig', 'phones') for b in blocks)
            texts = [b for b in blocks if b.kind in ('p', 'li')]
            prose = (chr(10) * 2).join(plain(b.text) for b in texts)
            notes_blocks = [b for b in blocks if b.kind == 'note']
            # Mục có ảnh và có "Cách làm" thì chữ chỉ làm ghi chú; không thì chữ cũng là slide.
            text_is_slide = not (has_figs and sec['bullets'])
            how = list(sec['bullets'])
            if has_figs and not how and texts:
                lis = [short(b.text, 118) for b in texts if b.kind == 'li']
                paras = [b for b in texts if b.kind == 'p']
                if lis and len(lis) <= 5:
                    how = lis
                    text_is_slide = bool(paras) and sum(len(plain(b.text)) for b in paras) > 260
                elif len(paras) == 1 and len(plain(paras[0].text)) <= 430:
                    how = [plain(paras[0].text)]
                    text_is_slide = False
                else:
                    how = []
                    text_is_slide = True
            figs = [b for b in blocks if b.kind in ('fig', 'phones')]
            n_figs = len(figs)
            note_text = short(notes_blocks[0].text, 230) if notes_blocks and has_figs else ''
            fig_no = 0
            pending = []

            def flush(label=title):
                if not pending:
                    return
                items = [b.text for b in pending]
                pages = chunk_texts(items)
                for n, chunk in enumerate(pages, 1):
                    size = 18 if sum(len(plain(t)) for t in chunk) < 900 else 16
                    d.text_slide(label + (' (%d/%d)' % (n, len(pages)) if len(pages) > 1 else ''), kicker, chunk, size=size)
                del pending[:]

            for b in blocks:
                k = b.kind
                if k in ('p', 'li'):
                    if text_is_slide:
                        pending.append(b)
                elif k == 'table':
                    lead_text = ''
                    if pending and sum(len(plain(x.text)) for x in pending) <= 330 and len(pending) <= 2:
                        lead_text = ' '.join(x.text for x in pending)
                        del pending[:]
                    else:
                        flush()
                    pages = paginate_rows(b.headers, b.rows, b.weights)
                    for n, rows in enumerate(pages, 1):
                        d.table_slide(title + (' (%d/%d)' % (n, len(pages)) if len(pages) > 1 else ''), kicker, b.headers, rows, b.weights,
                                      prose if n == 1 and not text_is_slide else '', lead_text if n == 1 else '')
                elif k in ('fig', 'phones'):
                    flush()
                    fig_no += 1
                    label = title + (' (%d/%d)' % (fig_no, n_figs) if n_figs > 1 else '')
                    first = fig_no == 1
                    last = fig_no == n_figs
                    if k == 'phones':
                        d.phones_slide(title, kicker, b.figs, how if first else [], prose if first else '')
                    else:
                        d.figure_slide(label, kicker, b, how if first else [], note_text if last else '', prose if first else '')
            flush()
            if not has_figs:
                for nb in notes_blocks:
                    d.note_slide('Lưu ý · ' + title, kicker, plain(nb.text))
            else:
                for nb in notes_blocks[1:]:
                    d.note_slide('Lưu ý · ' + title, kicker, plain(nb.text))

    d.prs.save(OUT)
    print('pptx: %d slide, %d hình -> %s (%d KB)' % (d.count, g.figure_no, OUT, os.path.getsize(OUT) // 1024))


if __name__ == '__main__':
    build()
