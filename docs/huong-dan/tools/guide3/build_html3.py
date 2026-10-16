"""Dựng HUONG_DAN_SU_DUNG_LS_ROUTING.html từ mô hình nội dung (cùng nguồn với docx và pptx).

    py tools/guide3/build_html3.py

Dùng lại CSS, script và cách nhúng ảnh của build_html.py (một file tự đủ, ảnh JPEG nhúng base64, nhúng iframe được).
"""
import html
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

import build_html as bh  # noqa: E402
from content_all import build_guide  # noqa: E402

OUT = bh.OUT
VERSION = 'Phiên bản 15/10/2026'
SAMPLE_NOTE = 'Ảnh minh họa chụp trên môi trường thử nghiệm; tên khách hàng và số liệu là dữ liệu mẫu.'
HOW = ('Cách đọc: mỗi bước có ảnh chụp màn hình thật. Khung đỏ đánh số trên ảnh khớp với chú giải (1), (2)... ngay dưới ảnh. '
       'Tên nút và mục được in đậm. Bấm vào ảnh để xem lớn.')
ROLE_CARDS = [('Phòng / PGD', 'Phần 2'), ('Kiểm soát LS', 'Phần 3'), ('Cán bộ LS', 'Phần 4'), ('Quản lý LS', 'Phần 5'),
              ('Quản trị hệ thống', 'Phần 6'), ('Giám sát', 'Phần 7'),
              ('Cách ghi nhận thời gian làm việc', 'Phần 10'), ('Cách ghi nhận việc tồn', 'Phần 11')]

esc = html.escape

# Tiêu đề hero bị `#main h1` (màu xanh, viền trên) đè nên gần như vô hình trên nền xanh; ghi đè lại.
EXTRA_CSS = '#main .hero h1{color:#fff;border:0;padding:0;margin:6px 0}'


def slug(text, used):
    """Mã mục không dấu để đường dẫn #phan-4-... đọc được."""
    s = unicodedata.normalize('NFD', text.lower().replace('đ', 'd'))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'muc'
    base, n = s, 2
    while s in used:
        s = '%s-%d' % (base, n)
        n += 1
    used.add(s)
    return s


def md(text):
    """Chữ đậm theo **...**; còn lại thoát ký tự HTML."""
    parts = re.split(r'(\*\*.+?\*\*)', text)
    return ''.join('<strong>%s</strong>' % esc(p[2:-2]) if p.startswith('**') and p.endswith('**') else esc(p) for p in parts if p)


def build():
    g = build_guide()
    used = set()
    nav = []
    heads = {}
    for n, b in enumerate(g.blocks):
        if b.kind in ('h1', 'h2', 'h3'):
            b.hid = slug(b.text, used)
            if b.kind == 'h1':
                nav.append([b.hid, b.text, []])
            elif b.kind == 'h2' and nav:
                nav[-1][2].append((b.hid, b.text))
            heads[b.text] = b.hid

    def figure(f):
        uri, w, h = bh.data_uri(f.name)
        s = '<figure><img loading="lazy" decoding="async" width="%d" height="%d" src="%s" alt="%s">' % (w, h, uri, esc(f.alt or f.caption))
        s += '<figcaption>Hình %d. %s</figcaption></figure>' % (f.no, esc(f.caption))
        if f.legend:
            items = ''.join('<span class="item"><b>%d</b>%s</span>' % (k, esc(t)) for k, t in enumerate(f.legend, 1))
            s += '<div class="legend">%s</div>' % items
        return s

    out = []
    i = 0
    blocks = g.blocks
    while i < len(blocks):
        b = blocks[i]
        k = b.kind
        if k in ('h1', 'h2', 'h3'):
            out.append('<%s id="%s">%s</%s>' % (k, b.hid, esc(b.text), k))
        elif k == 'p':
            out.append('<p>%s</p>' % md(b.text))
        elif k == 'li':
            items = []
            while i < len(blocks) and blocks[i].kind == 'li':
                items.append('<li>%s</li>' % md(blocks[i].text))
                i += 1
            out.append('<ul>%s</ul>' % ''.join(items))
            continue
        elif k == 'note':
            out.append('<div class="note">%s</div>' % md(b.text))
        elif k == 'table':
            total = float(sum(b.weights))
            colgroup = ''.join('<col style="width:%.1f%%">' % (w * 100 / total) for w in b.weights)
            head = ''.join('<th>%s</th>' % md(h) for h in b.headers)
            rows = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % md(c) for c in r) for r in b.rows)
            out.append('<div class="tw"><table><colgroup>%s</colgroup><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (colgroup, head, rows))
        elif k == 'fig':
            out.append(figure(b))
        elif k == 'phones':
            cells = []
            for f in b.figs:
                uri, w, h = bh.data_uri(f.name)
                cells.append('<figure><img loading="lazy" decoding="async" width="%d" height="%d" src="%s" alt="%s"><figcaption>Hình %d. %s</figcaption></figure>' % (
                    w, h, uri, esc(f.alt or f.caption), f.no, esc(f.caption)))
            out.append('<div class="phones">%s</div>' % ''.join(cells))
        elif k == 'pagebreak':
            pass
        i += 1

    nav_html = ''.join(
        '<li class="nav-sec"><a href="#%s" class="n1">%s</a>%s</li>' % (
            hid, esc(text),
            ('<ul class="subnav">%s</ul>' % ''.join('<li><a href="#%s" class="n2">%s</a></li>' % (sid, esc(st)) for sid, st in subs)) if subs else '')
        for hid, text, subs in nav)
    by_part = {n[1].split('.')[0]: n[0] for n in nav}
    cards = ''.join('<a href="#%s">%s<span>%s</span></a>' % (by_part[part], esc(name), esc(part))
                    for name, part in ROLE_CARDS if part in by_part)

    page = ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>%s</title><style>%s</style></head><body>'
            '<button id="menu-btn" aria-label="Mục lục">☰ Mục lục</button><div id="scrim"></div>'
            '<div id="wrap"><nav id="side" aria-label="Mục lục"><span class="brand">%s</span><ul>%s</ul></nav>'
            '<main id="main"><header class="hero"><small>%s</small><h1>%s</h1><p>%s</p></header>'
            '<div class="roles">%s</div><p class="meta">%s · %s</p><p class="how">%s</p>%s'
            '<footer class="foot">LS-Routing · %s</footer></main></div>'
            '<button id="backtop" aria-label="Lên đầu trang">↑</button><div id="lightbox" role="dialog" aria-label="Xem ảnh lớn"><img alt=""></div>'
            '<script>%s</script></body></html>') % (
        esc(bh.TITLE), bh.CSS + EXTRA_CSS, esc(bh.TITLE), nav_html, 'LS-ROUTING', 'Hướng dẫn sử dụng', 'Tài liệu dành cho từng vai trò',
        cards, esc(VERSION), esc(SAMPLE_NOTE), esc(HOW), ''.join(out), esc(VERSION), bh.JS)
    open(OUT, 'w', encoding='utf-8').write(page)
    print('html: %d KB, %d ảnh -> %s' % (len(page.encode('utf-8')) // 1024, len(bh._img_cache), OUT))


if __name__ == '__main__':
    build()
