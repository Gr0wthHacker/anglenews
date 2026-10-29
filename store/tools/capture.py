"""Capture Chrome Web Store assets for AngleCheck.

    npm run build:ext
    xvfb-run -a python3 store/tools/capture.py      # Linux
    python store/tools/capture.py                   # Windows / macOS (opens a window)

Loads extension/dist unpacked and drives the real popup, side panel and
settings page. The article page is a local stand-in served through request
routing, and the analysis API is answered from the fictional sample in
SAMPLE below (the extension's fetch to api.anglecheck.dev is intercepted
inside its service worker). The story and every outlet in it are made up,
so the screenshots attribute no framing to any real publication.

Writes store/screenshots/*.png, store/icon-128.png,
extension/assets/icons/icon-*.png and store/promo-small-440x280.png.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harness import (Brand, Session, Site, article_page, compose, full_layout, png_data_uri,  # noqa: E402
                     prepare_extension, read_listing_field, render_icon, render_tile, with_popup, with_side_panel)

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "store"
SHOTS = STORE / "screenshots"
DIST = ROOT / "extension" / "dist"
ICON_SVG = (STORE / "icon.svg").read_text(encoding="utf-8")

BRAND = Brand(bg="#0b1b3f", bg2="#1d4ed8", fg="#ffffff", sub="#c7d7fe", accent="#3b82f6", icon_svg=ICON_SVG)

ARTICLE_URL = "http://harborgazette.example/city/2026/10/congestion-fee-vote"
POPUP_URL = ARTICLE_URL + "?popup"
PANEL_URL = ARTICLE_URL + "?panel"
TOPIC_URL = "http://fieldnotes.example/seed-starting"
HEADLINE = "Council passes downtown congestion fee after six-hour hearing"
BODY = [
    "Harbor City's council voted 7 to 4 on Tuesday night to charge drivers entering the downtown core on weekdays, ending a debate that has run for more than two years.",
    "The fee starts at $9 for passenger cars during peak hours and drops to $4 in the evening. Revenue is set aside for bus service and street repairs inside the zone.",
    "Supporters on the council pointed to commute times that have grown each year since 2021. Opponents said the plan moves too fast and will push traffic onto residential streets just outside the boundary.",
    "The transit agency has until spring to install cameras at the 31 entry points. Enforcement is expected to begin next September.",
]


def art(domain, site, headline, framing, entity, cause, register, solution, omissions, compound, bias, factual="high"):
    return {
        "article": {"headline": headline, "body": "", "byline": None, "siteName": site, "url": f"http://{domain}/story",
                    "domain": domain, "publishDate": "2026-10-28T09:00:00Z", "imageUrl": None},
        "angle": {"headline_framing": framing, "central_entity": entity, "causal_attribution": cause,
                  "emotional_register": register, "solution_frame": solution, "key_omissions": omissions,
                  "quote_sources": [], "statistical_anchoring": "", "confidence": 0.82},
        "sentiment": {"positive": max(compound, 0), "negative": max(-compound, 0), "neutral": 0.5, "compound": compound},
        "sourceBias": {"domain": domain, "name": site, "biasRating": bias, "factualRating": factual,
                       "country": "US", "mediaType": "online"},
    }


CURRENT = art("harborgazette.example", "Harbor Gazette", HEADLINE,
              "Frames the vote as the end of a long procedural fight", "City council",
              "Years of growing commute times", "neutral", "Fee revenue funds buses and street repairs",
              ["Effect on low-income drivers", "Exemptions for residents inside the zone"], 0.05, "center")

CLUSTERS = [
    {"id": "c1", "label": "Cleaner air and faster buses", "dominantRegister": "optimistic", "distinctiveness": 0.71,
     "articles": [
         art("baylineradio.example", "Bayline Public Radio", "Congestion fee could cut downtown traffic by a fifth, planners say",
             "Leads with projected drops in traffic and emissions", "Transit planners", "Car traffic as the main source of downtown pollution",
             "optimistic", "Faster bus routes once traffic thins", ["Cost to commuters"], 0.42, "left-center"),
         art("civicwire.example", "Civic Wire", "What the congestion fee pays for, line by line",
             "Explains the revenue plan", "Transit agency", "Underfunded bus service", "neutral",
             "Dedicated revenue for transit", ["Opposition arguments"], 0.18, "center"),
     ]},
    {"id": "c2", "label": "Cost to commuters", "dominantRegister": "alarm", "distinctiveness": 0.88,
     "articles": [
         art("taxpayerweekly.example", "Taxpayer Weekly", "Drivers face $2,000 a year in new downtown fees",
             "Frames the fee as a new tax on working commuters", "Commuters", "City spending decisions",
             "alarm", "Repeal or a public vote", ["Transit improvements funded by the fee"], -0.55, "right"),
         art("ridgereport.example", "Ridge Report", "Suburban riders say new fee leaves them few options",
             "Centers suburban residents with limited transit", "Suburban commuters", "Gaps in regional transit",
             "empathetic", "Better park-and-ride service", ["Projected traffic reductions"], -0.21, "right-center"),
     ]},
    {"id": "c3", "label": "Small business worries", "dominantRegister": "adversarial", "distinctiveness": 0.64,
     "articles": [
         art("metroledger.example", "Metro Ledger", "Downtown shops brace for fewer customers under congestion plan",
             "Frames the fee as a threat to downtown retail", "Business owners", "Council ignoring merchant concerns",
             "adversarial", "Delivery and customer exemptions", ["Experience of other cities with similar fees"], -0.34, "right-center"),
     ]},
    {"id": "c4", "label": "Process and legal questions", "dominantRegister": "neutral", "distinctiveness": 0.52,
     "articles": [
         art("northshoredaily.example", "Northshore Daily", "State review could delay congestion fee into 2028",
             "Focuses on legal and state approval hurdles", "State transportation board", "Unsettled state authority over local tolls",
             "neutral", "Wait for the state review", ["Public health findings"], -0.05, "center"),
         art("couriertimes.example", "Courier Times", "Four council members explain their no votes",
             "Gives the dissenting members room to explain", "Dissenting council members", "Rushed timeline",
             "neutral", "Delay for a pilot program", ["Majority's rationale"], -0.08, "left-center"),
     ]},
]

SAMPLE = {
    "id": "sample-congestion-fee",
    "topic": "Harbor City congestion fee",
    "normalizedTopic": "harbor city congestion fee",
    "currentArticle": CURRENT,
    "clusters": CLUSTERS,
    "coverageGaps": [
        {"description": "Discounts or exemptions for low-income drivers",
         "mentionedBy": ["Ridge Report", "Civic Wire", "Bayline Public Radio"], "missedBy": "Harbor Gazette"},
        {"description": "What happened to retail sales in other cities after similar fees",
         "mentionedBy": ["Bayline Public Radio"], "missedBy": "Harbor Gazette"},
    ],
    "toneDistribution": {"alarm": 1, "neutral": 4, "optimistic": 1, "adversarial": 1, "empathetic": 1, "dismissive": 0},
    "totalSourcesFetched": 12,
    "totalSourcesAnalyzed": 8,
    "timestamp": "2026-10-28T14:00:00Z",
    "cachedAt": None,
}


async def render_icons() -> None:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await render_icon(page, ICON_SVG, STORE / "icon-128.png", 128)
        for size in (16, 48, 128):
            await render_icon(page, ICON_SVG, ROOT / "extension" / "assets" / "icons" / f"icon-{size}.png", size)
            await render_icon(page, ICON_SVG, DIST / "assets" / "icons" / f"icon-{size}.png", size)
        await browser.close()


async def mock_api(s: Session) -> None:
    """Answer the extension's API calls from SAMPLE, inside its service worker."""
    await s.worker().evaluate("""(sample) => {
        const realFetch = self.fetch.bind(self);
        self.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input.url;
            if (!url.startsWith('https://api.anglecheck.dev/')) return realFetch(input, init);
            await new Promise(r => setTimeout(r, 300));
            const body = url.endsWith('/api/analyze')
                ? { success: true, comparison: sample, error: null, cached: false }
                : { status: 'ok' };
            return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        };
    }""", SAMPLE)


