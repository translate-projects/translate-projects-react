// Local stand-in for the Translate Projects API: HTTP endpoints + progress WebSocket.
// "Translates" by prefixing each source text with "[lang] ".
const http = require('http');
const { WebSocketServer } = require('ws');

const startMockApi = async ({ taskMs = 150, failLangs = [] } = {}) => {
  const state = {
    sources: {}, // hashed key -> source text
    seenHashes: {}, // file hash -> content hash already synced
    requests: [],
    running: 0,
    maxRunning: 0,
  };
  const tasks = {};
  let nextTask = 0;

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const q = Object.fromEntries(url.searchParams);
      const body = raw ? JSON.parse(raw) : null;
      state.requests.push({ method: req.method, path: url.pathname, q });

      if (url.pathname === '/v1/translations/validate-changes-files') {
        const changed = {};
        for (const [file, hash] of Object.entries(body || {})) {
          if (state.seenHashes[file] !== hash) changed[file] = true;
          state.seenHashes[file] = hash;
        }
        return reply(res, 200, { status: 'ok', message: '', data: changed });
      }
      if (url.pathname === '/v1/translations/load-sources') {
        Object.assign(state.sources, body);
        const id = `sync-${nextTask++}`;
        tasks[id] = {};
        return reply(res, 200, {
          status: 'ok',
          message: '',
          data: { task_id: id },
        });
      }
      if (url.pathname === '/v1/translations/' && req.method === 'POST') {
        if (failLangs.includes(q.target_lang)) {
          return reply(res, 400, {
            status: 'error',
            message: `mock refuses ${q.target_lang}`,
          });
        }
        const id = `tr-${nextTask++}`;
        tasks[id] = { translation: true };
        return reply(res, 200, {
          status: 'ok',
          message: '',
          data: { task_id: id },
        });
      }
      if (url.pathname === '/v1/translations/language-project') {
        const data = {};
        for (const [k, v] of Object.entries(state.sources))
          data[k] = `[${q.target_lang}] ${v}`;
        return reply(res, 200, { status: 'ok', message: '', data });
      }
      reply(res, 404, { status: 'error', message: 'not found' });
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    const id = req.url.split('/').filter(Boolean).pop();
    const isTranslation = tasks[id]?.translation;
    if (isTranslation)
      state.maxRunning = Math.max(state.maxRunning, ++state.running);
    socket.send(JSON.stringify({ progress: '50' }));
    setTimeout(() => {
      if (isTranslation) state.running--;
      socket.send(JSON.stringify({ progress: '100' }));
    }, taskMs);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    count: (path) => state.requests.filter((r) => r.path === path).length,
    close: () => {
      wss.clients.forEach((c) => c.terminate());
      return new Promise((r) => server.close(r));
    },
  };
};

module.exports = { startMockApi };
