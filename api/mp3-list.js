import { readdir } from 'node:fs/promises';
import path from 'node:path';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function publicMp3Path(file) {
  return `/mp3/${encodeURIComponent(file)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const candidateDirs = [
    path.join(process.cwd(), 'mp3'),
    path.join('/var/task', 'mp3')
  ];

  for (const mp3Dir of candidateDirs) {
    try {
      const files = await readdir(mp3Dir);
      const tracks = files
        .filter((file) => /\.mp3$/i.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map(publicMp3Path);

      return sendJson(res, 200, tracks);
    } catch (error) {
      // Try the next possible runtime directory.
    }
  }

  return sendJson(res, 200, []);
}
