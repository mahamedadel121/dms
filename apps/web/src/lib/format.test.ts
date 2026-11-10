import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDay,
  formatDayTime,
  formatEgp,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  ltrIsolate,
  setNumeralSystem,
} from './format';

afterEach(() => setNumeralSystem('latn'));

const ISO = '2026-03-05T12:30:00Z'; // Cairo 14:30 (UTC+2)

describe('format additions', () => {
  it('formatDay short', () => expect(formatDay(ISO)).toBe('05/03/2026'));
  it('formatDay long Arabic', () => expect(formatDay(ISO, 'ar', 'long')).toBe('5 مارس 2026'));
  it('formatDay long English', () => expect(formatDay(ISO, 'en', 'long')).toBe('5 March 2026'));
  it('formatDayTime', () => expect(formatDayTime(ISO)).toBe('05/03/2026 14:30'));
  it('formatTime', () => expect(formatTime(ISO)).toBe('14:30'));
  it('empty values give empty string', () => {
    expect(formatDay(null)).toBe('');
    expect(formatDay('nope')).toBe('');
  });
  it('formatRelative now / minutes / hours / yesterday / days / falls back to a date after a week', () => {
    const t = Date.parse(ISO);
    expect(formatRelative(t - 10_000, 'ar', t)).toBe('الآن');
    expect(formatRelative(t - 5 * 60_000, 'ar', t)).toBe('منذ 5 دقيقة');
    expect(formatRelative(t - 5 * 60_000, 'en', t)).toBe('5 min ago');
    expect(formatRelative(t - 3 * 3600_000, 'en', t)).toBe('3 h ago');
    expect(formatRelative(t - 30 * 3600_000, 'en', t)).toBe('yesterday');
    expect(formatRelative(t - 4 * 86400_000, 'en', t)).toBe('4 days ago');
    expect(formatRelative(t - 20 * 86400_000, 'en', t)).toBe(formatDay(t - 20 * 86400_000, 'en'));
  });
  it('formatCount', () => expect(formatCount(1234)).toBe('1,234'));
  it('formatPercent', () => expect(formatPercent(0.1234)).toBe('12.3%'));
  it('arab numerals change amounts and dates', () => {
    setNumeralSystem('arab');
    expect(formatCount(1234)).toBe('١٬٢٣٤');
    expect(formatNumber(12450.75)).not.toMatch(/[0-9]/);
    expect(formatDay(ISO)).toBe('٠٥/٠٣/٢٠٢٦');
    expect(formatTime(ISO)).toBe('١٤:٣٠');
  });
  it('latn output equals the legacy output', () => {
    expect(formatNumber(12450.75)).toBe('12,450.75');
    expect(formatEgp(1234.5, 'ar')).toBe('1,234.50 ج.م');
    expect(formatEgp(1234.5, 'en')).toBe('EGP 1,234.50');
  });
  it('identifiers are untouched by ltrIsolate', () => {
    setNumeralSystem('arab');
    expect(ltrIsolate('DE-26-000011')).toBe('⁦DE-26-000011⁩');
  });
});
