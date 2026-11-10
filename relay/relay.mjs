/**
 * Servicio de intercambio de Mi Turno.
 *
 * Guarda durante unos minutos un paquete de datos asociado a un código de 6 cifras:
 *   POST /share          { payload }  → { code, expiresIn }
 *   GET  /share/:code                 → { payload }   (y lo borra: un solo uso)
 *
 * Y mantiene «canales» de sincronización continua (identificador secreto de 32 caracteres):
 *   POST /sync           { payload }        → { channel, version, rev }
 *   GET  /sync/:channel?have=rev            → { version, rev [, payload] }  (sin payload si no ha cambiado)
 *   PUT  /sync/:channel  { base, payload }  → { version, rev }   (409 si alguien escribió antes)
 *
 * La lógica no depende de dónde se ejecute: recibe un almacén con get/put/delete.
 * worker.mjs lo conecta a Cloudflare KV; dev-server.mjs, a la memoria (para pruebas).
 */

export const TTL_SECONDS = 10 * 60;
/** Un canal sin cambios durante este tiempo se borra solo. */
export const SYNC_TTL_SECONDS = 180 * 24 * 3600;
const MAX_BYTES = 2 * 1024 * 1024;
/** Intentos fallidos permitidos por dirección en cada ventana: frena el probar códigos al azar. */
const MAX_FAILURES = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readPayload(request) {
  const text = await request.text();
  if (text.length > MAX_BYTES) return { status: 413 };
  try {
    const body = JSON.parse(text);
    if (typeof body.payload !== 'string' || !body.payload) return { status: 400 };
    return { payload: body.payload, base: body.base };
  } catch {
    return { status: 400 };
  }
}

async function handleSync(request, url, store) {
  const fail = (status) => json({ error: status === 413 ? 'too_large' : 'bad_request' }, status);
  const save = async (channel, previous, payload) => {
    // La versión nunca retrocede, aunque el canal haya caducado y se vuelva a crear.
    const next = { version: Math.max(Date.now(), (previous?.version ?? 0) + 1), rev: randomHex(8), payload };
    await store.put(`sync:${channel}`, JSON.stringify(next), SYNC_TTL_SECONDS);
    return next;
  };

  if (url.pathname === '/sync' && request.method === 'POST') {
    const body = await readPayload(request);
    if (body.status) return fail(body.status);
    const channel = randomHex(16);
    const { version, rev } = await save(channel, null, body.payload);
    return json({ channel, version, rev });
  }

  const m = url.pathname.match(/^\/sync\/([a-f0-9]{32})$/);
  if (!m) return null;
  const raw = await store.get(`sync:${m[1]}`);
  const current = raw ? JSON.parse(raw) : null;

  if (request.method === 'GET') {
    if (!current) return json({ error: 'not_found' }, 404);
    if (url.searchParams.get('have') === current.rev) return json({ version: current.version, rev: current.rev });
    return json(current);
  }
  if (request.method === 'PUT') {
    const body = await readPayload(request);
    if (body.status) return fail(body.status);
    if ((current?.version ?? 0) !== body.base) return json({ error: 'conflict' }, 409);
    const { version, rev } = await save(m[1], current, body.payload);
    return json({ version, rev });
  }
  return null;
}

/**
 * @param {Request} request
 * @param {{ get(k: string): Promise<string|null>, put(k: string, v: string, ttl: number): Promise<void>, delete(k: string): Promise<void> }} store
 * @param {string} clientId  Identificador de quien llama (su IP).
 */
export async function handle(request, store, clientId) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (url.pathname.startsWith('/sync')) {
    const res = await handleSync(request, url, store);
    if (res) return res;
  }

  if (request.method === 'POST' && url.pathname === '/share') {
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
    let payload;
    try {
      payload = JSON.parse(text).payload;
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    if (typeof payload !== 'string' || !payload) return json({ error: 'bad_request' }, 400);
    for (let i = 0; i < 20; i++) {
      const code = randomCode();
      if (await store.get(`share:${code}`)) continue;
      await store.put(`share:${code}`, payload, TTL_SECONDS);
      return json({ code, expiresIn: TTL_SECONDS });
    }
    return json({ error: 'busy' }, 503);
  }

  const m = url.pathname.match(/^\/share\/(\d{6})$/);
  if (request.method === 'GET' && m) {
    const failKey = `fail:${clientId}`;
    const failures = Number((await store.get(failKey)) ?? 0);
    if (failures >= MAX_FAILURES) return json({ error: 'too_many_attempts' }, 429);
    const payload = await store.get(`share:${m[1]}`);
    if (!payload) {
      await store.put(failKey, String(failures + 1), TTL_SECONDS);
      return json({ error: 'not_found' }, 404);
    }
    await store.delete(`share:${m[1]}`);
    return json({ payload });
  }

  return json({ error: 'not_found' }, 404);
}
