# Home page product screenshots (HOME-1 "honest images")

Real app screens, captured from the **local production build** with the **QA identity only**
(`qa-student`, CAPTCHA-safe QA session). The content in them is already-public published material.
No real user, name, e-mail address or id may appear. The candidate security watermark (masked
candidate id + attempt id) is hidden while capturing, and a shot is refused if it is visible.

| File | Screen | Used in |
| --- | --- | --- |
| `learn-*.webp` | a published lesson (anonymous visit: a signed-in visit would save reading progress) | How it works, step 1 |
| `practice-*.webp` | a diagnostic practice question (GET only, no answer sent) | step 2 |
| `mock-*.webp` | the mock test player with the exam timer | step 3 |
| `analyze-*.webp` | the result of the QA fixture attempt | step 4 |
| `revise-*.webp` | the Mistake Vault | step 5 |
| `hero-*.webp` | the mock player on a phone (inside the CSS phone frame) | hero |

Sizes: the file suffix is the target screen (390 / 768 / 1280 px). Step copies are 240 / 320 / 480 px wide
and at most 40 KB each; hero copies are 240 / 480 px wide and at most 60 KB. Width, height and alt text
live in `content/marketing-shots.json` (written by the script).

## Re-capture

1. Build: `npm run build`.
2. Read-only shots. Every non-GET request is aborted; practice needs the flag for the local server only:

   ```bash
   PRACTICE_ENABLED=true node scripts/live/with-server.cjs -- "node scripts/content/capture-marketing.cjs http://localhost:3100 --readonly --raw=<folder outside the repo>"
   ```

3. Mock and hero shots. **This writes:** it opens the player, which starts an attempt for qa-student,
   and it always submits that attempt through the app at the end. Take a DB backup first
   (`node scripts/db/backup.cjs pre-marketing --resilient`).

   ```bash
   node scripts/live/with-server.cjs -- "node scripts/content/capture-marketing.cjs http://localhost:3100 --mock --raw=<folder outside the repo>"
   ```

4. Look at every PNG in the raw folder before committing. The script already refuses a crop whose text
   contains "@", the QA name, a UUID or a long digit run. The HOME-1 gate re-checks the committed WebP files.
