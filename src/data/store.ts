import { useSyncExternalStore } from 'react';

import { INITIAL_CODES, toDictionary, type Dictionary } from '../domain/codes';
import type { ShiftMap } from '../domain/stats';
import { NAME_KEY, clearSent, codeKey, figuresKey, isNewer, mergeRemote, shiftKey, type PendingValue, type SyncLink } from '../domain/sync';
import { DEFAULT_SETTINGS, type Board, type CodeDef, type MonthFigures, type Settings, type SharedCalendar, type Shift } from '../domain/types';
import { deleteBoardImage } from '../services/images';
import { rescheduleNotifications } from '../services/notifications';
import { buildPackage, createChannel, parsePackage, pullChannel, pushChannel, relayUrl } from '../services/share';
import { refreshCalendarWidget } from '../widget';
import { loadAll, loadShared, persist, type Snapshot } from './db';

/**
 * Estado de la app en memoria, respaldado por SQLite.
 * Las pantallas leen con useStore(); toda modificación pasa por `actions`,
 * que actualiza la memoria, escribe en disco y reprograma los avisos.
 */
export interface State {
  ready: boolean;
  error: string | null;
  shifts: ShiftMap;
  codes: Dictionary;
  boards: Board[];
  figures: Record<string, MonthFigures>;
  settings: Settings;
  shared: SharedCalendar[];
  /** Última sincronización correcta (ISO) y, si la última falló, el motivo. */
  syncAt: string | null;
  syncError: string | null;
}

let state: State = {
  ready: false,
  error: null,
  shifts: {},
  codes: {},
  boards: [],
  figures: {},
  settings: DEFAULT_SETTINGS,
  shared: [],
  syncAt: null,
  syncError: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getState = () => state;

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNotifications() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    refreshCalendarWidget(state.shifts);
    rescheduleNotifications(state.shifts, state.settings).catch(() => {
      // Sin permiso o sin soporte: la app sigue funcionando sin avisos.
    });
  }, 400);
}

function applySnapshot(snap: Snapshot) {
  const shifts: ShiftMap = {};
  for (const s of snap.shifts) shifts[s.date] = s;
  const figures: Record<string, MonthFigures> = {};
  for (const f of snap.figures) figures[f.month] = f;
  set({
    ready: true,
    error: null,
    shifts,
    codes: toDictionary(snap.codes),
    boards: snap.boards,
    figures,
    settings: snap.settings,
  });
}

export function snapshot(): Snapshot {
  return {
    shifts: Object.values(state.shifts),
    codes: Object.values(state.codes),
    boards: state.boards,
    figures: Object.values(state.figures),
    settings: state.settings,
  };
}

// ── Sincronización continua ──────────────────────────────────────────────

function setSync(sync: SyncLink | null) {
  set({ settings: { ...state.settings, sync } });
  persist.setting('sync', sync).catch(() => {});
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void actions.syncNow(), 1200);
}

/** Apunta un cambio local para enviarlo a los teléfonos enlazados. */
function track(entries: [string, PendingValue][]) {
  const sync = state.settings.sync;
  if (!sync) return;
  const pending = { ...sync.pending };
  for (const [k, v] of entries) pending[k] = v;
  setSync({ ...sync, pending });
  scheduleSync();
}

const localPackage = (channel: string) => JSON.stringify(buildPackage(snapshot(), state.settings.employeeName, channel));

/** Deja este teléfono igual que el servicio, conservando lo que aún no ha enviado. */
async function applyRemote(payload: string, sync: SyncLink) {
  const remote = parsePackage(payload);
  const merged = mergeRemote(remote, snapshot(), sync.pending);
  const snap: Snapshot = { ...merged, boards: state.boards, settings: state.settings };
  applySnapshot(snap);
  const applied = state;
  await persist.replaceAll(snap);
  // Si se ha tocado algo mientras se escribía, el disco se pone al día con la memoria.
  if (state.shifts !== applied.shifts || state.codes !== applied.codes || state.figures !== applied.figures) {
    await persist.replaceAll(snapshot());
  }
  scheduleNotifications();
}

async function syncOwn(base: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = state.settings.sync;
    if (!before) return;
    const remote = await pullChannel(base, before.channel, before.rev);
    let sync = state.settings.sync;
    if (!sync || sync.channel !== before.channel) return;

    if (remote?.payload && !sync.full && isNewer(remote, sync)) {
      await applyRemote(remote.payload, sync);
      sync = { ...(state.settings.sync ?? sync), version: remote.version, rev: remote.rev };
      setSync(sync);
    }
    if (remote && !sync.full && Object.keys(sync.pending).length === 0) return;

    const sent = sync.pending;
    const pushed = await pushChannel(base, sync.channel, remote?.version ?? 0, localPackage(sync.channel));
    const now = state.settings.sync;
    if (!now || now.channel !== sync.channel) return;
    if (pushed) {
      setSync({ ...now, version: pushed.version, rev: pushed.rev, pending: clearSent(now.pending, sent), full: false });
      if (Object.keys(state.settings.sync?.pending ?? {}).length === 0) return;
    }
    // Conflicto (otro teléfono escribió antes) o cambios nuevos: otra vuelta.
  }
}

/** Pone al día los calendarios de otras personas que se mantienen por canal. */
async function syncShared(base: string) {
  for (const cal of state.shared) {
    if (!cal.channel) continue;
    const remote = await pullChannel(base, cal.channel, cal.rev ?? '');
    if (!remote?.payload || !isNewer(remote, { version: cal.version ?? 0, rev: cal.rev ?? '' })) continue;
    const pkg = parsePackage(remote.payload);
    if (!state.shared.some((c) => c.id === cal.id)) continue;
    await actions.saveShared({ ...cal, name: pkg.name, shifts: pkg.shifts, codes: pkg.codes, version: remote.version, rev: remote.rev });
  }
}

