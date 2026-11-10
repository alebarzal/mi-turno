import { describe, expect, it } from 'vitest';

import { clearSent, codeKey, isNewer, mergeRemote, shiftKey, type Pending } from '../sync';
import type { CodeDef, Shift } from '../types';

const shift = (date: string, code: string, boardId: string | null = null): Shift => ({
  date,
  code,
  type: 'morning',
  segments: [],
  hours: 8,
  isHoliday: false,
  notes: '',
  boardId,
  manual: false,
});
const code = (c: string): CodeDef => ({ code: c, label: c, type: 'morning', segments: [], source: 'user', updatedAt: '' });

describe('sincronización', () => {
  it('toma lo recibido como base y vuelve a aplicar los cambios locales sin enviar', () => {
    const remote = { shifts: [shift('2026-11-01', 'M'), shift('2026-11-02', 'T'), shift('2026-11-03', 'D')], codes: [code('M'), code('T')], figures: [] };
    const local = { shifts: [shift('2026-11-01', 'D', 'b1'), shift('2026-11-02', 'T', 'b1')], codes: [code('M')], figures: [] };
    const pending: Pending = {
      [shiftKey('2026-11-01')]: shift('2026-11-01', 'D', 'b1'), // lo cambié yo
      [shiftKey('2026-11-03')]: null, // lo borré yo
      [codeKey('X')]: code('X'),
    };
    const out = mergeRemote(remote, local, pending);
    expect(out.shifts.map((s) => [s.date, s.code, s.boardId])).toEqual([
      ['2026-11-01', 'D', 'b1'],
      ['2026-11-02', 'T', 'b1'],
    ]);
    expect(out.codes.map((c) => c.code)).toEqual(['M', 'T', 'X']);
  });

  it('sin cambios locales, el teléfono queda igual que el otro', () => {
    const remote = { shifts: [shift('2026-11-05', 'TN')], codes: [code('TN')], figures: [{ month: '2026-11', pendingHours: 2, compensationHours: null, totalWorkedHours: null }] };
    const local = { shifts: [shift('2026-11-05', 'M'), shift('2026-11-06', 'M')], codes: [], figures: [] };
    expect(mergeRemote(remote, local, {})).toEqual(remote);
  });

  it('solo da por enviado lo que no ha vuelto a cambiar', () => {
    const a = shift('2026-11-01', 'M');
    const b = shift('2026-11-02', 'M');
    const sent: Pending = { [shiftKey(a.date)]: a, [shiftKey(b.date)]: b };
    const now: Pending = { [shiftKey(a.date)]: a, [shiftKey(b.date)]: shift(b.date, 'T'), [shiftKey('2026-11-03')]: null };
    expect(Object.keys(clearSent(now, sent))).toEqual([shiftKey(b.date), shiftKey('2026-11-03')]);
  });

  it('ignora respuestas antiguas del servicio', () => {
    expect(isNewer({ version: 5, rev: 'a' }, { version: 9, rev: 'b' })).toBe(false);
    expect(isNewer({ version: 9, rev: 'b' }, { version: 9, rev: 'b' })).toBe(false);
    expect(isNewer({ version: 10, rev: 'c' }, { version: 9, rev: 'b' })).toBe(true);
  });
});
