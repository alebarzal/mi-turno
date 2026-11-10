import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { actions, useStore } from '../data/store';
import { interpretBoard } from '../domain/interpret';
import type { Board } from '../domain/types';
import { ENGINE_NAMES, engineStatuses, recognizeBoard, type BoardExtraction, type EngineStatus } from '../recognition';
import { normText } from '../recognition/tableParser';
import { persistBoardImage, type PickedImage } from '../services/images';
import { Banner, Button, Card, IconButton, Screen, T, Tap, notify, type IconName } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

type Phase =
  | { kind: 'choose' }
  | { kind: 'working'; image: PickedImage; message: string }
  | { kind: 'who'; image: PickedImage; extraction: BoardExtraction; people: string[] }
  | { kind: 'error'; image: PickedImage | null; message: string };

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function ScanScreen() {
  const t = useTheme();
  const settings = useStore((s) => s.settings);
  const codes = useStore((s) => s.codes);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [engines, setEngines] = useState<EngineStatus[] | null>(null);

  useEffect(() => {
    engineStatuses().then(setEngines);
  }, []);

  const wanted = settings.engine === 'auto' ? (['claude', 'local'] as const) : ([settings.engine] as const);
  const usable = engines?.filter((e) => wanted.includes(e.id as never) && !e.unavailableReason) ?? [];
  const active = usable[0]?.id;

  /** Crea la cartelera pendiente de revisión y abre la pantalla de revisión. */
  const finish = async (extraction: BoardExtraction, image: PickedImage | null) => {
    const id = newId();
    const { months, drafts } = interpretBoard(extraction, codes, { boardId: id });
    const board: Board = {
      id,
      imageUri: image ? await persistBoardImage(image, id) : null,
      months: months.map((m) => m.month),
      importedAt: new Date().toISOString(),
      status: 'pending',
      engine: extraction.engine,
      shiftCount: drafts.filter((d) => d.segments.length > 0).length,
      extraction,
    };
    await actions.saveBoard(board);
    router.replace({ pathname: '/review/[id]', params: { id } });
  };

  const analyze = async (image: PickedImage, chosen?: string) => {
    const employeeName = chosen ?? settings.employeeName;
    setPhase({ kind: 'working', image, message: 'Preparando la imagen…' });
    try {
      const extraction = await recognizeBoard({ ...image, employeeName, knownCodes: Object.keys(codes) }, settings.engine, (id) =>
        setPhase({
          kind: 'working',
          image,
          message:
            id === 'claude'
              ? `Buscando la fila de ${employeeName} y leyendo la leyenda…`
              : `Leyendo el texto de la cartelera en el teléfono…`,
        }),
      );
      // La primera vez (o si no aparece el nombre guardado) se pregunta cuál de las filas es la suya.
      const people = extraction.people ?? [];
      const confirmed = chosen != null || settings.nameChosen;
      if (people.length > 1 && (!confirmed || !extraction.employeeFound)) {
        setPhase({ kind: 'who', image, extraction, people });
        return;
      }
      if (!extraction.employeeFound || extraction.months.length === 0) {
        setPhase({
          kind: 'error',
          image,
          message: extraction.employeeFound
            ? ['He encontrado tu nombre, pero no he podido leer la tabla. Prueba con una foto más nítida, de frente y con buena luz.', ...extraction.warnings].join('\n')
            : employeeName
              ? `No he encontrado ninguna fila con el nombre «${employeeName}». Comprueba que se vea en la foto o cambia el nombre en Ajustes.`
              : 'No he podido distinguir los nombres de la cartelera. Escribe tu nombre tal como aparece en Ajustes y vuelve a intentarlo.',
        });
        return;
      }
      await finish(extraction, image);
    } catch (e) {
      setPhase({ kind: 'error', image, message: e instanceof Error ? e.message : 'No se ha podido analizar la imagen.' });
    }
  };

  /** El usuario indica cuál de las filas detectadas es la suya; se recuerda para las próximas. */
  const choosePerson = async (name: string) => {
    if (phase.kind !== 'who') return;
    const { image, extraction } = phase;
    await actions.updateSettings({ employeeName: name, nameChosen: true });
    const same = normText(name) === normText(extraction.employeeName);
    if (same && extraction.employeeFound && extraction.months.length > 0) await finish(extraction, image);
    else await analyze(image, name);
  };

  const pick = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return notify('Sin acceso a la cámara', 'Permite el acceso a la cámara en los ajustes del teléfono para hacer la foto.');
      }
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      await analyze({ uri: a.uri, width: a.width, height: a.height });
    } catch (e) {
      notify('No se ha podido abrir la imagen', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Screen
      title="Añadir cartelera"
      right={<IconButton icon="x" label="Cerrar" onPress={() => router.back()} />}
    >
      {phase.kind === 'choose' ? (
        <View style={{ gap: space.md }}>
          <T v="body" color={t.sub}>
            Fotografía la cartelera completa, con la leyenda de horarios. Solo se leerá la fila de{' '}
            <T v="body" style={{ fontWeight: '700' }}>{settings.employeeName}</T>.
          </T>

          <Option icon="camera" title="Hacer una foto" text="Usa la cámara ahora mismo" onPress={() => pick('camera')} primary />
          <Option icon="image" title="Elegir de la galería" text="Usa una foto que ya tengas" onPress={() => pick('library')} />

          {engines && usable.length === 0 ? (
            <Banner
              text={`Ningún motor de lectura está disponible todavía.\n${engines
                .filter((e) => wanted.includes(e.id as never))
                .map((e) => `• ${e.unavailableReason}`)
                .join('\n')}`}
            />
          ) : active ? (
            <Banner
              tone="info"
              icon={active === 'claude' ? 'cloud' : 'smartphone'}
              text={
                active === 'claude'
                  ? 'Lectura con IA de visión: la foto se envía a Anthropic para analizarla. Puedes cambiarlo en Ajustes.'
                  : 'Lectura con el OCR del teléfono: la foto no sale del dispositivo.'
              }
            />
          ) : null}
          {engines && usable.length === 0 ? (
            <Button title="Abrir ajustes de reconocimiento" kind="soft" icon="sliders" onPress={() => router.replace('/settings')} />
          ) : null}

        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          {phase.image ? (
            <Image
              source={{ uri: phase.image.uri }}
              resizeMode="cover"
              style={{ width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: t.card, opacity: phase.kind === 'working' ? 0.75 : 1 }}
            />
          ) : null}
          {phase.kind === 'who' ? (
            <View style={{ gap: space.sm }}>
              <T v="heading">¿Cuál de estas filas es la tuya?</T>
              <T v="label" color={t.sub}>
                He encontrado estos nombres en la cartelera. Solo se leerá tu fila y lo recordaré para las próximas fotos.
              </T>
              {phase.people.map((p) => (
                <Option key={p} icon="user" title={p} text="Leer esta fila" onPress={() => choosePerson(p)} />
              ))}
              <Button title="Elegir otra foto" kind="soft" onPress={() => setPhase({ kind: 'choose' })} />
            </View>
          ) : phase.kind === 'working' ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <ActivityIndicator color={t.accent} />
              <View style={{ flex: 1 }}>
                <T v="heading">Analizando la cartelera</T>
                <T v="label" style={{ marginTop: 2 }}>{phase.message}</T>
              </View>
            </Card>
          ) : (
            <>
              <Banner text={phase.message} />
              {phase.image ? <Button title="Reintentar con esta foto" icon="refresh-cw" onPress={() => analyze(phase.image!)} /> : null}
              <Button title="Elegir otra foto" kind="soft" onPress={() => setPhase({ kind: 'choose' })} />
            </>
          )}
          {phase.kind === 'working' ? (
            <T v="caption" style={{ textAlign: 'center' }}>
              Suele tardar menos de un minuto. Después podrás revisar cada turno antes de guardarlo.
            </T>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Option({ icon, title, text, onPress, primary }: { icon: IconName; title: string; text: string; onPress: () => void; primary?: boolean }) {
  const t = useTheme();
  const fg = primary ? t.onAccent : t.text;
  return (
    <Tap
      onPress={onPress}
      label={title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 20,
        borderRadius: radius.lg,
        backgroundColor: primary ? t.accent : t.card,
        borderWidth: primary ? 0 : 1,
        borderColor: t.border,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? 'rgba(255,255,255,0.2)' : t.accentSoft,
        }}
      >
        <Feather name={icon} size={24} color={primary ? t.onAccent : t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="heading" color={fg}>{title}</T>
        <T v="label" color={primary ? t.onAccent : t.sub} style={{ opacity: primary ? 0.85 : 1, marginTop: 2 }}>{text}</T>
      </View>
      <Feather name="chevron-right" size={20} color={primary ? t.onAccent : t.faint} />
    </Tap>
  );
}
