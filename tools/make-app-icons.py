from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#142133')
    draw = ImageDraw.Draw(image)
    s = size / 192
    def box(values): return tuple(round(v * s) for v in values)
    draw.rounded_rectangle(box((28, 40, 164, 132)), radius=round(12*s), outline='#70b7ff', width=round(10*s))
    draw.line(box((96, 132, 96, 153)), fill='#70b7ff', width=round(10*s))
    draw.line(box((72, 153, 120, 153)), fill='#70b7ff', width=round(10*s))
    draw.line(box((51, 66, 99, 66)), fill='#f1f5fb', width=round(8*s))
    draw.line(box((51, 86, 81, 86)), fill='#f1f5fb', width=round(8*s))
    draw.ellipse(box((115, 68, 149, 102)), fill='#87d4a4')
    image.save(root / f'app-icon-{size}.png')
