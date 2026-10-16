"""Vẽ ba hình minh họa cho tài liệu "Cách tính giờ" (PNG, chữ Calibri).

    py docs/huong-dan/tinh-gio/make_figures.py

Khổ hình 1300 px được dàn vừa bề ngang trang A4 nên chữ trong hình xấp xỉ 8–10 pt khi in.
Số liệu trong hình là đúng ví dụ trong tài liệu và đã được đối chiếu với LSTiming (js/core.js).
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = r'C:\Windows\Fonts\calibri.ttf'
BOLD = r'C:\Windows\Fonts\calibrib.ttf'

GREEN, DARK = (15, 92, 85), (8, 58, 54)
TEAL = (47, 143, 131)
AMBER, AMBER_BG, AMBER_INK = (232, 163, 23), (255, 241, 204), (154, 103, 0)
GRAY, GRAY_BG, INK, MUTED = (148, 163, 184), (226, 232, 240), (30, 41, 59), (100, 116, 139)
RED = (225, 29, 72)
WHITE = (255, 255, 255)
W = 1300


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def hm(text):
    h, m = text.split(':')
    return int(h) * 60 + int(m)


class Canvas:
    def __init__(self, height):
        self.img = Image.new('RGB', (W, height), WHITE)
        self.d = ImageDraw.Draw(self.img)

    def text(self, xy, s, size=26, fill=INK, bold=False, anchor='la'):
        self.d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)

    def box(self, x0, y0, x1, y1, fill, outline=None, hatch=None, radius=0):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        if hatch:
            w, h = x1 - x0, y1 - y0
            patch = Image.new('RGB', (w, h), fill)
            pd = ImageDraw.Draw(patch)
            for k in range(-h, w, 14):
                pd.line([(k, h), (k + h, 0)], fill=hatch, width=2)
            self.img.paste(patch, (x0, y0))
            if outline:
                self.d.rectangle([x0, y0, x1, y1], outline=outline, width=2)
            return
        if radius:
            self.d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline, width=2 if outline else 0)
        else:
            self.d.rectangle([x0, y0, x1, y1], fill=fill, outline=outline, width=2 if outline else 0)

    def save(self, name):
        self.img.save(os.path.join(HERE, name), optimize=True)
        print('saved', name, self.img.size)


class Axis:
    def __init__(self, start, end, x0, x1):
        self.s, self.e, self.x0, self.x1 = hm(start), hm(end), x0, x1

    def x(self, t):
        m = t if isinstance(t, int) else hm(t)
        return self.x0 + (m - self.s) * (self.x1 - self.x0) / (self.e - self.s)


def ticks(c, ax, y, labels, bold=(), size=22):
    for t in labels:
        x = ax.x(t)
        c.d.line([(x, y), (x, y + 10)], fill=MUTED, width=2)
        c.text((x, y + 14), t, size, INK if t in bold else MUTED, t in bold, 'ma')


def fig_calendar():
    c = Canvas(400)
    ax = Axis('06:00', '20:00', 50, 1250)
    y0, y1 = 100, 200
    for a, b, kind in [('06:00', '07:30', 'o'), ('07:30', '11:30', 'w'), ('11:30', '13:30', 'b'), ('13:30', '18:00', 'w'), ('18:00', '20:00', 'o')]:
        xa, xb = ax.x(a), ax.x(b)
        if kind == 'w':
            c.box(xa, y0, xb, y1, GREEN)
        elif kind == 'b':
            c.box(xa, y0, xb, y1, GRAY_BG)
        else:
            c.box(xa, y0, xb, y1, AMBER_BG, hatch=(240, 200, 110))
    mid = lambda a, b: (ax.x(a) + ax.x(b)) / 2
    c.text((mid('07:30', '11:30'), 132), 'Sáng', 30, WHITE, True, 'ma')
    c.text((mid('07:30', '11:30'), 168), '240 phút', 26, WHITE, False, 'ma')
    c.text((mid('13:30', '18:00'), 132), 'Chiều', 30, WHITE, True, 'ma')
    c.text((mid('13:30', '18:00'), 168), '270 phút', 26, WHITE, False, 'ma')
    c.text((mid('11:30', '13:30'), 132), 'Nghỉ trưa', 26, MUTED, True, 'ma')
    c.text((mid('11:30', '13:30'), 168), 'không tính', 23, MUTED, False, 'ma')
    c.text((mid('06:00', '07:30'), 150), 'Ngoài', 23, AMBER_INK, True, 'mm')
    c.text((mid('18:00', '20:00'), 150), 'Ngoài giờ', 23, AMBER_INK, True, 'mm')
    ticks(c, ax, y1 + 4, ['06:00', '07:30', '09:00', '11:30', '13:30', '15:00', '17:00', '18:00', '20:00'], bold=('07:30', '11:30', '13:30', '18:00'), size=22)
    c.text((50, 30), 'Một ngày làm việc theo lịch chuẩn: 510 phút', 36, DARK, True)
    c.box(50, 290, 80, 318, GREEN)
    c.text((92, 290), 'Giờ làm việc: luôn được tính', 25, INK)
    c.box(50, 336, 80, 364, AMBER_BG, hatch=(240, 200, 110))
    c.text((92, 336), 'Ngoài giờ: tính khi phiên đã đóng trong cùng ngày', 25, INK)
    c.box(700, 290, 730, 318, GRAY_BG)
    c.text((742, 290), 'Nghỉ trưa: không tính', 25, INK)
    c.save('hinh-1-lich-ngay.png')


def fig_day():
    c = Canvas(700)
    ax = Axis('07:00', '19:00', 320, 1250)
    top, lane_h, gap = 110, 80, 30
    lanes = [
        (['Hồ sơ A'], [('07:45', '09:15', GREEN, '90 phút'), ('13:30', '15:00', GREEN, '90 phút')]),
        (['Hồ sơ B'], [('09:15', '11:30', TEAL, '135 phút'), ('16:00', '18:00', TEAL, '120 phút'), ('18:00', '18:40', AMBER, '40')]),
        (['Tạm dừng toàn bộ', 'loại Báo cáo'], [('15:00', '16:00', MUTED, '60 phút')]),
        (['Giờ cán bộ', 'đã dùng'], [('07:45', '11:30', DARK, '225 phút'), ('13:30', '18:00', DARK, '270 phút'), ('18:00', '18:40', AMBER, '40')]),
    ]
    bottom = top + len(lanes) * (lane_h + gap) - gap
    c.box(ax.x('11:30'), top - 20, ax.x('13:30'), bottom + 20, GRAY_BG)
    c.box(ax.x('07:00'), top - 20, ax.x('07:30'), bottom + 20, AMBER_BG)
    c.box(ax.x('18:00'), top - 20, ax.x('19:00'), bottom + 20, AMBER_BG)
    c.text(((ax.x('11:30') + ax.x('13:30')) / 2, top - 50), 'Nghỉ trưa', 23, MUTED, True, 'ma')
    c.text(((ax.x('18:00') + ax.x('19:00')) / 2, top - 50), 'Ngoài giờ', 23, AMBER_INK, True, 'ma')
    for i, (names, segs) in enumerate(lanes):
        y = top + i * (lane_h + gap)
        bold = i == 3
        if len(names) == 1:
            c.text((30, y + lane_h / 2), names[0], 28, INK, bold, 'lm')
        else:
            c.text((30, y + lane_h / 2 - 17), names[0], 27, INK, bold, 'lm')
            c.text((30, y + lane_h / 2 + 17), names[1], 27, INK, bold, 'lm')
        for a, b, col, label in segs:
            xa, xb = ax.x(a), ax.x(b)
            c.box(xa, y, xb, y + lane_h, col, radius=6)
            c.text(((xa + xb) / 2, y + lane_h / 2), label, 25, WHITE if col != AMBER else INK, True, 'mm')
    ticks(c, ax, bottom + 24, ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '18:00', '19:00'], bold=('18:00',), size=23)
    c.text((30, 28), 'Một ngày mẫu của một cán bộ: 535 phút ghi nhận', 36, DARK, True)
    c.text((30, bottom + 78), 'Hồ sơ A + B = 475 phút, trong đó 40 phút ngoài giờ vì B hoàn thành lúc 18:40.', 25, INK)
    c.text((30, bottom + 112), 'Báo cáo = 60 phút. Tổng 535 phút, mỗi khoảng chỉ tính một lần.', 25, INK)
    c.save('hinh-2-ngay-mau.png')


def fig_sla():
    c = Canvas(640)
    ax = Axis('07:30', '18:00', 250, 1250)
    h = 80
    lanes = [('Thứ Ba 06/10', 150), ('Thứ Tư 07/10', 340)]
    c.text((30, 26), 'Hạn lùi khi hồ sơ dừng tính hạn', 36, DARK, True)
    c.text((30, 74), 'Nhận thứ Ba 09:00, SLA 8 giờ, đang hẹn khách từ 14:00 đến 09:00 thứ Tư', 25, MUTED)
    for name, y in lanes:
        c.text((30, y + h / 2), name, 28, INK, True, 'lm')
        for a, b in (('07:30', '11:30'), ('13:30', '18:00')):
            c.box(ax.x(a), y, ax.x(b), y + h, (241, 245, 249), outline=(203, 213, 225))
        c.text(((ax.x('11:30') + ax.x('13:30')) / 2, y + h / 2), 'nghỉ trưa', 22, MUTED, False, 'mm')
        ticks(c, ax, y + h + 2, ['07:30', '09:00', '11:30', '13:30', '16:00', '18:00'], size=21)
    ty, wy = lanes[0][1], lanes[1][1]
    c.box(ax.x('09:00'), ty, ax.x('11:30'), ty + h, GREEN)
    c.box(ax.x('13:30'), ty, ax.x('14:00'), ty + h, GREEN)
    c.box(ax.x('14:00'), ty, ax.x('18:00'), ty + h, GRAY_BG, outline=GRAY, hatch=GRAY)
    c.text(((ax.x('09:00') + ax.x('11:30')) / 2, ty + h / 2), '150 phút', 25, WHITE, True, 'mm')
    c.text(((ax.x('14:00') + ax.x('18:00')) / 2, ty + h / 2), 'Đang hẹn khách ký', 25, INK, True, 'mm')
    c.box(ax.x('07:30'), wy, ax.x('09:00'), wy + h, GRAY_BG, outline=GRAY, hatch=GRAY)
    c.box(ax.x('09:00'), wy, ax.x('11:30'), wy + h, GREEN)
    c.box(ax.x('13:30'), wy, ax.x('16:00'), wy + h, GREEN)
    c.text(((ax.x('07:30') + ax.x('09:00')) / 2, wy + h / 2), 'dừng', 23, INK, True, 'mm')
    c.text(((ax.x('09:00') + ax.x('11:30')) / 2, wy + h / 2), '150 phút', 25, WHITE, True, 'mm')
    c.text(((ax.x('13:30') + ax.x('16:00')) / 2, wy + h / 2), '150 phút', 25, WHITE, True, 'mm')
    x = ax.x('09:00')
    c.d.line([(x, ty - 22), (x, ty)], fill=AMBER, width=5)
    c.text((x, ty - 28), 'LS tiếp nhận 09:00', 24, AMBER_INK, True, 'ms')
    x = ax.x('16:00')
    c.d.line([(x, wy - 22), (x, wy + h + 6)], fill=RED, width=5)
    c.text((x, wy - 28), 'Hạn: thứ Tư 16:00', 26, RED, True, 'ms')
    c.text((30, 478), 'Đã tính: 150 + 30 + 150 + 150 = 480 phút = 8 giờ.', 25, INK)
    c.text((30, 512), 'Khoảng dừng gồm 240 + 90 = 330 phút giờ làm việc, hạn lùi đúng 330 phút.', 25, INK)
    c.text((30, 546), 'Không dừng thì hạn là thứ Tư 08:30; có dừng thì thứ Tư 16:00.', 25, INK)
    c.save('hinh-3-han-sla.png')


if __name__ == '__main__':
    fig_calendar()
    fig_day()
    fig_sla()
