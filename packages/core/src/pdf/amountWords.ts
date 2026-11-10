import { dec } from '@dms/shared';
import { DomainError } from '../errors';

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
// [singular, dual, plural(3-10), tanween form(11-99)]
const SCALES: [string, string, string, string][] = [
  ['', '', '', ''],
  ['ألف', 'ألفان', 'آلاف', 'ألفاً'],
  ['مليون', 'مليونان', 'ملايين', 'مليوناً'],
  ['مليار', 'ملياران', 'مليارات', 'ملياراً'],
  ['تريليون', 'تريليونان', 'تريليونات', 'تريليوناً'],
];

function below100(n: number): string {
  if (n < 11) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  const u = n % 10;
  const t = Math.floor(n / 10);
  return u ? `${ONES[u]} و${TENS[t]}` : TENS[t]!;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (r) parts.push(below100(r));
  return parts.join(' و');
}

/** Cardinal number in Arabic words (masculine, nominative). */
export function integerToArabicWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new DomainError('VALIDATION', 'Invalid integer for words');
  if (n === 0) return 'صفر';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const parts: string[] = [];
  for (let s = groups.length - 1; s >= 0; s--) {
    const c = groups[s]!;
    if (!c) continue;
    if (s === 0) {
      parts.push(below1000(c));
      continue;
    }
    const sc = SCALES[s]!;
    const r = c % 100;
    if (c === 1) parts.push(sc[0]);
    else if (c === 2) parts.push(sc[1]);
    else if (r >= 3 && r <= 10) parts.push(`${below1000(c)} ${sc[2]}`);
    else if (r >= 11) parts.push(`${below1000(c)} ${sc[3]}`);
    else parts.push(`${below1000(c)} ${sc[0]}`);
  }
  return parts.join(' و');
}

function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${integerToArabicWords(n)} ${few}`;
  if (r >= 11) return `${integerToArabicWords(n)} ${many}`;
  return `${integerToArabicWords(n)} ${one.replace(/ واحد$/, '')}`;
}

/**
 * amountToArabicWords("1250.50") => "ألف ومائتان وخمسون جنيهاً مصرياً وخمسون قرشاً فقط لا غير".
 * `amount` is a decimal string with at most 2 decimals.
 */
export function amountToArabicWords(amount: string): string {
  let d;
  try {
    d = dec(amount);
  } catch {
    throw new DomainError('VALIDATION', 'Invalid amount');
  }
  if (!d.isFinite() || d.isNegative()) throw new DomainError('VALIDATION', 'Invalid amount');
  const fixed = d.toFixed(2);
  const [p, q] = fixed.split('.') as [string, string];
  const pounds = Number(p);
  const piastres = Number(q);
  const poundsText =
    pounds === 1
      ? 'جنيه مصري واحد'
      : pounds === 2
        ? 'جنيهان مصريان'
        : (() => {
            const r = pounds % 100;
            if (r >= 3 && r <= 10) return `${integerToArabicWords(pounds)} جنيهات مصرية`;
            if (r >= 11) return `${integerToArabicWords(pounds)} جنيهاً مصرياً`;
            return `${integerToArabicWords(pounds)} جنيه مصري`;
          })();
  const piastresText = unit(piastres, 'قرش واحد', 'قرشان', 'قروش', 'قرشاً');
  if (pounds === 0 && piastres === 0) return 'صفر جنيه مصري فقط لا غير';
  if (pounds === 0) return `${piastresText} فقط لا غير`;
  if (piastres === 0) return `${poundsText} فقط لا غير`;
  return `${poundsText} و${piastresText} فقط لا غير`;
}
