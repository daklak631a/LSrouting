"""Sinh HUONG_DAN_SU_DUNG_LS_ROUTING.html từ chính file docx đã dựng (cùng một nguồn nội dung).

    py docs/huong-dan/tools/build_html.py

Bản HTML là MỘT file tự đủ (CSS, script, ảnh JPEG nhúng base64), không gọi tài nguyên ngoài, nên nhúng vào trang khác bằng
<iframe> được. Khi chạy trong iframe, trang tự báo chiều cao cho trang cha qua postMessage:
    window.addEventListener('message', e => { if (e.data && e.data.type === 'ls-guide-height') iframe.style.height = e.data.height + 'px'; });
"""
import base64
import html
import io
import os
import re
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import guide_model as gm

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
DOCX = os.path.join(ROOT, 'HUONG_DAN_SU_DUNG_LS_ROUTING.docx')
ANH = os.path.join(ROOT, 'anh')
OUT = os.path.join(ROOT, 'HUONG_DAN_SU_DUNG_LS_ROUTING.html')
TITLE = 'Hướng dẫn sử dụng LS-Routing'

esc = html.escape


def slug(text, used):
    s = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'muc'
    base, n = s, 2
    while s in used:
        s = '%s-%d' % (base, n); n += 1
    used.add(s)
    return s


_img_cache = {}


def data_uri(name):
    """Ảnh chụp -> JPEG rộng tối đa 1200px (đủ nét cho khung nội dung, nhẹ để nhúng)."""
    if name in _img_cache:
        return _img_cache[name]
    im = Image.open(os.path.join(ANH, name + '.png'))
    if im.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', im.size, (255, 255, 255))
        im = im.convert('RGBA'); bg.paste(im, mask=im.split()[-1]); im = bg
    else:
        im = im.convert('RGB')
    if im.width > 1200:
        im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=80, optimize=True, progressive=True)
    uri = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
    _img_cache[name] = (uri, im.width, im.height)
    return _img_cache[name]


def rich(runs):
    out = []
    for t, bold, red in runs:
        s = esc(t)
        out.append('<strong>%s</strong>' % s if bold else s)
    return ''.join(out)


def para_runs(cell_paragraphs):
    return '<br>'.join(rich(p) for p in cell_paragraphs if p)


