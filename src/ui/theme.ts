import { useColorScheme } from 'react-native';

import { useStore } from '../data/store';
import type { Shift, ShiftType } from '../domain/types';

/** «past»: días que ya han ocurrido, en gris para distinguirlos de un vistazo. */
export type Tone = ShiftType | 'holiday' | 'past';

interface ToneColors {
  bg: string;
  fg: string;
  dot: string;
}

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  elevated: string;
  text: string;
  sub: string;
  faint: string;
  border: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  warnBg: string;
  warnFg: string;
  overlay: string;
  tones: Record<Tone, ToneColors>;
}

const light: Theme = {
  dark: false,
  bg: '#F5F5F7',
  card: '#FFFFFF',
  elevated: '#FFFFFF',
  text: '#111114',
  sub: '#6B6B76',
  faint: '#A3A3AE',
  border: '#E8E8ED',
  accent: '#5B5BD6',
  accentSoft: '#EEEEFC',
  onAccent: '#FFFFFF',
  danger: '#D1403A',
  warnBg: '#FFF4D6',
  warnFg: '#8A5A00',
  overlay: 'rgba(15,15,25,0.35)',
  tones: {
    morning: { bg: '#FFF3CC', fg: '#7A5600', dot: '#F2B90F' },
    afternoon: { bg: '#DDEAFF', fg: '#1B4DB3', dot: '#3B82F6' },
    night: { bg: '#EADFFF', fg: '#5A2DB8', dot: '#8B5CF6' },
    split: { bg: '#D6F3EF', fg: '#0E6B62', dot: '#14B8A6' },
    off: { bg: '#DDF4E1', fg: '#1E7A39', dot: '#34C759' },
    holiday: { bg: '#FCE2E0', fg: '#B32A22', dot: '#F26B63' },
    other: { bg: '#ECECF0', fg: '#55555F', dot: '#9A9AA6' },
    past: { bg: '#E6E6EB', fg: '#9494A0', dot: '#B9B9C4' },
  },
};

const dark: Theme = {
  dark: true,
  bg: '#0B0B0E',
  card: '#17171C',
  elevated: '#1F1F26',
  text: '#F2F2F5',
  sub: '#9A9AA6',
  faint: '#6A6A75',
  border: '#28282F',
  accent: '#8E8EF5',
  accentSoft: '#25254D',
  onAccent: '#0B0B0E',
  danger: '#FF6B63',
  warnBg: '#3A2E0C',
  warnFg: '#F2C55C',
  overlay: 'rgba(0,0,0,0.6)',
  tones: {
    morning: { bg: '#3B300E', fg: '#F5D36B', dot: '#F2B90F' },
    afternoon: { bg: '#14284D', fg: '#8DB7FF', dot: '#3B82F6' },
    night: { bg: '#2A1D4D', fg: '#C3A8FF', dot: '#8B5CF6' },
    split: { bg: '#0F3330', fg: '#6FE0D2', dot: '#14B8A6' },
    off: { bg: '#12331B', fg: '#7EDC95', dot: '#34C759' },
    holiday: { bg: '#40191A', fg: '#FF9C96', dot: '#F26B63' },
    other: { bg: '#26262E', fg: '#B5B5C0', dot: '#6A6A75' },
    past: { bg: '#1E1E24', fg: '#686873', dot: '#4A4A54' },
  },
};

export const THEMES = { light, dark };

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useStore((s) => s.settings.theme);
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return isDark ? dark : light;
}

export const TYPE_LABEL: Record<ShiftType, string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  night: 'Noche',
  split: 'Partido',
  off: 'Libre',
  other: 'Otro',
};

/** Color con el que se pinta un día: un festivo libre se muestra en rojo suave. */
export function toneOf(shift: Pick<Shift, 'type' | 'isHoliday'>): Tone {
  return shift.isHoliday && shift.type === 'off' ? 'holiday' : shift.type;
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 26 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
