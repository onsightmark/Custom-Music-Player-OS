import type { CSSProperties } from 'react';
import type { Appearance } from '../library/state';

const fontFamilies = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif',
};

export function appearanceStyle(
  appearance: Appearance,
): CSSProperties & Record<`--${string}`, string | number> {
  return {
    '--glass-opacity': appearance.glass / 100,
    '--glass-blur': `${appearance.blur}px`,
    '--lyric-font': appearance.customFont.trim()
      ? `"${appearance.customFont.trim()}", ${fontFamilies[appearance.font]}`
      : fontFamilies[appearance.font],
    '--lyric-size': `${appearance.fontSize}px`,
    '--lyric-weight': appearance.fontWeight,
  };
}
