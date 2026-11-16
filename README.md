# cs.burritogang.com — CS Major live board + simulator (GitHub Pages)

Static site. Pick an event (the one that's live is chosen automatically, else the next upcoming), watch the Swiss "Group play" board per stage, and use the **Simulator** (Stage 1 → 2 → 3 → Playoffs) to build your own bracket. Real results always replace your picks.

## Files
- `data/events.json` — list of majors (status is computed from dates).
- `data/events/<id>.json` — one event: teams, `seeds` (seed order), stages (entrants, dates, `hltvEventId`), real `matches`, `playoffs`.
- `swiss.js` — Swiss engine (pairings, records, advancement). `bracket.js` — playoff bracket logic.

## Updating results
1. **Automatic (best effort):** set each stage's `hltvEventId` in the event JSON (HLTV lists every stage as its own event; id = the number in `hltv.org/events/<id>/...`). `.github/workflows/sync.yml` runs `scripts/sync.mjs` every 10 min and commits changes. HLTV is behind Cloudflare, so GitHub's servers may get blocked — if so the run just changes nothing.
2. **Manual:** open `/#/admin`, add Swiss results with the form, click playoff winners on the event page, then **Copy event JSON** and paste it into `data/events/<id>.json` on GitHub.

Seed order in the event file is an estimate — fix `seeds` to the official seeding. Later-round Swiss pairings in the simulator use Buchholz/seed pairing (no rematches), which may differ slightly from Valve's.

## Publish
Settings → Pages → Deploy from branch → `main` / root. `CNAME` is set to cs.burritogang.com.
