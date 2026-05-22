// /api/leaderboard.js
// Dice Rush shared leaderboard for Vercel Blob.
// Safe for several open tabs/devices:
// 1) read current Blob
// 2) merge incoming scores
// 3) write with ETag ifMatch
// 4) retry if another tab wrote first

const DEFAULT_PATH = 'leaderboard.json';
const FALLBACK_PATHS = [
  'leaderboard.json',
  'dice-rush-leaderboard.json',
  'dice-rush/leaderboard.json'
];

const TOP_LIMIT = 10;
const MAX_WRITE_ATTEMPTS = 10;

function token() {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

function blobAccess() {
  return String(process.env.BLOB_ACCESS || 'public').toLowerCase() === 'private'
    ? 'private'
    : 'public';
}

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function cleanName(value, fallback) {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || fallback || 'Player';
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function cleanEntry(entry, index) {
  if (!entry || typeof entry !== 'object') return null;

  const score = Math.floor(safeNumber(entry.score, 0));
  if (!Number.isFinite(score) || score <= 0) return null;

  const rawPlayers = Math.floor(safeNumber(entry.players, 1));
  const players = Math.max(1, Math.min(2, rawPlayers));
  const mode = entry.mode === 'multiplayer' || players >= 2 ? 'multiplayer' : 'single';

  const names = Array.isArray(entry.playerNames)
    ? entry.playerNames.map(function(name, i) {
        return cleanName(name, 'Player ' + (i + 1));
      }).slice(0, 2)
    : [];

  const createdAt = entry.createdAt ? String(entry.createdAt) : nowIso();

  return {
    id: String(entry.id || 'server-' + createdAt + '-' + index + '-' + Math.random().toString(36).slice(2, 8)),
    name: cleanName(entry.name, 'Player ' + (index + 1)),
    score: score,
    mode: mode,
    players: mode === 'multiplayer' ? Math.max(2, players) : 1,
    playerIndex: Math.max(1, Math.min(2, Math.floor(safeNumber(entry.playerIndex, index + 1)))),
    playerNames: names,
    targetMode: entry.targetMode === 'pick' ? 'pick' : 'forced',
    createdAt: createdAt
  };
}

function entrySignature(entry) {
  const names = Array.isArray(entry.playerNames)
    ? entry.playerNames.map(function(name) {
        return cleanName(name, 'Player').toLowerCase();
      }).join(' vs ')
    : '';

  return [
    cleanName(entry.name, 'Player').toLowerCase(),
    Math.floor(safeNumber(entry.score, 0)),
    entry.mode === 'multiplayer' ? 'multi' : 'single',
    Math.floor(safeNumber(entry.players, 1)),
    Math.floor(safeNumber(entry.playerIndex, 1)),
    entry.targetMode === 'pick' ? 'pick' : 'forced',
    names
  ].join('|');
}

function sortedTop(entries) {
  const map = new Map();
  const list = Array.isArray(entries) ? entries : [];

  list.forEach(function(entry, index) {
    const clean = cleanEntry(entry, index);
    if (!clean) return;

    const sig = entrySignature(clean);
    const old = map.get(sig);

    if (!old || String(clean.createdAt).localeCompare(String(old.createdAt)) < 0) {
      map.set(sig, clean);
    }
  });

  return Array.from(map.values())
    .sort(function(a, b) {
      return Number(b.score || 0) - Number(a.score || 0)
        || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    })
    .slice(0, TOP_LIMIT);
}

function normalizeBoard(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const board = root.leaderboard && typeof root.leaderboard === 'object'
    ? root.leaderboard
    : root;

  if (Array.isArray(board.scores)) {
    return { scores: sortedTop(board.scores) };
  }

  const legacy = [];

  if (Array.isArray(board.single)) {
    board.single.forEach(function(entry) {
      legacy.push(entry);
    });
  }

  if (Array.isArray(board.multiplayer)) {
    board.multiplayer.forEach(function(entry) {
      legacy.push(entry);
    });
  }

  return { scores: sortedTop(legacy) };
}

function boardsEqual(a, b) {
  const aa = sortedTop(a && a.scores ? a.scores : []).map(entrySignature).join('\n');
  const bb = sortedTop(b && b.scores ? b.scores : []).map(entrySignature).join('\n');
  return aa === bb;
}

function errorText(error) {
  return String(
    (error && error.name ? error.name : '') + ' ' +
    (error && error.message ? error.message : '') + ' ' +
    (error && error.status ? error.status : '') + ' ' +
    (error && error.statusCode ? error.statusCode : '')
  ).toLowerCase();
}

function isNotFound(error) {
  const text = errorText(error);
  return text.includes('notfound')
    || text.includes('not found')
    || text.includes('blobnotfound')
    || error && (error.status === 404 || error.statusCode === 404);
}

function isRetryableWriteError(error) {
  const text = errorText(error);
  return text.includes('precondition')
    || text.includes('etag')
    || text.includes('conflict')
    || text.includes('already exists')
    || text.includes('blobpreconditionfailederror')
    || error && (
      error.status === 409 ||
      error.statusCode === 409 ||
      error.status === 412 ||
      error.statusCode === 412
    );
}

async function blobSdk() {
  return import('@vercel/blob');
}

async function resolvePath(sdk) {
  if (process.env.LEADERBOARD_BLOB_PATH) {
    return process.env.LEADERBOARD_BLOB_PATH;
  }

  for (let i = 0; i < FALLBACK_PATHS.length; i += 1) {
    const pathname = FALLBACK_PATHS[i];

    try {
      await sdk.head(pathname, { token: token() });
      return pathname;
    } catch (error) {
      if (!isNotFound(error)) {
        continue;
      }
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
    const result = await reader.read();
    if (result.done) break;
    chunks.push(Buffer.from(result.value));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {};
  }
}

function withCacheBust(url) {
  const sep = String(url).includes('?') ? '&' : '?';
  return String(url) + sep + 'leaderboard_t=' + Date.now();
}

async function readCurrentBoard(sdk, pathname) {
  const access = blobAccess();
  const rwToken = token();

  if (typeof sdk.get === 'function') {
    try {
      const result = await sdk.get(pathname, {
        access: access,
        token: rwToken
      });

      if (!result) {
        return {
          exists: false,
          etag: null,
          board: { scores: [] },
          updatedAt: null
        };
      }

      if (result.statusCode && result.statusCode !== 200 && result.statusCode !== 304) {
        throw new Error('Blob get failed with status ' + result.statusCode);
      }

      const text = result.stream ? await streamToText(result.stream) : '';
      const parsed = parseJson(text);

      return {
        exists: true,
        etag: result.blob && result.blob.etag ? result.blob.etag : null,
        board: normalizeBoard(parsed),
        updatedAt: parsed.updatedAt || null
      };
    } catch (error) {
      if (isNotFound(error)) {
        return {
          exists: false,
          etag: null,
          board: { scores: [] },
          updatedAt: null
        };
      }

      throw error;
    }
  }

  try {
    const meta = await sdk.head(pathname, { token: rwToken });
    const url = meta.downloadUrl || meta.url;

    if (!url) {
      throw new Error('Blob metadata had no readable URL.');
    }

    const headers = {};
    if (rwToken) {
      headers.Authorization = 'Bearer ' + rwToken;
    }

    const response = await fetch(withCacheBust(url), {
      cache: 'no-store',
      headers: headers
    });

    if (!response.ok) {
      throw new Error('Blob fetch failed with status ' + response.status);
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
        board: { scores: [] },
        updatedAt: null
      };
    }

    throw error;
  }
}

async function writeBoard(sdk, pathname, board, current) {
  const options = {
    access: blobAccess(),
    token: token(),
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    addRandomSuffix: false
  };

  if (current && current.exists && current.etag) {
    options.allowOverwrite = true;
    options.ifMatch = current.etag;
  } else if (current && current.exists) {
    options.allowOverwrite = true;
  } else {
    options.allowOverwrite = false;
  }

  const payload = {
    leaderboard: {
      scores: sortedTop(board.scores || [])
    },
    updatedAt: nowIso()
  };

  return sdk.put(pathname, JSON.stringify(payload, null, 2), options);
}

function extractIncomingEntries(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.entries)) return body.entries;
  if (Array.isArray(body.scores)) return body.scores;
  if (body.leaderboard && Array.isArray(body.leaderboard.scores)) return body.leaderboard.scores;
  if (body.entry) return [body.entry];
  return [];
}

