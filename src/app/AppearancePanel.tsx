import { useId } from 'react';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_APPEARANCE, type Appearance, type Backdrop } from '../library/state';
import type { PreparedBackdrop } from '../library/storage';
import { BackgroundSettings } from './BackgroundSettings';

type AppearancePanelProps = {
  value: Appearance;
  backdrop: Backdrop | null;
  onBackdrop: (backdrop: PreparedBackdrop | null, signal?: AbortSignal) => Promise<boolean>;
  onChange: (patch: Partial<Appearance>) => void;
  onClose: () => void;
};

const themes = [
  { value: 'aurora', label: 'Aurora' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'ember', label: 'Ember' },
] satisfies { value: Appearance['theme']; label: string }[];

const fonts = [
  { value: 'sans', label: 'Clean' },
  { value: 'serif', label: 'Editorial' },
  { value: 'mono', label: 'Mono' },
  { value: 'rounded', label: 'Rounded' },
] satisfies { value: Appearance['font']; label: string }[];

export function AppearancePanel({ value, backdrop, onBackdrop, onChange, onClose }: AppearancePanelProps) {
  const id = useId();

  return (
    <aside className="settings-panel glass-panel" aria-label="Appearance">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">
            <SlidersHorizontal size={13} aria-hidden="true" /> YOUR SPACE
          </p>
          <h2>Make it yours</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close appearance"
          title="Close appearance"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <BackgroundSettings value={backdrop} onSave={onBackdrop} />
      <fieldset className="settings-section">
        <legend>Atmosphere</legend>
        <div className="theme-options">
          {themes.map((theme) => (
            <button
              key={theme.value}
              type="button"
              className={`theme-option${value.theme === theme.value ? ' is-selected' : ''}`}
              onClick={() => onChange({ theme: theme.value })}
              aria-pressed={value.theme === theme.value}
            >
              <span className={`theme-swatch theme-swatch-${theme.value}`} aria-hidden="true">
                {value.theme === theme.value && <Check size={15} />}
              </span>
              <span>{theme.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-section">
        <legend>Typography</legend>
        <div className="font-options">
          {fonts.map((font) => (
            <button
              key={font.value}
              type="button"
              className={`font-option font-option-${font.value}${value.font === font.value && !value.customFont ? ' is-selected' : ''}`}
              onClick={() => onChange({ font: font.value, customFont: '' })}
              aria-pressed={value.font === font.value && !value.customFont}
            >
              <span aria-hidden="true">Aa</span>
              {font.label}
            </button>
          ))}
        </div>
        <label className="setting-label" htmlFor={`${id}-font`}>
          Your own font
        </label>
        <input
          id={`${id}-font`}
          className="text-input"
          type="text"
          value={value.customFont}
          maxLength={80}
          placeholder="Installed font name"
          onChange={(event) => onChange({ customFont: event.currentTarget.value })}
          aria-describedby={`${id}-font-help`}
          autoComplete="off"
          spellCheck={false}
        />
        <p id={`${id}-font-help`} className="panel-note">
          Use the exact name of a font installed on this device.
        </p>

        <label className="range-setting" htmlFor={`${id}-size`}>
          <span className="setting-label">
            Lyric size <output>{value.fontSize}px</output>
          </span>
          <input
            id={`${id}-size`}
            type="range"
            min={28}
            max={80}
            step={1}
            value={value.fontSize}
            onChange={(event) => onChange({ fontSize: event.currentTarget.valueAsNumber })}
          />
        </label>
        <label className="range-setting" htmlFor={`${id}-weight`}>
          <span className="setting-label">
            Font weight <output>{value.fontWeight}</output>
          </span>
          <input
            id={`${id}-weight`}
            type="range"
            min={400}
            max={800}
            step={100}
            value={value.fontWeight}
            onChange={(event) => onChange({ fontWeight: event.currentTarget.valueAsNumber })}
          />
        </label>
      </fieldset>

      <fieldset className="settings-section">
        <legend>Glass &amp; motion</legend>
        <label className="range-setting" htmlFor={`${id}-glass`}>
          <span className="setting-label">
            Glass opacity <output>{value.glass}%</output>
          </span>
          <input
            id={`${id}-glass`}
            type="range"
            min={10}
            max={85}
            step={1}
            value={value.glass}
            onChange={(event) => onChange({ glass: event.currentTarget.valueAsNumber })}
          />
        </label>
        <label className="range-setting" htmlFor={`${id}-blur`}>
          <span className="setting-label">
            Glass blur <output>{value.blur}px</output>
          </span>
          <input
            id={`${id}-blur`}
            type="range"
            min={0}
            max={40}
            step={1}
            value={value.blur}
            onChange={(event) => onChange({ blur: event.currentTarget.valueAsNumber })}
          />
        </label>
        <label className="setting-label" htmlFor={`${id}-motion`}>
          Lyric animation
        </label>
        <select
          id={`${id}-motion`}
          className="select-input"
          value={value.motion}
          onChange={(event) => {
            const motion = event.currentTarget.value;
            if (motion === 'flow' || motion === 'fade' || motion === 'still') onChange({ motion });
          }}
        >
          <option value="flow">Flow</option>
          <option value="fade">Fade</option>
          <option value="still">Still</option>
        </select>
        <p className="panel-note">Your device&apos;s reduced motion setting takes priority.</p>
      </fieldset>

      <label className="toggle-setting" htmlFor={`${id}-lyrics`}>
        <span>Show lyrics</span>
        <input
          id={`${id}-lyrics`}
          type="checkbox"
          role="switch"
          checked={value.showLyrics}
          onChange={(event) => onChange({ showLyrics: event.currentTarget.checked })}
        />
      </label>
      <button
        type="button"
        className="secondary-button reset-appearance"
        onClick={() => onChange(DEFAULT_APPEARANCE)}
      >
        <RotateCcw size={14} aria-hidden="true" /> Reset appearance
      </button>
    </aside>
  );
}
