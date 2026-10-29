"""Shared helpers for Chrome Web Store asset capture.

Loads the unpacked extension in Playwright's Chromium, serves stand-in web
pages through request routing (no network access needed), and composes the
captured UI into 1280x800 store screenshots and a 440x280 promo tile.

Requires: pip install playwright && playwright install chromium
Run under a display (Linux: xvfb-run -a python3 store/tools/capture.py),
because Chromium only loads extensions in headed mode.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import html
import json
import shutil
import tempfile
from pathlib import Path
from typing import Callable

from playwright.async_api import BrowserContext, Page, Route, async_playwright

FONT = "Inter, 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif"


# --------------------------------------------------------------------------
# Stand-in web pages
# --------------------------------------------------------------------------

def host_color(host: str) -> str:
    palette = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626", "#475569"]
    return palette[int(hashlib.md5(host.encode()).hexdigest(), 16) % len(palette)]


def favicon_svg(host: str) -> bytes:
    letter = host.split(".")[0][:1].upper() or "?"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<rect width="32" height="32" rx="7" fill="{host_color(host)}"/>'
        f'<text x="16" y="22" font-family="Arial" font-weight="700" font-size="18" '
        f'fill="#fff" text-anchor="middle">{letter}</text></svg>'
    ).encode()


def article_page(host: str, title: str, paragraphs: list[str] | None = None, *,
                 site_name: str | None = None, byline: str | None = None,
                 published: str | None = None, dark: bool = False) -> str:
    color = host_color(host)
    site = site_name or host
    paras = paragraphs or [
        "This page is a stand-in used to capture store screenshots. It has a title, a header and a few paragraphs of text so the browser treats it like a normal page.",
        "The extension under test reads tab and page details from the browser in the same way it would on any other site.",
    ]
    meta = ""
    if published:
        meta += f'<meta property="article:published_time" content="{published}">'
    if site_name:
        meta += f'<meta property="og:site_name" content="{html.escape(site_name)}">'
    meta += f'<meta property="og:title" content="{html.escape(title)}">'
    bg, fg, muted = ("#111827", "#f3f4f6", "#9ca3af") if dark else ("#ffffff", "#111827", "#6b7280")
    body = "".join(f"<p>{html.escape(p)}</p>" for p in paras)
    by = f'<div class="by">{html.escape(byline)}{" &middot; " + html.escape(published[:10]) if published else ""}</div>' if byline else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<link rel="icon" href="/favicon.svg">{meta}
<style>
body{{margin:0;font-family:Georgia,'Times New Roman',serif;background:{bg};color:{fg}}}
header{{border-bottom:4px solid {color};padding:14px 36px;font:700 20px {FONT};color:{color};display:flex;gap:28px;align-items:center}}
header span{{font:500 13px {FONT};color:{muted}}}
article{{max-width:640px;margin:34px auto;padding:0 36px}}
h1{{font-size:34px;line-height:1.15;margin:0 0 12px}}
.by{{font:500 13px {FONT};color:{muted};margin-bottom:22px}}
p{{font-size:18px;line-height:1.6;margin:0 0 18px}}
</style></head><body>
<header>{html.escape(site)}<span>News</span><span>Opinion</span><span>Local</span><span>About</span></header>
<article><h1>{html.escape(title)}</h1>{by}{body}</article></body></html>"""


class Site:
    """Routes every request from the browser to in-memory pages."""

    def __init__(self) -> None:
        self.pages: dict[str, tuple[str, bytes]] = {}

    def add(self, url: str, body: str | bytes, content_type: str = "text/html; charset=utf-8") -> None:
        self.pages[url] = (content_type, body.encode() if isinstance(body, str) else body)

    async def handle(self, route: Route) -> None:
        url = route.request.url
        if url.startswith(("chrome-extension://", "data:", "blob:")):
            await route.continue_()
            return
        key = url.split("#")[0]
        if key in self.pages:
            ctype, body = self.pages[key]
            await route.fulfill(status=200, body=body, headers={"content-type": ctype})
            return
        if key.startswith("https://www.google.com/s2/favicons?"):
            domain = key.split("domain=")[1].split("&")[0]
            await route.fulfill(status=200, body=favicon_svg(domain), headers={"content-type": "image/svg+xml"})
            return
        if key.endswith("/favicon.svg") or key.endswith("/favicon.ico"):
            host = key.split("/")[2]
            await route.fulfill(status=200, body=favicon_svg(host), headers={"content-type": "image/svg+xml"})
            return
        await route.fulfill(status=404, body=b"not found", headers={"content-type": "text/plain"})


