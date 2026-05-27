# MLB Scorecard

A static GitHub + Cloudflare Pages webpage that builds a live official-style MLB scorecard from MLB play-by-play data.

## Architecture

- `index.html` is the webpage.
- `css/styles.css` controls layout and print styling.
- `js/config.js` stores the API base URL.
- `js/mlb-api.js` calls your Cloudflare Worker API proxy.
- `js/scorecard.js` converts MLB play-by-play into scorecard rows.
- `js/analytics.js` parses Baseball Savant CSV and builds trend/projection summaries.
- `js/app.js` controls the webpage.
- `worker/worker.js` is the Cloudflare Worker proxy that forwards requests to MLB Stats API and Baseball Savant.

## Quick Start

1. Upload this repo to GitHub.
2. In Cloudflare Pages:
   - Create Pages project
   - Connect to Git
   - Select this repo
   - Framework preset: None
   - Build command: leave blank
   - Output directory: `/`
3. Deploy.

## Worker API

Your webpage currently points to:

```js
https://mlb.denegri-justin.workers.dev
```

To change it, edit:

```text
js/config.js
```

When `mlb.elskatemm.com` works, change the API base there.

## Cloudflare Worker

Paste `worker/worker.js` into your Cloudflare Worker and deploy.

Test:

```text
https://mlb.denegri-justin.workers.dev/api/v1/teams?sportId=1
```

You should see MLB JSON.

Baseball Savant trend data is proxied through:

```text
/savant/statcast_search/csv
```
