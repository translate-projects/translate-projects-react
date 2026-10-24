// Local stand-in for the Translate Projects API: HTTP endpoints + progress WebSocket.
// Mirrors api.translateprojects.dev (checked 2026-10-25): a missing or wrong token
// gets 401 UNAUTHORIZED "Token no válido" on every endpoint.
// "Translates" by prefixing each source text with "[lang] ".
const http = require('http');
const { WebSocketServer } = require('ws');

/**
 * @param {object} opts
 * @param {string} [opts.token] valid API key
 * @param {number} [opts.taskMs] time each task takes before reaching 100 %
 * @param {Array<{path: string, status: number, times?: number, lang?: string, code?: string}>} [opts.failures]
 *   answer `status` to the first `times` (default: all) matching requests
 * @param {string[]} [opts.untranslatable] source texts the backend cannot translate
 *   because the project has no AI key: POST answers PARTIAL / MISSING_API_KEY and GET
 *   lacks them. The array is read live, so a test can empty it to "configure the key"
 *   (what MISSING_API_KEY looks like from the client: GET simply lacks them)
 * @param {string[]} [opts.stallLangs] translation tasks that never reach 100 %
 */
const startMockApi = async ({
  token = 'test-key',
  taskMs = 150,
  failures = [],
  untranslatable = [],
  stallLangs = [],
} = {}) => {
  const state = {
    sources: {}, // hashed key -> source text
    synced: new Set(), // content hashes already loaded with load-sources
    requests: [],
    running: 0,
    maxRunning: 0,
  };
  const tasks = {};
  let nextTask = 0;
  const rules = failures.map((f) => ({ times: Infinity, ...f }));

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const ok = (res, data, message = '') =>
    reply(res, 200, { status: 'SUCCESS', message, data, code: 200 });
  const fail = (res, status, code, message) =>
    reply(res, status, { status: 'FAILURE', code, message });

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const q = Object.fromEntries(url.searchParams);
      const body = raw ? JSON.parse(raw) : null;
      const auth = req.headers.authorization || '';
      state.requests.push({ method: req.method, path: url.pathname, q, auth });

      const rule = rules.find(
        (r) =>
          r.times > 0 &&
          r.path === url.pathname &&
          (!r.lang || r.lang === q.target_lang)
      );
      if (rule) {
        rule.times--;
        return fail(
          res,
          rule.status,
          rule.code || 'UNKNOWN_ERROR',
          `mock ${rule.status} ${q.target_lang || ''}`.trim()
        );
      }

      if (auth !== `Token ${token}`) {
        return fail(res, 401, 'UNAUTHORIZED', 'Token no válido');
      }

      if (url.pathname === '/v1/translations/validate-changes-files') {
        const changed = {};
        for (const [file, hash] of Object.entries(body || {})) {
          if (!state.synced.has(hash)) changed[file] = hash;
        }
        return ok(res, changed, 'Change detected');
      }
      if (url.pathname === '/v1/translations/language-project') {
        const data = {};
        for (const [k, v] of Object.entries(state.sources)) {
          if (!untranslatable.includes(v)) data[k] = `[${q.target_lang}] ${v}`;
        }
        return ok(res, data, 'Translations');
      }

      if (url.pathname === '/v1/translations/load-sources') {
        Object.assign(state.sources, body);
        state.synced.add(q.cache_hash);
        const id = `sync-${nextTask++}`;
        tasks[id] = {};
        return ok(res, { task_id: id }, 'Task created');
      }
      if (url.pathname === '/v1/translations/' && req.method === 'POST') {
        const id = `tr-${nextTask++}`;
        tasks[id] = {
          translation: true,
          stall: stallLangs.includes(q.target_lang),
        };
        if (untranslatable.length) {
          return reply(res, 200, {
            status: 'PARTIAL',
            code: 'MISSING_API_KEY',
            error: 'MISSING_API_KEY',
            message:
              'Configura el modelo y la API key de IA del proyecto para traducir los textos nuevos.',
            data: { task_id: id },
          });
        }
        return ok(res, { task_id: id }, 'Task created');
      }
      fail(res, 404, 'UNKNOWN_ERROR', 'not found');
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    const task = tasks[req.url.split('/').filter(Boolean).pop()] || {};
    if (task.translation)
      state.maxRunning = Math.max(state.maxRunning, ++state.running);
    socket.send(JSON.stringify({ progress: '50' }));
    setTimeout(() => {
      if (task.translation) state.running--;
      if (task.stall) return socket.close(); // dies before 100 %
      socket.send(JSON.stringify({ progress: '100' }));
    }, taskMs);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    count: (path, lang) =>
      state.requests.filter(
        (r) => r.path === path && (!lang || r.q.target_lang === lang)
      ).length,
    // add a failure rule at runtime (same shape as opts.failures)
    failNext: (rule) => rules.push({ times: Infinity, ...rule }),
    close: () => {
      wss.clients.forEach((c) => c.terminate());
      return new Promise((r) => server.close(r));
    },
  };
};

module.exports = { startMockApi };