CSS = """
:root{--bg:#f4f7f7;--panel:#fff;--ink:#14212b;--muted:#566472;--line:#dde5e8;--accent:#0f5c55;--accent2:#0b6f68;--soft:#e6f2f0;--warn:#fff8e6;--warn-line:#f0d58a;--red:#e11d48}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65;font-size:16px}
a{color:var(--accent2);text-decoration:none}
img{max-width:100%;height:auto}
#wrap{display:flex;min-height:100vh}
#side{width:300px;flex:0 0 300px;background:var(--panel);border-right:1px solid var(--line);position:sticky;top:0;height:100vh;overflow-y:auto;padding:18px 14px}
#side .brand{display:block;font-size:15px;font-weight:700;color:var(--accent);padding:4px 8px 12px;border-bottom:1px solid var(--line);margin-bottom:8px}
#side ul{list-style:none;margin:0;padding:0}
.nav-sec>.n1{display:block;font-weight:700;color:var(--ink);padding:8px;border-radius:8px;font-size:14px}
.nav-sec>.n1:hover{background:#eef5f4}
.subnav{margin:2px 0 8px 6px;border-left:2px solid var(--line);padding-left:6px}
.subnav a{display:block;color:var(--muted);padding:5px 8px;border-radius:7px;font-size:13px;line-height:1.35}
.subnav a:hover{background:#eef5f4;color:var(--ink)}
a.active{background:var(--soft)!important;color:var(--accent)!important;font-weight:600}
#main{flex:1;min-width:0;padding:28px 40px 80px;max-width:960px}
.hero{background:linear-gradient(135deg,#083a36,#0f5c55);color:#fff;border-radius:16px;padding:28px 30px;margin-bottom:22px}
.hero small{letter-spacing:.14em;font-weight:700;opacity:.8;font-size:12px}
.hero h1{margin:6px 0 6px;font-size:30px;line-height:1.2;color:#fff;border:0;padding:0}
.hero p{margin:0;opacity:.92}
.roles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:0 0 18px}
.roles a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--ink);font-weight:600;font-size:14px}
.roles a:hover{border-color:var(--accent2);background:var(--soft)}
.roles span{display:block;color:var(--muted);font-weight:400;font-size:12px}
.meta{color:var(--muted);font-size:13px;margin:0 0 14px}
#main h1{font-size:25px;margin:40px 0 10px;padding-top:12px;border-top:3px solid var(--accent);color:var(--accent)}
#main h2{font-size:19px;margin:28px 0 8px;color:var(--accent2)}
#main h3{font-size:16px;margin:20px 0 6px;color:var(--ink)}
#main p{margin:8px 0}
#main ul{margin:6px 0 10px;padding-left:22px}
#main li{margin:3px 0}
.lead{font-weight:600;color:var(--accent)}
.how{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;font-size:14px;color:var(--muted)}
figure{margin:16px 0 4px;text-align:center}
figure img{border:1px solid var(--line);border-radius:10px;box-shadow:0 2px 10px rgba(16,32,43,.08);cursor:zoom-in;background:#fff}
figcaption{font-size:13px;font-style:italic;color:var(--muted);margin-top:6px}
.legend{font-size:14px;margin:2px auto 16px;padding:0 6px;text-align:left}
.legend span.item{display:inline-block;margin:2px 14px 2px 0}
.legend b{display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:50%;background:var(--red);color:#fff;text-align:center;font-size:12px;margin-right:6px}
.tw{overflow-x:auto;margin:10px 0 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:14px}
th{background:var(--accent);color:#fff;text-align:left;padding:8px 12px;font-weight:600}
td{padding:8px 12px;border-top:1px solid var(--line);vertical-align:top}
tbody tr:nth-child(even) td{background:#f6faf9}
.note{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:10px 14px;margin:12px 0;font-size:14.5px}
.phones{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:12px 0}
.phones figure{margin:0}
.phones img{max-height:560px;width:auto;max-width:100%}
#menu-btn{display:none;position:fixed;top:12px;left:12px;z-index:30;background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
#backtop{position:fixed;right:16px;bottom:16px;background:var(--accent);color:#fff;border:0;border-radius:50%;width:46px;height:46px;font-size:20px;display:none;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}
#lightbox{display:none;position:fixed;inset:0;background:rgba(10,20,25,.86);z-index:60;overflow:auto;padding:20px;cursor:zoom-out}
#lightbox.show{display:block}
#lightbox img{display:block;margin:0 auto;max-width:none;width:min(1600px,100%);border-radius:8px}
footer.foot{margin-top:48px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:14px}
.embedded #side{display:none}
.embedded #main{padding:18px 18px 40px;max-width:none}
.embedded #menu-btn{display:none!important}
@media(max-width:860px){
 #menu-btn{display:block}
 #side{position:fixed;left:0;top:0;z-index:25;transform:translateX(-100%);transition:transform .22s;box-shadow:2px 0 18px rgba(0,0,0,.18)}
 #side.open{transform:translateX(0)}
 #main{padding:64px 16px 80px}
 .hero{padding:20px 18px}.hero h1{font-size:24px}
 #scrim{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:20}
 #scrim.show{display:block}
 .phones{grid-template-columns:1fr}
}
@media print{#side,#menu-btn,#backtop{display:none}#wrap{display:block}#main{max-width:none;padding:0}figure{break-inside:avoid}h1{break-before:page}}
"""

