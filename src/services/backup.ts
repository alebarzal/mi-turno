import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Snapshot } from '../data/db';
import { DEFAULT_SETTINGS } from '../domain/types';

const FORMAT = 'mi-turno-backup';

interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  data: Snapshot;
}

/**
 * Exporta turnos, diccionario, ajustes e historial a un archivo JSON que el usuario guarda
 * donde quiera. Las fotos de las carteleras no se incluyen (se quedan en el teléfono) y la
 * clave de API tampoco.
 */
export async function exportBackup(snap: Snapshot): Promise<void> {
  const payload: BackupFile = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { ...snap, boards: snap.boards.map((b) => ({ ...b, imageUri: null })), settings: { ...snap.settings, sync: null } },
  };
  const json = JSON.stringify(payload, null, 2);
  const name = `mi-turno-${payload.exportedAt.slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Guardar copia de seguridad' });
}

/** Devuelve null si el usuario cancela. Lanza un error si el archivo no es una copia válida. */
export async function pickBackup(): Promise<Snapshot | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const text = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();

  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es una copia de seguridad de Mi Turno.');
  }
  const d = parsed.data;
  if (parsed.format !== FORMAT || !d || !Array.isArray(d.shifts) || !Array.isArray(d.codes)) {
    throw new Error('El archivo no es una copia de seguridad de Mi Turno.');
  }
  return {
    shifts: d.shifts,
    codes: d.codes,
    boards: Array.isArray(d.boards) ? d.boards : [],
    figures: Array.isArray(d.figures) ? d.figures : [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), sync: null },
  };
}
