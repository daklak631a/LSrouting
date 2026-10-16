"""Đọc HUONG_DAN_SU_DUNG_LS_ROUTING.docx thành các khối có ý nghĩa (tiêu đề, đoạn, danh sách, ảnh + chú thích + chú giải,
bảng, hộp lưu ý) để sửa nội dung và sinh lại docx / html từ cùng một nguồn.

Mỗi khối giữ phần tử XML gốc (`xml`); khối nào không bị sửa thì khi ghi lại docx vẫn dùng đúng phần tử gốc, nên định dạng
không đổi. Khối mới được dựng bằng các hàm `make_*` ở đây, nhân bản từ khối mẫu của chính tài liệu.
"""
import copy
import re
import zipfile
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
NS = {'w': W, 'wp': WP, 'a': A, 'r': R, 'pic': PIC}


def q(tag):
    p, t = tag.split(':')
    return '{%s}%s' % (NS[p], t)


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(q('w:t')))


def runs_of(p):
    """[(text, bold)] của một đoạn; gộp các run liền nhau cùng kiểu."""
    out = []
    for r in p.findall(q('w:r')):
        t = ''.join(x.text or '' for x in r.findall(q('w:t')))
        if not t:
            continue
        b = r.find('w:rPr/w:b', NS)
        bold = b is not None and b.get(q('w:val')) not in ('false', '0')
        color = r.find('w:rPr/w:color', NS)
        red = color is not None and color.get(q('w:val')) == 'E11D48'
        if out and out[-1][1] == bold and out[-1][2] == red:
            out[-1] = (out[-1][0] + t, bold, red)
        else:
            out.append((t, bold, red))
    return out


def style_of(p):
    s = p.find('w:pPr/w:pStyle', NS)
    return s.get(q('w:val')) if s is not None else ''


class Block:
    def __init__(self, kind, xml=None, **kw):
        self.kind = kind
        self.xml = xml          # phần tử XML gốc (None = dựng mới khi ghi docx)
        self.__dict__.update(kw)

    def __repr__(self):
        return '<%s %s>' % (self.kind, getattr(self, 'text', ''))


def parse(docx_path):
    z = zipfile.ZipFile(docx_path)
    root = etree.fromstring(z.read('word/document.xml'))
    rels = etree.fromstring(z.read('word/_rels/document.xml.rels'))
    rid_target = {r.get('Id'): r.get('Target') for r in rels}
    body = root.find('w:body', NS)
    blocks, pending = [], None
    children = [c for c in body if etree.QName(c).localname in ('p', 'tbl')]
    i = 0
    while i < len(children):
        el = children[i]
        tag = etree.QName(el).localname
        if tag == 'p':
            st = style_of(el)
            txt = text_of(el)
            drawing = el.find('.//w:drawing', NS)
            if st in ('Heading1', 'Heading2', 'Heading3'):
                blocks.append(Block('h' + st[-1], el, text=txt))
            elif st == 'ListParagraph':
                blocks.append(Block('li', el, runs=runs_of(el)))
            elif drawing is not None:
                dp = drawing.find('.//wp:docPr', NS)
                blip = drawing.find('.//a:blip', NS)
                ext = drawing.find('.//wp:extent', NS)
                fig = Block('fig', el, name=dp.get('name'), alt=dp.get('descr') or '', rid=blip.get(q('r:embed')),
                            target=rid_target[blip.get(q('r:embed'))], cx=int(ext.get('cx')), cy=int(ext.get('cy')),
                            caption=None, caption_xml=None, legend=None, legend_xml=None)
                # chú thích và chú giải đi liền sau ảnh
                if i + 1 < len(children) and etree.QName(children[i + 1]).localname == 'p':
                    cap = children[i + 1]
                    if cap.find('.//w:i', NS) is not None and text_of(cap):
                        fig.caption, fig.caption_xml = text_of(cap), cap
                        i += 1
                        if i + 1 < len(children) and etree.QName(children[i + 1]).localname == 'p':
                            leg = children[i + 1]
                            if re.match(r'^\(1\) ', text_of(leg)):
                                fig.legend, fig.legend_xml = runs_of(leg), leg
                                i += 1
                blocks.append(fig)
            else:
                pb = el.find('.//w:br', NS)
                if not txt and pb is not None and pb.get(q('w:type')) == 'page':
                    blocks.append(Block('pagebreak', el))
                elif not txt:
                    blocks.append(Block('empty', el))
                else:
                    blocks.append(Block('p', el, runs=runs_of(el), text=txt))
        else:
            blocks.append(parse_table(el))
        i += 1
    return z, root, body, blocks


