import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actions, getState, useStore } from '../../data/store';
import { ISSUE_TEXT, draftToShift, interpretBoard, isBlocked, resolveShift, type DraftShift } from '../../domain/interpret';
import { addMonths, formatHours, monthKey, monthLabel } from '../../domain/time';
import type { MonthFigures } from '../../domain/types';
import { ENGINE_NAMES, type BoardExtraction } from '../../recognition';
import { Banner, Button, Card, Empty, IconButton, Screen, Section, Segmented, Sheet, T, Tap, confirmAsync } from '../../ui/kit';
import { shareDiagnostics } from '../../services/diagnostics';
import { ShiftEditor } from '../../ui/ShiftEditor';
import { DayRow, MonthGrid, Stat } from '../../ui/shifts';
import { space, useTheme } from '../../ui/theme';

type DraftMap = Record<string, DraftShift>;

const toMap = (drafts: DraftShift[]): DraftMap => Object.fromEntries(drafts.map((d) => [d.date, d]));

export default function ReviewScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const board = useStore((s) => s.boards.find((b) => b.id === id));
  const codes = useStore((s) => s.codes);
  const existing = useStore((s) => s.shifts);

  // La lectura se interpreta una vez; a partir de ahí manda lo que edite el usuario.
  const [extraction, setExtraction] = useState<BoardExtraction | null>(board?.extraction ?? null);
  const initial = useMemo(
    () => (extraction ? interpretBoard(extraction, getState().codes, { boardId: id }) : null),
    [extraction, id],
  );
  const [drafts, setDrafts] = useState<DraftMap>(() => toMap(initial?.drafts ?? []));
  const [filter, setFilter] = useState<'issues' | 'all'>('issues');
  const [editDate, setEditDate] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!board || !extraction || !initial) {
    return (
      <Screen title="Revisar turnos" right={<IconButton icon="x" label="Cerrar" onPress={() => router.back()} />}>
        <Empty icon="alert-circle" title="Cartelera no encontrada" text="Puede que la hayas eliminado del historial." />
      </Screen>
    );
  }

  const months = initial.months;
  const all = Object.values(drafts).sort((a, b) => a.date.localeCompare(b.date));
  const flagged = all.filter((d) => d.issues.length > 0);
  const blocked = all.filter(isBlocked);
  const savable = all.filter((d) => !isBlocked(d));
  const workShifts = savable.filter((d) => d.segments.length > 0 || d.hours > 0);
  const offDays = savable.filter((d) => d.type === 'off');
  const totalHours = Math.round(savable.reduce((a, d) => a + d.hours, 0) * 100) / 100;
  const flaggedSet = new Set(flagged.map((d) => d.date));
  const effectiveFilter = flagged.length === 0 ? 'all' : filter;

  /** Corrige el mes de una tabla (por si el año o el mes se dedujeron mal). */
  const shiftMonth = (index: number, delta: number) => {
    const current = months[index].month;
    const [y, m] = addMonths(current, delta).split('-').map(Number);
    const next: BoardExtraction = {
      ...extraction,
      months: extraction.months.map((em, i) => (i === index ? { ...em, year: y, month: m, firstWeekday: null } : em)),
    };
    setExtraction(next);
    setDrafts(toMap(interpretBoard(next, getState().codes, { boardId: id }).drafts));
  };

  const confirm = async () => {
    if (blocked.length > 0) {
      const ok = await confirmAsync(
        'Hay días sin resolver',
        `${blocked.length} ${blocked.length === 1 ? 'día no se guardará' : 'días no se guardarán'} porque falta confirmar su turno. Puedes completarlos después desde el calendario.`,
        'Guardar el resto',
      );
      if (!ok) return;
    }
    const overwritten = savable.filter((d) => existing[d.date]?.manual).length;
    if (overwritten > 0) {
      const ok = await confirmAsync(
        'Sustituir turnos editados',
        `${overwritten} ${overwritten === 1 ? 'día que habías editado a mano se sustituirá' : 'días que habías editado a mano se sustituirán'} por lo que dice esta cartelera.`,
        'Sustituir',
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      for (const c of initial.legendCodes) {
        // No pisar lo que el usuario haya aprendido durante esta revisión.
        if (getState().codes[c.code]?.source !== 'user') await actions.saveCode(c);
      }
      await actions.saveShifts(savable.map(draftToShift));
      for (const m of months) {
        const prev = getState().figures[m.month];
        const merged: MonthFigures = {
          month: m.month,
          pendingHours: m.figures.pendingHours ?? prev?.pendingHours ?? null,
          compensationHours: m.figures.compensationHours ?? prev?.compensationHours ?? null,
          totalWorkedHours: m.figures.totalWorkedHours ?? prev?.totalWorkedHours ?? null,
        };
        if (Object.values(merged).some((v) => typeof v === 'number')) await actions.saveFigures(merged);
      }
      await actions.saveBoard({
        ...board,
        extraction,
        months: months.map((m) => m.month),
        status: 'reviewed',
        shiftCount: workShifts.length,
      });
      router.dismissTo('/');
    } finally {
      setSaving(false);
    }
  };

  const editing = editDate ? drafts[editDate] : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Revisar turnos"
        subtitle={ENGINE_NAMES[extraction.engine]}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {board.imageUri ? <IconButton icon="image" label="Ver la foto original" onPress={() => setShowPhoto(true)} /> : null}
            <IconButton icon="x" label="Cerrar sin guardar" onPress={() => router.back()} />
          </View>
        }
      >
        <Card>
          <T v="label">Detectado</T>
          <T v="heading" style={{ marginTop: 2 }}>{months.map((m) => monthLabel(m.month)).join(' · ')}</T>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <Stat label="Turnos" value={String(workShifts.length)} />
            <Stat label="Días libres" value={String(offDays.length)} />
            <Stat label="Horas" value={formatHours(totalHours)} />
          </View>
        </Card>

        <View style={{ gap: space.sm, marginTop: space.md }}>
          {flagged.length > 0 ? (
            <Banner
              text={`${flagged.length} ${flagged.length === 1 ? 'día necesita' : 'días necesitan'} que lo compruebes. Están marcados con borde discontinuo.`}
            />
          ) : (
            <Banner tone="info" icon="check-circle" text="Todos los códigos se han reconocido. Echa un vistazo y confirma." />
          )}
          {extraction.warnings.map((w, i) => (
            <Banner key={i} text={w} icon="info" />
          ))}
          {initial.legendCodes.length > 0 ? (
            <Banner
              tone="info"
              icon="book-open"
              text={`La leyenda de la foto añade o actualiza en tu diccionario: ${initial.legendCodes.map((c) => c.code).join(', ')}.`}
            />
          ) : null}
        </View>

        {months.map((m, index) => {
          const monthDrafts = all.filter((d) => monthKey(d.date) === m.month);
          const computed = Math.round(monthDrafts.reduce((a, d) => a + d.hours, 0) * 100) / 100;
          const matches = m.statedTotal != null && Math.abs(m.statedTotal - computed) < 0.01;
          return (
            <Section
              key={`${index}-${m.month}`}
              title={monthLabel(m.month)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Tap onPress={() => shiftMonth(index, -1)} label="Mes anterior" scaleTo={0.9} style={{ padding: 4 }}>
                    <Feather name="chevron-left" size={18} color={t.sub} />
                  </Tap>
                  <T v="caption">Cambiar mes</T>
                  <Tap onPress={() => shiftMonth(index, 1)} label="Mes siguiente" scaleTo={0.9} style={{ padding: 4 }}>
                    <Feather name="chevron-right" size={18} color={t.sub} />
                  </Tap>
                </View>
              }
            >
              <Card>
                <MonthGrid month={m.month} shifts={drafts} flagged={flaggedSet} selected={editDate} onSelect={setEditDate} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md, paddingTop: space.md, borderTopWidth: 0.5, borderTopColor: t.border }}>
                  <Feather
                    name={m.statedTotal == null ? 'clock' : matches ? 'check-circle' : 'alert-triangle'}
                    size={16}
                    color={m.statedTotal == null ? t.sub : matches ? t.tones.off.fg : t.warnFg}
                  />
                  <T v="label" style={{ flex: 1 }} color={m.statedTotal != null && !matches ? t.warnFg : undefined}>
                    {m.statedTotal == null
                      ? `${formatHours(computed)} en total`
                      : matches
                        ? `${formatHours(computed)}: coincide con el total de la cartelera`
                        : `Suman ${formatHours(computed)}, pero la cartelera dice ${formatHours(m.statedTotal)}`}
                  </T>
                </View>
              </Card>
            </Section>
          );
        })}

        <Section title="Días">
          {flagged.length > 0 ? (
            <View style={{ marginBottom: space.md }}>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'issues', label: `Por revisar (${flagged.length})` },
                  { value: 'all', label: `Todos (${all.length})` },
                ]}
              />
            </View>
          ) : null}
          <Card style={{ paddingVertical: 4 }}>
            {(effectiveFilter === 'issues' ? flagged : all).map((d, i, list) => (
              <DayRow
                key={d.date}
                date={d.date}
                shift={d.code ? d : undefined}
                warning={d.issues[0] ? ISSUE_TEXT[d.issues[0]] : undefined}
                last={i === list.length - 1}
                onPress={() => setEditDate(d.date)}
              />
            ))}
          </Card>
        </Section>
        {extraction.debug ? (
          <Button
            title="¿Algo mal leído? Enviar diagnóstico"
            kind="ghost"
            icon="send"
            onPress={() => shareDiagnostics(extraction).catch(() => undefined)}
          />
        ) : null}
      </Screen>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: space.lg,
          paddingBottom: insets.bottom + space.md,
          backgroundColor: t.bg,
          borderTopWidth: 0.5,
          borderTopColor: t.border,
        }}
      >
        <Button title={`Confirmar y guardar ${savable.length} días`} icon="check" big loading={saving} onPress={confirm} />
      </View>

      <ShiftEditor
        visible={!!editDate}
        date={editDate}
        initial={editing?.code ? editing : undefined}
        codes={codes}
        warning={editing?.issues.map((i) => ISSUE_TEXT[i]).join('. ')}
        onClose={() => setEditDate(null)}
        onSave={async (shift, learned) => {
          setEditDate(null);
          const nextDrafts: DraftMap = { ...drafts, [shift.date]: { ...shift, issues: [], statedHours: editing?.statedHours ?? null } };
          if (learned) {
            await actions.saveCode(learned);
            // El resto de días con ese código se vuelven a interpretar con lo aprendido.
            const dict = getState().codes;
            for (const d of Object.values(drafts)) {
              if (d.code === learned.code && d.date !== shift.date && !d.manual) {
                nextDrafts[d.date] = resolveShift(d.date, d.code, d.statedHours, dict, { holiday: d.isHoliday, boardId: id });
              }
            }
          }
          setDrafts(nextDrafts);
        }}
      />

      <Sheet visible={showPhoto} onClose={() => setShowPhoto(false)} title="Foto original">
        {board.imageUri ? (
          <Image source={{ uri: board.imageUri }} resizeMode="contain" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12 }} />
        ) : null}
      </Sheet>
    </View>
  );
}
