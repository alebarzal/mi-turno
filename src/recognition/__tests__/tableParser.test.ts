import { describe, expect, it } from 'vitest';

import { SAMPLE_EXTRACTION } from './fixture';
import { parseBoardFromWords, wordsFromCorners, type OcrCornerWord, type OcrWord } from '../tableParser';

/**
 * Genera las «palabras» que devolvería un OCR ante una cartelera sintética con la misma
 * estructura que la real: título del mes, letras de día, números de día, cuatro filas de
 * trabajadores (código arriba, horas abajo) y la leyenda. Con inclinación configurable.
 */
function synthBoard(slope: number, drop: (day: number) => boolean = () => false): OcrWord[] {
  const words: OcrWord[] = [];
  let line = 0;
  const H = 16;
  const put = (text: string, cx: number, cy: number, l = ++line) => {
    const w = text.length * 9;
    words.push({ text, x: cx - w / 2, y: cy + slope * cx - H / 2, w, h: H, line: l });
  };
  const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const others = ['M', 'MT', 'TA', 'D', 'CS'];

  SAMPLE_EXTRACTION.months.forEach((m, mi) => {
    const top = 100 + mi * 600;
    const colX = (d: number) => 260 + (d - 1) * 38;
    put(m.month === 11 ? 'NOVIEMBRE' : 'DICIEMBRE', 700, top);
    const letters = ++line;
    const numbers = ++line;
    for (const d of m.days) {
      put(LETTERS[(m.firstWeekday! + d.day - 1) % 7], colX(d.day), top + 20, letters);
      if (!drop(d.day)) put(String(d.day), colX(d.day), top + 42, numbers);
    }
    ['Marta', 'Alex', 'Lucía', 'Andrés'].forEach((name, r) => {
      const y = top + 68 + r * 44;
      put(name, 190, y);
      const codeLine = ++line;
      const hourLine = ++line;
      for (const d of m.days) {
        const code = name === 'Alex' ? d.code! : others[(d.day + r) % others.length];
        const hours = name === 'Alex' ? d.hours : code === 'D' ? null : 7;
        put(code, colX(d.day), y, codeLine);
        if (hours != null) put(String(hours), colX(d.day), y + 22, hourLine);
      }
      // Columnas de resumen a la derecha: no deben confundirse con días.
      put('139', colX(31) + 180, y + 10);
    });
  });

  // Leyenda
  put('HORARIOS NOVIEMBRE y DICIEMBRE'.split(' ')[0], 600, 420, ++line);
  put('NOVIEMBRE', 700, 420, line);
  put('y', 760, 420, line);
  put('DICIEMBRE', 820, 420, line);
  const legend: [string | null, string][] = [
    ['CS', '10:00h a 14:00h en COLÓN'],
    [null, '17:00h a 21:00h en STA EULALIA'],
    ['T', '15:00h a 21:00/22:00h/23:00 en COLÓN'],
    ['TN', '17:00h a 01:00 en STA EULALIA'],
  ];
  legend.forEach(([code, text], i) => {
    const y = 450 + i * 26;
    if (code) put(code, 300, y);
    const l = ++line;
    let x = 380;
    for (const part of text.split(' ')) {
      put(part, x + (part.length * 9) / 2, y, l);
      x += part.length * 9 + 6;
    }
    if (code) put('8H', 760, y);
  });
  return words;
}

const expected = (mi: number) =>
  SAMPLE_EXTRACTION.months[mi].days.map((d) => ({ day: d.day, code: d.code, hours: d.hours }));

