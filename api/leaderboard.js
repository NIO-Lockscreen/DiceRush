import { list, put } from '@vercel/blob';

const LEADERBOARD_PATH = 'dice-rush/leaderboard.json';
const LEGACY_LEADERBOARD_PATHS = ['leaderboards/dice-rush-top10.json', 'leaderboards/dice-rush-shared-top10.json'];
const MAX_ENTRIES = 10;
const EMPTY_BOARD = { scores: [], updatedAt: null };

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function safeErrorMessage(error) {
  return String(error?.message || error?.name || 'Unknown Blob error').slice(0, 180);
}

function leaderboardMeta(extra = {}) {
  return {
    storage: 'vercel-blob',
    path: LEADERBOARD_PATH,
    hasBlobToken: hasBlobToken(),
    ...extra
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}


function cleanName(value, fallback = 'Player') {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || fallback;
}

function cleanMode(value, players) {
  return value === 'multiplayer' || Number(players) >= 2 ? 'multiplayer' : 'single';
}

function cleanTargetMode(value) {
  return value === 'pick' ? 'pick' : 'forced';
}

function cleanEntry(input) {
  const score = Math.floor(Number(input?.score));
  if (!Number.isFinite(score) || score <= 0) return null;

  const players = Math.max(1, Math.min(2, Math.floor(Number(input?.players || 1))));
  const mode = cleanMode(input?.mode, players);
  const playerNames = Array.isArray(input?.playerNames)
    ? input.playerNames.map((name, index) => cleanName(name, `Player ${index + 1}`)).slice(0, 2)
    : [];

  return {
    id: String(input?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    name: cleanName(input?.name),
    score,
    mode,
    players: mode === 'multiplayer' ? Math.max(2, players) : 1,
    playerIndex: Math.max(1, Math.min(2, Math.floor(Number(input?.playerIndex || 1)))),
    playerNames,
    targetMode: cleanTargetMode(input?.targetMode),
    createdAt: input?.createdAt || new Date().toISOString()
  };
}

function entrySignature(entry) {
  const playerNames = Array.isArray(entry?.playerNames)
    ? entry.playerNames.map((name) => cleanName(name).toLowerCase()).join(' vs ')
    : '';
  return [
    cleanName(entry?.name).toLowerCase(),
    Math.floor(Number(entry?.score || 0)),
    entry?.mode === 'multiplayer' ? 'multi' : 'single',
    Number(entry?.players || 1),
    Number(entry?.playerIndex || 1),
    entry?.targetMode === 'pick' ? 'pick' : 'forced',
    playerNames
  ].join('|');
}

function dedupeEntries(entries) {
  const bySignature = new Map();
  (entries || []).map(cleanEntry).filter(Boolean).forEach((entry) => {
    const sig = entrySignature(entry);
    const existing = bySignature.get(sig);
    if (!existing || String(entry.createdAt || '').localeCompare(String(existing.createdAt || '')) < 0) {
      bySignature.set(sig, entry);
    }
  });
  return [...bySignature.values()];
}

function sortAndTrim(board) {
  board.scores = dedupeEntries(Array.isArray(board.scores) ? board.scores : [])
    .sort((a, b) => b.score - a.score || String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, MAX_ENTRIES);
  return board;
}

function normalizeBoard(board) {
  // Migration support: older deploys stored separate single/multiplayer arrays.
  const legacyScores = [
    ...(Array.isArray(board?.single) ? board.single : []),
    ...(Array.isArray(board?.multiplayer) ? board.multiplayer : [])
  ];

  const next = {
    scores: Array.isArray(board?.scores) ? board.scores : legacyScores,
    updatedAt: board?.updatedAt || null
  };

  next.scores = dedupeEntries(next.scores);
  return sortAndTrim(next);
}

function lowestScore(entries) {
  if (!entries.length || entries.length < MAX_ENTRIES) return -Infinity;
  return Number(entries[entries.length - 1]?.score || 0);
}

function mergeEntries(board, entries) {
  const before = JSON.stringify(sortAndTrim({ scores: board.scores || [] }).scores);
  const beforeSignatures = new Set((board.scores || []).map(entrySignature));
  const accepted = [];

  for (const entry of entries) {
    const sig = entrySignature(entry);
    const couldEnter = entry.score > lowestScore(board.scores || []);
    if (couldEnter && !beforeSignatures.has(sig)) {
      board.scores.push(entry);
      beforeSignatures.add(sig);
    }
  }

  sortAndTrim(board);
  const after = JSON.stringify(board.scores);
  const afterSignatures = new Set((board.scores || []).map(entrySignature));
  const saved = before !== after;

  for (const entry of entries) {
    const sig = entrySignature(entry);
    accepted.push({
      id: entry.id,
      name: entry.name,
      score: entry.score,
      mode: entry.mode,
      saved: saved && afterSignatures.has(sig) && !JSON.parse(before).some((oldEntry) => entrySignature(oldEntry) === sig)
    });
  }

  if (saved) board.updatedAt = new Date().toISOString();
  return { board, saved, accepted };
}

// Read a blob by pathname using list() to find its URL, then fetch the content.
// The etag from the list result is used for optimistic concurrency in saveBoard().
// Private-store blobs require an Authorization header — public-store blobs ignore it.
async function readBoardFromPath(path) {
  // @vercel/blob has no get(); find the blob URL via list(), then fetch its content.
  const { blobs } = await list({ prefix: path, limit: 1 });
  const blobMeta = blobs.find((b) => b.pathname === path);
  if (!blobMeta) return null;

  const fetchHeaders = {
    // Force CDN bypass so we always get the current ETag from storage.
    // Note: these are HTTP *request* headers, and `cache` is a separate fetch option below.
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    fetchHeaders['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }
  // `cache: 'no-store'` must be a fetch *option*, not a header.
  // Previously it was incorrectly placed inside the headers object and had no effect.
  const response = await fetch(blobMeta.url, { headers: fetchHeaders, cache: 'no-store' });
  if (!response.ok) return null;

  const etag = response.headers.get('etag') || null;
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : EMPTY_BOARD;
  return { board: normalizeBoard(parsed), etag, path };
}

async function loadBoard() {
  // Wrap the primary read in a try-catch so a transient read error (e.g. CDN hiccup)
  // returns an empty board rather than blocking the entire POST with a 500.
  let board;
  let etag = null;
  try {
    const primary = await readBoardFromPath(LEADERBOARD_PATH);
    board = primary ? primary.board : { ...EMPTY_BOARD, scores: [] };
    etag = primary ? primary.etag : null;
  } catch (readError) {
    // If we can't read the existing board, start from scratch for this request.
    // The missing ifMatch means the write will succeed unconditionally (last write wins).
    board = { ...EMPTY_BOARD, scores: [] };
    etag = null;
  }

  for (const legacyPath of LEGACY_LEADERBOARD_PATHS) {
    try {
      const legacy = await readBoardFromPath(legacyPath);
      if (legacy?.board?.scores?.length) {
        board.scores.push(...legacy.board.scores);
        board.updatedAt = board.updatedAt || legacy.board.updatedAt || null;
      }
    } catch (error) {
      // Ignore missing or unreadable legacy paths.
    }
  }

  board = sortAndTrim(board);
  return { board, etag };
}

async function saveBoard(board, etag) {
  const options = {
    // Use 'private' to match private-store Blob accounts.
    // Public-store accounts accept 'public' here, but private stores reject it.
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 0
  };

  if (etag) options.ifMatch = etag;
  await put(LEADERBOARD_PATH, JSON.stringify(board, null, 2), options);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });

  // Fail fast with a clear message when the Blob token is missing so the error
  // is actionable rather than a cryptic "Unknown Blob error".
  if (!hasBlobToken()) {
    return sendJson(res, 503, {
      ok: false,
      error: 'Leaderboard unavailable',
      detail: 'BLOB_READ_WRITE_TOKEN is not configured. Add it in your Vercel project → Storage → Connect Store, or set it manually in Environment Variables.',
      meta: leaderboardMeta()
    });
  }

  if (req.method === 'GET') {
    try {
      const { board } = await loadBoard();
      return sendJson(res, 200, {
        ok: true,
        leaderboard: board,
        meta: leaderboardMeta({ count: board.scores.length, updatedAt: board.updatedAt })
      });
    } catch (error) {
      return sendJson(res, 503, {
        ok: false,
        error: 'Leaderboard unavailable',
        detail: safeErrorMessage(error),
        meta: leaderboardMeta()
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let body = {};
  try {
    body = await readBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: 'Invalid JSON' });
  }

  const rawEntries = Array.isArray(body.entries) ? body.entries : [body];
  const entries = rawEntries.map(cleanEntry).filter(Boolean).slice(0, MAX_ENTRIES);
  if (!entries.length) return sendJson(res, 400, { error: 'No valid scores submitted' });

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const { board, etag } = await loadBoard();
      const merged = mergeEntries(board, entries);

      if (!merged.saved) {
        return sendJson(res, 200, {
          ok: true,
          saved: false,
          accepted: merged.accepted,
          leaderboard: merged.board,
          meta: leaderboardMeta({ count: merged.board.scores.length, updatedAt: merged.board.updatedAt })
        });
      }

      // On the final attempt drop ifMatch so a persistent ETag race never blocks a
      // legitimate save.  Worst case: two concurrent final-round saves race and the
      // second one wins — acceptable for a leaderboard.
      const etagToUse = attempt < MAX_ATTEMPTS - 1 ? etag : null;
      await saveBoard(merged.board, etagToUse);
      return sendJson(res, 200, {
        ok: true,
        saved: true,
        accepted: merged.accepted,
        leaderboard: merged.board,
        meta: leaderboardMeta({ count: merged.board.scores.length, updatedAt: merged.board.updatedAt })
      });
    } catch (error) {
      const message = String(error?.message || error?.name || '');
      const retryable = /Precondition|ifMatch|etag|condition/i.test(message);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        return sendJson(res, 500, {
          ok: false,
          error: 'Could not save leaderboard score',
          detail: safeErrorMessage(error),
          meta: leaderboardMeta()
        });
      }
      // Exponential backoff: 100 ms, 200 ms, 400 ms, 800 ms
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }
}
