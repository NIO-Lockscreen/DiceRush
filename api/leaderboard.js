// /api/leaderboard.js
// Dice Rush leaderboard — Vercel Blob private store.
// Fixes:
// - Blob not found should not crash.
// - Private Blob store uses access: "private".
// - Multiple tabs/devices can save at same time with merge + ETag retry.

const DEFAULT_PATH = 'leaderboard.json';

const FALLBACK_PATHS = [
  'leaderboard.json',
  'dice-rush-leaderboard.json',
  'dice-rush/leaderboard.json'
];

const TOP_LIMIT = 10;
const MAX_WRITE_ATTEMPTS = 8;

let sdkPromise = null;

async function sdk() {
  if (!sdkPromise) sdkPromise = import('@vercel/blob');
  return sdkPromise;
}

function token() {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

// Your store is Private. Keep this as private unless you intentionally make a public Blob store.
function access() {
  return process.env.BLOB_ACCESS || 'private';
}

function adminPin() {
  // Set LEADERBOARD_ADMIN_PIN in Vercel for a real private admin code.
  // Fallback keeps the hidden Thomas admin mode usable without extra setup.
  return String(process.env.LEADERBOARD_ADMIN_PIN || process.env.LEADERBOARD_ADMIN_KEY || 'Thomas');
}

function adminValueFromRequest(req, body) {
  const headerValue = req?.headers?.['x-leaderboard-admin'] || req?.headers?.['X-Leaderboard-Admin'];
  return String(body?.adminPin || body?.adminKey || body?.pin || headerValue || '');
}

function isAdminAuthorized(req, body) {
  const expected = adminPin();
  const provided = adminValueFromRequest(req, body);
  return Boolean(expected && provided && provided === expected);
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;

  const score = Math.floor(num(entry.score, 0));
  if (!Number.isFinite(score) || score <= 0) return null;

  const rawPlayers = Math.floor(num(entry.players, 1));
  const players = Math.max(1, Math.min(2, rawPlayers));
  const mode = entry.mode === 'multiplayer' || players >= 2 ? 'multiplayer' : 'single';

  const playerNames = Array.isArray(entry.playerNames)
    ? entry.playerNames.map((name, i) => cleanName(name, `Player ${i + 1}`)).slice(0, 2)
    : [];

  const createdAt = String(entry.createdAt || entry.timestamp || nowIso());

  return {
    ...entry,
    id: String(entry.id || `server-${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`),
    name: cleanName(entry.name, `Player ${index + 1}`),
    score,
    mode,
    players: mode === 'multiplayer' ? Math.max(2, players) : 1,
    playerIndex: Math.max(1, Math.min(2, Math.floor(num(entry.playerIndex, index + 1)))),
    playerNames,
    targetMode: entry.targetMode === 'pick' ? 'pick' : 'forced',
    createdAt
  };
}

function sig(entry) {
  const playerNames = Array.isArray(entry.playerNames)
    ? entry.playerNames.map(name => cleanName(name).toLowerCase()).join(' vs ')
    : '';

  return [
    cleanName(entry.name).toLowerCase(),
    Math.floor(num(entry.score, 0)),
    entry.mode === 'multiplayer' ? 'multi' : 'single',
    Math.floor(num(entry.players, 1)),
    Math.floor(num(entry.playerIndex, 1)),
    entry.targetMode === 'pick' ? 'pick' : 'forced',
    playerNames
  ].join('|');
}

function sortedTop(entries) {
  const map = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    const clean = cleanEntry(entry, index);
    if (!clean) return;

    const key = sig(clean);
    const old = map.get(key);

    if (!old || String(clean.createdAt).localeCompare(String(old.createdAt)) < 0) {
      map.set(key, clean);
    }
  });

  return [...map.values()]
    .sort((a, b) => {
      return Number(b.score || 0) - Number(a.score || 0)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    })
    .slice(0, TOP_LIMIT);
}

function compatBoard(entries) {
  const scores = sortedTop(entries);

  return {
    scores,
    single: scores.filter(entry => entry.mode !== 'multiplayer'),
    multiplayer: scores.filter(entry => entry.mode === 'multiplayer')
  };
}

