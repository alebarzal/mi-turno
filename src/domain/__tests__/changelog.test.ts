import { describe, expect, it } from 'vitest';

import { CHANGELOG, latestChangelog, shouldShowChangelog } from '../changelog';

describe('novedades', () => {
  it('cada entrada tiene un id distinto', () => {
    expect(new Set(CHANGELOG.map((e) => e.id)).size).toBe(CHANGELOG.length);
    expect(latestChangelog().items.length).toBeGreaterThan(0);
  });

  it('se enseñan una vez a quien actualiza', () => {
    expect(shouldShowChangelog('', true)).toBe(true); // venía de una versión sin novedades
    expect(shouldShowChangelog('2026-11-13-uso', false)).toBe(true);
    expect(shouldShowChangelog(latestChangelog().id, true)).toBe(false);
  });

  it('no en una instalación nueva', () => {
    expect(shouldShowChangelog('', false)).toBe(false);
  });
});
