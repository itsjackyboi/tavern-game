# Connecting the leaderboard (Google Sheets + Apps Script)

It takes about 5 minutes. The game works without this; until it's connected,
runs are saved on each player's own device.

## How it's organised (like the Mario board)

- **`runs` tab:** every finished run is logged here: wins, losses and
  bankruptcies. Each row has the innkeeper and tavern names, home city, result,
  times, Company Value, version and more. This is the full record.
- **`Pre Release Records` tab:** the top ten **Fastest Monopoly** and the top ten
  **Sponsored the Trials** (by Company Value) from **v1.x** builds, i.e. the
  current testing phase.
- **`Official Records` tab:** the same two top tens from **v2.0 onwards**. It
  starts filling itself the day the game's version reaches v2.0. Nothing to
  change here.
- The in-game Leaderboards window shows both, with Official and Pre-release
  tabs.

## Set it up

1. Create a new **Google Sheet**, e.g. "Last Call leaderboard".
2. **Extensions → Apps Script.** Delete the starter code and paste in the whole
   of [`gas/Code.gs`](Code.gs). Save.
3. **Deploy → New deployment**. Click the gear and choose **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Then click **Deploy** and **Authorise**. Google warns that the app is
   unverified: choose Advanced → Go to (project). The script can only touch this
   one Sheet.
4. Copy the **Web app URL**; it ends in `/exec`.
5. Send me the URL and I'll put it in and publish. Or edit
   `src/leaderboard/config.ts` yourself: `export const LEADERBOARD_URL = 'https://script.google.com/macros/s/…/exec';`
   The tabs create themselves on the first run that comes in.

## Later

- **Updating the script:** use **Deploy → Manage deployments → ✏️ Edit → Version: New
  version → Deploy**. This keeps the same URL. A brand-new deployment gets a new URL.
- **Hiding a run:** type anything in its `hidden` column in `runs`, then visit
  `…/exec?rebuild=1` to redraw the record tabs. Boards are cached for about a minute.
- **Locking out old builds (optional):** Project Settings → Script Properties
  → `ALLOWED_VERSIONS` = `v2.`. That accepts v2.x only; a comma-separated list
  of prefixes is also allowed.
- **Going official:** when the game's version becomes **v2.0** (`src/version.ts`),
  new runs land in `Official Records`. The v1 runs stay in
  `Pre Release Records` as a keepsake.

## What the server checks

- It uses the same validation as the game (`src/leaderboard/shared/validate.js`).
- Monopolies faster than 8 minutes and sponsorships before the 50-minute mark
  are rejected.
- Formula characters are escaped in every text cell.
- Rate limits: one run per player a minute, and 30 a minute overall.
- Duplicate runs are ignored.
- Writes happen under a script lock.

It's honest-mode protection: enough to keep junk and spreadsheet tricks out.
`tests/gas/code.test.ts` runs the script against a stand-in for Google's
services in CI.