# --------------------------------------------------------------------------
# Browser
# --------------------------------------------------------------------------

def prepare_extension(build_dir: Path, accessible: list[str], extra_permissions: list[str] | None = None) -> Path:
    """Copy the unpacked build to a temp dir and expose the given extension
    pages to web pages (capture only), so the real popup or side panel can be
    framed next to a stand-in page. The extension code is not changed.

    extra_permissions stands in for grants a user gesture would give (for
    example "tabs" in place of the activeTab grant from a toolbar click)."""
    tmp = Path(tempfile.mkdtemp(prefix="cws-ext-")) / "ext"
    shutil.copytree(build_dir, tmp)
    manifest_path = tmp / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    war = manifest.setdefault("web_accessible_resources", [])
    war.append({"resources": accessible, "matches": ["<all_urls>"]})
    if extra_permissions:
        manifest["permissions"] = sorted(set(manifest.get("permissions", [])) | set(extra_permissions))
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return tmp


def with_side_panel(page_html: str, panel_url: str, width: int = 360) -> str:
    frame = (f'<iframe src="{panel_url}" style="position:fixed;top:0;right:0;width:{width}px;height:100vh;'
             f'border:0;border-left:1px solid #d0d4da;background:#fff;z-index:9"></iframe>'
             f'<style>body{{margin-right:{width}px !important}}</style>')
    return page_html.replace("</body>", frame + "</body>")


def with_popup(page_html: str, popup_url: str, width: int, height: int) -> str:
    frame = (f'<iframe src="{popup_url}" style="position:fixed;top:6px;right:12px;width:{width}px;height:{height}px;'
             f'border:0;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);background:#fff;z-index:9"></iframe>')
    return page_html.replace("</body>", frame + "</body>")


class Session:
    def __init__(self, ext_dir: Path, site: Site) -> None:
        self.ext_dir = ext_dir.resolve()
        self.site = site
        self.ctx: BrowserContext | None = None
        self.ext_id = ""
        self._pw = None
        self._profile = ""

    async def __aenter__(self) -> "Session":
        self._pw = await async_playwright().start()
        self._profile = tempfile.mkdtemp(prefix="cws-profile-")
        self.ctx = await self._pw.chromium.launch_persistent_context(
            self._profile,
            headless=False,
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
            color_scheme="light",
            args=[
                f"--disable-extensions-except={self.ext_dir}",
                f"--load-extension={self.ext_dir}",
                "--no-first-run",
                # Nothing leaves the machine: unrouted requests fail to resolve.
                "--no-proxy-server",
                "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
                "--hide-scrollbars",
            ],
        )
        await self.ctx.route("**/*", self.site.handle)
        sw = self.ctx.service_workers[0] if self.ctx.service_workers else await self.ctx.wait_for_event("serviceworker", timeout=20000)
        self.ext_id = sw.url.split("/")[2]
        return self

    async def __aexit__(self, *exc) -> None:
        if self.ctx:
            await self.ctx.close()
        if self._pw:
            await self._pw.stop()
        shutil.rmtree(self._profile, ignore_errors=True)

    def ext_url(self, path: str) -> str:
        return f"chrome-extension://{self.ext_id}/{path.lstrip('/')}"

    def worker(self):
        for sw in self.ctx.service_workers:
            if self.ext_id in sw.url:
                return sw
        raise RuntimeError("extension service worker not running")

    async def new_page(self, url: str | None = None, width: int = 1280, height: int = 800) -> Page:
        page = await self.ctx.new_page()
        await page.set_viewport_size({"width": width, "height": height})
        if url:
            await page.goto(url)
        return page


# --------------------------------------------------------------------------
# Composition
# --------------------------------------------------------------------------

