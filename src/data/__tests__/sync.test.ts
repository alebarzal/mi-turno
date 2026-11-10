import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handle } from '../../../relay/relay.mjs';
import type { Shift } from '../../domain/types';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { shareRelayUrl: 'http://relay' } } } }));
vi.mock('../../services/notifications', () => ({ rescheduleNotifications: async () => {} }));
vi.mock('../../services/images', () => ({ deleteBoardImage: () => {} }));
vi.mock('../../widget', () => ({ refreshCalendarWidget: () => {} }));
vi.mock('../db', async () => {
  const { DEFAULT_SETTINGS } = await import('../../domain/types');
  const noop = async () => {};
  return {
    loadAll: async () => ({ shifts: [], codes: [], boards: [], figures: [], settings: DEFAULT_SETTINGS }),
    loadShared: async () => [],
    persist: new Proxy({}, { get: () => noop }),
  };
});

const shift = (date: string, code: string): Shift => ({
  date,
  code,
  type: 'morning',
  segments: [{ start: '07:00', end: '15:00' }],
  hours: 8,
  isHoliday: false,
  notes: '',
  boardId: null,
  manual: true,
});

/** Cada llamada devuelve un «teléfono» distinto, con su propio estado. */
async function phone() {
  vi.resetModules();
  const store = await import('../store');
  await store.actions.init();
  const codes = () => Object.values(store.getState().shifts).map((s) => `${s.date.slice(8)}${s.code}`).sort().join(' ');
  return { ...store, codes };
}

describe('dos teléfonos enlazados', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    const kv = {
      get: async (k: string) => data.get(k) ?? null,
      put: async (k: string, v: string) => void data.set(k, v),
      delete: async (k: string) => void data.delete(k),
    };
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => handle(new Request(url, init), kv, 'test'));
  });

  it('lo que cambia uno aparece en el otro sin volver a compartir', async () => {
    const a = await phone();
    await a.actions.saveShifts([shift('2026-11-01', 'M'), shift('2026-11-02', 'T')]);
    const channel = await a.actions.ensureChannel();

    const b = await phone();
    await b.actions.saveShift(shift('2026-11-09', 'X')); // lo que tuviera antes se sustituye
    await b.actions.restore({ shifts: [], codes: [], boards: [], figures: [], settings: b.getState().settings });
    await b.actions.joinChannel(channel);
    expect(b.codes()).toBe('01M 02T');

    // A cambia un turno → llega a B.
    await a.actions.saveShift(shift('2026-11-02', 'D'));
    await a.actions.syncNow();
    await b.actions.syncNow();
    expect(b.codes()).toBe('01M 02D');

    // B cambia y borra → llega a A.
    await b.actions.saveShift(shift('2026-11-03', 'TN'));
    await b.actions.deleteShift('2026-11-01');
    await b.actions.syncNow();
    await a.actions.syncNow();
    expect(a.codes()).toBe('02D 03TN');

    // Los dos cambian días distintos a la vez: no se pisan.
    await a.actions.saveShift(shift('2026-11-10', 'M'));
    await b.actions.saveShift(shift('2026-11-11', 'T'));
    await a.actions.syncNow();
    await b.actions.syncNow();
    await a.actions.syncNow();
    expect(a.codes()).toBe('02D 03TN 10M 11T');
    expect(b.codes()).toBe(a.codes());
    expect(a.getState().settings.sync?.pending).toEqual({});
    expect(b.getState().settings.sync?.pending).toEqual({});
    expect(a.getState().syncError).toBeNull();
  });

  it('el calendario guardado de otra persona se pone al día solo', async () => {
    const a = await phone();
    await a.actions.updateSettings({ employeeName: 'ALEX' });
    await a.actions.saveShift(shift('2026-11-01', 'M'));
    const channel = await a.actions.ensureChannel();

    const c = await phone();
    await c.actions.saveShift(shift('2026-11-20', 'CS'));
    await c.actions.saveShared({ id: 'x', name: 'ALEX', receivedAt: '', shifts: [shift('2026-11-01', 'M')], codes: [], channel });

    await a.actions.saveShift(shift('2026-11-01', 'T'));
    await a.actions.saveShift(shift('2026-11-02', 'D'));
    await a.actions.syncNow();
    await c.actions.syncNow();
    expect(c.getState().shared[0].shifts.map((s) => s.code).sort()).toEqual(['D', 'T']);
    // Los turnos propios de quien mira no se tocan.
    expect(c.codes()).toBe('20CS');
  });

  it('si deja de sincronizar, ya no envía nada', async () => {
    const a = await phone();
    await a.actions.saveShift(shift('2026-11-01', 'M'));
    const channel = await a.actions.ensureChannel();
    const b = await phone();
    await b.actions.joinChannel(channel);
    await b.actions.stopSync();
    await b.actions.saveShift(shift('2026-11-01', 'T'));
    await b.actions.syncNow();
    await a.actions.syncNow();
    expect(a.codes()).toBe('01M');
  });
});
