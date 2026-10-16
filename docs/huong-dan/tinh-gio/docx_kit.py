"""Bộ dựng nhỏ trên python-docx cho tài liệu "Cách tính giờ": kiểu chữ, bảng, khung ghi chú, hình, mục lục.

Màu và phông theo bộ hướng dẫn sử dụng hiện có (Calibri, xanh 0F5C55 / 083A36, vàng E8A317).
"""
import re

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor, Twips

INK = '1E293B'
GREEN = '0F5C55'
DARK = '083A36'
LIGHT = 'F6FAF9'
LINE = 'CFE8E4'
AMBER = 'E8A317'
AMBER_BG = 'FFF8E6'
AMBER_INK = '9A6700'
MUTED = '64748B'
RED = 'E11D48'
RED_BG = 'FFF1F2'

PAGE_W, PAGE_H, MARGIN = 11906, 16838, 1134
CONTENT_W = PAGE_W - 2 * MARGIN  # 9638 DXA


def rgb(hex_):
    return RGBColor.from_string(hex_)


def set_fonts(run_or_style, name='Calibri'):
    el = run_or_style.element if hasattr(run_or_style, 'element') else run_or_style
    rpr = el.get_or_add_rPr() if hasattr(el, 'get_or_add_rPr') else el.find(qn('w:rPr'))
    fonts = rpr.find(qn('w:rFonts'))
    if fonts is None:
        fonts = OxmlElement('w:rFonts')
        rpr.insert(0, fonts)
    for k in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        fonts.set(qn(k), name)


def shade(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    for old in tcpr.findall(qn('w:shd')):
        tcpr.remove(old)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    tcpr.append(shd)


def cell_margins(cell, top=80, bottom=80, left=120, right=120):
    tcpr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for side, v in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        e = OxmlElement('w:' + side)
        e.set(qn('w:w'), str(v))
        e.set(qn('w:type'), 'dxa')
        mar.append(e)
    tcpr.append(mar)


def cell_borders(cell, **sides):
    """sides: left=(size, color) ... ; None để bỏ cạnh."""
    tcpr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right'):
        e = OxmlElement('w:' + side)
        spec = sides.get(side)
        if spec is None:
            e.set(qn('w:val'), 'nil')
        else:
            e.set(qn('w:val'), 'single')
            e.set(qn('w:sz'), str(spec[0]))
            e.set(qn('w:space'), '0')
            e.set(qn('w:color'), spec[1])
        borders.append(e)
    tcpr.append(borders)


def table_borders(table, color=LINE, size=4):
    tblpr = table._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + side)
        e.set(qn('w:val'), 'single')
        e.set(qn('w:sz'), str(size))
        e.set(qn('w:space'), '0')
        e.set(qn('w:color'), color)
        borders.append(e)
    tblpr.append(borders)


def fixed_layout(table, widths):
    """Chiều rộng bảng và từng cột bằng DXA, bố cục cố định."""
    table.autofit = False
    tblpr = table._tbl.tblPr
    for old in tblpr.findall(qn('w:tblW')):
        tblpr.remove(old)
    w = OxmlElement('w:tblW')
    w.set(qn('w:w'), str(sum(widths)))
    w.set(qn('w:type'), 'dxa')
    tblpr.append(w)
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tblpr.append(layout)
    grid = table._tbl.tblGrid
    for g, width in zip(grid.findall(qn('w:gridCol')), widths):
        g.set(qn('w:w'), str(width))
    for row in table.rows:
        for cell, width in zip(row.cells, widths):
            cell.width = Twips(width)


def keep_row_together(row):
    trpr = row._tr.get_or_add_trPr()
    e = OxmlElement('w:cantSplit')
    trpr.append(e)


def repeat_header(row):
    trpr = row._tr.get_or_add_trPr()
    e = OxmlElement('w:tblHeader')
    trpr.append(e)


def add_runs(paragraph, text, size=None, color=None, bold=None, italic=None):
    """Chữ đậm theo **...** trong chuỗi."""
    parts = re.split(r'(\*\*.+?\*\*)', text)
    for part in parts:
        if not part:
            continue
        is_bold = part.startswith('**') and part.endswith('**')
        run = paragraph.add_run(part[2:-2] if is_bold else part)
        set_fonts(run)
        if is_bold or bold:
            run.bold = True
        if italic:
            run.italic = True
        if size:
            run.font.size = Pt(size)
        if color:
            run.font.color.rgb = rgb(color)
    return paragraph


def field(paragraph, instruction, placeholder='', size=None, color=None):
    """Chèn một trường Word (PAGE, NUMPAGES, TOC...)."""
    def run_with(child):
        run = paragraph.add_run()
        set_fonts(run)
        if size:
            run.font.size = Pt(size)
        if color:
            run.font.color.rgb = rgb(color)
        run._r.append(child)
        return run
    begin = OxmlElement('w:fldChar'); begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'), 'preserve'); instr.text = ' ' + instruction + ' '
    sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'), 'separate')
    end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'), 'end')
    run_with(begin)
    run_with(instr)
    run_with(sep)
    text = paragraph.add_run(placeholder)
    set_fonts(text)
    if size:
        text.font.size = Pt(size)
    if color:
        text.font.color.rgb = rgb(color)
    run_with(end)


