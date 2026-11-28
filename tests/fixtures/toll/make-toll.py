#!/usr/bin/env python3
"""Synthetic Greek motorway toll receipts for the scanner tests (fictional data only).

No real station, company, VAT number, name, address or account is printed. The 36-digit
Code128 follows the known toll layout: 05 | yyyymmddhhmmss | 9-digit receipt no | 11-digit tail.

Usage: python3 make-toll.py <outdir>
Writes:
  toll-far.jpg            whole receipt with margin, ~12 MP phone photo (held 20 cm away)
  toll-close-12mp.jpg     ~12 MP close-up: barcode fills the frame, slight blur (held 5-6 cm away)
  toll-close-blurry.jpg   close-up below the lens' focus distance (strong blur): bars unreadable
  camera-close-then-far.y4m  1280x720 fake camera: 9 s close + out of focus, then 6 s farther and sharp
"""
import os, sys, io
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import barcode
from barcode.writer import ImageWriter

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)
DIGITS = '05' + '20261127183012' + '001234567' + '00998700009'
assert len(DIGITS) == 36
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def receipt(width=1000):
    """The receipt paper itself, ~80 mm thermal roll at ~12.5 px/mm."""
    lines = [
        (BOLD, 44, 'ΑΠΟΔΕΙΞΗ ΠΛΗΡΩΜΗΣ ΔΙΟΔΙΩΝ'),
        (SANS, 36, 'ΟΔΟΣ ΔΟΚΙΜΗΣ Α.Ε. (ΠΑΡΑΔΕΙΓΜΑ)'),
        (SANS, 36, 'ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΔΟΚΙΜΗΣ'),
        (SANS, 34, 'ΛΩΡΙΔΑ 04     ΚΑΤΗΓΟΡΙΑ 1'),
        (MONO, 36, '27/11/2026 18:30:12  1234567'),
        (BOLD, 54, 'ΕΥΡΩ 2,55'),
        (SANS, 30, 'ΜΕΤΡΗΤΑ'),
    ]
    code = barcode.get('code128', DIGITS, writer=ImageWriter())
    buf = io.BytesIO()
    code.write(buf, {'module_width': 0.32, 'module_height': 16, 'quiet_zone': 4, 'write_text': False, 'dpi': 300})
    bar = Image.open(io.BytesIO(buf.getvalue())).convert('L')
    bar = bar.resize((width - 60, int(bar.height * (width - 60) / bar.width)), Image.NEAREST)
    h = 80 + sum(s + 34 for _, s, _ in lines) + bar.height + 140
    img = Image.new('L', (width, h), 246)
    d = ImageDraw.Draw(img)
    y = 50
    for font, size, text in lines:
        f = ImageFont.truetype(font, size)
        w = d.textlength(text, font=f)
        d.text(((width - w) / 2, y), text, font=f, fill=25)
        y += size + 34
    img.paste(bar, (30, y)); y += bar.height + 20
    f = ImageFont.truetype(MONO, 25)
    w = d.textlength(DIGITS, font=f)
    d.text(((width - w) / 2, y), DIGITS, font=f, fill=30)
    return img.convert('RGB')


def photo(paper, size, paper_width_frac, center=(0.5, 0.5), blur=0.0, angle=0.0):
    """Paper on a darker table, scaled so it spans `paper_width_frac` of the photo width."""
    W, H = size
    bg = Image.new('RGB', (W, H), (92, 84, 76))
    pw = int(W * paper_width_frac)
    ph = int(paper.height * pw / paper.width)
    p = paper.resize((pw, ph), Image.LANCZOS)
    if angle:
        p = p.rotate(angle, expand=True, fillcolor=(92, 84, 76), resample=Image.BICUBIC)
    cx, cy = int(W * center[0] - p.width / 2), int(H * center[1] - p.height / 2)
    bg.paste(p, (cx, cy))
    if blur:
        bg = bg.filter(ImageFilter.GaussianBlur(blur))
    return bg


paper = receipt()
bar_y = (paper.height - 175) / paper.height  # roughly where the bars sit
photo(paper, (4032, 3024), 0.42, angle=1.5).rotate(-90, expand=True).save(os.path.join(OUT, 'toll-far.jpg'), quality=88)
photo(paper, (4032, 3024), 1.08, center=(0.5, 0.5 - (bar_y - 0.5) * 1.08 * paper.height / paper.width * 4032 / 3024), blur=2.2).save(os.path.join(OUT, 'toll-close-12mp.jpg'), quality=88)
photo(paper, (4032, 3024), 1.08, center=(0.5, 0.5 - (bar_y - 0.5) * 1.08 * paper.height / paper.width * 4032 / 3024), blur=14).save(os.path.join(OUT, 'toll-close-blurry.jpg'), quality=88)

# Fake camera (Chrome --use-file-for-fake-video-capture loops it): close + out of focus, then farther + sharp.
if '--y4m' in sys.argv:
    W, H, FPS = 1280, 720, 10
    close = photo(paper, (W, H), 1.15, center=(0.5, 0.5 - (bar_y - 0.5) * 1.15 * paper.height / paper.width * W / H), blur=7)
    far = photo(paper, (W, H), 0.80, center=(0.5, 0.5 - (bar_y - 0.5) * 0.80 * paper.height / paper.width * W / H) , blur=0.6)
    def yuv(img):
        y, u, v = img.convert('YCbCr').split()
        return y.tobytes() + u.resize((W // 2, H // 2)).tobytes() + v.resize((W // 2, H // 2)).tobytes()
    fc, ff = yuv(close), yuv(far)
    with open(os.path.join(OUT, 'camera-close-then-far.y4m'), 'wb') as fh:
        fh.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
        for i in range(15 * FPS):
            fh.write(b'FRAME\n'); fh.write(fc if i < 9 * FPS else ff)
    with open(os.path.join(OUT, 'camera-close.y4m'), 'wb') as fh:
        fh.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
        for i in range(2 * FPS):
            fh.write(b'FRAME\n'); fh.write(fc)
print('ok', OUT)
