"""Ghép ảnh thu nhỏ để kiểm tra nhanh: py contact_sheet.py <tiền tố> <ảnh-ra>"""
import glob
import os
import sys
from PIL import Image, ImageDraw

prefix, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'anh', prefix + '*.png')))
cols, tw = 3, 620
thumbs = []
for f in files:
    im = Image.open(f).convert('RGB')
    r = tw / im.width
    im = im.resize((tw, int(im.height * r)))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 260, 20], fill=(0, 0, 0))
    d.text((4, 4), os.path.basename(f), fill=(255, 255, 255))
    thumbs.append(im)
rows = [thumbs[i:i + cols] for i in range(0, len(thumbs), cols)]
h = sum(max(t.height for t in r) + 6 for r in rows)
sheet = Image.new('RGB', (cols * (tw + 6), h), (240, 240, 240))
y = 0
for r in rows:
    for i, t in enumerate(r):
        sheet.paste(t, (i * (tw + 6), y))
    y += max(t.height for t in r) + 6
sheet.save(out, quality=80)
print(len(files), 'ảnh ->', out)