async def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    await render_icons()
    # "tabs" stands in for the activeTab grant a real toolbar click gives the side panel.
    ext = prepare_extension(DIST, ["popup/index.html", "sidepanel/index.html"], ["tabs"])
    page_html = article_page("harborgazette.example", HEADLINE, BODY, site_name="Harbor Gazette",
                             byline="By Dana Ortiz", published="2026-10-28T09:00:00Z")
    site = Site()

    async with Session(ext, site) as s:
        site.add(POPUP_URL, with_popup(page_html, s.ext_url("popup/index.html"), 380, 500))
        site.add(PANEL_URL, with_side_panel(page_html, s.ext_url("sidepanel/index.html"), 400))
        await mock_api(s)

        stage = s.ctx.pages[0] if s.ctx.pages else await s.ctx.new_page()
        await stage.set_viewport_size({"width": 1120, "height": 600})
        shots: list[tuple[str, str, str, bytes]] = []

        async def grab(page, name: str, headline: str, sub: str) -> None:
            await page.wait_for_timeout(900)
            png = await page.screenshot()
            if os.environ.get("CWS_DEBUG_DIR"):
                Path(os.environ["CWS_DEBUG_DIR"], f"{name}.png").write_bytes(png)
            shots.append((name, headline, sub, png))

        # 1. Popup: the article is extracted from the page and analyzed on click.
        await stage.goto(POPUP_URL)
        popup = next(f for f in stage.frames if f.url.endswith("/popup/index.html"))
        await popup.wait_for_selector("text=Contrasting angles", timeout=20000)
        await grab(stage, "1-popup", "See how other outlets frame the story you are reading",
                   "Click the toolbar button on a news article for the most contrasting angles in coverage of the same story.")

        # 2-4. Side panel: the full comparison for the same article.
        await stage.goto(PANEL_URL)
        panel = next(f for f in stage.frames if f.url.endswith("/sidepanel/index.html"))
        try:
            await panel.wait_for_selector("text=Harbor Gazette", timeout=20000)
        except Exception:
            if os.environ.get("CWS_DEBUG_DIR"):
                await stage.screenshot(path=str(Path(os.environ["CWS_DEBUG_DIR"], "panel-fail.png")))
                print(await s.worker().evaluate("1"))
            raise
        await grab(stage, "2-panel", "The full comparison opens beside the article",
                   "Your article's framing next to how other outlets approach the same story, grouped by angle.")

        scroller = panel.locator("div.overflow-y-auto").first
        await panel.locator("button[title='Compact view']").click()
        await scroller.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        await grab(stage, "3-gaps", "Spot what your source left out",
                   "Coverage gaps list points other outlets raised that your article did not. Compact view fits more on screen.")

        # 4. Dark theme with the source list open.
        await panel.evaluate("""() => chrome.storage.sync.get('userPreferences').then(r =>
            chrome.storage.sync.set({ userPreferences: { ...(r.userPreferences || {}), theme: 'dark' } }))""")
        await panel.locator("button[title='Expand view']").click()
        await panel.get_by_text("All Sources").click()
        await scroller.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        await grab(stage, "4-sources", "Every source in one list, in light or dark",
                   "Each outlet with its bias label, factual rating and tone score. Open any article in a new tab.")

        # 5. Popup on a page that is not an article: search a topic instead.
        site.add(TOPIC_URL, with_popup(article_page("fieldnotes.example", "Seed starting indoors",
                                                    ["Short page."], site_name="fieldnotes.example"),
                                       s.ext_url("popup/index.html"), 380, 500))
        await panel.evaluate("""() => chrome.storage.sync.get('userPreferences').then(r =>
            chrome.storage.sync.set({ userPreferences: { ...(r.userPreferences || {}), theme: 'light' } }))""")
        await stage.goto(TOPIC_URL)
        popup = next(f for f in stage.frames if f.url.endswith("/popup/index.html"))
        await popup.wait_for_selector("text=doesn't appear to be a news article", timeout=20000)
        await popup.locator("input[type=text]").fill("downtown congestion fee")
        await grab(stage, "5-topic", "Not on an article? Search a topic",
                   "Type a topic in the popup to compare coverage without opening a story first.")

        comp = await s.ctx.new_page()
        urls = {"5-topic": TOPIC_URL}
        for name, headline, sub, png in shots:
            await compose(comp, SHOTS / f"{name}.png", BRAND, headline, sub, urls.get(name, ARTICLE_URL), full_layout(png))

        await render_tile(comp, STORE / "promo-small-440x280.png", BRAND,
                          read_listing_field(STORE / "listing.md", "Name"),
                          read_listing_field(STORE / "listing.md", "Tile tagline"),
                          png_data_uri(STORE / "icon-128.png"))


if __name__ == "__main__":
    asyncio.run(main())
