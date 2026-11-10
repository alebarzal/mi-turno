import React from 'react';
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { nextSegment, type ShiftMap } from '../domain/stats';
import {
  WEEKDAY_LETTERS,
  daysInMonth,
  makeYmd,
  monthLabel,
  segmentLabel,
  shortDate,
  weekdayIndex,
  ymd,
} from '../domain/time';
import { THEMES, toneOf, type Theme } from '../ui/theme';

const c = (s: string) => s as ColorProp;

/** Calendario del mes en curso para la pantalla de inicio: un color por tipo de turno. */
export function CalendarWidget({ shifts, now, dark }: { shifts: ShiftMap; now: Date; dark: boolean }) {
  const t: Theme = dark ? THEMES.dark : THEMES.light;
  const today = ymd(now);
  const ym = today.slice(0, 7);
  const [year, month] = ym.split('-').map(Number);
  const offset = weekdayIndex(makeYmd(year, month, 1));
  const total = daysInMonth(ym);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < offset + total; i += 7) {
    weeks.push(Array.from({ length: 7 }, (_, k) => (i + k >= offset && i + k - offset < total ? i + k - offset + 1 : null)));
  }

  const next = nextSegment(shifts, now);
  const nextText = !next
    ? 'Sin turnos próximos'
    : next.inProgress
      ? `Ahora · ${next.shift.code} · ${segmentLabel(next.segment)}`
      : `${next.shift.date === today ? 'Hoy' : shortDate(next.shift.date)} · ${next.shift.code} · ${segmentLabel(next.segment)}`;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Calendario de turnos"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c(t.card),
        borderRadius: 24,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextWidget text={monthLabel(ym)} style={{ fontSize: 15, fontWeight: '700', color: c(t.text) }} />
        <TextWidget text={nextText} maxLines={1} truncate="END" style={{ fontSize: 11, color: c(t.accent), fontWeight: '600' }} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 6, marginBottom: 2 }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <FlexWidget key={i} style={{ flex: 1, alignItems: 'center' }}>
            <TextWidget text={l} style={{ fontSize: 10, color: c(t.faint), fontWeight: '600' }} />
          </FlexWidget>
        ))}
      </FlexWidget>

      {weeks.map((week, wi) => (
        <FlexWidget key={wi} style={{ width: 'match_parent', flex: 1, flexDirection: 'row' }}>
          {week.map((day, di) => {
            if (day == null) return <FlexWidget key={di} style={{ flex: 1, height: 'match_parent' }} />;
            const date = makeYmd(year, month, day);
            const shift = shifts[date];
            const isToday = date === today;
            const past = date < today;
            const tone = shift ? t.tones[past ? 'past' : toneOf(shift)] : null;
            return (
              <FlexWidget key={di} style={{ flex: 1, height: 'match_parent', padding: 1 }}>
                <FlexWidget
                  style={{
                    width: 'match_parent',
                    height: 'match_parent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    backgroundColor: c(tone ? tone.bg : t.card),
                    borderWidth: isToday ? 2 : 0,
                    borderColor: c(t.accent),
                  }}
                >
                  <TextWidget
                    text={String(day)}
                    style={{ fontSize: 10, color: c(isToday ? t.accent : past ? t.faint : t.sub), fontWeight: isToday ? '700' : '500' }}
                  />
                  <TextWidget
                    text={shift?.code || '·'}
                    maxLines={1}
                    style={{ fontSize: 11, fontWeight: '700', color: c(tone ? tone.fg : t.faint) }}
                  />
                </FlexWidget>
              </FlexWidget>
            );
          })}
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}
