import type { CodeDef, MonthFigures, Shift } from './types';

/**
 * Sincronización continua entre teléfonos enlazados con un código.
 *
 * Cada teléfono apunta sus cambios locales aún no enviados en `pending` (clave → valor nuevo,
 * o null si se borró). Al recibir el estado del servicio se toma ese estado como base y se
 * vuelven a aplicar encima los cambios pendientes: así nadie pisa lo que el otro acaba de
 * cambiar, salvo que los dos toquen el mismo día (gana el último en enviarlo).
 */
export type PendingValue = Shift | CodeDef | MonthFigures | null | true;
export type Pending = Record<string, PendingValue>;

export interface SyncLink {
  /** Identificador secreto del canal en el servicio de intercambio. */
  channel: string;
  /** Última versión del servicio que este teléfono ya tiene aplicada. */
  version: number;
  rev: string;
  pending: Pending;
  /** El estado local manda entero (p. ej. tras restaurar una copia): se envía sin mezclar. */
  full: boolean;
}

export interface SyncData {
  shifts: Shift[];
  codes: CodeDef[];
  figures: MonthFigures[];
}

export const shiftKey = (date: string) => `s:${date}`;
export const codeKey = (code: string) => `c:${code}`;
export const figuresKey = (month: string) => `f:${month}`;
/** Cambio que no es un dato concreto (el nombre): solo obliga a enviar. */
export const NAME_KEY = 'n';

export function isNewer(remote: { version: number; rev: string }, have: { version: number; rev: string }): boolean {
  return remote.version > have.version || (remote.version === have.version && remote.rev !== have.rev);
}

export function mergeRemote(remote: SyncData, local: SyncData, pending: Pending): SyncData {
  // La cartelera de origen de cada turno es propia de cada teléfono: se conserva la local.
  const boardOf = new Map(local.shifts.map((s) => [s.date, s.boardId]));
  const shifts = new Map(remote.shifts.map((s) => [s.date, { ...s, boardId: boardOf.get(s.date) ?? null }]));
  const codes = new Map(remote.codes.map((c) => [c.code, c]));
  const figures = new Map(remote.figures.map((f) => [f.month, f]));

  for (const [key, value] of Object.entries(pending)) {
    const id = key.slice(2);
    const target: Map<string, unknown> | null = key.startsWith('s:') ? shifts : key.startsWith('c:') ? codes : key.startsWith('f:') ? figures : null;
    if (!target) continue;
    if (value === null) target.delete(id);
    else if (value !== true) target.set(id, value);
  }
  return { shifts: [...shifts.values()], codes: [...codes.values()], figures: [...figures.values()] };
}

/** Quita de `pending` lo que ya se ha enviado, salvo lo que haya vuelto a cambiar mientras tanto. */
export function clearSent(pending: Pending, sent: Pending): Pending {
  const rest: Pending = {};
  for (const [k, v] of Object.entries(pending)) if (!(k in sent) || sent[k] !== v) rest[k] = v;
  return rest;
}