function normalizeBoard(payload) {
  if (Array.isArray(payload)) return compatBoard(payload);

  const root = payload && typeof payload === 'object' ? payload : {};
  const board = root.leaderboard && typeof root.leaderboard === 'object'
    ? root.leaderboard
    : root;

  if (Array.isArray(board.scores)) {
    return compatBoard(board.scores);
  }

  const combined = [];

  if (Array.isArray(board.single)) {
    combined.push(...board.single.map(entry => ({ ...entry, mode: entry.mode || 'single' })));
  }

  if (Array.isArray(board.multiplayer)) {
    combined.push(...board.multiplayer.map(entry => ({ ...entry, mode: 'multiplayer' })));
  }

  return compatBoard(combined);
}

function boardsEqual(a, b) {
  return sortedTop(a?.scores || []).map(sig).join('\n') ===
    sortedTop(b?.scores || []).map(sig).join('\n');
}

function textOfError(error) {
  return String(
    `${error?.name || ''} ${error?.message || ''} ${error?.status || ''} ${error?.statusCode || ''}`
  ).toLowerCase();
}

function isNotFound(error) {
  const text = textOfError(error);

  return error?.status === 404 ||
    error?.statusCode === 404 ||
    text.includes('404') ||
    text.includes('notfound') ||
    text.includes('not found') ||
    text.includes('does not exist') ||
    text.includes('blobnotfound');
}

