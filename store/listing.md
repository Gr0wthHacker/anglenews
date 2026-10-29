# AngleCheck: Chrome Web Store listing

Copy for the store form. Everything below describes what the current code does.
Privacy answers for the form are in `privacy-disclosures.md`; a draft privacy
policy is in `privacy-policy.md`.

**Name:** AngleCheck
**Category:** News & Weather
**Language:** English
**Tile tagline:** Compare how outlets frame a story

## Short description

**Short description:** See how other outlets cover the news story you are reading: their framing, tone, and the points your article left out.

(118 of 132 characters)

## Long description

AngleCheck shows how other news outlets cover the story you are reading. Open a news article, click the toolbar button, and AngleCheck finds coverage of the same story from other sources and compares how each one frames it.

In the popup
- The article you are reading, with its outlet's bias label and the emotional tone of its framing.
- The most contrasting angles in other coverage, each with the outlet, its bias label and a one-line summary of its framing.
- A button to open the full comparison in Chrome's side panel.

In the side panel
- Your article's central figure, framing and what it credits as the cause.
- Other coverage grouped by angle, with each article's framing and a tone meter from negative to positive.
- Coverage gaps: points other outlets raised that your article did not mention, and which outlets raised them.
- Tone distribution across all the coverage that was analyzed.
- A list of every source with its bias label, factual rating and tone. Open any article in a new tab.
- Topic search and a list of your recent comparisons.
- Copy a summary as plain text or Markdown, or open it as a page in a new tab.
- Compact view and a light or dark theme.

Not on an article? Type a topic in the popup to compare coverage without opening a story first.

How it works
When you ask for a comparison, AngleCheck reads the headline and up to 3,000 characters of text from the page and sends them, with the page address, to the AngleCheck server. The server searches news sources for the same story, uses an AI model to summarize how each article frames it, and sends the comparison back. Bias and factual ratings come from a table of outlet ratings included with AngleCheck. Results are cached in your browser for 4 hours, so reopening the same story within that time does not send it again.

AngleCheck only reads a page when you open the popup or the side panel. It does not track your browsing.

## Screenshots (1280x800, in upload order)

1. `screenshots/1-popup.png`: popup with contrasting angles on an article
2. `screenshots/2-panel.png`: full comparison in the side panel
3. `screenshots/3-gaps.png`: coverage gaps and tone distribution (compact view)
4. `screenshots/4-sources.png`: source list in the dark theme
5. `screenshots/5-topic.png`: topic search from the popup on a non-article page

Small promo tile: `promo-small-440x280.png`. Store icon: `icon-128.png` (source `icon.svg`, also rendered to `extension/assets/icons/`).

Screenshots are captured from the real extension by `store/tools/capture.py`.
The story, the article page and every outlet in them are fictional, and the
analysis shown is a fixed sample returned in place of the live API, so no
framing is attributed to a real publication.