let syncing: Promise<void> | null = null;
let syncAgain = false;

export const actions = {
  /** Envía los cambios pendientes y recoge los de los demás. Se llama sola; no lanza errores. */
  syncNow(): Promise<void> {
    if (syncing) {
      syncAgain = true;
      return syncing;
    }
    const base = relayUrl(state.settings.relayUrl);
    if (!base || (!state.settings.sync && !state.shared.some((c) => c.channel))) return Promise.resolve();
    syncing = (async () => {
      try {
        await syncOwn(base);
        await syncShared(base);
        set({ syncAt: new Date().toISOString(), syncError: null });
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'No se ha podido sincronizar.' });
      } finally {
        syncing = null;
        if (syncAgain) {
          syncAgain = false;
          scheduleSync();
        }
      }
    })();
    return syncing;
  },

  /** Crea (si hace falta) el canal de este teléfono y lo devuelve, para incluirlo al compartir. */
  async ensureChannel(): Promise<string> {
    const existing = state.settings.sync;
    if (existing) {
      await actions.syncNow();
      return existing.channel;
    }
    const created = await createChannel(relayUrl(state.settings.relayUrl), JSON.stringify(buildPackage(snapshot(), state.settings.employeeName)));
    setSync({ channel: created.channel, version: created.version, rev: created.rev, pending: {}, full: false });
    return created.channel;
  },

  /** Enlaza este teléfono a un canal recibido: a partir de ahora los dos comparten los mismos datos. */
  async joinChannel(channel: string) {
    setSync({ channel, version: 0, rev: '', pending: {}, full: false });
    await actions.syncNow();
  },

  /** Deja de sincronizar este teléfono. Los datos que ya tiene se conservan. */
  async stopSync() {
    setSync(null);
  },

  async init() {
    try {
      const snap = await loadAll();
      const shared = await loadShared();
      applySnapshot(snap);
      set({ shared });
      scheduleNotifications();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  async saveShift(shift: Shift) {
    set({ shifts: { ...state.shifts, [shift.date]: shift } });
    track([[shiftKey(shift.date), shift]]);
    await persist.shifts([shift]);
    scheduleNotifications();
  },

  async saveShifts(list: Shift[]) {
    const shifts = { ...state.shifts };
    for (const s of list) shifts[s.date] = s;
    set({ shifts });
    track(list.map((s) => [shiftKey(s.date), s]));
    await persist.shifts(list);
    scheduleNotifications();
  },

  async deleteShift(date: string) {
    const shifts = { ...state.shifts };
    delete shifts[date];
    set({ shifts });
    track([[shiftKey(date), null]]);
    await persist.deleteShift(date);
    scheduleNotifications();
  },

  async saveCode(code: CodeDef) {
    set({ codes: { ...state.codes, [code.code]: code } });
    track([[codeKey(code.code), code]]);
    await persist.code(code);
  },

  async deleteCode(code: string) {
    const codes = { ...state.codes };
    delete codes[code];
    set({ codes });
    track([[codeKey(code), null]]);
    await persist.deleteCode(code);
  },

  async saveBoard(board: Board) {
    set({ boards: [board, ...state.boards.filter((b) => b.id !== board.id)].sort((a, b) => b.importedAt.localeCompare(a.importedAt)) });
    await persist.board(board);
  },

  /** Borra la cartelera del historial. Los turnos ya guardados en el calendario se conservan. */
  async deleteBoard(id: string) {
    const board = state.boards.find((b) => b.id === id);
    const shifts = { ...state.shifts };
    for (const s of Object.values(shifts)) if (s.boardId === id) shifts[s.date] = { ...s, boardId: null };
    set({ boards: state.boards.filter((b) => b.id !== id), shifts });
    await persist.deleteBoard(id);
    deleteBoardImage(board?.imageUri ?? null);
  },

  async saveShared(c: SharedCalendar) {
    set({ shared: [c, ...state.shared.filter((x) => x.id !== c.id)] });
    await persist.shared(c);
  },

  async deleteShared(id: string) {
    set({ shared: state.shared.filter((x) => x.id !== id) });
    await persist.deleteShared(id);
  },

  async saveFigures(f: MonthFigures) {
    set({ figures: { ...state.figures, [f.month]: f } });
    track([[figuresKey(f.month), f]]);
    await persist.figures(f);
  },

  async updateSettings(patch: Partial<Settings>) {
    set({ settings: { ...state.settings, ...patch } });
    if ('employeeName' in patch) track([[NAME_KEY, true]]);
    for (const [k, v] of Object.entries(patch)) await persist.setting(k, v);
    scheduleNotifications();
  },

  async restore(input: Snapshot) {
    // El enlace de sincronización es de este teléfono: se conserva y lo restaurado se envía entero.
    const link = state.settings.sync;
    const snap: Snapshot = { ...input, settings: { ...input.settings, sync: link ? { ...link, pending: {}, full: true } : null } };
    await persist.replaceAll(snap);
    applySnapshot(snap);
    scheduleNotifications();
    if (link) scheduleSync();
  },

  async eraseAll() {
    for (const b of state.boards) deleteBoardImage(b.imageUri);
    const empty: Snapshot = { shifts: [], codes: INITIAL_CODES, boards: [], figures: [], settings: DEFAULT_SETTINGS };
    await persist.replaceAll(empty);
    await persist.deleteShared(null);
    applySnapshot(empty);
    set({ shared: [], syncAt: null, syncError: null });
    scheduleNotifications();
  },
};