class Kit:
    def __init__(self):
        self.doc = Document()
        self._page()
        self._styles()
        self._figure_no = 0

    # ------------------------------------------------------------------ trang & kiểu
    def _page(self):
        s = self.doc.sections[0]
        s.orientation = WD_ORIENT.PORTRAIT
        s.page_width, s.page_height = Twips(PAGE_W), Twips(PAGE_H)
        s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Twips(MARGIN)
        s.header_distance = s.footer_distance = Twips(560)

    def _styles(self):
        st = self.doc.styles
        n = st['Normal']
        n.font.name = 'Calibri'
        n.font.size = Pt(11)
        n.font.color.rgb = rgb(INK)
        set_fonts(n)
        n.paragraph_format.space_after = Pt(6)
        n.paragraph_format.line_spacing = 1.15

        def heading(name, size, color, before, after, page_break=False):
            h = st[name]
            h.font.name = 'Calibri'
            h.font.size = Pt(size)
            h.font.bold = True
            h.font.italic = False
            h.font.color.rgb = rgb(color)
            set_fonts(h)
            pf = h.paragraph_format
            pf.space_before, pf.space_after = Pt(before), Pt(after)
            pf.keep_with_next = True
            pf.page_break_before = page_break
            pf.line_spacing = 1.0
        heading('Heading 1', 20, GREEN, 26, 10)
        self._rule(st['Heading 1'])
        heading('Heading 2', 14, DARK, 16, 6)
        heading('Heading 3', 12, GREEN, 10, 4)

        # Mục lục gọn để hai cấp vừa một trang.
        for name, size, before, indent, bold in (('toc 1', 11, 5, 0, True), ('toc 2', 10, 0, 0.45, False)):
            toc = st.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
            toc.base_style = n
            toc.font.size = Pt(size)
            toc.font.bold = bold
            toc.paragraph_format.space_before = Pt(before)
            toc.paragraph_format.space_after = Pt(0)
            toc.paragraph_format.line_spacing = 1.0
            toc.paragraph_format.left_indent = Cm(indent)
            toc.paragraph_format.tab_stops.add_tab_stop(Twips(CONTENT_W), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)

        lb = st['List Bullet']
        lb.font.name = 'Calibri'
        lb.font.size = Pt(11)
        set_fonts(lb)
        lb.paragraph_format.space_after = Pt(3)

        cap = st['Caption']
        cap.font.name = 'Calibri'
        cap.font.size = Pt(9.5)
        cap.font.italic = True
        cap.font.bold = False
        cap.font.color.rgb = rgb(MUTED)
        set_fonts(cap)
        cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.space_before = Pt(2)
        cap.paragraph_format.space_after = Pt(10)

    @staticmethod
    def _rule(style):
        ppr = style.element.get_or_add_pPr()
        bdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '8')
        bottom.set(qn('w:space'), '4')
        bottom.set(qn('w:color'), GREEN)
        bdr.append(bottom)
        ppr.append(bdr)

    # ------------------------------------------------------------------ đầu trang / chân trang
    def header_footer(self, header_text):
        s = self.doc.sections[0]
        s.different_first_page_header_footer = True
        hp = s.header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        add_runs(hp, header_text, size=9, color=MUTED)
        fp = s.footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_runs(fp, 'Trang ', size=9, color=MUTED)
        field(fp, 'PAGE', '1', size=9, color=MUTED)
        add_runs(fp, ' / ', size=9, color=MUTED)
        field(fp, 'NUMPAGES', '1', size=9, color=MUTED)

    # ------------------------------------------------------------------ khối chữ
    def h1(self, text, page_break=False):
        p = self.doc.add_heading(text, level=1)
        p.paragraph_format.page_break_before = page_break
        return p

    def h2(self, text):
        return self.doc.add_heading(text, level=2)

    def h3(self, text):
        return self.doc.add_heading(text, level=3)

    def p(self, text, size=None, color=None, italic=None, align=None, after=None, keep_next=False):
        para = self.doc.add_paragraph()
        add_runs(para, text, size=size, color=color, italic=italic)
        if align == 'center':
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if after is not None:
            para.paragraph_format.space_after = Pt(after)
        if keep_next:
            para.paragraph_format.keep_with_next = True
        return para

    def bullets(self, items):
        for text in items:
            para = self.doc.add_paragraph(style='List Bullet')
            add_runs(para, text)

    def page_break(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # ------------------------------------------------------------------ bảng
    def table(self, headers, rows, widths, size=10, align=None):
        assert sum(widths) == CONTENT_W, (sum(widths), CONTENT_W)
        t = self.doc.add_table(rows=1, cols=len(headers))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        table_borders(t)
        for i, h in enumerate(headers):
            c = t.rows[0].cells[i]
            shade(c, GREEN)
            cell_margins(c)
            para = c.paragraphs[0]
            para.paragraph_format.space_after = Pt(0)
            para.paragraph_format.line_spacing = 1.0
            add_runs(para, h, size=size, color='FFFFFF', bold=True)
        repeat_header(t.rows[0])
        keep_row_together(t.rows[0])
        for r, row in enumerate(rows):
            cells = t.add_row().cells
            keep_row_together(t.rows[-1])
            for i, text in enumerate(row):
                c = cells[i]
                if r % 2 == 1:
                    shade(c, LIGHT)
                cell_margins(c)
                lines = text.split('\n')
                for k, line in enumerate(lines):
                    para = c.paragraphs[0] if k == 0 else c.add_paragraph()
                    para.paragraph_format.space_after = Pt(0 if k == len(lines) - 1 else 2)
                    para.paragraph_format.line_spacing = 1.0
                    if align and align[i] == 'r':
                        para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    add_runs(para, line, size=size)
        fixed_layout(t, widths)
        # Giữ cả bảng trên một trang: mọi đoạn trừ hàng cuối dính với đoạn sau.
        for row in t.rows[:-1]:
            for cell in row.cells:
                for para in cell.paragraphs:
                    para.paragraph_format.keep_with_next = True
        gap = self.doc.add_paragraph()
        gap.paragraph_format.space_after = Pt(4)
        gap.paragraph_format.line_spacing = 0.6
        return t

    def callout(self, kind, title, text):
        style = {'note': (AMBER_BG, AMBER, AMBER_INK), 'tip': (LIGHT, GREEN, GREEN), 'warn': (RED_BG, RED, RED)}[kind]
        fill, bar, ink = style
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        c = t.rows[0].cells[0]
        shade(c, fill)
        cell_margins(c, 120, 120, 200, 160)
        cell_borders(c, left=(24, bar))
        first = c.paragraphs[0]
        first.paragraph_format.space_after = Pt(2)
        first.paragraph_format.keep_with_next = True
        add_runs(first, title, size=10.5, color=ink, bold=True)
        for k, line in enumerate(text.split('\n')):
            para = c.add_paragraph()
            para.paragraph_format.space_after = Pt(2)
            para.paragraph_format.line_spacing = 1.1
            add_runs(para, line, size=10.5)
        keep_row_together(t.rows[0])
        fixed_layout(t, [CONTENT_W])
        gap = self.doc.add_paragraph()
        gap.paragraph_format.space_after = Pt(4)
        gap.paragraph_format.line_spacing = 0.6

    # ------------------------------------------------------------------ hình
    def figure(self, path, caption, alt, width_cm=16.6):
        para = self.doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.paragraph_format.keep_with_next = True
        para.paragraph_format.space_after = Pt(2)
        pic = para.add_run().add_picture(path, width=Cm(width_cm))
        doc_pr = pic._inline.docPr
        doc_pr.set('descr', alt)
        doc_pr.set('title', caption)
        self._figure_no += 1
        cap = self.doc.add_paragraph(style='Caption')
        add_runs(cap, 'Hình %d. %s' % (self._figure_no, caption))

    # ------------------------------------------------------------------ bìa & mục lục
    def cover(self, kicker, title, subtitle, audience_title, audience, version_line, note):
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        c = t.rows[0].cells[0]
        shade(c, DARK)
        cell_margins(c, 520, 520, 460, 460)
        k = c.paragraphs[0]
        k.paragraph_format.space_after = Pt(10)
        run = k.add_run(kicker)
        set_fonts(run)
        run.bold = True
        run.font.size = Pt(10.5)
        run.font.color.rgb = rgb(AMBER)
        spacing = OxmlElement('w:spacing')
        spacing.set(qn('w:val'), '60')
        run._r.get_or_add_rPr().append(spacing)
        ti = c.add_paragraph()
        ti.paragraph_format.space_after = Pt(8)
        ti.paragraph_format.line_spacing = 1.0
        add_runs(ti, title, size=32, color='FFFFFF', bold=True)
        sub = c.add_paragraph()
        sub.paragraph_format.space_after = Pt(0)
        add_runs(sub, subtitle, size=13, color=LINE)
        fixed_layout(t, [CONTENT_W])
        sp = self.doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(18)
        head = self.doc.add_paragraph()
        add_runs(head, audience_title, size=12, color=GREEN, bold=True)
        self.bullets(audience)
        gap = self.doc.add_paragraph()
        gap.paragraph_format.space_after = Pt(26)
        self.p(version_line, size=10, color=MUTED, after=2)
        self.p(note, size=9.5, color=MUTED, italic=True)

    def toc(self, title='Mục lục'):
        head = self.doc.add_paragraph()
        head.paragraph_format.space_after = Pt(12)
        head.paragraph_format.page_break_before = True
        add_runs(head, title, size=20, color=GREEN, bold=True)
        para = self.doc.add_paragraph()
        field(para, 'TOC \\o "1-2" \\h \\z \\u', 'Mục lục sẽ hiện khi mở bằng Word (nhấn F9 để cập nhật).')

    def save(self, path):
        self.doc.save(path)
