import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { monthDates } from '../domain/stats';
import { crossesMidnight, formatHours, parseYmd, weekdayIndex, WEEKDAY_LETTERS, WEEKDAYS_ES } from '../domain/time';
import type { Shift } from '../domain/types';
import { Chip, haptic, T, Tap } from './kit';
import { radius, toneOf, TYPE_LABEL, useTheme } from './theme';

/** Cuadrícula mensual, lunes primero. Cada día muestra su código con el color del turno. */
export function MonthGrid({
  month,
  shifts,
  selected,
  today,
  flagged,
  onSelect,
  onLongPress,
}: {
  month: string;
  shifts: Record<string, Shift | undefined>;
  selected?: string | null;
  today?: string;
  /** Fechas que hay que destacar (p. ej. lecturas dudosas en la revisión). */
  flagged?: Set<string>;
  onSelect: (date: string) => void;
  /** Mantener pulsado un día (p. ej. para editarlo directamente). */
  onLongPress?: (date: string) => void;
}) {
  const t = useTheme();
  const dates = monthDates(month);
  const cells: (string | null)[] = [...Array(weekdayIndex(dates[0])).fill(null), ...dates];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: i >= 5 ? t.faint : t.sub, fontSize: 12, fontWeight: '600' }}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={{ flex: 1, height: 58 }} />;
            const s = shifts[date];
            const isSel = selected === date;
            const isToday = today === date;
            const flag = flagged?.has(date);
            const past = !!today && date < today;
            const tone = s ? t.tones[past ? 'past' : toneOf(s)] : null;
            return (
              <Pressable
                key={di}
                accessibilityRole="button"
                accessibilityLabel={`${parseYmd(date).getDate()} ${s ? s.code : 'sin turno'}`}
                onPress={() => {
                  haptic();
                  onSelect(date);
                }}
                onLongPress={
                  onLongPress
                    ? () => {
                        haptic();
                        onLongPress(date);
                      }
                    : undefined
                }
                delayLongPress={350}
                style={{ flex: 1, height: 58, padding: 2 }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    backgroundColor: isSel ? t.accentSoft : 'transparent',
                    borderWidth: flag ? 1.5 : isSel ? 1.5 : 0,
                    borderColor: flag ? t.warnFg : t.accent,
                    borderStyle: flag ? 'dashed' : 'solid',
                  }}
                >
                  <View
                    style={{
                      minWidth: 24,
                      height: 22,
                      borderRadius: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isToday ? t.accent : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: isToday ? '700' : '500',
                        color: isToday ? t.onAccent : past ? t.faint : s?.isHoliday ? t.tones.holiday.fg : t.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {parseYmd(date).getDate()}
                    </Text>
                  </View>
                  {s && tone ? (
                    <View style={{ backgroundColor: tone.bg, borderRadius: 6, paddingHorizontal: 4, minWidth: 30, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                      <Text numberOfLines={1} style={{ color: tone.fg, fontSize: 10.5, fontWeight: '700' }}>
                        {s.code || '?'}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ height: 18, justifyContent: 'center' }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.border }} />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Lista de tramos con hora de entrada, salida y lugar. */
export function SegmentList({ shift, compact }: { shift: Pick<Shift, 'segments'>; compact?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: compact ? 2 : 8 }}>
      {shift.segments.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!compact ? <Feather name="clock" size={15} color={t.sub} /> : null}
          <Text style={{ color: t.text, fontSize: compact ? 14 : 16, fontWeight: compact ? '500' : '600', fontVariant: ['tabular-nums'] }}>
            {s.start} – {s.end}
            {crossesMidnight(s) ? <Text style={{ color: t.sub, fontSize: 11 }}> +1</Text> : null}
          </Text>
          {s.location ? (
            <Text numberOfLines={1} style={{ color: t.sub, fontSize: compact ? 13 : 14.5, flexShrink: 1 }}>
              · {s.location}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function shiftTitle(s: Shift): string {
  if (s.type === 'off') return s.isHoliday ? 'Festivo · libre' : 'Día libre';
  return `${TYPE_LABEL[s.type]}${s.isHoliday ? ' · festivo' : ''}`;
}

/** Fila de un día en listas (semana, revisión, detalle de cartelera). */
export function DayRow({
  date,
  shift,
  onPress,
  isToday,
  past,
  warning,
  last,
}: {
  date: string;
  shift?: Shift;
  onPress?: () => void;
  isToday?: boolean;
  /** El día ya ha pasado: se muestra atenuado. */
  past?: boolean;
  warning?: string;
  last?: boolean;
}) {
  const t = useTheme();
  const wd = WEEKDAYS_ES[weekdayIndex(date)].slice(0, 3);
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        gap: 12,
        opacity: past ? 0.6 : 1,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ width: 40, alignItems: 'center' }}>
        <Text style={{ color: isToday ? t.accent : t.sub, fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase' }}>{wd}</Text>
        <Text style={{ color: isToday ? t.accent : past ? t.faint : t.text, fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {parseYmd(date).getDate()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        {shift ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Chip text={shift.code || '?'} tone={past ? 'past' : toneOf(shift)} />
              <T v="label" numberOfLines={1} style={{ flexShrink: 1 }}>{shiftTitle(shift)}</T>
            </View>
            {shift.segments.length > 0 ? <SegmentList shift={shift} compact /> : null}
          </>
        ) : (
          <T v="label" color={t.faint}>Sin turno</T>
        )}
        {warning ? (
          <Text style={{ color: t.warnFg, fontSize: 12.5 }}>
            <Feather name="alert-triangle" size={11} /> {warning}
          </Text>
        ) : null}
      </View>
      {shift && shift.hours > 0 ? (
        <Text style={{ color: t.sub, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatHours(shift.hours)}</Text>
      ) : null}
      {onPress ? <Feather name="chevron-right" size={16} color={t.faint} /> : null}
    </View>
  );
  return onPress ? <Tap onPress={onPress} scaleTo={0.99}>{body}</Tap> : body;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <T v="caption" numberOfLines={1}>{label}</T>
      <T v="number" style={{ marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      {sub ? <T v="caption" color={t.faint} numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}
