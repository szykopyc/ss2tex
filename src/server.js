const http = require('node:http');
const ocr = require('./ocr');

const PORT = Number(process.env.PORT ?? 8000);
const MAX_BYTES = 20 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('image too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    return res.writeHead(200, { 'content-type': 'text/plain' }).end('ss2tex');
  }
  if (req.url !== '/ocr' || req.method !== 'POST') return res.writeHead(404).end();

  try {
    const image = await readBody(req);
    const latex = await ocr.toLatex(new Blob([image]));
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(latex);
  } catch (err) {
    res.writeHead(err.status ?? 400, { 'content-type': 'text/plain; charset=utf-8' }).end(err.message);
  }
});

ocr.load().then(() => server.listen(PORT, () => console.log(`ss2tex listening on :${PORT}`)));