JS = """
(function(){
var side=document.getElementById('side'),scrim=document.getElementById('scrim');
function toggle(o){side.classList.toggle('open',o);scrim.classList.toggle('show',o);}
document.getElementById('menu-btn').onclick=function(){toggle(!side.classList.contains('open'));};
scrim.onclick=function(){toggle(false);};
side.addEventListener('click',function(e){if(e.target.tagName==='A'&&window.innerWidth<=860)toggle(false);});
var bt=document.getElementById('backtop');
addEventListener('scroll',function(){bt.style.display=scrollY>400?'block':'none';});
bt.onclick=function(){scrollTo({top:0,behavior:'smooth'});};
var links=[].slice.call(document.querySelectorAll('#side a[href^="#"]')),map={};
links.forEach(function(a){map[a.getAttribute('href').slice(1)]=a;});
var heads=[].slice.call(document.querySelectorAll('#main h1[id],#main h2[id]'));
if('IntersectionObserver' in window){
 var obs=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){links.forEach(function(a){a.classList.remove('active');});var a=map[en.target.id];if(a)a.classList.add('active');}});},{rootMargin:'-10% 0px -80% 0px'});
 heads.forEach(function(h){obs.observe(h);});
}
var lb=document.getElementById('lightbox'),lbi=lb.querySelector('img');
document.addEventListener('click',function(e){var i=e.target.closest('figure img');if(i){lbi.src=i.src;lbi.alt=i.alt;lb.classList.add('show');}});
lb.onclick=function(){lb.classList.remove('show');};
addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('show');});
// Nhúng bằng <iframe>: ẩn mục lục bên, báo chiều cao cho trang cha (xem hướng dẫn ở đầu file nguồn).
var embedded=false;try{embedded=window.self!==window.top;}catch(e){embedded=true;}
if(embedded||/[?&]embed=1/.test(location.search))document.documentElement.classList.add('embedded');
function report(){try{parent.postMessage({type:'ls-guide-height',height:document.documentElement.scrollHeight},'*');}catch(e){}}
if(embedded){addEventListener('load',report);addEventListener('resize',report);if('ResizeObserver' in window)new ResizeObserver(report).observe(document.body);}
})();
"""


