// Preload (node -r): appends "METHOD /path target_lang status" per request to $REQ_LOG
const fs = require('fs');
const orig = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const res = await orig(url, init);
  const u = new URL(url);
  fs.appendFileSync(
    process.env.REQ_LOG,
    `${init.method || 'GET'} ${u.pathname} ${u.searchParams.get('target_lang') || '-'} ${res.status}\n`
  );
  return res;
};