async function mergeAndSave(incomingEntries) {
  const sdk = await blobSdk();
  const pathname = await resolvePath(sdk);
  const incoming = sortedTop(incomingEntries);

  if (!incoming.length) {
    const currentOnly = await readCurrentBoard(sdk, pathname);
    return {
      saved: false,
      attempts: 0,
      pathname: pathname,
      board: currentOnly.board,
      etag: currentOnly.etag,
      updatedAt: currentOnly.updatedAt
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await readCurrentBoard(sdk, pathname);
    const existingScores = current.board && Array.isArray(current.board.scores)
      ? current.board.scores
      : [];

    const nextBoard = {
      scores: sortedTop(existingScores.concat(incoming))
    };

    if (boardsEqual(current.board, nextBoard)) {
      return {
        saved: false,
        attempts: attempt,
        pathname: pathname,
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
        pathname: pathname,
        board: nextBoard,
        etag: written && written.etag ? written.etag : null,
        updatedAt: nowIso()
      };
    } catch (error) {
      lastError = error;

      if (!isRetryableWriteError(error)) {
        break;
      }

      if (attempt >= MAX_WRITE_ATTEMPTS) {
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
  } catch (error) {
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

  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET') {
      const sdk = await blobSdk();
      const pathname = await resolvePath(sdk);
      const current = await readCurrentBoard(sdk, pathname);

      return sendJson(res, 200, {
        ok: true,
        saved: false,
        pathname: pathname,
        leaderboard: current.board,
        scores: current.board.scores,
        count: current.board.scores.length,
        updatedAt: current.updatedAt,
        online: true
      });
    }

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const incoming = extractIncomingEntries(body);
      const result = await mergeAndSave(incoming);

      return sendJson(res, 200, {
        ok: true,
        saved: result.saved,
        attempts: result.attempts,
        pathname: result.pathname,
        leaderboard: result.board,
        scores: result.board.scores,
        count: result.board.scores.length,
        updatedAt: result.updatedAt,
        online: true
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
      error: 'Blob leaderboard failed: ' + (error && error.message ? error.message : String(error)),
      name: error && error.name ? error.name : 'Error'
    });
  }
};
