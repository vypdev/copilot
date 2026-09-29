import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../../../web/src/styles/tokens.css'), 'utf8');

function palette(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector) + selector.length).split('}')[0];
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map(([, name, value]) => [name, value]));
}

function luminance(hex: string): number {
  const body = hex.slice(1);
  const expanded = body.length === 3 ? [...body].map(char => char + char).join('') : body;
  const channels = expanded.match(/.{2}/g)!.map(part => Number.parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

describe('local web setup palettes', () => {
  const light = palette(':root {');
  const dark = palette(':root[data-theme="dark"] {');

  test.each([['light', light], ['dark', dark]])('%s text and semantic messages meet 4.5:1', (_name, colors) => {
    for (const [foreground, background] of [
      ['text', 'surface'], ['muted', 'surface'], ['accent-strong', 'accent-tint'],
      ['warn', 'warn-bg'], ['error', 'error-bg'],
    ]) expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  test.each([['light', light], ['dark', dark]])('%s control and focus boundaries meet 3:1', (_name, colors) => {
    expect(contrast(colors['control-line'], colors['surface-soft'])).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.focus, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  test('system mode follows prefers-color-scheme without persisting a theme', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain(':root[data-theme="dark"]');
    const ui = readFileSync(resolve(__dirname, '../../../web/src/components/ThemeSwitch.svelte'), 'utf8');
    expect(ui).toContain("'system' | 'light' | 'dark'");
    expect(ui).not.toMatch(/localStorage|sessionStorage/);
  });
});
