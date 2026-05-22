// /api/leaderboard.js
// ESM Vercel Serverless Function.
// Robust shared leaderboard for Vercel Blob with merge + ETag retry.

const DEFAULT_PATH = 'leaderboard.json';

const FALLBACK_PATHS = [
  'leaderboard.json',
  'dice-rush-leaderboard.json',
  'dice-rush/leaderboard.json'
];

const TOP_LIMIT = 10;
const MAX_WRITE_ATTEMPTS = 8;

let blobSdkPromise = null;

async function getBlobSdk() {
  if (!blobSdkPromise) {
    blobSdkPromise = import('@vercel/blob');
  }
  return blobSdkPromise;
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

function blobAccess() {
  return String(process.env.BLOB_ACCESS || 'public').toLowerCase() === 'private'
    ? 'private'
    : 'public';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function cleanName(value, fallback = 'Player') {
  const name = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);

  return name || fallback;
}

function cleanNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function cleanEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;

  const score = Math.floor(cleanNumber(entry.score, 0));
  if (!Number.isFinite(score) || score <= 0) return null;

  const playersRaw = Math.floor(cleanNumber(entry.players, 1));
  const players = Math.max(1, Math.min(2, playersRaw));
  const mode = entry.mode === 'multiplayer' || players >= 2 ? 'multiplayer' : 'single';

  const playerNames = Array.isArray(entry.playerNames)
    ? entry.playerNames
        .map((name, i) => cleanName(name, `Player ${i + 1}`))
        .slice(0, 2)
    : [];

  const createdAt = entry.createdAt
    ? String(entry.createdAt)
    : entry.timestamp
      ? String(entry.timestamp)
      : nowIso();

  return {
    ...entry,
    id: String(
      entry.id ||
      `server-${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`
    ),
    name: cleanName(entry.name, `Player ${index + 1}`),
    score,
    mode,
    players: mode === 'multiplayer' ? Math.max(2, players) : 1,
    playerIndex: Math.max(1, Math.min(2, Math.floor(cleanNumber(entry.playerIndex, index + 1)))),
    playerNames,
    targetMode: entry.targetMode === 'pick' ? 'pick' : 'forced',
    createdAt
  };
}

function entrySignature(entry) {
  const playerNames = Array.isArray(entry.playerNames)
    ? entry.playerNames.map(name => cleanName(name).toLowerCase()).join(' vs ')
    : '';

  return [
    cleanName(entry.name).toLowerCase(),
    Math.floor(cleanNumber(entry.score, 0)),
    entry.mode === 'multiplayer' ? 'multi' : 'single',
    Math.floor(cleanNumber(entry.players, 1)),
    Math.floor(cleanNumber(entry.playerIndex, 1)),
    entry.targetMode === 'pick' ? 'pick' : 'forced',
    playerNames
  ].join('|');
}

