"""Bộ chụp ảnh hướng dẫn bản 15/10/2026: chạy bản demo cục bộ, đi đúng luồng và chụp từng bước.

Khác bản cap.py cũ:
  - đồng hồ trình duyệt do script điều khiển (clock.set_system_time), nên giờ nhận/giờ làm/hạn trong ảnh là số liệu
    mẫu có ý nghĩa chứ không phải vài giây giữa hai lần bấm;
  - chụp theo vùng (shot_box) để các màn dài như Dashboard cá nhân không bị cắt;
  - lưu/nạp trạng thái localStorage giữa các lượt chạy (CAP_STATE_IN / CAP_STATE_OUT).

Cách chạy (cần server tĩnh ở cổng 4173, xem .claude/launch.json):
    py docs/huong-dan/tools/capture3.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4173/'
OUT = os.environ.get('GUIDE_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'anh')
os.makedirs(OUT, exist_ok=True)

RED = '#e11d48'
DAY = '2026-10-15'          # thứ Năm, ngày mẫu của toàn bộ ảnh
TZ = '+07:00'

OVERLAY_JS = """
(items) => {
  const root = document.createElement('div');
  root.id = '__guide_overlay';
  root.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  items.forEach(it => {
    const b = document.createElement('div');
    b.style.cssText = `position:fixed;left:${it.x - 4}px;top:${it.y - 4}px;width:${it.w + 8}px;height:${it.h + 8}px;` +
      `border:3px solid ${it.color};border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)`;
    const n = document.createElement('div');
    const nx = Math.max(2, it.x - 14), ny = Math.max(2, it.y - 16);
    n.textContent = it.n;
    n.style.cssText = `position:fixed;left:${nx}px;top:${ny}px;width:26px;height:26px;border-radius:50%;background:${it.color};` +
      'color:#fff;font:700 15px/26px Arial,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4)';
    root.appendChild(b); root.appendChild(n);
  });
  document.body.appendChild(root);
}
"""


def stamp(hh, mm=0, day=DAY):
    return '%sT%02d:%02d:00%s' % (day, hh, mm, TZ)


class Cap:
    def __init__(self, p, width=1440, height=1080, mobile=False, storage_state=None, start=(7, 40)):
        self.browser = p.chromium.launch()
        storage_state = storage_state or os.environ.get('CAP_STATE_IN') or None
        opts = dict(viewport={'width': width, 'height': height}, locale='vi-VN', device_scale_factor=1, timezone_id='Asia/Ho_Chi_Minh')
        if mobile:
            opts.update(is_mobile=True, has_touch=True, device_scale_factor=2)
        if storage_state:
            opts['storage_state'] = storage_state
        self.ctx = self.browser.new_context(**opts)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        self.page.clock.install(time=stamp(*start))
        self.page.goto(BASE)
        self.page.wait_for_timeout(500)
        self.shots = []
        self.manifest = {}

    # ---- đồng hồ ----
    def at(self, hh, mm=0):
        """Đặt giờ hệ thống của trình duyệt (ngày mẫu); đồng hồ vẫn chạy tiếp từ đó."""
        self.page.clock.set_system_time(stamp(hh, mm))
        self.page.wait_for_timeout(60)

    # ---- điều hướng ----
    def login(self, code):
        pg = self.page
        if pg.locator('[data-act="logout"]').count():
            pg.locator('[data-act="logout"]').first.click()
            pg.wait_for_timeout(500)
        pg.click(f'[data-act="login-as"][data-code="{code}"]')
        pg.wait_for_timeout(700)

    def go(self, screen):
        self.page.locator(f'[data-act="go"][data-screen="{screen}"]:visible').first.click()
        self.page.wait_for_timeout(600)

    def settle(self, ms=350):
        self.page.wait_for_timeout(ms)

    def clean_ui(self):
        self.page.evaluate("""() => { document.querySelectorAll('.toast').forEach(t => t.remove()); }""")

    # ---- chụp ----
    def _items(self, marks, name):
        items = []
        for target, n in marks:
            if target is None:
                continue
            try:
                loc = target.first if hasattr(target, 'first') else None
                if loc is not None:
                    loc.scroll_into_view_if_needed(timeout=3000)
                box = loc.bounding_box() if loc is not None else target
            except Exception:
                box = None
            if not box:
                print('  ! không thấy phần tử cho dấu', n, 'ở', name)
                continue
            items.append(dict(x=box['x'], y=box['y'], w=box['width'], h=box['height'], n=n, color=RED))
        return items

    def note(self, name, caption, legend, alt=''):
        """Ghi chú thích và chú giải của ảnh vào manifest để bộ dựng tài liệu lấy đúng một nguồn."""
        self.manifest[name] = dict(caption=caption, legend=list(legend or []), alt=alt or caption)

    def dialog_clip(self, pad=18):
        """Khung cắt quanh hộp thoại đang mở (nếu có và nhỏ hơn màn hình), để ảnh chỉ có hộp thoại chứ không kèm nền mờ."""
        pg = self.page
        try:
            if not pg.evaluate("() => { const s = document.querySelector('.scrim'); return !!(s && s.classList.contains('on')); }"):
                return None
            dlg = pg.locator('#dialog').first
            if not dlg.count() or not dlg.is_visible():
                return None
            box = dlg.bounding_box()
            vp = pg.viewport_size
            if not box or box['width'] > vp['width'] * 0.9 or box['height'] < 40:
                return None
            x0, y0 = max(0, box['x'] - pad), max(0, box['y'] - pad)
            x1, y1 = min(vp['width'], box['x'] + box['width'] + pad), min(vp['height'], box['y'] + box['height'] + pad)
            return dict(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
        except Exception:
            return None

    def shot(self, name, marks=(), clip=None, full=False, caption=None, legend=None, crop_dialog=True):
        """marks: [(locator|None, số)] — khung đỏ đánh số quanh phần tử."""
        if caption:
            self.note(name, caption, legend)
        pg = self.page
        self.clean_ui()
        if clip is None and crop_dialog and not full:
            clip = self.dialog_clip()
        items = self._items(marks, name)
        if items:
            pg.evaluate(OVERLAY_JS, items)
        path = os.path.join(OUT, name + '.png')
        if clip:
            pg.screenshot(path=path, clip=clip)
        else:
            pg.screenshot(path=path, full_page=full)
        pg.evaluate("() => { const o = document.getElementById('__guide_overlay'); if (o) o.remove(); }")
        self.shots.append(name)
        print('  chụp', name)

    def shot_box(self, name, region, marks=(), pad=10, min_h=0, caption=None, legend=None):
        """Chụp vùng bao quanh `region` (locator) và vẽ dấu đánh số lên đó. Vùng dài hơn khung nhìn thì chụp phần đầu."""
        if caption:
            self.note(name, caption, legend)
        pg = self.page
        self.clean_ui()
        loc = region.first
        loc.scroll_into_view_if_needed(timeout=5000)
        pg.wait_for_timeout(150)
        vp = pg.viewport_size
        box = loc.bounding_box()
        items = self._items(marks, name)
        x0 = max(0, box['x'] - pad)
        y0 = max(0, box['y'] - pad)
        x1 = min(vp['width'], box['x'] + box['width'] + pad)
        y1 = min(vp['height'], box['y'] + max(box['height'], min_h) + pad)
        if items:
            pg.evaluate(OVERLAY_JS, items)
        path = os.path.join(OUT, name + '.png')
        pg.screenshot(path=path, clip=dict(x=x0, y=y0, width=x1 - x0, height=y1 - y0))
        pg.evaluate("() => { const o = document.getElementById('__guide_overlay'); if (o) o.remove(); }")
        self.shots.append(name)
        print('  chụp', name)

    def close(self):
        import json
        path = os.path.join(OUT, '_manifest.json')
        old = {}
        if os.path.exists(path):
            try:
                old = json.load(open(path, encoding='utf-8'))
            except Exception:
                old = {}
        old.update(self.manifest)
        json.dump(old, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        out = os.environ.get('CAP_STATE_OUT')
        if out:
            self.ctx.storage_state(path=out)
        self.browser.close()
