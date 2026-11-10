import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { actions, getState, snapshot, useStore } from '../data/store';
import { buildPackage, receivePackage, relayUrl, sendPackage, type SharePackage } from '../services/share';
import { formatImported } from '../ui/boardText';
import { Banner, Button, Card, Field, IconButton, Row, Screen, Section, Sheet, T, confirmAsync, notify } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function ShareScreen() {
  const t = useTheme();
  const settings = useStore((s) => s.settings);
  const shared = useStore((s) => s.shared);
  const shiftCount = useStore((s) => Object.keys(s.shifts).length);
  const syncAt = useStore((s) => s.syncAt);
  const syncError = useStore((s) => s.syncError);
  const linked = !!settings.sync;
  const base = relayUrl(settings.relayUrl);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ code: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<SharePackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(settings.relayUrl);

  // Cuenta atrás del código generado.
  useEffect(() => {
    if (!sent) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sent]);
  const remaining = sent ? sent.until - now : 0;
  const active = sent && remaining > 0 ? sent : null;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const channel = await actions.ensureChannel();
      const res = await sendPackage(base, buildPackage(snapshot(), settings.employeeName, channel));
      setNow(Date.now());
      setSent({ code: res.code, until: Date.now() + res.expiresIn * 1000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido generar el código.');
    } finally {
      setSending(false);
    }
  };

  const receive = async () => {
    setReceiving(true);
    setError(null);
    try {
      setReceived(await receivePackage(base, code));
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido recibir los datos.');
    } finally {
      setReceiving(false);
    }
  };

  const keepAsCalendar = async () => {
    if (!received) return;
    const id = newId();
    await actions.saveShared({ id, name: received.name, receivedAt: new Date().toISOString(), shifts: received.shifts, codes: received.codes, channel: received.channel });
    setReceived(null);
    router.push({ pathname: '/shared/[id]', params: { id } });
  };

  const replaceMine = async () => {
    if (!received) return;
    const ok = await confirmAsync(
      'Sustituir mis datos',
      `Tus ${shiftCount} días actuales se cambiarán por los ${received.shifts.length} días recibidos de ${received.name}. No se puede deshacer.${received.channel ? ' Los dos teléfonos quedarán enlazados: lo que cambies en uno cambiará en el otro.' : ''}`,
      'Sustituir',
      true,
    );
    if (!ok) return;
    const st = getState();
    await actions.restore({ shifts: received.shifts, codes: received.codes, figures: received.figures, boards: st.boards, settings: st.settings });
    const channel = received.channel;
    setReceived(null);
    if (channel) await actions.joinChannel(channel);
    notify('Datos sustituidos', channel ? 'Ya tienes los turnos recibidos. A partir de ahora los dos teléfonos se mantienen iguales.' : 'Ya tienes en tu calendario los turnos recibidos.');
  };

  return (
    <Screen title="Compartir" right={<IconButton icon="arrow-left" label="Volver" onPress={() => router.back()} />}>
      <T v="body" color={t.sub}>
        Pasa tus turnos a otra persona que tenga Mi Turno con un código de 6 cifras. El código vale 10 minutos y un solo uso; después, los cambios que hagas le llegan solos, sin volver a compartir.
      </T>

      {!base ? (
        <View style={{ marginTop: space.md }}>
          <Banner text="El servicio de intercambio aún no está configurado en esta copia de la app. Escribe abajo su dirección para poder compartir." />
        </View>
      ) : null}
      {error ? (
        <View style={{ marginTop: space.md }}>
          <Banner text={error} />
        </View>
      ) : null}

      {linked ? (
        <Section title="Sincronización">
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Feather name={syncError ? 'cloud-off' : 'refresh-cw'} size={20} color={syncError ? t.warnFg : t.accent} />
              <View style={{ flex: 1 }}>
                <T v="heading">{syncError ? 'Sin conexión con el servicio' : 'Sincronización activa'}</T>
                <T v="caption">
                  {syncError
                    ? 'Tus cambios se enviarán en cuanto vuelva la conexión.'
                    : syncAt
                      ? `Última actualización a las ${new Date(syncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Tus cambios llegan solos a quien tenga tu código.'}
                </T>
              </View>
            </View>
            <Button
              title="Dejar de sincronizar"
              kind="soft"
              icon="x-circle"
              onPress={async () => {
                const ok = await confirmAsync(
                  'Dejar de sincronizar',
                  'Este teléfono dejará de enviar y recibir cambios. Tus turnos se quedan como están. Para volver a enlazarlo habrá que compartir un código nuevo.',
                  'Dejar de sincronizar',
                  true,
                );
                if (ok) await actions.stopSync();
              }}
            />
          </Card>
        </Section>
      ) : null}

      <Section title="Enviar mis datos">
        <Card style={{ gap: space.md }}>
          {active ? (
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: space.sm }}>
              <T v="label">Dile este código a la otra persona</T>
              <Text
                selectable
                accessibilityLabel={`Código ${active.code.split('').join(' ')}`}
                style={{ color: t.text, fontSize: 46, fontWeight: '700', letterSpacing: 6, fontVariant: ['tabular-nums'] }}
              >
                {active.code.slice(0, 3)} {active.code.slice(3)}
              </Text>
              <T v="caption">Caduca en {mmss(remaining)}</T>
            </View>
          ) : (
            <T v="label">
              Se envían tus {shiftCount} días de turnos, tu diccionario de códigos y tus cifras de horas. No se envían las fotos de las
              carteleras ni tus ajustes.
            </T>
          )}
          <Button
            title={active ? 'Generar otro código' : sent ? 'El código ha caducado: generar otro' : 'Generar código'}
            icon="send"
            kind={active ? 'soft' : 'primary'}
            loading={sending}
            disabled={!base || shiftCount === 0}
            onPress={send}
          />
          {shiftCount === 0 ? <T v="caption">Todavía no tienes turnos que compartir.</T> : null}
        </Card>
      </Section>

      <Section title="Recibir con un código">
        <Card style={{ gap: space.md }}>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            accessibilityLabel="Código de 6 cifras"
            style={{ fontSize: 30, fontWeight: '700', letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          />
          <Button title="Recibir" icon="download" loading={receiving} disabled={!base || code.length !== 6} onPress={receive} />
        </Card>
      </Section>

      <Section title="Calendarios recibidos">
        {shared.length === 0 ? (
          <T v="caption" style={{ marginHorizontal: 4 }}>Aquí aparecerán los calendarios que otras personas compartan contigo.</T>
        ) : (
          <Card style={{ paddingVertical: 2 }}>
            {shared.map((c, i) => (
              <Row
                key={c.id}
                icon="user"
                title={c.name}
                detail={`${c.shifts.length} días · ${c.channel ? 'se actualiza solo' : `recibido el ${formatImported(c.receivedAt)}`}`}
                last={i === shared.length - 1}
                onPress={() => router.push({ pathname: '/shared/[id]', params: { id: c.id } })}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Servicio de intercambio">
        <Card style={{ gap: space.md }}>
          <Field
            label="Dirección del servicio"
            value={url}
            onChangeText={setUrl}
            placeholder={base || 'https://…'}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onBlur={() => {
              if (url.trim() !== settings.relayUrl) actions.updateSettings({ relayUrl: url.trim() });
            }}
            hint="Las dos personas deben usar la misma dirección. Déjalo vacío para usar la que trae la app."
          />
        </Card>
      </Section>

      <Sheet visible={!!received} onClose={() => setReceived(null)} title="Datos recibidos">
        {received ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderRadius: radius.md, padding: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="user" size={20} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="heading">{received.name}</T>
                <T v="caption">{received.shifts.length} días de turnos · {received.codes.length} códigos</T>
              </View>
            </View>
            <Button title={`Guardar como calendario de ${received.name}`} icon="eye" onPress={keepAsCalendar} />
            <T v="caption" style={{ textAlign: 'center' }}>Podrás consultarlo sin que se mezcle con tus turnos{received.channel ? ', y se actualizará solo cuando cambie' : ''}.</T>
            <Button title="Sustituir mis datos por estos" kind="danger" icon="repeat" onPress={replaceMine} />
            <T v="caption" style={{ textAlign: 'center' }}>Para tener los mismos turnos en dos teléfonos: lo que cambies en uno cambia en el otro.</T>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
