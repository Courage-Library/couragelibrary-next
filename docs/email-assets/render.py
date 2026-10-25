# Renders banner.png, strip-main.png, strip-cnts.png at 2x. Run from this folder, with the REAL logo.png here.
from playwright.sync_api import sync_playwright
import pathlib; d=pathlib.Path(__file__).parent.resolve()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':560,'height':112},device_scale_factor=2)
    pg.goto((d/'banner.html').as_uri()); pg.wait_for_timeout(400)
    pg.screenshot(path=str(d/'banner.png'),omit_background=True)
    pg.set_viewport_size({'width':496,'height':56}); pg.goto((d/'strip.html').as_uri()); pg.wait_for_timeout(400)
    pg.screenshot(path=str(d/'strip-main.png'),clip={'x':0,'y':0,'width':240,'height':56},omit_background=True)
    pg.screenshot(path=str(d/'strip-cnts.png'),clip={'x':256,'y':0,'width':240,'height':56},omit_background=True)
    b.close()