describe('parseBoardFromWords', () => {
  for (const slope of [0, 0.02, -0.03]) {
    it(`lee la fila de ALEX con inclinación ${slope}`, () => {
      const out = parseBoardFromWords(synthBoard(slope), 'ALEX', new Date(2026, 10, 10));
      expect(out.employeeFound).toBe(true);
      expect(out.months.map((m) => m.month)).toEqual([11, 12]);
      expect(out.months.map((m) => m.firstWeekday)).toEqual([6, 1]);
      out.months.forEach((m, mi) => {
        expect(m.days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(mi));
        expect(m.days.some((d) => d.uncertain)).toBe(false);
      });
    });
  }

  it('interpola columnas cuyo número de día no se leyó; solo duda si quedan lejos de una leída', () => {
    const out = parseBoardFromWords(synthBoard(0.01, (d) => d === 7 || d === 8 || d === 20), 'ALEX', new Date(2026, 10, 10));
    expect(out.months[0].days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(0));
    expect(out.months[0].days.filter((d) => d.uncertain).map((d) => d.day)).toEqual([]);

    const edge = parseBoardFromWords(synthBoard(0.01, (d) => d <= 4), 'ALEX', new Date(2026, 10, 10));
    expect(edge.months[0].days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(0));
    expect(edge.months[0].days.filter((d) => d.uncertain).map((d) => d.day)).toEqual([1, 2]);
  });

  describe('fallos reales del OCR del teléfono (cartelera de noviembre)', () => {
    const KNOWN = ['D', 'M', 'MA', 'MB', 'T', 'TA', 'T4', 'CS', 'VCS', 'FS', 'MT', 'HE', 'NV', 'TN'];
    const now = new Date(2026, 10, 10);
    // Reproduce lo que devolvió el OCR: «O» por «D» el 19, «MB» y «D» pegados en «MBD» (28-29),
    // la «D» del 30 sin leer y el número 9 de la cabecera sin leer.
    const damaged = (): OcrWord[] => {
      const words = synthBoard(0.01, (d) => d === 9);
      const alexY = words.find((w) => w.text === 'Alex')!.y;
      const inRow = (w: OcrWord) => Math.abs(w.y - 0.01 * (w.x + w.w / 2) - (alexY - 0.01 * 190)) < 4 && w.text !== 'Alex';
      const row = words.filter(inRow).sort((a, b) => a.x - b.x);
      expect(row.map((w) => w.text).slice(18, 19)).toEqual(['D']);
      row[18].text = 'O';
      const [mb, d29, d30] = [row[27], row[28], row[29]];
      expect([mb.text, d29.text, d30.text]).toEqual(['MB', 'D', 'D']);
      mb.text = 'MBD';
      mb.w = d29.x + d29.w - mb.x;
      return words.filter((w) => w !== d29 && w !== d30);
    };

    it('corrige confusiones, separa celdas unidas y propone el día libre que falta', () => {
      const out = parseBoardFromWords(damaged(), 'ALEX', now, KNOWN);
      const nov = out.months[0];
      expect(nov.days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(0));
      // Solo queda para confirmar el día que el OCR no llegó a leer.
      expect(nov.days.filter((d) => d.uncertain).map((d) => d.day)).toEqual([30]);
    });

    it('lee ceros y códigos partidos en dos trozos', () => {
      const words = synthBoard(0);
      const alexY = words.find((w) => w.text === 'Alex')!.y;
      const row = words.filter((w) => Math.abs(w.y - alexY) < 4 && w.text !== 'Alex').sort((a, b) => a.x - b.x);
      row[1].text = '0'; // día 2: D
      const mb = row[6]; // día 7: MB → «M» + «B»
      expect(mb.text).toBe('MB');
      mb.text = 'M';
      mb.w = 9;
      words.push({ ...mb, text: '8', x: mb.x + 10 });
      const out = parseBoardFromWords(words, 'ALEX', now, KNOWN);
      expect(out.months[0].days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(0));
      expect(out.months[0].days.some((d) => d.uncertain)).toBe(false);
    });

    it('no toca los códigos que no están en el diccionario', () => {
      const words = synthBoard(0);
      const alexY = words.find((w) => w.text === 'Alex')!.y;
      const row = words.filter((w) => Math.abs(w.y - alexY) < 4 && w.text !== 'Alex').sort((a, b) => a.x - b.x);
      row[3].text = 'XR';
      const out = parseBoardFromWords(words, 'ALEX', now, KNOWN);
      expect(out.months[0].days[3].code).toBe('XR');
    });
  });

  it('lee la leyenda, con tramos partidos y varias horas de salida', () => {
    const out = parseBoardFromWords(synthBoard(0), 'ALEX', new Date(2026, 10, 10));
    expect(out.legend).toEqual([
      {
        code: 'CS',
        title: null,
        segments: [
          { start: '10:00', endOptions: ['14:00'], location: 'COLÓN' },
          { start: '17:00', endOptions: ['21:00'], location: 'STA EULALIA' },
        ],
      },
      { code: 'T', title: null, segments: [{ start: '15:00', endOptions: ['21:00', '22:00', '23:00'], location: 'COLÓN' }] },
      { code: 'TN', title: null, segments: [{ start: '17:00', endOptions: ['01:00'], location: 'STA EULALIA' }] },
    ]);
  });

  it('detecta los nombres de todas las filas para poder elegir la propia', () => {
    const codes = ['D', 'M', 'MB', 'T', 'TA', 'CS', 'VCS', 'FS', 'MT', 'HE', 'TN'];
    const out = parseBoardFromWords(synthBoard(0.01), 'PEDRO', new Date(2026, 10, 10), codes);
    expect(out.employeeFound).toBe(false);
    expect(out.people).toEqual(['Marta', 'Alex', 'Lucía', 'Andrés']);
    const lucia = parseBoardFromWords(synthBoard(0.01), 'Lucía', new Date(2026, 10, 10), codes);
    expect(lucia.months.map((m) => m.month)).toEqual([11, 12]);
    expect(lucia.months[0].days.slice(0, 3).map((d) => d.code)).toEqual(['D', 'CS', 'M']);
  });

  it('avisa si no encuentra al trabajador', () => {
    const out = parseBoardFromWords(synthBoard(0), 'PEDRO');
    expect(out.employeeFound).toBe(false);
    expect(out.months).toEqual([]);
  });
});

describe('fotos giradas', () => {
  // Gira la cartelera sintética como lo haría una foto hecha con el móvil de lado.
  const rotated = (deg: number): OcrCornerWord[] => {
    const a = (deg * Math.PI) / 180;
    const rot = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a) + 3000, y: x * Math.sin(a) + y * Math.cos(a) + 3000 });
    return synthBoard(0.01).map((w) => ({
      text: w.text,
      line: w.line,
      corners: [rot(w.x, w.y), rot(w.x + w.w, w.y), rot(w.x + w.w, w.y + w.h), rot(w.x, w.y + w.h)],
    }));
  };

  for (const deg of [90, 180, 270, 7]) {
    it(`endereza una foto girada ${deg}° y lee la fila de ALEX`, () => {
      const out = parseBoardFromWords(wordsFromCorners(rotated(deg)), 'ALEX', new Date(2026, 10, 10));
      expect(out.months.map((m) => m.month)).toEqual([11, 12]);
      out.months.forEach((m, mi) => {
        expect(m.days.map(({ day, code, hours }) => ({ day, code, hours }))).toEqual(expected(mi));
      });
      expect(out.legend.map((l) => l.code)).toEqual(['CS', 'T', 'TN']);
    });
  }
});
