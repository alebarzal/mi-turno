import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useTheme, type Tone } from './theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function haptic() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

// ── Texto ──────────────────────────────────────────────────────────────────

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'number';

const VARIANTS: Record<Variant, TextStyle> = {
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 12.5, lineHeight: 17 },
  number: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
};

export function T({
  v = 'body',
  color,
  style,
  ...rest
}: React.ComponentProps<typeof Text> & { v?: Variant; color?: string }) {
  const t = useTheme();
  const base = v === 'caption' || v === 'label' ? t.sub : t.text;
  return <Text {...rest} style={[VARIANTS[v], { color: color ?? base }, style]} />;
}

// ── Pulsable con respuesta suave ───────────────────────────────────────────

export function Tap({
  onPress,
  children,
  style,
  disabled,
  label,
  scaleTo = 0.97,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  label?: string;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  // Las propiedades que colocan el elemento dentro de su padre (flex, márgenes…) deben ir en
  // el Pressable exterior; el resto, en la vista animada interior.
  const flat = StyleSheet.flatten(style) ?? {};
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical, ...inner } = flat;
  const outer: ViewStyle = { flex, flexGrow, flexShrink, flexBasis, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={outer}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      onPress={() => {
        haptic();
        onPress?.();
      }}
    >
      <Animated.View style={[inner, { transform: [{ scale }], opacity: disabled ? 0.45 : 1 }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Aparición suave al montar. */
export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 320, delay, useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View
      style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

// ── Contenedores ───────────────────────────────────────────────────────────

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const s: StyleProp<ViewStyle> = [
    {
      backgroundColor: t.card,
      borderRadius: radius.lg,
      padding: space.lg,
      borderWidth: t.dark ? StyleSheet.hairlineWidth : 0,
      borderColor: t.border,
      shadowColor: '#101020',
      shadowOpacity: t.dark ? 0 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: t.dark ? 0 : 1,
    },
    style,
  ];
  return onPress ? <Tap onPress={onPress} style={s}>{children}</Tap> : <View style={s}>{children}</View>;
}

export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  footer,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.lg }}>
      <View style={{ flex: 1 }}>
        {subtitle ? <T v="label" style={{ marginBottom: 2 }}>{subtitle}</T> : null}
        <T v="title">{title}</T>
      </View>
      {right}
    </View>
  ) : null;
  const pad = { paddingTop: insets.top + space.lg, paddingHorizontal: space.lg };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[pad, { flex: 1 }]}>
          {header}
          {children}
        </View>
      )}
      {footer}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm, paddingHorizontal: 4 }}>
        <T v="label" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 }}>{title}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

// ── Botones y chips ────────────────────────────────────────────────────────

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
  big,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'soft' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'soft' ? t.accentSoft : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? t.danger : t.accent;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      label={title}
      style={[
        {
          backgroundColor: bg,
          borderRadius: big ? radius.lg : radius.md,
          paddingVertical: big ? 17 : 13,
          paddingHorizontal: space.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={big ? 20 : 17} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: big ? 17 : 15.5, fontWeight: '600' }}>{title}</Text>
    </Tap>
  );
}

export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress?: () => void; label: string; color?: string }) {
  const t = useTheme();
  return (
    <Tap
      onPress={onPress}
      label={label}
      scaleTo={0.9}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.border,
      }}
    >
      <Feather name={icon} size={18} color={color ?? t.text} />
    </Tap>
  );
}

export function Chip({ text, tone, small, style }: { text: string; tone: Tone; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = t.tones[tone];
  return (
    <View
      style={[
        { backgroundColor: c.bg, borderRadius: small ? 6 : 8, paddingHorizontal: small ? 5 : 9, paddingVertical: small ? 2 : 4, alignSelf: 'flex-start' },
        style,
      ]}
    >
      <Text numberOfLines={1} style={{ color: c.fg, fontSize: small ? 11 : 13, fontWeight: '700', letterSpacing: 0.2 }}>
        {text}
      </Text>
    </View>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.dark ? t.card : '#EAEAEF', borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: radius.md - 3,
              alignItems: 'center',
              backgroundColor: on ? (t.dark ? t.elevated : '#FFFFFF') : 'transparent',
              shadowColor: '#000',
              shadowOpacity: on && !t.dark ? 0.08 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text style={{ color: on ? t.text : t.sub, fontWeight: on ? '600' : '500', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Formularios ────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  style,
  ...rest
}: TextInputProps & { label?: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {label ? <T v="caption" style={{ marginBottom: 5, marginLeft: 2 }}>{label}</T> : null}
      <TextInput
        placeholderTextColor={t.faint}
        {...rest}
        style={[
          {
            backgroundColor: t.dark ? t.elevated : '#F2F2F5',
            color: t.text,
            borderRadius: radius.sm,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === 'ios' ? 12 : 9,
            fontSize: 16,
          },
          style,
        ]}
      />
      {hint ? <T v="caption" style={{ marginTop: 4, marginLeft: 2 }}>{hint}</T> : null}
    </View>
  );
}

export function Row({
  title,
  detail,
  icon,
  right,
  onPress,
  last,
  danger,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  const t = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
        gap: 12,
      }}
    >
      {icon ? <Feather name={icon} size={18} color={danger ? t.danger : t.sub} /> : null}
      <View style={{ flex: 1 }}>
        <T v="body" color={danger ? t.danger : undefined}>{title}</T>
        {detail ? <T v="caption" style={{ marginTop: 1 }}>{detail}</T> : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={t.faint} /> : null)}
    </View>
  );
  return onPress ? <Tap onPress={onPress} scaleTo={0.99}>{body}</Tap> : body;
}

export function SwitchRow({
  title,
  detail,
  value,
  onChange,
  last,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Row
      title={title}
      detail={detail}
      last={last}
      right={<Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.border }} />}
    />
  );
}

export function Banner({ text, icon = 'alert-triangle', tone = 'warn' }: { text: string; icon?: IconName; tone?: 'warn' | 'info' }) {
  const t = useTheme();
  const bg = tone === 'warn' ? t.warnBg : t.accentSoft;
  const fg = tone === 'warn' ? t.warnFg : t.accent;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Feather name={icon} size={16} color={fg} style={{ marginTop: 2 }} />
      <Text style={{ color: fg, flex: 1, fontSize: 14, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: space.lg }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg }}>
        <Feather name={icon} size={26} color={t.accent} />
      </View>
      <T v="heading" style={{ textAlign: 'center' }}>{title}</T>
      <T v="body" color={t.sub} style={{ textAlign: 'center', marginTop: 6 }}>{text}</T>
      {children ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

// ── Hoja inferior ──────────────────────────────────────────────────────────

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Cerrar" style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            maxHeight: '90%',
            paddingBottom: insets.bottom + space.md,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
            <T v="heading" style={{ flex: 1 }}>{title ?? ''}</T>
            <Tap onPress={onClose} label="Cerrar" scaleTo={0.9} style={{ padding: 6 }}>
              <Feather name="x" size={22} color={t.sub} />
            </Tap>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Diálogos (Alert no existe en la web) ───────────────────────────────────

export function confirmAsync(title: string, message: string, okLabel = 'Aceptar', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') globalThis.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
