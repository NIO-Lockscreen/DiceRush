# Dice Rush — Vercel Leaderboard Edition

This project is ready to deploy on Vercel.

## What is included

- `index.html` — patched Dice Rush game.
- `api/leaderboard.js` — Vercel Blob-backed shared top-10 leaderboard.
- `api/mp3-list.js` — lists `.mp3` files from the `/mp3` folder.
- `mp3/` — put your music files here.

## Add music

Put MP3 files directly in the `mp3` folder:

```text
mp3/theme.mp3
mp3/track2.mp3
```

The game calls `/api/mp3-list`, then loads the files from `/mp3/...`.

## Vercel Blob setup

1. Import this repo/project in Vercel.
2. Open the project in Vercel.
3. Go to **Storage**.
4. Click **Create Database**.
5. Choose **Blob**.
6. Create/connect the Blob store to this project.
7. Make sure `BLOB_READ_WRITE_TOKEN` exists under the project environment variables.
8. Redeploy after the Blob store is connected.

## Deploy

### Easiest method

1. Unzip this folder.
2. Upload/push everything to a GitHub repository.
3. In Vercel, click **Add New → Project**.
4. Import the GitHub repo.
5. Deploy.
6. Create/connect the Blob store.
7. Redeploy.

### Local CLI method

```bash
npm install
npm i -g vercel
vercel login
vercel
vercel --prod
```

For local leaderboard testing after creating the Blob store:

```bash
vercel env pull
npm run dev
```

## Leaderboard behavior

- There is one shared online Top 10.
- Single-player scores save to this shared Top 10.
- In two-player games, each player's individual score saves to the same shared Top 10.
- Scores only enter if they beat the current Top 10 cutoff.
- It is designed for a small personal project, not heavy simultaneous traffic.

## Balance note — Snake Eyes CEO update

Snake Eyes CEO is no longer a one-row dice.

- In `Ones`, every 1 scores as 12 before heat.
- Outside `Ones`, every 1 adds +12 score and +$3.
- Upgraded Snake gives an even larger score/cash payout.

Dice implementation audit: all 66 shop dice have an implemented live effect or a deliberate system effect, such as Coupon pricing, Brain Freeze held-dice scoring, WOG/WOW special handling, or Cat's random multiplier.


## Latest gameplay balance update

- Removed several boring beginner dice from the active loot pool.
- Added Reroll Baron, Salvage Roller, Gambler’s Floor, Game Breaker, and Point Stealer.
- Game Breaker only appears in forced mode. Point Stealer only appears in two-player games.
- All new dice have upgraded versions and dice-book explanations.


## 67 Dice update

Added **67 Dice**. It banks exactly 67 points regardless of row, roll, or heat. When upgraded, any real roll containing a 6 has a 50% chance to mutate another die into a visible 7. Banking with a 7 adds +67 extra, for 134 total. Straights also understand 7-based runs like 3-4-5-6-7.

## Live leaderboard refresh fix

- After saving a new score, the visible Top 10 updates immediately instead of requiring a page refresh.
- The client now does an optimistic local insert, posts to `/api/leaderboard`, and then reloads the Blob leaderboard with a cache-busting request.
- Clicking the Top 10 card opens a full Top 10 modal showing all 10 ranks across single-player and multiplayer individual scores.
