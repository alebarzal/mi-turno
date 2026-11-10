import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Platform, Text, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actions, useStore } from '../../data/store';
import { isOffDay, monthSummary, nextSegment, weekDates, weekSummary } from '../../domain/stats';
import {
  addDays,
  addMonths,
  countdown,
  formatHours,
  longDate,
  monthKey,
  monthLabel,
  shortDate,
  startOfWeek,
  ymd,
} from '../../domain/time';
import { DayDetail } from '../../ui/DayDetail';
import { Button, Card, Chip, Empty, FadeIn, IconButton, Screen, Segmented, Sheet, T, Tap, confirmAsync } from '../../ui/kit';
import { ShiftEditor } from '../../ui/ShiftEditor';
import { DayRow, MonthGrid, SegmentList, Stat } from '../../ui/shifts';
import { radius, space, toneOf, useTheme } from '../../ui/theme';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

type ViewMode = 'month' | 'week' | 'day';

/** Reloj que se actualiza cada medio minuto, para la cuenta atrás. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function CalendarScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const shifts = useStore((s) => s.shifts);
  const codes = useStore((s) => s.codes);
  const figures = useStore((s) => s.figures);
  const now = useNow();
  const today = ymd(now);

  const [mode, setMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(today);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);

  const hasData = Object.keys(shifts).length > 0;
  const next = useMemo(() => nextSegment(shifts, now), [shifts, now]);
  const month = monthKey(today);
  const mSum = useMemo(() => monthSummary(shifts, month, today), [shifts, month, today]);
  const wSum = useMemo(() => weekSummary(shifts, startOfWeek(today), today), [shifts, today]);
  const pending = figures[month]?.pendingHours;

  const changeMode = (m: ViewMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(m);
  };
  const move = (dir: 1 | -1) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (mode === 'month') setCursor(`${addMonths(monthKey(cursor), dir)}-01`);
    else setCursor(addDays(cursor, mode === 'week' ? 7 * dir : dir));
  };
  const periodLabel =
    mode === 'month'
      ? monthLabel(monthKey(cursor))
      : mode === 'week'
        ? `${shortDate(startOfWeek(cursor))} – ${shortDate(addDays(startOfWeek(cursor), 6))}`
        : longDate(cursor);

  const openEditor = (date: string) => {
    setSheetDate(null);
    // Deja que la hoja de detalle termine de cerrarse antes de abrir el editor.
    setTimeout(() => setEditDate(date), Platform.OS === 'ios' ? 350 : 50);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Mi Turno"
        subtitle={longDate(today)}
        right={<IconButton icon="plus" label="Añadir turno a mano" onPress={() => setEditDate(mode === 'month' ? today : cursor)} />}
      >
        {/* Próximo turno */}
        <FadeIn>
          {next ? (
            <Card onPress={() => setSheetDate(next.shift.date)} style={{ backgroundColor: t.accent, borderWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: t.onAccent, opacity: 0.85, fontSize: 13, fontWeight: '600', flex: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {next.inProgress ? 'Turno en curso' : 'Próximo turno'}
                </Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 13 }}>{next.shift.code}</Text>
                </View>
              </View>
              <Text style={{ color: t.onAccent, fontSize: 34, fontWeight: '700', letterSpacing: -1, marginTop: 10, fontVariant: ['tabular-nums'] }}>
                {next.segment.start} – {next.segment.end}
              </Text>
              <Text style={{ color: t.onAccent, opacity: 0.9, fontSize: 15, marginTop: 2 }}>
                {next.shift.date === today ? 'Hoy' : next.shift.date === addDays(today, 1) ? 'Mañana' : longDate(next.shift.date)}
                {next.segment.location ? ` · ${next.segment.location}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <Feather name="clock" size={14} color={t.onAccent} />
                <Text style={{ color: t.onAccent, fontSize: 14.5, fontWeight: '600' }}>
                  {next.inProgress
                    ? `Sales en ${countdown(next.end.getTime() - now.getTime())}`
                    : `Entras en ${countdown(next.start.getTime() - now.getTime())}`}
                </Text>
                {next.shift.segments.length > 1 ? (
                  <Text style={{ color: t.onAccent, opacity: 0.8, fontSize: 13, marginLeft: 'auto' }}>
                    {next.shift.segments.map((s) => `${s.start}–${s.end}`).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : hasData ? (
            <Card>
              <T v="label">Próximo turno</T>
              <T v="heading" style={{ marginTop: 6 }}>No tienes turnos próximos</T>
              <T v="body" color={t.sub} style={{ marginTop: 2 }}>Añade la cartelera del mes que viene cuando se publique.</T>
            </Card>
          ) : (
            <Card>
              <Empty
                icon="camera"
                title="Empieza con una foto"
                text="Haz una foto a la cartelera del mes y tus turnos aparecerán aquí en unos segundos."
              >
                <Button title="Añadir cartelera" icon="camera" big onPress={() => router.push('/scan')} />
              </Empty>
            </Card>
          )}
        </FadeIn>

        {/* Resumen del mes */}
        {hasData ? (
          <FadeIn delay={60}>
            <Card style={{ marginTop: space.md, flexDirection: 'row', gap: space.md }}>
              <Stat label="Horas del mes" value={formatHours(mSum.plannedHours)} sub={`${formatHours(mSum.workedHours)} hechas`} />
              <Stat label="Días libres" value={String(mSum.offDays)} sub={`${mSum.workDays} de trabajo`} />
              <Stat label="Pendientes" value={pending != null ? formatHours(pending) : '—'} sub={pending != null ? 'según cartelera' : 'sin datos'} />
            </Card>
          </FadeIn>
        ) : null}

        {/* Calendario */}
        <FadeIn delay={120} style={{ marginTop: space.xl }}>
          <Segmented
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'month', label: 'Mes' },
              { value: 'week', label: 'Semana' },
              { value: 'day', label: 'Día' },
            ]}
          />
          <Card style={{ marginTop: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
              <Tap onPress={() => move(-1)} label="Anterior" scaleTo={0.9} style={{ padding: 6 }}>
                <Feather name="chevron-left" size={22} color={t.text} />
              </Tap>
              <Tap onPress={() => setCursor(today)} label="Ir a hoy" style={{ flex: 1, alignItems: 'center' }}>
                <T v="heading" numberOfLines={1}>{periodLabel}</T>
              </Tap>
              <Tap onPress={() => move(1)} label="Siguiente" scaleTo={0.9} style={{ padding: 6 }}>
                <Feather name="chevron-right" size={22} color={t.text} />
              </Tap>
            </View>

            {mode === 'month' ? (
              <MonthGrid month={monthKey(cursor)} shifts={shifts} today={today} selected={sheetDate} onSelect={setSheetDate} />
            ) : mode === 'week' ? (
              <View>
                {weekDates(startOfWeek(cursor)).map((d, i) => (
                  <DayRow key={d} date={d} shift={shifts[d]} isToday={d === today} past={d < today} last={i === 6} onPress={() => setSheetDate(d)} />
                ))}
              </View>
            ) : (
              <DayDetail
                shift={shifts[cursor]}
                codeLabel={shifts[cursor] ? codes[shifts[cursor].code]?.label : undefined}
                onEdit={() => setEditDate(cursor)}
                onAdd={() => setEditDate(cursor)}
              />
            )}
          </Card>

          {mode === 'month' ? <Legend /> : null}
        </FadeIn>

        {/* Resumen de la semana */}
        {hasData ? (
          <FadeIn delay={180}>
            <Card style={{ marginTop: space.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <T v="heading" style={{ flex: 1 }}>Esta semana</T>
                <T v="label">
                  {formatHours(wSum.plannedHours)} · {wSum.workDays} turnos · {wSum.offDays} libres
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: 4, marginTop: space.md }}>
                {weekDates(startOfWeek(today)).map((d) => {
                  const s = shifts[d];
                  const tone = s ? t.tones[d < today ? 'past' : toneOf(s)] : null;
                  return (
                    <Tap key={d} onPress={() => setSheetDate(d)} style={{ flex: 1 }} label={longDate(d)}>
                      <View
                        style={{
                          borderRadius: radius.sm,
                          paddingVertical: 8,
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: tone ? tone.bg : t.dark ? t.elevated : '#F2F2F5',
                          borderWidth: d === today ? 1.5 : 0,
                          borderColor: t.accent,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: tone ? tone.fg : t.faint, opacity: 0.8, fontWeight: '600' }}>
                          {'LMXJVSD'[weekDates(startOfWeek(today)).indexOf(d)]}
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: tone ? tone.fg : t.faint }}>
                          {s ? (isOffDay(s) ? 'D' : s.code) : '·'}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: tone ? tone.fg : t.faint, opacity: 0.8, fontVariant: ['tabular-nums'] }}>
                          {s && s.hours > 0 ? `${String(s.hours).replace('.', ',')}h` : ' '}
                        </Text>
                      </View>
                    </Tap>
                  );
                })}
              </View>
            </Card>
          </FadeIn>
        ) : null}
      </Screen>

      {/* Botón principal */}
      {hasData ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: space.md, alignItems: 'center' }}>
          <Tap
            onPress={() => router.push('/scan')}
            label="Añadir cartelera"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              backgroundColor: t.accent,
              paddingHorizontal: 22,
              paddingVertical: 15,
              borderRadius: 30,
              shadowColor: t.accent,
              shadowOpacity: 0.35,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Feather name="camera" size={19} color={t.onAccent} />
            <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 16 }}>Añadir cartelera</Text>
          </Tap>
        </View>
      ) : null}

      <Sheet visible={!!sheetDate} onClose={() => setSheetDate(null)} title={sheetDate ? longDate(sheetDate) : ''}>
        {sheetDate ? (
          <DayDetail
            shift={shifts[sheetDate]}
            codeLabel={shifts[sheetDate] ? codes[shifts[sheetDate].code]?.label : undefined}
            onEdit={() => openEditor(sheetDate)}
            onAdd={() => openEditor(sheetDate)}
          />
        ) : null}
        <View style={{ height: insets.bottom }} />
      </Sheet>

      <ShiftEditor
        visible={!!editDate}
        date={editDate}
        initial={editDate ? shifts[editDate] : undefined}
        codes={codes}
        onClose={() => setEditDate(null)}
        onSave={async (shift, learned) => {
          setEditDate(null);
          if (learned) await actions.saveCode(learned);
          await actions.saveShift(shift);
        }}
        onDelete={
          editDate && shifts[editDate]
            ? async () => {
                const date = editDate;
                if (await confirmAsync('Eliminar turno', `¿Eliminar el turno del ${longDate(date).toLowerCase()}?`, 'Eliminar', true)) {
                  setEditDate(null);
                  await actions.deleteShift(date);
                }
              }
            : undefined
        }
      />
    </View>
  );
}

function Legend() {
  const items: [string, 'morning' | 'afternoon' | 'night' | 'split' | 'off' | 'holiday' | 'past'][] = [
    ['Mañana', 'morning'],
    ['Tarde', 'afternoon'],
    ['Noche', 'night'],
    ['Partido', 'split'],
    ['Libre', 'off'],
    ['Festivo', 'holiday'],
    ['Ya pasado', 'past'],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md, justifyContent: 'center' }}>
      {items.map(([label, tone]) => (
        <Chip key={tone} text={label} tone={tone} small />
      ))}
    </View>
  );
}
