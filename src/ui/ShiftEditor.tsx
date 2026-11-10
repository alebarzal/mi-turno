import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { codeVariants, normalizeCode, type Dictionary } from '../domain/codes';
import { formatHours, inferType, longDate, normalizeTime, segmentsHours } from '../domain/time';
import type { CodeDef, Segment, Shift } from '../domain/types';
import { Banner, Button, Card, Field, Sheet, SwitchRow, T, Tap } from './kit';
import { radius, useTheme } from './theme';

export interface SegmentDraft {
  start: string;
  end: string;
  location: string;
}

export const toDraft = (s: Segment): SegmentDraft => ({ start: s.start, end: s.end, location: s.location ?? '' });

/** Valida los tramos escritos a mano. Devuelve null si alguna hora no es válida. */
export function parseSegments(drafts: SegmentDraft[]): Segment[] | null {
  const out: Segment[] = [];
  for (const d of drafts) {
    const start = normalizeTime(d.start);
    const end = normalizeTime(d.end);
    if (!start || !end) return null;
    out.push({ start, end, location: d.location.trim() || undefined });
  }
  return out;
}

export function SegmentsEditor({ value, onChange }: { value: SegmentDraft[]; onChange: (v: SegmentDraft[]) => void }) {
  const t = useTheme();
  const patch = (i: number, p: Partial<SegmentDraft>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <View style={{ gap: 10 }}>
      {value.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ width: 78 }}>
            <Field
              label={i === 0 ? 'Entrada' : undefined}
              value={s.start}
              onChangeText={(v) => patch(i, { start: v })}
              onBlur={() => patch(i, { start: normalizeTime(s.start) ?? s.start })}
              placeholder="10:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              accessibilityLabel={`Entrada del tramo ${i + 1}`}
            />
          </View>
          <View style={{ width: 78 }}>
            <Field
              label={i === 0 ? 'Salida' : undefined}
              value={s.end}
              onChangeText={(v) => patch(i, { end: v })}
              onBlur={() => patch(i, { end: normalizeTime(s.end) ?? s.end })}
              placeholder="14:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              accessibilityLabel={`Salida del tramo ${i + 1}`}
            />
          </View>
          <Field
            label={i === 0 ? 'Lugar' : undefined}
            value={s.location}
            onChangeText={(v) => patch(i, { location: v })}
            placeholder="Opcional"
            accessibilityLabel={`Lugar del tramo ${i + 1}`}
          />
          <Tap onPress={() => onChange(value.filter((_, j) => j !== i))} label="Quitar tramo" scaleTo={0.9} style={{ padding: 10 }}>
            <Feather name="minus-circle" size={20} color={t.faint} />
          </Tap>
        </View>
      ))}
      <Button
        title={value.length === 0 ? 'Añadir horario' : 'Añadir otro tramo'}
        icon="plus"
        kind="soft"
        onPress={() => onChange([...value, { start: '', end: '', location: value[value.length - 1]?.location ?? '' }])}
      />
    </View>
  );
}

function sameSegments(a: Segment[], b: Segment[]) {
  const n = (s: Segment[]) => JSON.stringify(s.map((x) => [x.start, x.end, x.location ?? '']));
  return n(a) === n(b);
}

/**
 * Editor de un turno. Sirve tanto para los turnos del calendario como para los borradores
 * de la revisión. Si se activa «Recordar», devuelve también la definición del código para
 * que el diccionario la aprenda.
 */
