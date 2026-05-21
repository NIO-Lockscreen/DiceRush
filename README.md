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
