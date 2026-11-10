// Entrada para Cloudflare Workers. Necesita un espacio KV enlazado como SHARES (ver wrangler.toml).
import { handle } from './relay.mjs';

export default {
  async fetch(request, env) {
    const store = {
      get: (k) => env.SHARES.get(k),
      // KV exige una caducidad mínima de 60 segundos.
      put: (k, v, ttl) => env.SHARES.put(k, v, { expirationTtl: Math.max(60, ttl) }),
      delete: (k) => env.SHARES.delete(k),
    };
    return handle(request, store, request.headers.get('CF-Connecting-IP') ?? 'unknown');
  },
};
