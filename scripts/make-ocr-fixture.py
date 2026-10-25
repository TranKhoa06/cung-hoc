"""Create an authored, non-private image for a manual browser OCR smoke test."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
folder.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1500, 1050), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 38)
lines = [
    'Câu 1. Tần số của clock có chu kỳ 10 ns là bao nhiêu?',
    'A. 10 MHz', 'B. 50 MHz', 'C. 100 MHz', 'D. 1 GHz', 'E. 200 MHz', '',
    'Câu 2. Chọn các số chẵn.', 'A. 2', 'B. 3', 'C. 4',
]
for index, line in enumerate(lines):
    draw.text((70, 60 + index * 75), line, fill=(25, 59, 64), font=font)
image.save(folder / 'ocr-sample.png')
print(folder / 'ocr-sample.png')
