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

# Telecom layout: header row and value row as separate items in columns, value baseline a point off.
def columns_pdf(out):
    c = canvas.Canvas(str(here / out), pagesize=A4); c.setFont('DejaVu', 11)
    c.drawString(50, 800, 'vodafone'); c.drawString(50, 780, 'Λογαριασμός Κινητής Τηλεφωνίας')
    cols = [(50, 'Αριθμός λογαριασμού', '1234567890'), (200, 'Ημερομηνία έκδοσης', '05/10/2026'), (340, 'Ημερομηνία λήξης', '05/11/2026'), (470, 'Ποσό πληρωμής', '€ 32,45')]
    for x, h, v in cols: c.drawString(x, 740, h); c.drawString(x, 721.5 + (x % 3) * 0.6, v)
    c.drawString(50, 690, 'Περίοδος χρέωσης 01/09/2026 - 30/09/2026')
    c.drawString(50, 670, 'Υποσύνολο χρεώσεων'); c.drawString(470, 670, '26,17 €')
    c.drawString(50, 650, 'ΦΠΑ 24%'); c.drawString(470, 650, '6,28 €')
    c.drawString(50, 620, 'Κωδικός πληρωμής RF18 5390 0754 7034'); c.save()

# Any provider: text has no amount/due label, an EPC (SEPA) QR carries the amount.
def epc_pdf(out):
    import qrcode
    payload = 'BCD\n002\n1\nSCT\n\nNOVA\nGR1601101250000000012300695\nEUR49.60\n\n\nRF18539007547034\n'
    png = here / '_qr.png'; qrcode.make(payload, box_size=8, border=4).save(png)
    c = canvas.Canvas(str(here / out), pagesize=A4); c.setFont('DejaVu', 12)
    c.drawString(50, 800, 'NOVA - Ειδοποίηση'); c.drawString(50, 778, 'Σκανάρετε τον κωδικό QR για πληρωμή')
    c.drawString(50, 756, 'Κωδικός πληρωμής RF18539007547034'); c.drawImage(str(png), 50, 480, width=220, height=220); c.save(); png.unlink()

columns_pdf('vodafone-columns.pdf')
epc_pdf('nova-epc.pdf')
