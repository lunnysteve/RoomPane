from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


root = Path(__file__).resolve().parents[1]
target = root / 'android-tv/app/src/main/res/drawable'
target.mkdir(parents=True, exist_ok=True)

icon = Image.open(root / 'app-icon-192.png').convert('RGB')
icon.save(target / 'icon.png')

image = Image.new('RGB', (320, 180), '#142133')
draw = ImageDraw.Draw(image)
image.paste(icon.resize((112, 112), Image.Resampling.LANCZOS), (12, 34))
font = ImageFont.truetype(str(root / 'studio-heavy.ttf'), 29)
small = ImageFont.truetype(str(root / 'studio-sans.ttf'), 13)
draw.text((132, 60), 'Roompane', font=font, fill='#f1f5fb')
draw.text((134, 105), 'YOUR HOME AT A GLANCE', font=small, fill='#70b7ff')
image.save(target / 'banner.png')
