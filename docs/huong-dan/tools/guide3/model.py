"""Mô hình nội dung của hướng dẫn bản 15/10/2026: một danh sách khối, dùng chung cho docx, html và pptx.

Khối: h1/h2/h3, p, li (danh sách), fig (ảnh + chú thích + chú giải lấy từ _manifest.json do capture3.py ghi),
note (hộp lưu ý), table, phones (ba ảnh điện thoại), pagebreak.
Cách làm ngắn của từng bước cho slide (`bullets`) và thẻ đầu phần (`part`) chỉ dùng cho pptx.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
ANH = os.path.join(ROOT, 'anh')


class Block:
    def __init__(self, kind, **kw):
        self.kind = kind
        self.__dict__.update(kw)

    def __repr__(self):
        return '<%s %s>' % (self.kind, getattr(self, 'text', getattr(self, 'name', '')))


class Guide:
    def __init__(self, manifest_path=None):
        self.blocks = []
        self.figure_no = 0
        path = manifest_path or os.path.join(ANH, '_manifest.json')
        self.manifest = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
        self.used = []

    # ---- văn bản ----
    def h1(self, text):
        self.blocks.append(Block('h1', text=text))

    # Hai mục lặp lại ở đầu mỗi phần dành cho một vai trò: hạ xuống cấp 3 để mục lục chỉ liệt kê các bước.
    MINOR = ('Bạn làm được gì', 'Các bước chính', 'Menu quản trị')

    def h2(self, text, bullets=None):
        if text in self.MINOR:
            self.blocks.append(Block('h3', text=text))
            return
        self.blocks.append(Block('h2', text=text, bullets=bullets or []))

    def h3(self, text):
        self.blocks.append(Block('h3', text=text))

    def p(self, text):
        self.blocks.append(Block('p', text=text))

    def li(self, *items):
        for t in items:
            self.blocks.append(Block('li', text=t))

    def note(self, text):
        self.blocks.append(Block('note', text=text))

    def pagebreak(self):
        self.blocks.append(Block('pagebreak'))

    def table(self, headers, rows, weights=None, size=None):
        self.blocks.append(Block('table', headers=headers, rows=rows, weights=weights or [1] * len(headers), size=size))

    # ---- hình ----
    def fig(self, name, caption=None, legend=None):
        meta = self.manifest.get(name, {})
        cap = caption or meta.get('caption') or name
        leg = legend if legend is not None else meta.get('legend', [])
        if not os.path.exists(os.path.join(ANH, name + '.png')):
            raise FileNotFoundError('Thiếu ảnh ' + name)
        self.figure_no += 1
        self.used.append(name)
        self.blocks.append(Block('fig', name=name, caption=cap, legend=list(leg), no=self.figure_no, alt=meta.get('alt', cap)))

    def phones(self, names):
        figs = []
        for n in names:
            meta = self.manifest.get(n, {})
            self.figure_no += 1
            self.used.append(n)
            figs.append(Block('fig', name=n, caption=meta.get('caption', n), legend=list(meta.get('legend', [])), no=self.figure_no, alt=meta.get('alt', '')))
        self.blocks.append(Block('phones', figs=figs))


def _sub(text, numbers):
    def one(m):
        name = m.group(1)
        if name not in numbers:
            raise KeyError('Tham chiếu hình chưa dùng: ' + name)
        return 'Hình %d' % numbers[name]
    return re.sub(r'\{hinh:([^}]+)\}', one, text)


def resolve_refs(guide):
    """Thay {hinh:tên} bằng 'Hình N' theo số hình thực tế; ảnh trùng tên là lỗi."""
    numbers = {}
    for b in guide.blocks:
        figs = b.figs if b.kind == 'phones' else ([b] if b.kind == 'fig' else [])
        for f in figs:
            if f.name in numbers:
                raise ValueError('Ảnh dùng hai lần: ' + f.name)
            numbers[f.name] = f.no
    for b in guide.blocks:
        if hasattr(b, 'text'):
            b.text = _sub(b.text, numbers)
        if b.kind == 'h2':
            b.bullets = [_sub(x, numbers) for x in b.bullets]
        if b.kind == 'table':
            b.rows = [[_sub(c, numbers) for c in r] for r in b.rows]
        if b.kind == 'fig':
            b.caption = _sub(b.caption, numbers)
    return numbers


def plain(text):
    """Bỏ dấu ** để lấy chữ thường."""
    return re.sub(r'\*\*(.+?)\*\*', r'\1', text)
