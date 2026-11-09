# Deploying the AngleCheck API on Vercel

The extension calls `https://anglecheck-api.vercel.app` (`API_BASE_URL` in
`shared/constants.ts`; the build derives the manifest's only host permission
from it), so the API has to be live there before the extension is submitted.

## Project settings

- Import `Gr0wthHacker/anglenews` into Vercel.
- **Root Directory:** `api`
- **Framework preset:** Other. `api/vercel.json` sets the build command and
  routes every path to `api/index.js`, which wraps the compiled Hono app.
- Keep "Include source files outside of the Root Directory" on (the default),
  because the build compiles `../shared`.

## Environment variables (Production)

| Name | Needed | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Angle extraction. |
| `NEWSDATA_API_KEY` | no | Extra news source. |
| `THE_NEWS_API_KEY` | no | Extra news source. |
| `NODE_ENV` | set by Vercel | Must be `production` so the local dev server does not start. |

## Domain

None needed: the extension uses the project's `anglecheck-api.vercel.app`
domain. To move to a custom domain later, attach it in Vercel first, then
change `API_BASE_URL` and ship a new extension version (Chrome asks installed
users to approve the new host).

## Check

`GET https://anglecheck-api.vercel.app/api/health` should return `"status":"ok"` with
`"anthropic": true`.

## Known limit

The rate limiter and cache are in memory, so each serverless instance keeps its
own counts. That is fine for launch traffic; move them to a shared store (for
example Upstash Redis) before relying on the limit to cap API spend.