export function ShiftEditor({
  visible,
  date,
  initial,
  codes,
  warning,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  date: string | null;
  initial?: Shift;
  codes: Dictionary;
  warning?: string;
  onSave: (shift: Shift, learned: CodeDef | null) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [code, setCode] = useState('');
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [hoursText, setHoursText] = useState('');
  const [isHoliday, setHoliday] = useState(false);
  const [notes, setNotes] = useState('');
  const [learn, setLearn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCode(initial?.code ?? '');
    setSegments(initial?.segments.map(toDraft) ?? []);
    setHoursText('');
    setHoliday(initial?.isHoliday ?? false);
    setNotes(initial?.notes ?? '');
    setLearn(!!initial?.code && !codes[initial.code]);
    setError(null);
    // Solo al abrir: no reiniciar mientras se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, date]);

  const norm = normalizeCode(code);
  const known = codes[norm];
  const variants = useMemo(() => (known ? codeVariants(known) : []), [known]);
  const parsed = parseSegments(segments);
  const autoHours = parsed ? segmentsHours(parsed) : 0;
  const initialHoursDiffer = initial && parsed && sameSegments(initial.segments, parsed) && initial.hours !== autoHours;
  const sortedCodes = useMemo(
    () => Object.values(codes).sort((a, b) => Number(b.type === 'off') - Number(a.type === 'off') || a.code.localeCompare(b.code)),
    [codes],
  );

  const applyCode = (c: CodeDef, variant = 0) => {
    setCode(c.code);
    setSegments(codeVariants(c)[variant].segments.map(toDraft));
    setHoursText('');
    setLearn(false);
    setError(null);
  };

  const save = () => {
    if (!date) return;
    if (!norm) return setError('Escribe el código del turno (por ejemplo CS, T o D).');
    if (!parsed) return setError('Revisa las horas: usa el formato 10:00.');
    let hours = autoHours;
    if (hoursText.trim()) {
      const h = Number(hoursText.replace(',', '.'));
      if (!Number.isFinite(h) || h < 0 || h > 24) return setError('Las horas deben ser un número entre 0 y 24.');
      hours = h;
    } else if (initialHoursDiffer) {
      hours = initial!.hours;
    }
    const type = parsed.length === 0 ? (known?.type && known.segments.length === 0 ? known.type : 'off') : inferType(parsed);
    const shift: Shift = {
      date,
      code: norm,
      type,
      segments: parsed,
      hours,
      isHoliday,
      notes: notes.trim(),
      boardId: initial?.boardId ?? null,
      manual: true,
    };
    let learned: CodeDef | null = null;
    if (learn) {
      // Si el horario ya coincide con una variante conocida no hay nada nuevo que aprender.
      const already = variants.some((v) => sameSegments(v.segments, parsed));
      if (!already) {
        learned = {
          code: norm,
          label: known?.label ?? norm,
          type,
          segments: parsed,
          source: 'user',
          updatedAt: new Date().toISOString(),
        };
      }
    }
    onSave(shift, learned);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={date ? longDate(date) : ''}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onDelete ? <Button title="Eliminar" kind="danger" icon="trash-2" onPress={onDelete} /> : null}
          <Button title="Guardar" onPress={save} style={{ flex: 1 }} />
        </View>
      }
    >
      <View style={{ gap: 14 }}>
        {warning ? <Banner text={warning} /> : null}

        <View>
          <T v="caption" style={{ marginBottom: 6, marginLeft: 2 }}>Código</T>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ width: 96 }}>
              <Field
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setLearn(!codes[normalizeCode(v)]);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="CS"
                maxLength={6}
                accessibilityLabel="Código del turno"
                style={{ fontWeight: '700', fontSize: 18 }}
              />
            </View>
            <T v="label" style={{ flex: 1 }} numberOfLines={2}>
              {known ? known.label : norm ? 'Código nuevo' : 'Elige uno o escríbelo'}
            </T>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
            {sortedCodes.map((c) => {
              const on = c.code === norm;
              const tone = t.tones[c.type];
              return (
                <Tap
                  key={c.code}
                  onPress={() => applyCode(c)}
                  label={`Usar código ${c.code}`}
                  style={{
                    backgroundColor: tone.bg,
                    borderRadius: 9,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderWidth: 1.5,
                    borderColor: on ? tone.fg : 'transparent',
                  }}
                >
                  <Text style={{ color: tone.fg, fontWeight: '700', fontSize: 13.5 }}>{c.code}</Text>
                </Tap>
              );
            })}
          </ScrollView>
        </View>

        {known && variants.length > 1 ? (
          <View>
            <T v="caption" style={{ marginBottom: 6, marginLeft: 2 }}>Hora de salida de «{known.code}»</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {variants.map((v, i) => {
                const on = !!parsed && sameSegments(v.segments, parsed);
                return (
                  <Tap
                    key={i}
                    onPress={() => applyCode(known, i)}
                    style={{
                      borderRadius: radius.sm,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: on ? t.accent : t.card,
                      borderWidth: 1,
                      borderColor: on ? t.accent : t.border,
                    }}
                  >
                    <Text style={{ color: on ? t.onAccent : t.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {v.segments[v.segments.length - 1].end} · {formatHours(v.hours)}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          </View>
        ) : null}

        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <T v="label" style={{ flex: 1 }}>Horario</T>
            <T v="label" color={t.text}>
              {segments.length === 0 ? 'Día libre' : parsed ? formatHours(autoHours) : '—'}
            </T>
          </View>
          <SegmentsEditor value={segments} onChange={setSegments} />
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 130 }}>
            <Field
              label="Horas computadas"
              value={hoursText}
              onChangeText={setHoursText}
              placeholder={String(initialHoursDiffer ? initial!.hours : autoHours).replace('.', ',')}
              keyboardType="decimal-pad"
            />
          </View>
          <Field label="Observaciones" value={notes} onChangeText={setNotes} placeholder="Opcional" />
        </View>

        <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
          <SwitchRow title="Festivo" value={isHoliday} onChange={setHoliday} />
          <SwitchRow
            title={`Recordar «${norm || '…'}» con este horario`}
            detail={
              known
                ? 'Cambia el diccionario para futuras carteleras. Desactivado, solo se cambia este día.'
                : 'Se guarda en tu diccionario para futuras carteleras.'
            }
            value={learn}
            onChange={setLearn}
            last
          />
        </Card>

        {error ? <Banner text={error} /> : null}
      </View>
    </Sheet>
  );
}
