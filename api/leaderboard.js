import { get, put } from '@vercel/blob';

const LEADERBOARD_PATH = 'dice-rush/leaderboard.json';
const MAX_ENTRIES = 10;
const EMPTY_BOARD = { scores: [], updatedAt: null };

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

async function streamToText(stream) {
  if (!stream) return '';
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out + decoder.decode();
  }

  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
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

function sortAndTrim(board) {
  board.scores = (Array.isArray(board.scores) ? board.scores : [])
    .filter(Boolean)
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

  next.scores = next.scores.map(cleanEntry).filter(Boolean);
  return sortAndTrim(next);
}

function lowestScore(entries) {
  if (!entries.length || entries.length < MAX_ENTRIES) return -Infinity;
  return Number(entries[entries.length - 1]?.score || 0);
}

function mergeEntries(board, entries) {
  let saved = false;
  const accepted = [];

  for (const entry of entries) {
    const before = JSON.stringify(board.scores);

    if (entry.score > lowestScore(board.scores)) {
      board.scores.push(entry);
      sortAndTrim(board);
    }

    const didSave = before !== JSON.stringify(board.scores);
    saved = saved || didSave;
    accepted.push({ id: entry.id, name: entry.name, score: entry.score, mode: entry.mode, saved: didSave });
  }

  if (saved) board.updatedAt = new Date().toISOString();
  return { board, saved, accepted };
}

async function loadBoard() {
  const result = await get(LEADERBOARD_PATH, { access: 'public' });
  if (!result || result.statusCode !== 200) {
    return { board: { ...EMPTY_BOARD }, etag: null };
  }

  const text = await streamToText(result.stream);
  const parsed = text ? JSON.parse(text) : EMPTY_BOARD;
  return { board: normalizeBoard(parsed), etag: result.blob?.etag || null };
}

async function saveBoard(board, etag) {
  const options = {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60
  };

  if (etag) options.ifMatch = etag;
  await put(LEADERBOARD_PATH, JSON.stringify(board, null, 2), options);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });

  if (req.method === 'GET') {
    try {
      const { board } = await loadBoard();
      return sendJson(res, 200, { leaderboard: board });
    } catch (error) {
      return sendJson(res, 200, { leaderboard: { ...EMPTY_BOARD }, warning: 'Leaderboard unavailable' });
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
  const entries = rawEntries.map(cleanEntry).filter(Boolean).slice(0, 4);
  if (!entries.length) return sendJson(res, 400, { error: 'No valid scores submitted' });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { board, etag } = await loadBoard();
      const merged = mergeEntries(board, entries);

      if (!merged.saved) {
        return sendJson(res, 200, {
          saved: false,
          accepted: merged.accepted,
          leaderboard: merged.board
        });
      }

      await saveBoard(merged.board, etag);
      return sendJson(res, 200, {
        saved: true,
        accepted: merged.accepted,
        leaderboard: merged.board
      });
    } catch (error) {
      const message = String(error?.message || error?.name || '');
      const retryable = /Precondition|ifMatch|etag|condition/i.test(message);
      if (!retryable || attempt === 3) {
        return sendJson(res, 500, { error: 'Could not save leaderboard score' });
      }
      await new Promise((resolve) => setTimeout(resolve, 80 + attempt * 120));
    }
  }
}
