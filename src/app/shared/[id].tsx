import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { actions, useStore } from '../../data/store';
import { monthSummary, nextSegment, type ShiftMap } from '../../domain/stats';
import { addDays, addMonths, formatHours, longDate, monthKey, monthLabel, ymd } from '../../domain/time';
import { formatImported } from '../../ui/boardText';
import { DayDetail } from '../../ui/DayDetail';
import { Button, Card, Empty, IconButton, Screen, Sheet, T, Tap, confirmAsync } from '../../ui/kit';
import { MonthGrid, SegmentList, Stat } from '../../ui/shifts';
import { space, useTheme } from '../../ui/theme';

/** Calendario de otra persona, solo de consulta. */
export default function SharedCalendarScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cal = useStore((s) => s.shared.find((c) => c.id === id));
  const now = new Date();
  const today = ymd(now);
  const [month, setMonth] = useState(monthKey(today));
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const shifts = useMemo<ShiftMap>(() => Object.fromEntries((cal?.shifts ?? []).map((s) => [s.date, s])), [cal]);
  const labels = useMemo(() => Object.fromEntries((cal?.codes ?? []).map((c) => [c.code, c.label])), [cal]);

  if (!cal) {
    return (
      <Screen title="Calendario" right={<IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />}>
        <Empty icon="alert-circle" title="Calendario no encontrado" text="Puede que lo hayas eliminado." />
      </Screen>
    );
  }
  const next = nextSegment(shifts, now);
  const sum = monthSummary(shifts, month, today);

  return (
    <Screen
      title={cal.name}
      subtitle={cal.channel ? 'Se actualiza solo' : `Recibido el ${formatImported(cal.receivedAt)}`}
      right={<IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />}
    >
      <Card>
        <T v="label">{next?.inProgress ? 'Turno en curso' : 'Próximo turno'}</T>
        {next ? (
          <View style={{ marginTop: 6, gap: 4 }}>
            <T v="heading">
              {next.shift.date === today ? 'Hoy' : next.shift.date === addDays(today, 1) ? 'Mañana' : longDate(next.shift.date)} · {next.shift.code}
            </T>
            <SegmentList shift={next.shift} compact />
          </View>
        ) : (
          <T v="heading" style={{ marginTop: 6 }}>Sin turnos próximos</T>
        )}
      </Card>

      <Card style={{ marginTop: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <Tap onPress={() => setMonth(addMonths(month, -1))} label="Mes anterior" scaleTo={0.9} style={{ padding: 6 }}>
            <Feather name="chevron-left" size={22} color={t.text} />
          </Tap>
          <Tap onPress={() => setMonth(monthKey(today))} label="Ir al mes actual" style={{ flex: 1, alignItems: 'center' }}>
            <T v="heading">{monthLabel(month)}</T>
          </Tap>
          <Tap onPress={() => setMonth(addMonths(month, 1))} label="Mes siguiente" scaleTo={0.9} style={{ padding: 6 }}>
            <Feather name="chevron-right" size={22} color={t.text} />
          </Tap>
        </View>
        <MonthGrid month={month} shifts={shifts} today={today} selected={sheetDate} onSelect={setSheetDate} />
      </Card>

      <Card style={{ marginTop: space.md, flexDirection: 'row', gap: space.md }}>
        <Stat label="Horas del mes" value={formatHours(sum.plannedHours)} />
        <Stat label="Días de trabajo" value={String(sum.workDays)} />
        <Stat label="Días libres" value={String(sum.offDays)} />
      </Card>

      <Button
        title="Eliminar este calendario"
        kind="danger"
        icon="trash-2"
        style={{ marginTop: space.lg }}
        onPress={async () => {
          if (await confirmAsync('Eliminar calendario', `Dejarás de ver los turnos de ${cal.name}. Tus propios turnos no cambian.`, 'Eliminar', true)) {
            router.back();
            await actions.deleteShared(cal.id);
          }
        }}
      />

      <Sheet visible={!!sheetDate} onClose={() => setSheetDate(null)} title={sheetDate ? longDate(sheetDate) : ''}>
        {sheetDate ? <DayDetail shift={shifts[sheetDate]} codeLabel={shifts[sheetDate] ? labels[shifts[sheetDate].code] : undefined} /> : null}
      </Sheet>
    </Screen>
  );
}