function sortedTop(entries) {
  const map = new Map();
  const list = Array.isArray(entries) ? entries : [];

  list.forEach((entry, index) => {
    const clean = cleanEntry(entry, index);
    if (!clean) return;

    const sig = entrySignature(clean);
    const existing = map.get(sig);

    if (!existing || String(clean.createdAt).localeCompare(String(existing.createdAt)) < 0) {
      map.set(sig, clean);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => {
      return Number(b.score || 0) - Number(a.score || 0)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    })
    .slice(0, TOP_LIMIT);
}

function makeCompatBoard(entries) {
  const scores = sortedTop(entries);

  return {
    scores,
    single: scores.filter(entry => entry.mode !== 'multiplayer'),
    multiplayer: scores.filter(entry => entry.mode === 'multiplayer')
  };
}

function normalizeBoard(payload) {
  if (Array.isArray(payload)) {
    return makeCompatBoard(payload);
  }

  const root = payload && typeof payload === 'object' ? payload : {};
  const board = root.leaderboard && typeof root.leaderboard === 'object'
    ? root.leaderboard
    : root;

  if (Array.isArray(board.scores)) {
    return makeCompatBoard(board.scores);
  }

  const combined = [];

  if (Array.isArray(board.single)) {
    combined.push(...board.single.map(entry => ({ ...entry, mode: entry.mode || 'single' })));
  }

  if (Array.isArray(board.multiplayer)) {
    combined.push(...board.multiplayer.map(entry => ({ ...entry, mode: 'multiplayer' })));
  }

  return makeCompatBoard(combined);
}

function boardsEqual(a, b) {
  const aa = sortedTop(a?.scores || []).map(entrySignature).join('\n');
  const bb = sortedTop(b?.scores || []).map(entrySignature).join('\n');
  return aa === bb;
}

function errorText(error) {
  return String(
    `${error?.name || ''} ${error?.message || ''} ${error?.status || ''} ${error?.statusCode || ''}`
  ).toLowerCase();
}

function isNotFound(error) {
  const text = errorText(error);

  return error?.status === 404 ||
    error?.statusCode === 404 ||
    text.includes('notfound') ||
    text.includes('not found') ||
    text.includes('blobnotfound');
}

function isRetryableWriteError(error) {
  const text = errorText(error);

  return error?.status === 409 ||
    error?.statusCode === 409 ||
    error?.status === 412 ||
    error?.statusCode === 412 ||
    text.includes('etag') ||
    text.includes('precondition') ||
    text.includes('conflict') ||
    text.includes('already exists') ||
    text.includes('blobpreconditionfailederror');
}

async function resolvePath(sdk) {
  if (process.env.LEADERBOARD_BLOB_PATH) {
    return process.env.LEADERBOARD_BLOB_PATH;
  }

  for (const pathname of FALLBACK_PATHS) {
    try {
      await sdk.head(pathname, { token: blobToken() });
      return pathname;
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
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
  const token = blobToken();
  const access = blobAccess();

  try {
    if (typeof sdk.get === 'function') {
      const result = await sdk.get(pathname, {
        access,
        token
      });

      if (!result) {
        return {
          exists: false,
          etag: null,
          board: makeCompatBoard([]),
          updatedAt: null
        };
      }

      if (result.statusCode && result.statusCode !== 200) {
        throw new Error(`Blob get failed with status ${result.statusCode}`);
      }

      const text = await streamToText(result.stream);
      const parsed = parseJson(text);

      return {
        exists: true,
        etag: result.blob?.etag || result.headers?.get?.('etag') || null,
        board: normalizeBoard(parsed),
        updatedAt: parsed.updatedAt || null
      };
    }

    const meta = await sdk.head(pathname, { token });
    const url = meta.downloadUrl || meta.url;

    if (!url) {
      throw new Error('Blob metadata had no readable URL.');
    }

    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Blob fetch failed with status ${response.status}`);
    }

    const parsed = parseJson(await response.text());

    return {
      exists: true,
      etag: meta.etag || response.headers.get('etag') || null,
      board: normalizeBoard(parsed),
      updatedAt: parsed.updatedAt || null
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        exists: false,
        etag: null,
        board: makeCompatBoard([]),
        updatedAt: null
      };
    }

    throw error;
  }
}

async function writeBoard(sdk, pathname, board, current) {
  const options = {
    access: blobAccess(),
    token: blobToken(),
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    addRandomSuffix: false
  };

  if (current?.exists && current?.etag) {
    options.allowOverwrite = true;
    options.ifMatch = current.etag;
  } else if (current?.exists) {
    options.allowOverwrite = true;
  } else {
    options.allowOverwrite = false;
  }

  const payload = {
    leaderboard: makeCompatBoard(board.scores || []),
    updatedAt: nowIso()
  };

  return sdk.put(pathname, JSON.stringify(payload, null, 2), options);
}

function extractIncomingEntries(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];

  if (Array.isArray(body.entries)) return body.entries;
  if (Array.isArray(body.scores)) return body.scores;

  if (body.leaderboard && Array.isArray(body.leaderboard.scores)) {
    return body.leaderboard.scores;
  }

  const combined = [];

  if (Array.isArray(body.single)) {
    combined.push(...body.single.map(entry => ({ ...entry, mode: entry.mode || 'single' })));
  }

  if (Array.isArray(body.multiplayer)) {
    combined.push(...body.multiplayer.map(entry => ({ ...entry, mode: 'multiplayer' })));
  }

  if (body.leaderboard && Array.isArray(body.leaderboard.single)) {
    combined.push(...body.leaderboard.single.map(entry => ({ ...entry, mode: entry.mode || 'single' })));
  }

  if (body.leaderboard && Array.isArray(body.leaderboard.multiplayer)) {
    combined.push(...body.leaderboard.multiplayer.map(entry => ({ ...entry, mode: 'multiplayer' })));
  }

  if (combined.length) return combined;

  if (body.entry) return [body.entry];
  if (body.score !== undefined) return [body];

  return [];
}

async function mergeAndSave(incomingEntries) {
  const sdk = await getBlobSdk();
  const pathname = await resolvePath(sdk);
  const incoming = sortedTop(incomingEntries);

  if (!incoming.length) {
    const currentOnly = await readCurrentBoard(sdk, pathname);

    return {
      saved: false,
      attempts: 0,
      pathname,
      board: currentOnly.board,
      etag: currentOnly.etag,
      updatedAt: currentOnly.updatedAt
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readCurrentBoard(sdk, pathname);
    const existing = current.board?.scores || [];

    const nextBoard = makeCompatBoard([
      ...existing,
      ...incoming
    ]);

    if (boardsEqual(current.board, nextBoard)) {
      return {
        saved: false,
        attempts: attempt,
        pathname,
        board: current.board,
        etag: current.etag,
        updatedAt: current.updatedAt
      };
    }

    try {
      const written = await writeBoard(sdk, pathname, nextBoard, current);

      return {
        saved: true,
        attempts: attempt,
        pathname,
        board: nextBoard,
        etag: written?.etag || null,
        updatedAt: nowIso()
      };
    } catch (error) {
      lastError = error;

      if (!isRetryableWriteError(error) || attempt >= MAX_WRITE_ATTEMPTS) {
        break;
      }

      await sleep(75 * attempt + Math.floor(Math.random() * 125));
    }
  }

  throw lastError || new Error('Could not save leaderboard after retries.');
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return parseJson(req.body);
  }

  let raw = '';

  try {
    for await (const chunk of req) {
      raw += chunk;
    }
  } catch {
    return {};
  }

  return parseJson(raw);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload, null, 2));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET') {
      const sdk = await getBlobSdk();
      const pathname = await resolvePath(sdk);
      const current = await readCurrentBoard(sdk, pathname);

      return sendJson(res, 200, {
        ok: true,
        online: true,
        saved: false,
        pathname,
        leaderboard: current.board,
        scores: current.board.scores,
        single: current.board.single,
        multiplayer: current.board.multiplayer,
        count: current.board.scores.length,
        updatedAt: current.updatedAt
      });
    }

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const incoming = extractIncomingEntries(body);
      const result = await mergeAndSave(incoming);

      return sendJson(res, 200, {
        ok: true,
        online: true,
        merged: true,
        saved: result.saved,
        attempts: result.attempts,
        pathname: result.pathname,
        leaderboard: result.board,
        scores: result.board.scores,
        single: result.board.single,
        multiplayer: result.board.multiplayer,
        count: result.board.scores.length,
        updatedAt: result.updatedAt
      });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');

    return sendJson(res, 405, {
      ok: false,
      error: 'Method not allowed'
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      online: false,
      error: error?.message || String(error),
      name: error?.name || 'Error',
      hint: 'Check that @vercel/blob is installed and BLOB_READ_WRITE_TOKEN exists in Vercel Environment Variables.'
    });
  }
}
