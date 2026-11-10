import { describe, expect, it } from 'vitest';
import { parseDensity, parseNumerals, parseTheme, resolveTheme } from './prefs-core';

describe('prefs-core', () => {
  it('resolveTheme', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('parseTheme defaults to light', () => {
    expect(parseTheme(null)).toBe('light');
    expect(parseTheme('junk')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
  });
  it('parseNumerals defaults to latn', () => {
    expect(parseNumerals(null)).toBe('latn');
    expect(parseNumerals('x')).toBe('latn');
    expect(parseNumerals('arab')).toBe('arab');
  });
  it('parseDensity defaults to default', () => {
    expect(parseDensity(null)).toBe('default');
    expect(parseDensity('compact')).toBe('compact');
    expect(parseDensity('comfortable')).toBe('comfortable');
    expect(parseDensity('huge')).toBe('default');
  });
});