def build():
    z, root, body, blocks = gm.parse(DOCX)
    used = set()
    # vị trí bắt đầu nội dung: sau đoạn "Cách đọc"
    start = next(i for i, b in enumerate(blocks) if b.kind == 'p' and b.text.startswith('Cách đọc'))
    cover = next(b for b in blocks if b.kind == 'cover')
    version = next(b.text for b in blocks if b.kind == 'p' and b.text.startswith('Phiên bản'))
    sample_note = next(b.text for b in blocks if b.kind == 'p' and b.text.startswith('Ảnh minh họa'))
    how = blocks[start].text
    role_names = [''.join(t for t, _, _ in b.runs) for b in blocks[:start] if b.kind == 'li']

    content = blocks[start + 1:]
    ids = {}
    nav = []           # [(id, text, [(id, text)])]
    # gán id cho tiêu đề
    for b in content:
        if b.kind in ('h1', 'h2', 'h3'):
            b.hid = slug(b.text, used)
            if b.kind == 'h1':
                nav.append([b.hid, b.text, []])
            elif b.kind == 'h2' and nav:
                nav[-1][2].append((b.hid, b.text))
    h1_ids = [n[0] for n in nav]

    out = []
    # ---- ảnh
    def figure(name, caption, alt, legend):
        uri, w, h = data_uri(name)
        s = '<figure><img loading="lazy" decoding="async" width="%d" height="%d" src="%s" alt="%s">' % (w, h, uri, esc(alt or caption or name))
        if caption:
            s += '<figcaption>%s</figcaption>' % esc(caption)
        s += '</figure>'
        if legend:
            items = []
            for k in range(0, len(legend) - 1, 2):
                num = re.sub(r'\D', '', legend[k][0])
                txt = legend[k + 1][0].strip() if k + 1 < len(legend) else ''
                items.append('<span class="item"><b>%s</b>%s</span>' % (num, esc(txt)))
            s += '<div class="legend">%s</div>' % ''.join(items)
        return s

    i = 0
    while i < len(content):
        b = content[i]
        k = b.kind
        if k == 'h1':
            out.append('<h1 id="%s">%s</h1>' % (b.hid, esc(b.text)))
        elif k == 'h2':
            out.append('<h2 id="%s">%s</h2>' % (b.hid, esc(b.text)))
        elif k == 'h3':
            out.append('<h3 id="%s">%s</h3>' % (b.hid, esc(b.text)))
        elif k == 'p':
            cls = ' class="lead"' if b.runs and all(r[1] for r in b.runs) else ''
            out.append('<p%s>%s</p>' % (cls, rich([(t, False if cls else bo, r) for t, bo, r in b.runs])))
        elif k == 'li':
            items = []
            while i < len(content) and content[i].kind == 'li':
                items.append('<li>%s</li>' % rich(content[i].runs)); i += 1
            out.append('<ul>%s</ul>' % ''.join(items))
            continue
        elif k == 'fig':
            out.append(figure(b.name, b.caption, b.alt, b.legend))
        elif k == 'note':
            runs = b.runs
            out.append('<div class="note">%s</div>' % rich(runs))
        elif k == 'table':
            grid = b.grid
            total = float(sum(grid))
            colgroup = ''.join('<col style="width:%.1f%%">' % (g * 100 / total) for g in grid)
            head = ''.join('<th>%s</th>' % para_runs(cell) for cell in b.rows[0])
            rows = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % para_runs(cell) for cell in r) for r in b.rows[1:])
            out.append('<div class="tw"><table><colgroup>%s</colgroup><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (colgroup, head, rows))
        elif k == 'mobile':
            cells = []
            for c in b.cells:
                fg = c['figs'][0]
                cap = c['texts'][0] if c['texts'] else ''
                legend = c['texts'][1] if len(c['texts']) > 1 else ''
                uri, w, h = data_uri(fg['name'])
                cells.append('<figure><img loading="lazy" decoding="async" width="%d" height="%d" src="%s" alt="%s"><figcaption>%s</figcaption>%s</figure>' % (
                    w, h, uri, esc(fg['alt'] or cap), esc(cap), ('<div class="legend">%s</div>' % esc(legend.strip())) if legend else ''))
            out.append('<div class="phones">%s</div>' % ''.join(cells))
        i += 1

    nav_html = ''.join(
        '<li class="nav-sec"><a href="#%s" class="n1">%s</a>%s</li>' % (hid, esc(text),
            ('<ul class="subnav">%s</ul>' % ''.join('<li><a href="#%s" class="n2">%s</a></li>' % (sid, esc(st)) for sid, st in subs)) if subs else '')
        for hid, text, subs in nav)
    # thẻ vai trò: Phần 2..7 theo thứ tự các vai trò ở bìa
    role_cards = ''.join('<a href="#%s">%s<span>%s</span></a>' % (h1_ids[1 + n], esc(name), esc(nav[1 + n][1].replace('Dành cho ', '').split('. ', 1)[0]))
                         for n, name in enumerate(role_names) if 1 + n < len(h1_ids))

    page = ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>%s</title><style>%s</style></head><body>'
            '<button id="menu-btn" aria-label="Mục lục">☰ Mục lục</button><div id="scrim"></div>'
            '<div id="wrap"><nav id="side" aria-label="Mục lục"><span class="brand">%s</span><ul>%s</ul></nav>'
            '<main id="main"><header class="hero"><small>%s</small><h1>%s</h1><p>%s</p></header>'
            '<div class="roles">%s</div><p class="meta">%s · %s</p><p class="how">%s</p>%s'
            '<footer class="foot">LS-Routing · %s</footer></main></div>'
            '<button id="backtop" aria-label="Lên đầu trang">↑</button><div id="lightbox" role="dialog" aria-label="Xem ảnh lớn"><img alt=""></div>'
            '<script>%s</script></body></html>') % (
        esc(TITLE), CSS, esc(TITLE), nav_html, esc(cover.lines[0]), esc(cover.lines[1]), esc(cover.lines[2]),
        role_cards, esc(version), esc(sample_note), esc(how), ''.join(out), esc(version), JS)
    open(OUT, 'w', encoding='utf-8').write(page)
    print('html: %d KB, %d ảnh -> %s' % (len(page.encode('utf-8')) // 1024, len(_img_cache), OUT))


if __name__ == '__main__':
    build()
