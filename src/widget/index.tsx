import React from 'react';
import { Platform } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { loadAll } from '../data/db';
import type { ShiftMap } from '../domain/stats';
import { CalendarWidget } from './CalendarWidget';

export const CALENDAR_WIDGET = 'Calendario';

const render = (shifts: ShiftMap) => {
  const now = new Date();
  return {
    light: <CalendarWidget shifts={shifts} now={now} dark={false} />,
    dark: <CalendarWidget shifts={shifts} now={now} dark />,
  };
};

/** Android pide pintar el widget (al añadirlo, al redimensionarlo o cada cierto tiempo). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetInfo.widgetName !== CALENDAR_WIDGET) return;
  const shifts: ShiftMap = {};
  try {
    for (const s of (await loadAll()).shifts) shifts[s.date] = s;
  } catch {
    // Sin datos todavía: se pinta el mes vacío.
  }
  props.renderWidget(render(shifts));
}

/** Repinta el widget desde la app cuando cambian los turnos. */
export function refreshCalendarWidget(shifts: ShiftMap): void {
  if (Platform.OS !== 'android') return;
  try {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    requestWidgetUpdate({ widgetName: CALENDAR_WIDGET, renderWidget: () => render(shifts) }).catch(() => undefined);
  } catch {
    // Versión sin el módulo nativo del widget.
  }
}
