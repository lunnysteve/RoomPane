from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
target=root/'android-tv/app/src/main/res/drawable';target.mkdir(parents=True,exist_ok=True)
Image.open(root/'app-icon-192.png').save(target/'icon.png')
image=Image.new('RGB',(320,180),'#142133');draw=ImageDraw.Draw(image)
image.paste(Image.open(root/'app-icon-192.png').convert('RGB').resize((110,110)),(12,35))
font_path=Path('C:/Windows/Fonts/seguisb.ttf')
if not font_path.exists():font_path=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
font=ImageFont.truetype(str(font_path),27) if font_path.exists() else ImageFont.load_default(size=27)
draw.text((133,48),'Home',font=font,fill='#f1f5fb');draw.text((133,86),'Display',font=font,fill='#70b7ff')
image.save(target/'banner.png')
