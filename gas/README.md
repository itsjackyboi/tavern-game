# Shared leaderboard (Google Sheets + Apps Script)

The game runs without this. Until a URL is set, winning runs are kept on the
player's own device. These steps set up the shared board. They follow the
same pattern as the Mario project's board, with extra hardening.

## One-time setup

1. Create a new Google Sheet, for example "Last Call leaderboard".
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete the starter code. Paste in the whole of `gas/Code.gs` from this repo.
   It is generated, so don't edit it by hand. After changing
   `gas/Code.template.gs` or `src/leaderboard/shared/validate.js`, run
   `npm run build-gas`.
4. **Project Settings → Script Properties → Add script property:**
   - `ALLOWED_BUILDS` = `lc-1.0`
   - Use a comma-separated list for more than one build. It must include the
     `BUILD` value in `src/leaderboard/config.ts`.
   - If you leave it empty, every build is accepted.
5. **Deploy → New deployment**, then pick the type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorise it when prompted. The script only touches this one Sheet
   (`@OnlyCurrentDoc`).
7. Copy the **Web app URL**; it ends in `/exec`. Paste it into
   `src/leaderboard/config.ts` as `LEADERBOARD_URL`, then commit and push. The
   Pages build picks it up.

The script creates a `runs` tab with a header row on the first submission.

## Updating the script later

Use **Deploy → Manage deployments → (pencil) Edit → Version: New version → Deploy**.
This keeps the same `/exec` URL. A brand-new deployment would change the URL,
and the game would stop reaching the board.

## Moderation

- The `runs` tab is append-only.
- To hide a run, put anything in its `hidden` column. Boards are cached for up
  to 60 seconds, so the change takes a minute to show.
- When a balance change makes old runs incomparable:
  - bump `BUILD` in `src/leaderboard/config.ts`;
  - set `ALLOWED_BUILDS` to the new value.
  Old rows stay in the Sheet but no longer accept new submissions under the old build.

## What the server checks

The server uses the same shared validation as the client (`validate.js`). On
top of that it:
- enforces the build allowlist;
- rejects monopolies faster than 8 minutes;
- rejects sponsorship wins before the 50-minute mark (the Year-463 verdict comes about 54 minutes in);
- escapes formula characters in every text cell;
- limits one run per client per minute and 30 runs a minute overall;
- rejects duplicate run IDs;
- takes a script lock around writes.

This is honest-mode protection. A static game can't stop a determined cheat,
but it keeps out junk and spreadsheet injection.

## Endpoints

- `POST` (body: the run record as JSON, sent as `text/plain` to avoid a CORS
  preflight) returns one of:
  - `{"ok":true}`
  - `{"ok":false,"error":"…"}`
  - `{"ok":false,"retry":true,"error":"…"}` (the client's outbox retries these with backoff)
- `GET ?board=monopoly|cv&cat=overall|aleforge|shanty|providence|roto|assisted|ngplus&n=25`
  returns `{"rows":[{rank,name,homeCity,value,winType,date}]}`

`tests/gas/code.test.ts` runs `Code.gs` against a small shim of the Apps
Script services. `script.google.com` can't be reached from CI, so check the
live board once by hand after deploying: open the game with the URL set, win
a debug-free run, and submit it.