def b64png(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(data).decode()


class Brand:
    def __init__(self, *, bg: str, bg2: str, fg: str, sub: str, accent: str, icon_svg: str, dark_chrome: bool = False):
        self.bg, self.bg2, self.fg, self.sub, self.accent = bg, bg2, fg, sub, accent
        self.icon_svg = icon_svg
        self.dark_chrome = dark_chrome


def _window(brand: Brand, url: str, content: str, width: int, height: int) -> str:
    chrome_bg, bar_bg, bar_fg, border = (
        ("#202124", "#35363a", "#bdc1c6", "#3c4043") if brand.dark_chrome else ("#dee1e6", "#ffffff", "#5f6368", "#c4c7cc")
    )
    icon = base64.b64encode(brand.icon_svg.encode()).decode()
    return f"""
<div class="win" style="width:{width}px;border:1px solid {border}">
  <div class="tb" style="background:{chrome_bg}">
    <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
    <div class="addr" style="background:{bar_bg};color:{bar_fg}">{html.escape(url)}</div>
    <img class="exticon" src="data:image/svg+xml;base64,{icon}">
  </div>
  <div class="content" style="height:{height}px">{content}</div>
</div>"""


async def compose(page: Page, out: Path, brand: Brand, headline: str, sub: str, url: str, content: str,
                  win_w: int = 1120, content_h: int = 600) -> None:
    doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box}}
body{{margin:0;width:1280px;height:800px;overflow:hidden;font-family:{FONT};
  background:linear-gradient(160deg,{brand.bg} 0%,{brand.bg2} 100%);color:{brand.fg}}}
.cap{{text-align:center;padding-top:34px;height:150px}}
.cap h1{{margin:0;font-size:38px;font-weight:800;letter-spacing:-0.02em}}
.cap p{{margin:10px 0 0;font-size:18px;color:{brand.sub}}}
.win{{margin:0 auto;border-radius:12px 12px 0 0;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)}}
.tb{{height:40px;display:flex;align-items:center;gap:8px;padding:0 14px}}
.dot{{width:12px;height:12px;border-radius:50%}}
.addr{{flex:1;margin-left:14px;height:26px;border-radius:13px;font-size:13px;line-height:26px;padding-left:14px;white-space:nowrap;overflow:hidden}}
.exticon{{width:18px;height:18px;margin-left:6px}}
.content{{position:relative;display:flex;background:#fff;overflow:hidden}}
.content img{{display:block}}
.panel{{border-left:1px solid #d0d4da}}
.popup{{position:absolute;top:4px;right:10px;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);overflow:hidden}}
</style></head><body>
<div class="cap"><h1>{html.escape(headline)}</h1><p>{html.escape(sub)}</p></div>
{_window(brand, url, content, win_w, content_h)}
</body></html>"""
    await page.set_viewport_size({"width": 1280, "height": 800})
    await page.set_content(doc)
    await page.wait_for_timeout(150)
    await page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": 1280, "height": 800})


def full_layout(png: bytes) -> str:
    return f'<img src="{b64png(png)}">'


async def render_icon(page: Page, svg: str, out_png: Path, size: int = 128) -> None:
    await page.set_viewport_size({"width": size, "height": size})
    await page.set_content(
        f'<html><body style="margin:0;background:transparent">'
        f'<img src="data:image/svg+xml;base64,{base64.b64encode(svg.encode()).decode()}" '
        f'style="width:{size}px;height:{size}px;display:block"></body></html>'
    )
    await page.wait_for_timeout(100)
    await page.screenshot(path=str(out_png), omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})


async def render_tile(page: Page, out: Path, brand: Brand, name: str, tagline: str, icon_src: str) -> None:
    doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;width:440px;height:280px;overflow:hidden;font-family:{FONT};
  background:linear-gradient(150deg,{brand.bg} 0%,{brand.bg2} 100%);color:{brand.fg};
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}}
img{{width:84px;height:84px;margin-bottom:16px}}
h1{{margin:0;font-size:34px;font-weight:800;letter-spacing:-0.02em}}
p{{margin:8px 24px 0;font-size:16px;line-height:1.35;color:{brand.sub}}}
</style></head><body><img src="{icon_src}"><h1>{html.escape(name)}</h1><p>{html.escape(tagline)}</p></body></html>"""
    await page.set_viewport_size({"width": 440, "height": 280})
    await page.set_content(doc)
    await page.wait_for_timeout(150)
    await page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": 440, "height": 280})


def png_data_uri(path: Path) -> str:
    return b64png(path.read_bytes())


def read_listing_field(listing: Path, field: str) -> str:
    """Return the value of a '**Field:** value' line in listing.md."""
    prefix = f"**{field}:**"
    for line in listing.read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    raise KeyError(field)
