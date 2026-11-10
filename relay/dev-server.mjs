// Servidor local para probar el intercambio sin desplegar nada:  node relay/dev-server.mjs
import { createServer } from 'node:http';
import { handle } from './relay.mjs';

const data = new Map();
const store = {
  async get(k) {
    const e = data.get(k);
    if (!e) return null;
    if (e.expires < Date.now()) {
      data.delete(k);
      return null;
    }
    return e.value;
  },
  async put(k, value, ttl) {
    data.set(k, { value, expires: Date.now() + ttl * 1000 });
  },
  async delete(k) {
    data.delete(k);
  },
};

const port = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request, store, req.socket.remoteAddress ?? 'local');
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(port, () => console.log(`Intercambio de Mi Turno en http://localhost:${port}`));
