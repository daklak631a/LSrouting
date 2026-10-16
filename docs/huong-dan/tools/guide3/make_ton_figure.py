"""Vẽ hình minh họa vòng đời việc tồn của một khách có hồ sơ vay và TSĐB mới (PNG 1300 px, chữ Calibri).

    py tools/guide3/make_ton_figure.py

Ra: anh/hinh-4-vong-doi-ton.png, đồng thời ghi chú thích vào anh/_manifest.json.
Các thẻ và điều kiện hết tồn khớp personalBacklogKinds trong js/screens.js.
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ANH = os.path.normpath(os.path.join(HERE, '..', '..', 'anh'))
FONT = r'C:\Windows\Fonts\calibri.ttf'
BOLD = r'C:\Windows\Fonts\calibrib.ttf'
GREEN, DARK, TEAL = (15, 92, 85), (8, 58, 54), (47, 143, 131)
AMBER_BG, AMBER_INK = (255, 241, 204), (154, 103, 0)
INK, MUTED, LINE, PANEL = (30, 41, 59), (100, 116, 139), (207, 232, 228), (246, 250, 249)
WHITE = (255, 255, 255)
CHIP = {
    'HĐTD': ((255, 241, 204), (154, 103, 0)),
    'HĐTC': ((219, 234, 254), (30, 64, 175)),
    'Kho TSĐB': ((237, 233, 254), (91, 33, 182)),
    'RLOS': ((255, 237, 213), (194, 65, 12)),
    'Chưa nhận HS': ((226, 232, 240), (71, 85, 105)),
}
W, H = 1300, 640


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


img = Image.new('RGB', (W, H), WHITE)
d = ImageDraw.Draw(img)

d.text((40, 24), 'Hồ sơ vay + TSĐB mới đi qua các thẻ của Việc tồn', font=font(34, True), fill=DARK)

left = 190
cols = 5
cw = (W - left - 30) / cols
steps = [
    ('1. Được giao', 'chưa tiếp nhận'),
    ('2. Tiếp nhận', 'bấm một chạm'),
    ('3. Xong HĐTD', 'hoặc Hẹn khách ký'),
    ('4. Tick soạn xong', 'HĐ thế chấp (việc TSĐB)'),
    ('5. Tick nhập kho,', 'Hoàn thành'),
]
chips = {
    'Món': [['Chưa nhận HS'], ['HĐTD', 'RLOS'], ['RLOS'], ['RLOS'], None],
    'TSĐB': [['Chưa nhận HS'], ['HĐTC', 'Kho TSĐB'], ['HĐTC', 'Kho TSĐB'], ['Kho TSĐB'], None],
}
counts = [
    'Chưa nhận HS 2',
    'HĐTD 1 · HĐTC 1 · Kho 1 · RLOS 1',
    'HĐTD 0 · HĐTC 1 · Kho 1 · RLOS 1',
    'HĐTD 0 · HĐTC 0 · Kho 1 · RLOS 1',
    'Hết tồn|Hồ sơ rời Việc tồn',
]

top = 90
# tiêu đề cột
for i, (a, b) in enumerate(steps):
    x0 = left + i * cw
    d.rounded_rectangle([x0 + 6, top, x0 + cw - 6, top + 78], radius=10, fill=GREEN)
    d.text((x0 + cw / 2, top + 24), a, font=font(24, True), fill=WHITE, anchor='mm')
    d.text((x0 + cw / 2, top + 54), b, font=font(20), fill=(207, 232, 228), anchor='mm')


def chip(x, y, label):
    bg, fg = CHIP[label]
    f = font(22, True)
    w = d.textlength(label, font=f) + 24
    d.rounded_rectangle([x, y, x + w, y + 38], radius=10, fill=bg)
    d.text((x + 12, y + 19), label, font=f, fill=fg, anchor='lm')
    return w + 8


lane_y = {'Món': top + 110, 'TSĐB': top + 230}
sub = {'Món': 'Vay mới SXKD', 'TSĐB': 'Nhập mới / nhập thêm'}
for lane, y in lane_y.items():
    d.rounded_rectangle([20, y, W - 20, y + 100], radius=12, fill=PANEL, outline=LINE, width=2)
    d.text((40, y + 32), lane, font=font(30, True), fill=DARK, anchor='lm')
    d.text((40, y + 68), sub[lane], font=font(20), fill=MUTED, anchor='lm')
    for i in range(cols):
        x0 = left + i * cw + 14
        row = chips[lane][i]
        if row is None:
            d.text((left + i * cw + cw / 2, y + 50), 'Ra khỏi tồn', font=font(24, True), fill=GREEN, anchor='mm')
            continue
        cx = x0
        cy = y + 12 if len(row) == 1 else y + 12
        for label in row:
            if cx - x0 + d.textlength(label, font=font(22, True)) + 24 > cw - 20:
                cx = x0
                cy += 46
            cx += chip(cx, cy, label)

# hàng số đếm
cy = top + 360
d.text((40, cy + 40), 'Thẻ đếm của', font=font(24, True), fill=DARK, anchor='lm')
d.text((40, cy + 68), 'nhóm Việc tồn', font=font(24, True), fill=DARK, anchor='lm')
for i, text in enumerate(counts):
    x0 = left + i * cw
    d.rounded_rectangle([x0 + 6, cy, x0 + cw - 6, cy + 108], radius=10, fill=AMBER_BG)
    words = text.split(' · ')
    if '|' in text:
        a, b = text.split('|')
        d.text((x0 + cw / 2, cy + 38), a, font=font(24, True), fill=AMBER_INK, anchor='mm')
        d.text((x0 + cw / 2, cy + 74), b, font=font(20), fill=AMBER_INK, anchor='mm')
    elif len(words) == 1:
        d.text((x0 + cw / 2, cy + 54), text, font=font(21, True), fill=AMBER_INK, anchor='mm')
    else:
        for k, wd in enumerate(words):
            col, row = k % 2, k // 2
            d.text((x0 + 14 + col * (cw / 2 - 6), cy + 32 + row * 40), wd, font=font(20, True), fill=AMBER_INK, anchor='lm')

d.text((40, H - 40), 'Việc kèm TSĐB được tiếp nhận cùng lúc với hồ sơ vay nếu giao cùng một cán bộ; HĐ thế chấp luôn tính ở việc TSĐB, không tính ở hồ sơ vay.',
       font=font(21), fill=MUTED, anchor='lm')

path = os.path.join(ANH, 'hinh-4-vong-doi-ton.png')
img.save(path, optimize=True)
print('saved', path, img.size)

mp = os.path.join(ANH, '_manifest.json')
m = json.load(open(mp, encoding='utf-8'))
m['hinh-4-vong-doi-ton'] = {
    'caption': 'Ví dụ: một hồ sơ vay và việc TSĐB mới đi kèm qua các thẻ của Việc tồn',
    'legend': [],
    'alt': 'Năm bước từ được giao đến hoàn thành; các thẻ HĐTD, HĐTC, Kho TSĐB, RLOS lần lượt hết tồn',
}
json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
