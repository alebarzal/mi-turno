import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';

/**
 * Actualizaciones desde GitHub: cada push a master compila un APK y lo publica como «release»
 * con la etiqueta `build-<número>` (ver .github/workflows/apk.yml). La app compara ese número
 * con el suyo y, si hay uno más nuevo, lo descarga y abre el instalador de Android.
 */

export type Update = {
  build: number;
  sha: string;
  title: string;
  date: string;
  apkUrl: string;
  size: number;
};

const REPO: string = Constants.expoConfig?.extra?.updatesRepo ?? 'alebarzal/mi-turno';

/** Lo inyecta la compilación de GitHub; en una compilación hecha a mano vale 0. */
export const CURRENT = {
  build: Number(process.env.EXPO_PUBLIC_BUILD_NUMBER) || 0,
  sha: process.env.EXPO_PUBLIC_BUILD_SHA ?? '',
};

export function currentLabel(): string {
  return CURRENT.build ? `Versión 1.0.${CURRENT.build} (${CURRENT.sha.slice(0, 7)})` : 'Versión compilada a mano';
}

/** Convierte la respuesta de la API de GitHub en una actualización, o null si no sirve. */
export function parseRelease(json: unknown): Update | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, any>;
  const m = /^build-(\d+)$/.exec(String(r.tag_name ?? ''));
  const apk = Array.isArray(r.assets) ? r.assets.find((a: any) => typeof a?.name === 'string' && a.name.endsWith('.apk')) : null;
  if (!m || !apk?.browser_download_url) return null;
  const body = String(r.body ?? '');
  return {
    build: Number(m[1]),
    sha: /sha:\s*([0-9a-f]{7,40})/.exec(body)?.[1] ?? '',
    title: body.split('\n')[0].trim() || String(r.name ?? ''),
    date: String(r.published_at ?? ''),
    apkUrl: String(apk.browser_download_url),
    size: Number(apk.size) || 0,
  };
}

export function isNewer(u: Update, current = CURRENT): boolean {
  return u.build > current.build;
}

/** La última versión publicada, o null si todavía no hay ninguna. */
export async function fetchLatest(): Promise<Update | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error('GitHub ha limitado las consultas. Prueba dentro de un rato.');
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`);
  const u = parseRelease(await res.json());
  if (!u) throw new Error('La última versión publicada no trae el APK.');
  return u;
}

/** Descarga el APK y abre el instalador del sistema (solo Android). */
export async function installUpdate(u: Update): Promise<void> {
  const target = new File(Paths.cache, 'MiTurno-actualizacion.apk');
  const file = await File.downloadFileAsync(u.apkUrl, target, { idempotent: true });
  const { getContentUriAsync } = await import('expo-file-system/legacy');
  const IntentLauncher = await import('expo-intent-launcher');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: await getContentUriAsync(file.uri),
    type: 'application/vnd.android.package-archive',
    flags: 1 | 0x10000000, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
  });
}