def parse_table(tbl):
    grid = [int(g.get(q('w:w'))) for g in tbl.findall('w:tblGrid/w:gridCol', NS)]
    fills = {s.get(q('w:fill')) for s in tbl.iter(q('w:shd'))}
    rows = tbl.findall('w:tr', NS)
    if len(grid) == 1:
        paras = [p for p in tbl.iter(q('w:p'))]
        if '083A36' in fills:
            return Block('cover', tbl, lines=[text_of(p) for p in paras])
        if 'FFF8E6' in fills:
            return Block('note', tbl, runs=[r for p in paras for r in runs_of(p)])
    if tbl.find('.//w:drawing', NS) is not None:
        cells = []
        for tc in rows[0].findall('w:tc', NS):
            figs = []
            for p in tc.findall('w:p', NS):
                if p.find('.//w:drawing', NS) is not None:
                    dp = p.find('.//wp:docPr', NS)
                    figs.append(dict(name=dp.get('name'), alt=dp.get('descr') or ''))
            cells.append(dict(figs=figs, texts=[text_of(p) for p in tc.findall('w:p', NS) if text_of(p)]))
        return Block('mobile', tbl, cells=cells)
    data = []
    for tr in rows:
        data.append([[(runs_of(p)) for p in tc.findall('w:p', NS)] for tc in tr.findall('w:tc', NS)])
    return Block('table', tbl, grid=grid, rows=data)


def cell_text(tc):
    return ' '.join(text_of(p) for p in tc.findall('w:p', NS))


def set_cell_text(tbl, r, c, text):
    """Đặt chữ cho ô (hàng r, cột c), giữ định dạng của run đầu tiên."""
    tr = tbl.findall('w:tr', NS)[r]
    tc = tr.findall('w:tc', NS)[c]
    p = tc.find('w:p', NS)
    runs = p.findall(q('w:r'))
    for extra in runs[1:]:
        p.remove(extra)
    runs[0].find(q('w:t')).text = text
    runs[0].find(q('w:t')).set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def add_table_row(tbl, texts):
    """Thêm một hàng cuối bảng bằng cách nhân bản hàng cuối, đảo màu nền xen kẽ."""
    rows = tbl.findall('w:tr', NS)
    new = copy.deepcopy(rows[-1])
    prev_shaded = rows[-1].find('.//w:shd', NS) is not None
    for tc in new.findall('w:tc', NS):
        shd = tc.find('w:tcPr/w:shd', NS)
        if prev_shaded and shd is not None:
            shd.getparent().remove(shd)
    if not prev_shaded:
        for tc in new.findall('w:tc', NS):
            tcpr = tc.find('w:tcPr', NS)
            shd = etree.SubElement(tcpr, q('w:shd'))
            shd.set(q('w:fill'), 'F6FAF9'); shd.set(q('w:color'), 'auto'); shd.set(q('w:val'), 'clear')
            # shd phải đứng trước tcMar theo thứ tự lược đồ
            mar = tcpr.find('w:tcMar', NS)
            if mar is not None:
                tcpr.remove(shd); mar.addprevious(shd)
    rows[-1].addnext(new)
    for c, t in enumerate(texts):
        tc = new.findall('w:tc', NS)[c]
        p = tc.find('w:p', NS)
        runs = p.findall(q('w:r'))
        for extra in runs[1:]:
            p.remove(extra)
        runs[0].find(q('w:t')).text = t
    return new
