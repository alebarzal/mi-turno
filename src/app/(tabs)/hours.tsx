import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { actions, useStore } from '../../data/store';
import { monthDates, monthSummary, monthsWithData, weekSummary } from '../../domain/stats';
import { addMonths, formatHours, monthKey, monthLabel, MONTHS_ES, startOfWeek, ymd } from '../../domain/time';
import type { ShiftType } from '../../domain/types';
import { Button, Card, Empty, Field, Screen, Section, Sheet, T, Tap } from '../../ui/kit';
import { radius, space, TYPE_LABEL, useTheme } from '../../ui/theme';

const parseNum = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const numText = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

export default function HoursScreen() {
  const t = useTheme();
  const shifts = useStore((s) => s.shifts);
  const figures = useStore((s) => s.figures);
  const today = ymd(new Date());
  const [month, setMonth] = useState(monthKey(today));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ pending: '', comp: '', total: '' });

  const sum = useMemo(() => monthSummary(shifts, month, today), [shifts, month, today]);
  const week = useMemo(() => weekSummary(shifts, startOfWeek(today), today), [shifts, today]);
  const fig = figures[month];
  const hasData = Object.keys(shifts).length > 0;

  // Comparativa: los seis meses que terminan en el mes seleccionado (o en el último con datos).
  const compare = useMemo(() => {
    const withData = monthsWithData(shifts);
    const end = withData.length && withData[withData.length - 1] > month ? withData[withData.length - 1] : month;
    return Array.from({ length: 6 }, (_, i) => addMonths(end, i - 5)).map((ym) => ({
      ym,
      hours: monthSummary(shifts, ym, today).plannedHours,
    }));
  }, [shifts, month, today]);
  const maxHours = Math.max(1, ...compare.map((c) => c.hours));

  const byType = useMemo(() => {
    const counts: Partial<Record<ShiftType, number>> = {};
    for (const d of monthDates(month)) {
      const s = shifts[d];
      if (s) counts[s.type] = (counts[s.type] ?? 0) + 1;
    }
    return (Object.entries(counts) as [ShiftType, number][]).sort((a, b) => b[1] - a[1]);
  }, [shifts, month]);

  const openEdit = () => {
    setForm({ pending: numText(fig?.pendingHours), comp: numText(fig?.compensationHours), total: numText(fig?.totalWorkedHours) });
    setEditing(true);
  };

  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: 'Horas trabajadas', value: formatHours(sum.workedHours), sub: month === monthKey(today) ? 'hasta hoy' : 'en el mes' },
    { label: 'Horas previstas', value: formatHours(sum.plannedHours), sub: 'según tus turnos' },
    { label: 'Esta semana', value: formatHours(week.plannedHours), sub: `${formatHours(week.workedHours)} hechas` },
    { label: 'Horas pendientes', value: fig?.pendingHours != null ? formatHours(fig.pendingHours) : '—', sub: fig?.pendingHours != null ? undefined : 'sin datos' },
    { label: 'A compensar', value: fig?.compensationHours != null ? formatHours(fig.compensationHours) : '—', sub: fig?.compensationHours != null ? undefined : 'sin datos' },
    { label: 'Total acumulado', value: fig?.totalWorkedHours != null ? formatHours(fig.totalWorkedHours) : '—', sub: fig?.totalWorkedHours != null ? 'en el año' : 'sin datos' },
    { label: 'Días trabajados', value: String(sum.workDays) },
    { label: 'Días libres', value: String(sum.offDays), sub: sum.holidays ? `${sum.holidays} ${sum.holidays === 1 ? 'festivo' : 'festivos'} en el mes` : undefined },
  ];

  return (
    <Screen title="Mis horas">
      <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
        <Tap onPress={() => setMonth(addMonths(month, -1))} label="Mes anterior" scaleTo={0.9} style={{ padding: 6 }}>
          <Feather name="chevron-left" size={22} color={t.text} />
        </Tap>
        <Tap onPress={() => setMonth(monthKey(today))} label="Ir al mes actual" style={{ flex: 1, alignItems: 'center' }}>
          <T v="heading">{monthLabel(month)}</T>
        </Tap>
        <Tap onPress={() => setMonth(addMonths(month, 1))} label="Mes siguiente" scaleTo={0.9} style={{ padding: 6 }}>
          <Feather name="chevron-right" size={22} color={t.text} />
        </Tap>
      </Card>

      {!hasData ? (
        <Empty icon="bar-chart-2" title="Aún no hay horas" text="Cuando importes una cartelera verás aquí el resumen de tus horas." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}>
            {tiles.map((x) => (
              <Card key={x.label} style={{ flexBasis: '47%', flexGrow: 1, padding: 14 }}>
                <T v="caption">{x.label}</T>
                <T v="number" style={{ marginTop: 4 }}>{x.value}</T>
                {x.sub ? <T v="caption" color={t.faint}>{x.sub}</T> : null}
              </Card>
            ))}
          </View>
          <Button title="Editar pendientes y compensación" kind="ghost" icon="edit-2" onPress={openEdit} style={{ marginTop: space.sm }} />

          <Section title="Comparativa entre meses">
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 150 }}>
                {compare.map((c) => {
                  const on = c.ym === month;
                  return (
                    <Tap key={c.ym} onPress={() => setMonth(c.ym)} style={{ flex: 1 }} label={monthLabel(c.ym)}>
                      <View style={{ alignItems: 'center', justifyContent: 'flex-end', height: 150 }}>
                        <Text style={{ fontSize: 11, color: on ? t.text : t.sub, fontWeight: '600', marginBottom: 4, fontVariant: ['tabular-nums'] }}>
                          {c.hours > 0 ? Math.round(c.hours) : ''}
                        </Text>
                        <View
                          style={{
                            width: '100%',
                            height: Math.max(4, (c.hours / maxHours) * 100),
                            borderRadius: 7,
                            backgroundColor: on ? t.accent : t.accentSoft,
                          }}
                        />
                        <Text style={{ fontSize: 11.5, color: on ? t.accent : t.sub, marginTop: 6, fontWeight: on ? '700' : '500' }}>
                          {MONTHS_ES[Number(c.ym.slice(5)) - 1].slice(0, 3)}
                        </Text>
                      </View>
                    </Tap>
                  );
                })}
              </View>
            </Card>
          </Section>

          {byType.length > 0 ? (
            <Section title="Tipos de día">
              <Card style={{ gap: 10 }}>
                {byType.map(([type, n]) => {
                  const tone = t.tones[type];
                  return (
                    <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <T v="label" style={{ width: 70 }}>{TYPE_LABEL[type]}</T>
                      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: t.dark ? t.elevated : '#F0F0F4' }}>
                        <View style={{ width: `${(n / monthDates(month).length) * 100}%`, height: 10, borderRadius: 5, backgroundColor: tone.dot }} />
                      </View>
                      <Text style={{ color: t.text, fontWeight: '600', width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{n}</Text>
                    </View>
                  );
                })}
              </Card>
            </Section>
          ) : null}
        </>
      )}

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={monthLabel(month)}
        footer={
          <Button
            title="Guardar"
            onPress={async () => {
              setEditing(false);
              await actions.saveFigures({
                month,
                pendingHours: parseNum(form.pending),
                compensationHours: parseNum(form.comp),
                totalWorkedHours: parseNum(form.total),
              });
            }}
          />
        }
      >
        <View style={{ gap: 12 }}>
          <T v="body" color={t.sub}>
            Estas cifras salen de la tabla resumen de la cartelera. Si no se leyeron bien, corrígelas aquí.
          </T>
          <View style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, gap: 12 }}>
            <Field label="Horas pendientes" value={form.pending} onChangeText={(v) => setForm({ ...form, pending: v })} keyboardType="decimal-pad" placeholder="—" />
            <Field label="Horas a compensar" value={form.comp} onChangeText={(v) => setForm({ ...form, comp: v })} keyboardType="decimal-pad" placeholder="—" />
            <Field label="Total de horas trabajadas (acumulado)" value={form.total} onChangeText={(v) => setForm({ ...form, total: v })} keyboardType="decimal-pad" placeholder="—" />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
