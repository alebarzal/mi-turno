import { describe, expect, it } from 'vitest';
import { handle } from './relay.mjs';

function memory() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const post = (payload) => new Request('http://x/share', { method: 'POST', body: JSON.stringify({ payload }) });
const get = (code) => new Request(`http://x/share/${code}`);

describe('servicio de intercambio', () => {
  it('entrega el paquete una sola vez con un código de 6 cifras', async () => {
    const store = memory();
    const { code } = await (await handle(post('hola'), store, 'a')).json();
    expect(code).toMatch(/^\d{6}$/);
    expect(await (await handle(get(code), store, 'b')).json()).toEqual({ payload: 'hola' });
    expect((await handle(get(code), store, 'b')).status).toBe(404);
  });

  it('bloquea a quien prueba códigos al azar', async () => {
    const store = memory();
    const { code } = await (await handle(post('secreto'), store, 'a')).json();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 8; i++) expect((await handle(get(wrong), store, 'malo')).status).toBe(404);
    expect((await handle(get(code), store, 'malo')).status).toBe(429);
    // Otra persona sí puede recogerlo.
    expect((await handle(get(code), store, 'bueno')).status).toBe(200);
  });

  it('mantiene un canal de sincronización con control de versiones', async () => {
    const store = memory();
    const req = (method, path, body) => new Request(`http://x${path}`, { method, body: body ? JSON.stringify(body) : undefined });
    const created = await (await handle(req('POST', '/sync', { payload: 'v1' }), store, 'a')).json();
    expect(created.channel).toMatch(/^[a-f0-9]{32}$/);
    const path = `/sync/${created.channel}`;
    expect(await (await handle(req('GET', path), store, 'b')).json()).toEqual({ version: created.version, rev: created.rev, payload: 'v1' });
    // Sin cambios: no se vuelve a descargar el contenido.
    expect(await (await handle(req('GET', `${path}?have=${created.rev}`), store, 'b')).json()).toEqual({ version: created.version, rev: created.rev });
    const second = await (await handle(req('PUT', path, { base: created.version, payload: 'v2' }), store, 'b')).json();
    expect(second.version).toBeGreaterThan(created.version);
    // Quien escribe partiendo de una versión antigua recibe un conflicto.
    expect((await handle(req('PUT', path, { base: created.version, payload: 'viejo' }), store, 'a')).status).toBe(409);
    expect((await (await handle(req('GET', path), store, 'a')).json()).payload).toBe('v2');
    // Un canal caducado se puede volver a crear partiendo de cero.
    const other = `/sync/${'0'.repeat(32)}`;
    expect((await handle(req('GET', other), store, 'a')).status).toBe(404);
    expect((await handle(req('PUT', other, { base: 0, payload: 'x' }), store, 'a')).status).toBe(200);
  });

  it('rechaza peticiones mal formadas', async () => {
    expect((await handle(post(''), memory(), 'a')).status).toBe(400);
    expect((await handle(new Request('http://x/share/12'), memory(), 'a')).status).toBe(404);
  });
});