function isRetryableWriteError(error) {
  const text = textOfError(error);

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

async function findExistingPath(blobSdk) {
  if (process.env.LEADERBOARD_BLOB_PATH) {
    return process.env.LEADERBOARD_BLOB_PATH;
  }

  for (const pathname of FALLBACK_PATHS) {
    try {
      await blobSdk.head(pathname, { token: token() });
      return pathname;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  // If an older version created a random-suffix blob, try to find it.
  if (typeof blobSdk.list === 'function') {
    try {
      const result = await blobSdk.list({
        token: token(),
        limit: 1000
      });

      const blobs = Array.isArray(result?.blobs) ? result.blobs : [];

      const candidates = blobs
        .filter(blob => {
          const path = String(blob.pathname || '').toLowerCase();
          return path.includes('leaderboard') && path.endsWith('.json');
        })
        .sort((a, b) => {
          return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
        });

      if (candidates[0]?.pathname) {
        return candidates[0].pathname;
      }
    } catch {
      // Listing is only a fallback. Ignore and use default path.
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

async function readBoard(blobSdk, pathname) {
  if (typeof blobSdk.get !== 'function') {
    throw new Error('@vercel/blob is too old. Update package.json to use @vercel/blob >= 2.3.0 for private Blob stores.');
  }

  try {
    const result = await blobSdk.get(pathname, {
      access: access(),
      token: token()
    });

    if (!result || result.statusCode === 404) {
      return {
        exists: false,
        etag: null,
        board: compatBoard([]),
        updatedAt: null
      };
    }

    if (result.statusCode !== 200) {
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
  } catch (error) {
    if (isNotFound(error)) {
      return {
        exists: false,
        etag: null,
        board: compatBoard([]),
        updatedAt: null
      };
    }

    throw error;
  }
}

async function writeBoard(blobSdk, pathname, board, current) {
  const payload = {
    leaderboard: compatBoard(board.scores || []),
    updatedAt: nowIso()
  };

  const options = {
    access: access(),
    token: token(),
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 60
  };

  if (current?.exists && current?.etag) {
    options.allowOverwrite = true;
    options.ifMatch = current.etag;
  } else if (current?.exists) {
    options.allowOverwrite = true;
  } else {
    options.allowOverwrite = false;
  }

  return blobSdk.put(pathname, JSON.stringify(payload, null, 2), options);
}

function extractIncoming(body) {
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

async function ensureBoardExists(blobSdk, pathname) {
  const current = await readBoard(blobSdk, pathname);

  if (current.exists) {
    return {
      saved: false,
      created: false,
      pathname,
      board: current.board,
      etag: current.etag,
      updatedAt: current.updatedAt
    };
  }

  try {
    const empty = compatBoard([]);
    const written = await writeBoard(blobSdk, pathname, empty, current);

    return {
      saved: true,
      created: true,
      pathname,
      board: empty,
      etag: written?.etag || null,
      updatedAt: nowIso()
    };
  } catch (error) {
    // Another tab may have created it at the same time.
    if (isRetryableWriteError(error)) {
      const reread = await readBoard(blobSdk, pathname);

      return {
        saved: false,
        created: false,
        pathname,
        board: reread.board,
        etag: reread.etag,
        updatedAt: reread.updatedAt
      };
    }

    throw error;
  }
}

async function mergeAndSave(incomingEntries) {
  const blobSdk = await sdk();
  const pathname = await findExistingPath(blobSdk);
  const incoming = sortedTop(incomingEntries);

  if (!incoming.length) {
    return ensureBoardExists(blobSdk, pathname);
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readBoard(blobSdk, pathname);

    const nextBoard = compatBoard([
      ...(current.board?.scores || []),
      ...incoming
    ]);

    if (boardsEqual(current.board, nextBoard)) {
      return {
        saved: false,
        created: false,
        attempts: attempt,
        pathname,
        board: current.board,
        etag: current.etag,
        updatedAt: current.updatedAt
      };
    }

    try {
      const written = await writeBoard(blobSdk, pathname, nextBoard, current);

      return {
        saved: true,
        created: !current.exists,
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


async function deleteScoresFromBoard(deleteIds = [], deleteSignatures = []) {
  const blobSdk = await sdk();
  const pathname = await findExistingPath(blobSdk);
  const ids = new Set((Array.isArray(deleteIds) ? deleteIds : []).map(value => String(value)));
  const signatures = new Set((Array.isArray(deleteSignatures) ? deleteSignatures : []).map(value => String(value)));

  if (!ids.size && !signatures.size) {
    throw new Error('No leaderboard score selected for deletion.');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readBoard(blobSdk, pathname);
    const before = current.board?.scores || [];
    const kept = before.filter(entry => !ids.has(String(entry.id)) && !signatures.has(sig(entry)));
    const nextBoard = compatBoard(kept);
    const deletedCount = Math.max(0, before.length - nextBoard.scores.length);

    if (!deletedCount) {
      return {
        deleted: 0,
        attempts: attempt,
        pathname,
        board: current.board,
        etag: current.etag,
        updatedAt: current.updatedAt
      };
    }

    try {
      const written = await writeBoard(blobSdk, pathname, nextBoard, current);

      return {
        deleted: deletedCount,
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

  throw lastError || new Error('Could not delete leaderboard score after retries.');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parseJson(req.body);

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
      const blobSdk = await sdk();
      const pathname = await findExistingPath(blobSdk);
      const result = await ensureBoardExists(blobSdk, pathname);

      return sendJson(res, 200, {
        ok: true,
        online: true,
        initialized: result.created,
        pathname: result.pathname,
        leaderboard: result.board,
        scores: result.board.scores,
        single: result.board.single,
        multiplayer: result.board.multiplayer,
        count: result.board.scores.length,
        updatedAt: result.updatedAt
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (body?.action === 'deleteScore' || body?.adminAction === 'deleteScore') {
        if (!isAdminAuthorized(req, body)) {
          return sendJson(res, 403, {
            ok: false,
            online: true,
            error: 'Admin mode denied'
          });
        }

        const result = await deleteScoresFromBoard(body?.ids || body?.deleteIds || [], body?.signatures || body?.deleteSignatures || []);

        return sendJson(res, 200, {
          ok: true,
          online: true,
          admin: true,
          deleted: result.deleted,
          attempts: result.attempts || 0,
          pathname: result.pathname,
          leaderboard: result.board,
          scores: result.board.scores,
          single: result.board.single,
          multiplayer: result.board.multiplayer,
          count: result.board.scores.length,
          updatedAt: result.updatedAt
        });
      }

      const result = await mergeAndSave(extractIncoming(body));

      return sendJson(res, 200, {
        ok: true,
        online: true,
        merged: true,
        saved: result.saved,
        created: result.created,
        attempts: result.attempts || 0,
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
      hint: 'If this mentions @vercel/blob being too old, update package.json to @vercel/blob >= 2.3.0. Otherwise check Vercel Function logs.'
    });
  }
}
