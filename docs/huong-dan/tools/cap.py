"""Bộ chụp ảnh hướng dẫn: chạy bản demo cục bộ, đi đúng luồng và chụp từng bước.

Cách chạy (cần server tĩnh ở cổng 4173, xem .claude/launch.json):
    py docs/huong-dan/tools/capture.py
"""
import os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4173/'
OUT = os.environ.get('GUIDE_OUT') or os.path.join(os.path.dirname(__file__), '..', 'anh')
os.makedirs(OUT, exist_ok=True)

RED = '#e11d48'

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


class Cap:
    def __init__(self, p, width=1440, height=1080, mobile=False, storage_state=None):
        self.browser = p.chromium.launch()
        opts = dict(viewport={'width': width, 'height': height}, locale='vi-VN', device_scale_factor=1)
        if mobile:
            opts.update(is_mobile=True, has_touch=True, device_scale_factor=2)
        if storage_state:
            opts['storage_state'] = storage_state
        self.ctx = self.browser.new_context(**opts)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        self.page.goto(BASE)
        self.page.wait_for_timeout(500)
        self.shots = []

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
        self.page.wait_for_timeout(500)

    def settle(self, ms=350):
        self.page.wait_for_timeout(ms)

    def clean_ui(self):
        self.page.evaluate("""() => { document.querySelectorAll('.toast').forEach(t => t.remove()); }""")

    # ---- chụp ----
    def shot(self, name, marks=(), clip=None):
        """marks: [(locator|None, số)] — khung đỏ đánh số quanh phần tử."""
        pg = self.page
        self.clean_ui()
        items = []
        for target, n in marks:
            if target is None:
                continue
            box = target.first.bounding_box() if hasattr(target, 'first') else target
            if not box:
                print('  ! không thấy phần tử cho dấu', n, 'ở', name)
                continue
            items.append(dict(x=box['x'], y=box['y'], w=box['width'], h=box['height'], n=n, color=RED))
        if items:
            pg.evaluate(OVERLAY_JS, items)
        path = os.path.join(OUT, name + '.png')
        pg.screenshot(path=path, clip=clip) if clip else pg.screenshot(path=path)
        pg.evaluate("() => { const o = document.getElementById('__guide_overlay'); if (o) o.remove(); }")
        self.shots.append(name)
        print('  chụp', name)

    def close(self):
        self.browser.close()
