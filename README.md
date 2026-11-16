# cs.burritogang.com — CS Major bracket (GitHub Pages)

Static site, no build step. PGL Major Singapore 2026 playoffs.

- `data/results.json` — official playoff teams + results. Edit this to update the site for everyone.
- `data/live.json` — the live bracket's picks. It auto-corrects against results.json when viewed.
- Open `/#/admin` to enter results with clicks, then **Copy results.json** and paste it into `data/results.json` on GitHub (open file → pencil → Commit). Pages redeploys in ~1 min; open pages refresh themselves every 30s.
- Other people's brackets are saved in their own browser; "Copy share link" sends one to a friend.

## Publish
1. Create a new public repo (e.g. `cs-burritogang`) and upload these files to the root of `main`.
2. Repo → Settings → Pages → Source: Deploy from a branch → `main` / root.
3. Custom domain: Settings → Pages → `cs.burritogang.com` (the `CNAME` file already says this). At your DNS provider add a CNAME record: `cs` → `<your-github-username>.github.io`. Then tick "Enforce HTTPS".
