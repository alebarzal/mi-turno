import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { monthAsText, monthsAsIcs } from '../domain/export';
import type { Shift } from '../domain/types';

type ShiftMap = Record<string, Shift>;

/** Abre el menú de compartir del sistema con el mes en texto (WhatsApp, Telegram…). */
export async function shareMonthText(shifts: ShiftMap, ym: string, today: string): Promise<boolean> {
  const message = monthAsText(shifts, ym, today);
  if (!message) return false;
  if (Platform.OS === 'web') {
    await navigator.clipboard?.writeText(message);
    return true;
  }
  await Share.share({ message });
  return true;
}

/** Genera un .ics con los meses dados y lo comparte para abrirlo en la app de calendario. */
export async function shareIcs(shifts: ShiftMap, months: string[]): Promise<void> {
  const ics = monthsAsIcs(shifts, months);
  const name = `mi-turno-${months[0]}${months.length > 1 ? `-${months[months.length - 1]}` : ''}.ics`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
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
  file.write(ics);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: 'Añadir al calendario' });
}
