# アプリアイコンを作る（方眼の上のトグルクランプと、締圧力の矢印）。python tools/make_icons.py（Pillow が必要）
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
BG, GRID, WHITE, BASE, ARROW = (29, 92, 150), (50, 112, 168), (255, 255, 255), (98, 146, 190), (240, 160, 122)

def draw(size, maskable=False):
    s = 4 * size  # 4 倍で描いて縮小（縁を滑らかにする）
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        k = 0.72  # 円形に切り抜かれても収まる大きさ
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=BG)
        k = 1.0
    step = s / 8
    for i in range(1, 8):
        d.line([i * step, 0, i * step, s], fill=GRID, width=max(1, s // 256))
        d.line([0, i * step, s, i * step], fill=GRID, width=max(1, s // 256))
    if not maskable:
        mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.2, fill=255)
        im.putalpha(mask)
        d = ImageDraw.Draw(im)
    c = s / 2
    P = lambda x, y: (c + x * s * k, c + y * s * k)  # 中心からの比率で置く
    w = round(s * 0.05 * k)
    # 台座とワーク
    d.polygon([P(-0.36, 0.30), P(0.02, 0.30), P(-0.06, 0.12), P(-0.24, 0.12)], fill=BASE)
    d.rectangle([P(0.14, 0.16), P(0.38, 0.30)], fill=BASE)
    A, B, C, D, S, H = P(-0.06, 0.10), P(-0.12, -0.04), P(-0.21, 0.03), P(-0.28, 0.12), P(0.26, 0.10), P(-0.08, -0.36)
    d.line([C, D], fill=WHITE, width=round(w * 0.8))
    d.line([B, A, S], fill=WHITE, width=w, joint='curve')
    d.line([C, B, H], fill=WHITE, width=w, joint='curve')
    # 締圧力の矢印（ワークを押す向き）
    ax = P(0.26, -0.22)[0]
    d.line([P(0.26, -0.20), P(0.26, -0.02)], fill=ARROW, width=round(w * 0.8))
    d.polygon([P(0.19, -0.06), P(0.33, -0.06), P(0.26, 0.04)], fill=ARROW)
    for p in (A, B, C, D):
        q = w * 0.75
        d.ellipse([p[0] - q, p[1] - q, p[0] + q, p[1] + q], fill=BG, outline=WHITE, width=round(w * 0.35))
    return im.resize((size, size), Image.LANCZOS)

OUT.mkdir(exist_ok=True)
draw(512).save(OUT / 'icon-512.png')
draw(192).save(OUT / 'icon-192.png')
draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
im = draw(180)
bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im); bg.convert('RGB').save(OUT / 'apple-touch-icon.png')
