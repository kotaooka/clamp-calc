# README 用のスクリーンショットを撮り直す（docs/screenshots/ に保存）
#   pip install playwright && python -m playwright install chromium
#   npm pack @fontsource/biz-udpgothic @fontsource/ibm-plex-mono  → 展開したフォルダを FONT_DIR に置く
#   python -m http.server 8765   （リポジトリのルートで起動しておく）
#   python tools/screenshots.py [FONT_DIR]
# あわせて SNS 共有用の og.png（1200×630、地の色 #1d5c96）をリポジトリのルートに作る
# 画面と同じ字体（BIZ UDPGothic・IBM Plex Mono）で撮るため、Google Fonts への要求を手元のフォントで返す
import sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screenshots'
FONT_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else 'fonts')
URL = 'http://localhost:8765/index.html'

def font_css():
    css = ''
    for pkg, files in [('biz-udpgothic', ['400.css', '700.css']), ('ibm-plex-mono', ['500.css'])]:
        base = next(FONT_DIR.glob(f'fontsource-{pkg}-*/package'))
        for f in files:
            css += re.sub(r'url\(\./files/([^)]+)\)', lambda m: f'url(https://fonts.local/{pkg}/{m.group(1)})', (base / f).read_text(encoding='utf-8'))
    return css

def route_fonts(page):
    css = font_css()
    page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=css))
    def serve(r):
        pkg, name = r.request.url.split('https://fonts.local/')[1].split('/', 1)
        path = next(FONT_DIR.glob(f'fontsource-{pkg}-*/package/files')) / name
        r.fulfill(status=200, content_type='font/woff2' if name.endswith('woff2') else 'font/woff', body=path.read_bytes())
    page.route('https://fonts.local/**', serve)

def open_page(b, **ctx):
    pg = b.new_context(service_workers='block', **ctx).new_page()
    route_fonts(pg)
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    ok = pg.evaluate("""async () => { await document.fonts.ready;
        return [document.fonts.check("15px 'BIZ UDPGothic'", "締圧力"), document.fonts.check("15px 'IBM Plex Mono'", "1,036")]; }""")
    assert all(ok), f'フォント未読込: {ok}'
    # 保存した入力を消して例から始める
    pg.evaluate("localStorage.removeItem('clamp-calc-inputs')"); pg.reload(); pg.wait_for_load_state('networkidle')
    pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(300)
    return pg

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = open_page(b, viewport={'width': 1100, 'height': 1000}, color_scheme='light')
    pg.screenshot(path=str(OUT / 'main.png'), full_page=False)
    # ハンドルを死点の手前まで開いた姿勢
    pg.evaluate("""() => { const a = document.getElementById('ang'); a.value = -2.5; a.dispatchEvent(new Event('input')); }""")
    pg.wait_for_timeout(200)
    pg.evaluate("window.scrollTo(0, document.getElementById('plot').getBoundingClientRect().top + scrollY - 200)")
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / 'plot.png'), full_page=False)
    # og.png：例のグラフを地の色の上に置く
    svg = pg.evaluate("document.querySelector('#plot svg').outerHTML")
    o = b.new_context(viewport={'width': 1200, 'height': 630}, service_workers='block').new_page()
    route_fonts(o)
    o.set_content(f"""<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=IBM+Plex+Mono:wght@500"></head>
      <body style="margin:0;width:1200px;height:630px;background:linear-gradient(#1d5c96,#1a5388);font-family:'BIZ UDPGothic';color:#fff;display:flex;align-items:center;gap:40px;padding:0 64px;box-sizing:border-box">
      <div style="flex:0 0 430px"><div style="font-size:26px;opacity:.85">QC Workbench</div>
      <div style="font-size:52px;font-weight:700;line-height:1.25;margin:14px 0 22px">トグルクランプ<br>締圧力計算機</div>
      <div style="font-size:24px;line-height:1.6;opacity:.92">リンク寸法から、ハンドル角ごとの<br>締圧力と操作力を求める</div></div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:14px">{svg}</div></body></html>""")
    o.wait_for_load_state('networkidle'); o.evaluate("document.fonts.ready"); o.wait_for_timeout(300)
    o.screenshot(path=str(ROOT / 'og.png'))
    pg.click('#type button[data-v="base"]'); pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / 'base.png'), full_page=False)
    m = open_page(b, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
    m.evaluate("window.scrollTo(0, document.getElementById('mech').getBoundingClientRect().top + scrollY - document.querySelector('header.top').offsetHeight - 12)")
    m.wait_for_timeout(300)
    m.screenshot(path=str(OUT / 'mobile.png'))
    b.close()
print('docs/screenshots/ に保存しました')
