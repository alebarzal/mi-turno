import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { actions, useStore } from '../data/store';
import { codeVariants, normalizeCode } from '../domain/codes';
import { formatHours, inferType, normalizeTime } from '../domain/time';
import type { CodeDef } from '../domain/types';
import { Banner, Button, Card, Chip, Field, IconButton, Screen, Sheet, T, confirmAsync } from '../ui/kit';
import { parseSegments, SegmentsEditor, toDraft, type SegmentDraft } from '../ui/ShiftEditor';
import { space, useTheme } from '../ui/theme';

const SOURCE_TEXT: Record<CodeDef['source'], string> = {
  initial: 'De tu cartelera de referencia',
  legend: 'Leído de una leyenda',
  user: 'Corregido por ti',
};

function describe(c: CodeDef): string {
  if (c.segments.length === 0) return 'Sin horario';
  const ends = c.endOptions && c.endOptions.length > 1 ? c.endOptions.join(' / ') : null;
  return c.segments
    .map((s, i) => {
      const end = ends && i === c.segments.length - 1 ? ends : s.end;
      return `${s.start}–${end}${s.location ? ` ${s.location}` : ''}`;
    })
    .join('  ·  ');
}

export default function CodesScreen() {
  const t = useTheme();
  const codes = useStore((s) => s.codes);
  const list = Object.values(codes).sort((a, b) => a.code.localeCompare(b.code));

  const [open, setOpen] = useState<{ original: CodeDef | null } | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [ends, setEnds] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const o = open.original;
    setCode(o?.code ?? '');
    setLabel(o?.label ?? '');
    setSegments(o?.segments.map(toDraft) ?? []);
    setEnds(o?.endOptions && o.endOptions.length > 1 ? o.endOptions.join(', ') : '');
    setError(null);
  }, [open]);

  const save = async () => {
    const norm = normalizeCode(code);
    if (!norm) return setError('Escribe el código.');
    if (!open?.original && codes[norm]) return setError(`El código «${norm}» ya existe.`);
    const parsed = parseSegments(segments);
    if (!parsed) return setError('Revisa las horas: usa el formato 10:00.');
    let endOptions: string[] | undefined;
    if (ends.trim() && parsed.length > 0) {
      const list = ends.split(/[,/;]\s*|\s+/).filter(Boolean).map(normalizeTime);
      if (list.some((e) => e === null)) return setError('Revisa las salidas alternativas: usa el formato 21:00, 22:00.');
      endOptions = list as string[];
      if (endOptions.length > 1) parsed[parsed.length - 1].end = endOptions[0];
      else endOptions = undefined;
    }
    const def: CodeDef = {
      code: norm,
      label: label.trim() || norm,
      type: parsed.length === 0 ? (open?.original?.segments.length === 0 ? open.original.type : 'off') : inferType(parsed),
      segments: parsed,
      endOptions,
      source: 'user',
      updatedAt: new Date().toISOString(),
    };
    setOpen(null);
    await actions.saveCode(def);
  };

  return (
    <Screen
      title="Diccionario"
      subtitle="Códigos de turno"
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="plus" label="Añadir código" onPress={() => setOpen({ original: null })} />
          <IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />
        </View>
      }
    >
      <T v="body" color={t.sub} style={{ marginBottom: space.md }}>
        Lo que significa cada código de tu cartelera. Se usa para convertir cada cartelera nueva en horarios. Lo que corrijas aquí no lo
        cambiará ninguna leyenda.
      </T>
      <View style={{ gap: space.sm }}>
        {list.map((c) => (
          <Card key={c.code} onPress={() => setOpen({ original: c })} style={{ padding: 14, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Chip text={c.code} tone={c.type} />
              <T v="label" color={t.text} style={{ flex: 1 }} numberOfLines={1}>{c.label}</T>
              {c.segments.length > 0 ? (
                <T v="caption">{codeVariants(c).map((v) => formatHours(v.hours).replace(' h', '')).join('/')} h</T>
              ) : null}
            </View>
            <T v="caption" color={t.text}>{describe(c)}</T>
            <T v="caption" color={t.faint}>{SOURCE_TEXT[c.source]}</T>
          </Card>
        ))}
      </View>

      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open?.original ? `Código ${open.original.code}` : 'Código nuevo'}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {open?.original ? (
              <Button
                title="Eliminar"
                kind="danger"
                icon="trash-2"
                onPress={async () => {
                  const c = open.original!;
                  if (await confirmAsync('Eliminar código', `«${c.code}» dejará de reconocerse en futuras carteleras. Los turnos ya guardados no cambian.`, 'Eliminar', true)) {
                    setOpen(null);
                    await actions.deleteCode(c.code);
                  }
                }}
              />
            ) : null}
            <Button title="Guardar" onPress={save} style={{ flex: 1 }} />
          </View>
        }
      >
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 100 }}>
              <Field label="Código" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} editable={!open?.original} maxLength={6} placeholder="CS" />
            </View>
            <Field label="Nombre" value={label} onChangeText={setLabel} placeholder="Mañana, partido…" />
          </View>
          <Card style={{ padding: 14 }}>
            <T v="label" style={{ marginBottom: 10 }}>Horario (vacío = día libre)</T>
            <SegmentsEditor value={segments} onChange={setSegments} />
          </Card>
          {segments.length > 0 ? (
            <Field
              label="Salidas alternativas del último tramo"
              value={ends}
              onChangeText={setEnds}
              placeholder="21:00, 22:00, 23:00"
              hint="Si el código puede acabar a varias horas. Se elige con las horas que marque la cartelera ese día."
            />
          ) : null}
          {error ? <Banner text={error} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
