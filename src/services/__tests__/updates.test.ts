import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

import { isNewer, parseRelease } from '../updates';

const release = {
  tag_name: 'build-107',
  name: 'Mi Turno 1.0.107',
  published_at: '2026-11-13T18:00:00Z',
  body: 'Botón para actualizar desde GitHub\n\nsha: 0123456789abcdef0123456789abcdef01234567\n',
  assets: [
    { name: 'notas.txt', browser_download_url: 'https://x/notas.txt', size: 3 },
    { name: 'MiTurno.apk', browser_download_url: 'https://x/MiTurno.apk', size: 52_000_000 },
  ],
};

describe('actualizaciones', () => {
  it('lee la versión publicada', () => {
    expect(parseRelease(release)).toEqual({
      build: 107,
      sha: '0123456789abcdef0123456789abcdef01234567',
      title: 'Botón para actualizar desde GitHub',
      date: '2026-11-13T18:00:00Z',
      apkUrl: 'https://x/MiTurno.apk',
      size: 52_000_000,
    });
  });

  it('descarta lo que no es una compilación con APK', () => {
    expect(parseRelease({ ...release, tag_name: 'v1' })).toBeNull();
    expect(parseRelease({ ...release, assets: [] })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('solo ofrece versiones más nuevas', () => {
    const u = parseRelease(release)!;
    expect(isNewer(u, { build: 0, sha: '' })).toBe(true);
    expect(isNewer(u, { build: 107, sha: '' })).toBe(false);
    expect(isNewer(u, { build: 110, sha: '' })).toBe(false);
  });
});
