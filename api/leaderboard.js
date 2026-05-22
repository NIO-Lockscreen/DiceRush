// /api/leaderboard.js
// Robust Vercel Blob leaderboard endpoint with merge/retry logic.
// Fixes ETag mismatch when several tabs/players save at the same time.

const DEFAULT_PATH = 'leaderboard.json';
const FALLBACK_PATHS = ['leaderboard.json', 'dice-rush-leaderboard.json', 'dice-rush/leaderboard.json'];
const MAX_WRITE_ATTEMPTS = 8;
const TOP_LIMIT = 10;

function blobAccess() {
  return String(process.env.BLOB_ACCESS || 'public').toLowerCase() === 'private' ? 'private' : 'public';
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanName(value, fallback = 'Player') {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || fallback;
}

function cleanEntry(entry, index = 0) {
  const score = Math.floor(Number(entry?.score));
  if (!Number.isFinite(score) || score <= 0) return null;

  const playersRaw = Math.floor(Number(entry?.players || 1));
  const players = Math.max(1, Math.min(2, Number.isFinite(playersRaw) ? playersRaw : 1));
  const mode = entry?.mode === 'multiplayer' || players >= 2 ? 'multiplayer' : 'single';
  const createdAt = entry?.createdAt || new Date().toISOString();
  const playerNames = Array.isArray(entry?.playerNames)
    ? entry.playerNames.map((name, i) => cleanName(name, `Player ${i + 1}`)).slice(0, 2)
    : [];

  return {
    id: String(entry?.id || `server-${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`),
    name: cleanName(entry?.name, `Player ${index + 1}`),
    score,
    mode,
    players: mode === 'multiplayer' ? Math.max(2, players) : 1,
    playerIndex: Math.max(1, Math.min(2, Math.floor(Number(entry?.playerIndex || index + 1)))),
    playerNames,
    targetMode: entry?.targetMode === 'pick' ? 'pick' : 'forced',
    createdAt
  };
}

function signature(entry) {
  const playerNames = Array.isArray(entry?.playerNames)
    ? entry.playerNames.map(name => cleanName(name).toLowerCase()).join(' vs ')
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

function sortedTop(entries) {
  const bySignature = new Map();

  (entries || []).forEach((entry, index) => {
    const clean = cleanEntry(entry, index);
    if (!clean) return;

    const sig = signature(clean);
    const existing = bySignature.get(sig);
    if (!existing || String(clean.createdAt || '').localeCompare(String(existing.createdAt || '')) < 0) {
      bySignature.set(sig, clean);
    }
  });

  return [...bySignature.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(0, TOP_LIMIT);
}

function normalizeBoard(payload) {
  const board = payload?.leaderboard || payload || {};

  if (Array.isArray(board.scores)) {
    return { scores: sortedTop(board.scores) };
  }

  const legacy = [
    ...(Array.isArray(board.single) ? board.single : []),
    ...(Array.isArray(board.multiplayer) ? board.multiplayer : [])
  ];

  return { scores: sortedTop(legacy) };
}

function boardsEqual(a, b) {
  const aa = sortedTop(a?.scores || []).map(signature).join('\n');
  const bb = sortedTop(b?.scores || []).map(signature).join('\n');
  return aa === bb;
}

function isNotFound(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return error?.status === 404 || error?.statusCode === 404 || text.includes('notfound') || text.includes('not found');
}

function isRetryableBlobWriteError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return error?.status === 409 ||
    error?.statusCode === 409 ||
    error?.status === 412 ||
    error?.statusCode === 412 ||
    text.includes('precondition') ||
    text.includes('etag') ||
    text.includes('already exists') ||
    text.includes('conflict');
}

async function getBlobSdk() {
  return import('@vercel/blob');
}

async function resolvePath(sdk) {
  if (process.env.LEADERBOARD_BLOB_PATH) return process.env.LEADERBOARD_BLOB_PATH;

  const options = { token: blobToken() };
  for (const pathname of FALLBACK_PATHS) {
    try {
      await sdk.head(pathname, options);
      return pathname;
    } catch (error) {
      if (!isNotFound(error)) continue;
    }
  }

  return DEFAULT_PATH;
}

async function streamToText(stream) {
  if (!stream) return '';
  if (typeof Response !== 'undefined') {
    return new Response(stream).text();
  }

  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readCurrentBoard(sdk, pathname) {
  const access = blobAccess();
  const token = blobToken();

  if (typeof sdk.get === 'function') {
    const result = await sdk.get(pathname, { access, token });
    if (!result || result.statusCode === 404) {
      return { exists: false, etag: null, board: { scores: [] } };
    }
    if (result.statusCode !== 200) {
      return { exists: true, etag: result.blob?.etag || null, board: { scores: [] } };
    }

    const text = await streamToText(result.stream);
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = {}; }

    return {
      exists: true,
      etag: result.blob?.etag || null,
      board: normalizeBoard(parsed)
    };
  }

  try {
    const meta = await sdk.head(pathname, { token });
    const response = await fetch(`${meta.url}${meta.url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
    const parsed = await response.json().catch(() => ({}));
    return { exists: true, etag: meta.etag || null, board: normalizeBoard(parsed) };
  } catch (error) {
    if (isNotFound(error)) return { exists: false, etag: null, board: { scores: [] } };
    throw error;
  }
}

async function writeBoard(sdk, pathname, board, etag) {
  const options = {
    access: blobAccess(),
    token: blobToken(),
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    addRandomSuffix: false
  };

  if (etag) {
    options.allowOverwrite = true;
    options.ifMatch = etag;
  } else {
    options.allowOverwrite = false;
  }

  return sdk.put(pathname, JSON.stringify({ leaderboard: board, updatedAt: new Date().toISOString() }, null, 2), options);
}

function extractIncomingEntries(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.entries)) return body.entries;
  if (Array.isArray(body?.scores)) return body.scores;
  if (Array.isArray(body?.leaderboard?.scores)) return body.leaderboard.scores;
  if (body?.entry) return [body.entry];
  return [];
}

async function mergeAndSave(incomingEntries) {
  const sdk = await getBlobSdk();
  const pathname = await resolvePath(sdk);
  const incoming = sortedTop(incomingEntries);

  if (!incoming.length) {
    const current = await readCurrentBoard(sdk, pathname);
    return { saved: false, attempts: 0, pathname, board: current.board, etag: current.etag };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readCurrentBoard(sdk, pathname);
    const nextBoard = { scores: sortedTop([...(current.board?.scores || []), ...incoming]) };

    if (boardsEqual(current.board, nextBoard)) {
      return { saved: false, attempts: attempt, pathname, board: current.board, etag: current.etag };
    }

    try {
      const written = await writeBoard(sdk, pathname, nextBoard, current.etag);
      return { saved: true, attempts: attempt, pathname, board: nextBoard, etag: written?.etag || null };
    } catch (error) {
      lastError = error;
      if (!isRetryableBlobWriteError(error) || attempt === MAX_WRITE_ATTEMPTS) break;

      await sleep(50 * attempt + Math.floor(Math.random() * 80));
    }
  }

  throw lastError || new Error('Could not save leaderboard score.');
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; }
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET,POST,OPTIONS');
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET') {
      const sdk = await getBlobSdk();
      const pathname = await resolvePath(sdk);
      const current = await readCurrentBoard(sdk, pathname);
      return sendJson(res, 200, {
        leaderboard: current.board,
        etag: current.etag,
        pathname,
        loaded: true
      });
    }

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const result = await mergeAndSave(extractIncomingEntries(body));
      return sendJson(res, 200, {
        saved: result.saved,
        merged: true,
        attempts: result.attempts,
        leaderboard: result.board,
        etag: result.etag,
        pathname: result.pathname
      });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Could not save leaderboard score.',
      detail: error?.message || String(error)
    });
  }
};
