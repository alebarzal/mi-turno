import Constants from 'expo-constants';

import type { Snapshot } from '../data/db';
import type { CodeDef, MonthFigures, Shift } from '../domain/types';

/**
 * Compartir con código de 6 cifras.
 * Quien envía sube un paquete al servicio de intercambio y recibe un código; quien recibe
 * escribe el código y descarga el paquete. El paquete caduca a los 10 minutos y solo se
 * puede descargar una vez. No incluye fotos, ajustes ni la clave de API.
 *
 * El paquete lleva además el identificador de un «canal»: a partir de ahí los dos teléfonos
 * envían y recogen los cambios por ese canal sin tener que volver a compartir.
 */

const FORMAT = 'mi-turno-share';

export interface SharePackage {
  format: typeof FORMAT;
  version: 1;
  name: string;
  sentAt: string;
  shifts: Shift[];
  codes: CodeDef[];
  figures: MonthFigures[];
  /** Canal de sincronización continua de quien envía. */
  channel?: string;
}

export class ShareError extends Error {}

/** Dirección del servicio: la de Ajustes o, si está vacía, la configurada en app.json. */
export function relayUrl(override: string): string {
  const fromConfig = (Constants.expoConfig?.extra as { shareRelayUrl?: string } | undefined)?.shareRelayUrl ?? '';
  return (override.trim() || fromConfig).replace(/\/+$/, '');
}

export function buildPackage(snap: Pick<Snapshot, 'shifts' | 'codes' | 'figures'>, name: string, channel?: string): SharePackage {
  return {
    format: FORMAT,
    version: 1,
    name,
    sentAt: new Date().toISOString(),
    shifts: snap.shifts.map((s) => ({ ...s, boardId: null })),
    codes: snap.codes,
    figures: snap.figures,
    channel,
  };
}

export function parsePackage(text: string): SharePackage {
  let p: Partial<SharePackage>;
  try {
    p = JSON.parse(text);
  } catch {
    throw new ShareError('Los datos recibidos no son válidos.');
  }
  if (p.format !== FORMAT || !Array.isArray(p.shifts) || !Array.isArray(p.codes)) {
    throw new ShareError('Los datos recibidos no son de Mi Turno.');
  }
  return {
    format: FORMAT,
    version: 1,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Sin nombre',
    sentAt: typeof p.sentAt === 'string' ? p.sentAt : new Date().toISOString(),
    shifts: p.shifts,
    codes: p.codes,
    figures: Array.isArray(p.figures) ? p.figures : [],
    channel: typeof p.channel === 'string' && /^[a-f0-9]{32}$/.test(p.channel) ? p.channel : undefined,
  };
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ShareError('No se ha podido conectar. Comprueba tu conexión a internet.');
  }
}

export async function sendPackage(base: string, pkg: SharePackage): Promise<{ code: string; expiresIn: number }> {
  if (!base) throw new ShareError('El servicio de intercambio no está configurado.');
  const res = await call(`${base}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(pkg) }),
  });
  if (res.status === 413) throw new ShareError('Hay demasiados datos para enviarlos de una vez.');
  if (!res.ok) throw new ShareError('El servicio de intercambio no responde. Inténtalo más tarde.');
  const body = (await res.json()) as { code?: string; expiresIn?: number };
  if (!body.code || !/^\d{6}$/.test(body.code)) throw new ShareError('El servicio ha devuelto una respuesta inesperada.');
  return { code: body.code, expiresIn: body.expiresIn ?? 600 };
}

export async function receivePackage(base: string, code: string): Promise<SharePackage> {
  if (!base) throw new ShareError('El servicio de intercambio no está configurado.');
  if (!/^\d{6}$/.test(code)) throw new ShareError('El código tiene 6 cifras.');
  const res = await call(`${base}/share/${code}`);
  if (res.status === 404) throw new ShareError('Código incorrecto o caducado. Pide uno nuevo.');
  if (res.status === 429) throw new ShareError('Demasiados intentos. Espera unos minutos.');
  if (!res.ok) throw new ShareError('El servicio de intercambio no responde. Inténtalo más tarde.');
  const body = (await res.json()) as { payload?: string };
  return parsePackage(body.payload ?? '');
}

// ── Canal de sincronización continua ───────────────────────────────────────

export interface RemoteState {
  version: number;
  rev: string;
  /** Ausente si el servicio no tiene nada más nuevo que lo que ya se tenía. */
  payload?: string;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function remoteState(res: Response): Promise<RemoteState> {
  const body = (await res.json()) as Partial<RemoteState>;
  if (typeof body.version !== 'number' || typeof body.rev !== 'string') throw new ShareError('El servicio ha devuelto una respuesta inesperada.');
  return { version: body.version, rev: body.rev, payload: typeof body.payload === 'string' ? body.payload : undefined };
}

/** Crea el canal con el estado inicial. */
export async function createChannel(base: string, payload: string): Promise<RemoteState & { channel: string }> {
  if (!base) throw new ShareError('El servicio de intercambio no está configurado.');
  const res = await call(`${base}/sync`, jsonInit('POST', { payload }));
  if (res.status === 413) throw new ShareError('Hay demasiados datos para enviarlos de una vez.');
  if (!res.ok) throw new ShareError('El servicio de intercambio no responde. Inténtalo más tarde.');
  const body = (await res.clone().json()) as { channel?: string };
  if (!body.channel || !/^[a-f0-9]{32}$/.test(body.channel)) throw new ShareError('El servicio ha devuelto una respuesta inesperada.');
  return { channel: body.channel, ...(await remoteState(res)) };
}

/** Estado actual del canal; null si el servicio ya no lo tiene. */
export async function pullChannel(base: string, channel: string, haveRev: string): Promise<RemoteState | null> {
  const res = await call(`${base}/sync/${channel}${haveRev ? `?have=${haveRev}` : ''}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new ShareError('El servicio de intercambio no responde. Inténtalo más tarde.');
  return remoteState(res);
}

/** Envía el estado partiendo de la versión `baseVersion`; null si otro teléfono escribió antes. */
export async function pushChannel(base: string, channel: string, baseVersion: number, payload: string): Promise<RemoteState | null> {
  const res = await call(`${base}/sync/${channel}`, jsonInit('PUT', { base: baseVersion, payload }));
  if (res.status === 409) return null;
  if (res.status === 413) throw new ShareError('Hay demasiados datos para enviarlos de una vez.');
  if (!res.ok) throw new ShareError('El servicio de intercambio no responde. Inténtalo más tarde.');
  return remoteState(res);
}
