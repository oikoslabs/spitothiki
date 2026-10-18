# Generates the synthetic bill PDFs used by the smoke test (no real customer data).
# python3 tests/fixtures/bills/make-pdfs.py
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).parent
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
pdfmetrics.registerFont(TTFont('DejaVu', FONT))

def text_pdf(src, out):
    c = canvas.Canvas(str(here / out), pagesize=A4)
    y = 800
    for line in (here / src).read_text(encoding='utf-8').splitlines():
        c.setFont('DejaVu', 12); c.drawString(50, y, line); y -= 22
    c.save()

def scanned_pdf(src, out):
    img = Image.new('RGB', (1240, 900), 'white'); d = ImageDraw.Draw(img); f = ImageFont.truetype(FONT, 28)
    for i, line in enumerate((here / src).read_text(encoding='utf-8').splitlines()): d.text((60, 60 + i * 50), line, font=f, fill='black')
    png = here / '_tmp.png'; img.save(png)
    c = canvas.Canvas(str(here / out), pagesize=A4); c.drawImage(str(png), 0, 300, width=595, height=432); c.save(); png.unlink()

text_pdf('dei.txt', 'dei.pdf')
text_pdf('cosmote.txt', 'cosmote.pdf')
scanned_pdf('eydap.txt', 'eydap-scanned.pdf')
