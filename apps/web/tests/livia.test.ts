import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseCommand, sanitizeConfig } from '../lib/livia';

describe('parseCommand', () => {
  it('parses transformation and scale commands', () => {
    expect(parseCommand('Become a spaceship.')).toEqual({ action: 'transform', form: 'spaceship' });
    expect(parseCommand('make yourself tiny')).toEqual({ action: 'scale', value: 0.5 });
    expect(parseCommand('get huge')).toEqual({ action: 'scale', value: 2 });
  });

  it('parses game and rebuild commands', () => {
    expect(parseCommand("let's play")).toEqual({ action: 'game', on: true });
    expect(parseCommand('turn this page into a game')).toEqual({ action: 'game', on: true });
    expect(parseCommand('stop playing')).toEqual({ action: 'game', on: false });
    expect(parseCommand('destroy everything')).toEqual({ action: 'destroy' });
    expect(parseCommand('rebuild it')).toEqual({ action: 'rebuild' });
    expect(parseCommand('Come here.')).toEqual({ action: 'move' });
  });

  it('rejects unknown and hostile input', () => {
    expect(parseCommand('become a dragon')).toBeNull();
    expect(parseCommand('<script>alert(1)</script>')).toBeNull();
    expect(parseCommand("eval(fetch('http://x'))")).toBeNull();
  });
});

describe('sanitizeConfig', () => {
  it('returns safe defaults for invalid input', () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig('x')).toEqual(DEFAULT_CONFIG);
  });

  it('rejects invalid form and color values', () => {
    const value = sanitizeConfig({ form: 'dragon', color: 'red; background:url(x)' });
    expect(value.form).toBe(DEFAULT_CONFIG.form);
    expect(value.color).toBe(DEFAULT_CONFIG.color);
  });

  it('clamps numeric size values', () => {
    expect(sanitizeConfig({ size: 99 }).size).toBe(3);
    expect(sanitizeConfig({ size: -5 }).size).toBe(0.25);
  });

  it('strips forbidden characters from names', () => {
    const value = sanitizeConfig({ name: '<img src=x onerror=1>' + 'a'.repeat(50) });
    expect(value.name).not.toMatch(/[<>]/);
    expect(value.name.length).toBeLessThanOrEqual(30);
  });
});
