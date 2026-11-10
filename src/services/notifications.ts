import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isWorkDay, upcomingSegments, type ShiftMap } from '../domain/stats';
import { addDays, addMonths, monthKey, parseYmd, segmentLabel, ymd } from '../domain/time';
import type { Settings, Shift } from '../domain/types';

const supported = Platform.OS !== 'web';
/** iOS admite como máximo 64 avisos programados; dejamos margen. */
const MAX_SCHEDULED = 58;
const CHANNEL = 'turnos';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === 'granted';
}

export interface PlannedNotification {
  at: Date;
  title: string;
  body: string;
}

const describe = (s: Shift) =>
  isWorkDay(s)
    ? `${s.code} · ${s.segments.map((g) => `${segmentLabel(g)}${g.location ? ` ${g.location}` : ''}`).join(' y ')}`
    : s.type === 'off'
      ? 'Día libre'
      : s.code;

/** Calcula qué avisos tocan según los turnos y los ajustes. Función pura: fácil de probar. */
export function planNotifications(shifts: ShiftMap, settings: Settings, now: Date): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const segments = upcomingSegments(shifts, now, 21);

  segments.forEach((seg, i) => {
    const place = seg.segment.location ? ` en ${seg.segment.location}` : '';
    if (settings.notifyBefore) {
      out.push({
        at: new Date(seg.start.getTime() - settings.notifyBeforeMinutes * 60000),
        title: `Entras a las ${seg.segment.start}`,
        body: `Turno ${seg.shift.code}${place}, de ${segmentLabel(seg.segment)}.`,
      });
    }
    if (settings.notifyAtStart) {
      out.push({ at: seg.start, title: 'Hora de entrada', body: `Empieza tu turno ${seg.shift.code}${place}.` });
    }
    if (settings.notifyNextShift) {
      const next = segments[i + 1];
      // Solo al terminar el último tramo del día.
      if (next && next.shift.date !== seg.shift.date) {
        const tomorrow = next.shift.date === addDays(seg.shift.date, 1);
        out.push({
          at: seg.end,
          title: 'Próximo turno',
          body: `${tomorrow ? 'Mañana' : parseYmd(next.shift.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })} a las ${next.segment.start}: ${describe(next.shift)}.`,
        });
      }
    }
  });

  if (settings.notifyDailySummary) {
    for (let i = 0; i < 14; i++) {
      const day = addDays(ymd(now), i);
      const tomorrow = shifts[addDays(day, 1)];
      if (!tomorrow) continue;
      const at = parseYmd(day);
      at.setHours(settings.dailySummaryHour, 0, 0, 0);
      out.push({ at, title: 'Mañana', body: describe(tomorrow) });
    }
  }

  if (settings.notifyNewBoard) {
    // Recordatorio si el mes siguiente aún no tiene turnos cargados.
    for (let i = 0; i < 2; i++) {
      const ym = addMonths(monthKey(ymd(now)), i);
      const next = addMonths(ym, 1);
      if (Object.keys(shifts).some((d) => d.startsWith(next))) continue;
      const [y, m] = ym.split('-').map(Number);
      const at = new Date(y, m - 1, settings.newBoardDay, 10, 0, 0, 0);
      out.push({
        at,
        title: '¿Ya hay cartelera nueva?',
        body: 'Aún no has importado los turnos del mes que viene. Hazle una foto y añádela.',
      });
      break;
    }
  }

  return out
    .filter((n) => n.at.getTime() > now.getTime() + 5000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);
}

/** Borra los avisos programados y los vuelve a crear a partir del calendario actual. */
export async function rescheduleNotifications(shifts: ShiftMap, settings: Settings): Promise<number> {
  if (!supported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(await notificationsAllowed())) return 0;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Turnos',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const plan = planNotifications(shifts, settings, new Date());
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  }
  return plan.length;
}
