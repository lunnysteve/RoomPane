from pathlib import Path

from PIL import Image, ImageDraw


root = Path(__file__).resolve().parents[1]


def make_icon(size):
    scale = 4
    image = Image.new('RGB', (size * scale, size * scale), '#142133')
    draw = ImageDraw.Draw(image)
    factor = size * scale / 192

    def box(values):
        return tuple(round(value * factor) for value in values)

    def panel(values, radius, fill):
        draw.rounded_rectangle(box(values), radius=round(radius * factor), fill=fill)

    panel((28, 28, 164, 164), 22, '#20364d')
    panel((42, 42, 100, 150), 10, '#70b7ff')
    panel((112, 42, 150, 92), 9, '#f1f5fb')
    panel((112, 104, 150, 150), 9, '#87d4a4')
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'app-icon-{size}.png')


for icon_size in (192, 512):
    make_icon(icon_size)
