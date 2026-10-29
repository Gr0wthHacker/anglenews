# AngleCheck Privacy Policy (draft)

Last updated: October 29, 2026

AngleCheck is a Chrome extension that shows how other news outlets cover the story in the article you are reading. This policy describes what AngleCheck reads, what it sends, and what it stores.

## What AngleCheck reads

AngleCheck reads a page only when you open its popup or side panel on that page. It then reads the page's headline, article text, byline, site name, publish date and lead image so it can identify the story. It does not read pages in the background and does not record your browsing.

## What AngleCheck sends

To build a comparison, the extension sends these items to the AngleCheck server at api.anglecheck.dev:

- the article's headline
- up to 3,000 characters of the article's text
- the page address and its domain

If you search a topic instead, the server receives the topic you typed.

The server uses this to find and analyze other coverage of the same story:

- The headline and text excerpt are sent to Anthropic's API, an AI service, to identify the topic and summarize how each article frames the story.
- Search terms based on the topic are sent to news search services (GDELT, Google News, NewsData.io and TheNewsAPI) to find other articles.

The finished comparison, which includes the headline and address of the article you analyzed, is kept in the server's memory for up to 2 hours so repeat requests for the same story can be answered without redoing the work. It is not written to a database. Server logs record each request's method, path, status and timing, along with the start of the headline and the detected topic. The server sees your IP address, as any web server does, and holds it in memory only to limit how many requests one address can make.

The side panel shows each listed outlet's icon using Google's favicon service, which receives the outlet's domain name.

If you enter an API key on the settings page and click "Test connection", the key is sent to the AngleCheck server to check it. It is not sent with analysis requests.

## What AngleCheck stores on your device

- Your settings, in Chrome's sync storage, which Chrome may sync to other browsers where you are signed in. This includes the API key if you enter one.
- Comparison results, cached for 4 hours, in local extension storage.
- Your last 20 comparisons and last 10 topic searches, in local extension storage, so you can reopen them.

You can clear cached comparisons on the settings page. Removing the extension deletes everything it stored on your device.

## What AngleCheck does not do

AngleCheck has no user accounts and no analytics or advertising. It does not sell your data, share it for advertising, or use it for any purpose other than producing the comparisons you ask for.

## Changes

If this policy changes, the updated version will be posted at this address with a new date.
