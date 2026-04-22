import { type ChangeEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';

export function PageIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center gap-3 px-2">
        <Sparkles className="size-[18px] text-melt-accent" />
        <span className="text-label-xs text-melt-text-label">Control Surface</span>
      </div>
      <div className="border-l border-melt-text-muted/10 pl-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-4xl font-black tracking-[0.14em] uppercase text-melt-text-heading">
              {title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-melt-text-label">
              {description}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function PageGrid({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        'grid gap-8',
        compact ? 'xl:grid-cols-2' : 'xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]',
      )}
    >
      {children}
    </div>
  );
}

export function PanelCard({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-melt-text-muted/10 bg-melt-frame/30 px-5 py-5 transition-colors duration-200 hover:border-melt-accent/30">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-black tracking-[0.16em] uppercase text-melt-text-heading">
            {title}
          </h3>
          {description ? (
            <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-melt-text-label">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  value,
  children,
}: {
  label: string;
  hint?: string;
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-3 rounded-[18px] border border-melt-text-muted/10 bg-melt-surface/20 px-4 py-4 transition-colors duration-200 hover:border-melt-accent/20 focus-within:border-melt-accent/35">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-black tracking-[0.18em] uppercase text-melt-text-heading">
            {label}
          </div>
          {hint ? (
            <div className="mt-2 text-[11px] leading-relaxed text-melt-text-label">{hint}</div>
          ) : null}
        </div>
        {value ? (
          <div className="rounded-full bg-melt-accent/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] uppercase text-melt-accent">
            {value}
          </div>
        ) : null}
      </div>
      {children}
    </label>
  );
}

export function RangeField({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  format = defaultNumberFormat,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const stringValue = String(value);

  return (
    <Field label={label} hint={hint} value={format(value)}>
      <div className="grid gap-3 md:grid-cols-[1fr_110px] md:items-center">
        <input
          className="accent-melt-accent"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <NumberInput
          value={stringValue}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (!Number.isNaN(next)) onChange(next);
          }}
        />
      </div>
    </Field>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field label={label} hint={hint} value={checked ? 'ON' : 'OFF'}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'inline-flex h-11 w-full items-center justify-between rounded-[16px] border px-4 transition-colors duration-200',
          checked
            ? 'border-melt-accent/35 bg-melt-accent/10 text-melt-text-heading'
            : 'border-melt-text-muted/10 bg-melt-frame/50 text-melt-text-label hover:border-melt-accent/25 hover:text-melt-text-heading',
        )}
      >
        <span className="text-label-sm text-current">{checked ? 'Enabled' : 'Disabled'}</span>
        <span
          className={clsx(
            'relative inline-flex h-6 w-11 rounded-full transition',
            checked ? 'bg-melt-accent' : 'bg-melt-text-muted/30',
          )}
        >
          <span
            className={clsx(
              'absolute top-1 size-4 rounded-full bg-white transition',
              checked ? 'left-6' : 'left-1',
            )}
          />
        </span>
      </button>
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint} value={value}>
      <select
        className="h-11 rounded-[16px] border border-melt-text-muted/10 bg-melt-frame/60 px-4 text-sm text-melt-text-heading outline-none transition-colors duration-200 focus:border-melt-accent/35"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="h-11 rounded-[16px] border border-melt-text-muted/10 bg-melt-frame/60 px-4 text-sm text-melt-text-heading outline-none transition-colors duration-200 placeholder:text-melt-text-muted focus:border-melt-accent/35"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

export function ActionButton({
  children,
  onClick,
  tone = 'primary',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex h-11 items-center justify-center rounded-full border px-4 text-[10px] font-black tracking-[0.24em] uppercase transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'primary' && 'border-melt-accent bg-melt-accent text-melt-frame hover:bg-melt-accent-hover',
        tone === 'secondary' && 'border-melt-text-muted/10 bg-melt-surface/30 text-melt-text-heading hover:border-melt-accent/30 hover:text-melt-accent',
        tone === 'danger' && 'border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/16',
      )}
    >
      {children}
    </button>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn' | 'accent';
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]',
        tone === 'neutral' && 'border-melt-text-muted/10 bg-melt-surface/30 text-melt-text-label',
        tone === 'good' && 'border-emerald-400/25 bg-emerald-400/12 text-emerald-200',
        tone === 'warn' && 'border-melt-accent/25 bg-melt-accent/10 text-melt-accent',
        tone === 'accent' && 'border-melt-accent/25 bg-melt-accent/10 text-melt-accent',
      )}
    >
      {label}
    </span>
  );
}

export function MetricGrid({
  items,
  columns = 3,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    detail?: string;
    tone?: 'neutral' | 'accent' | 'good' | 'warn';
  }>;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        columns === 2 && 'md:grid-cols-2',
        columns === 3 && 'md:grid-cols-3',
        columns === 4 && 'md:grid-cols-2 xl:grid-cols-4',
      )}
    >
      {items.map((item) => (
        <article
          key={item.label}
          className={clsx(
            'rounded-[18px] border px-4 py-4 transition-colors duration-200',
            item.tone === 'accent' && 'border-melt-accent/20 bg-melt-accent/8',
            item.tone === 'good' && 'border-emerald-400/20 bg-emerald-400/8',
            item.tone === 'warn' && 'border-melt-accent/25 bg-melt-accent/10',
            (!item.tone || item.tone === 'neutral') && 'border-melt-text-muted/10 bg-melt-surface/20',
          )}
        >
          <div className="text-[9px] font-black tracking-[0.24em] uppercase text-melt-text-muted">
            {item.label}
          </div>
          <div
            className={clsx(
              'mt-3 text-sm font-black tracking-[0.14em] uppercase',
              item.tone === 'accent' && 'text-melt-accent',
              item.tone === 'good' && 'text-emerald-200',
              item.tone === 'warn' && 'text-melt-accent',
              (!item.tone || item.tone === 'neutral') && 'text-melt-text-heading',
            )}
          >
            {item.value}
          </div>
          {item.detail ? (
            <p className="mt-2 text-[11px] leading-relaxed text-melt-text-label">{item.detail}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function MessageBanner({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
}) {
  return (
    <div
      className={clsx(
        'rounded-[18px] border px-4 py-3 text-[11px] leading-relaxed',
        tone === 'neutral' && 'border-melt-text-muted/10 bg-melt-surface/20 text-melt-text-label',
        tone === 'good' && 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
        tone === 'warn' && 'border-melt-accent/25 bg-melt-accent/10 text-melt-text-heading',
        tone === 'danger' && 'border-red-500/25 bg-red-500/10 text-red-100',
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-dashed border-melt-text-muted/18 bg-melt-surface/10 px-4 py-6 text-[11px] leading-relaxed text-melt-text-label">
      {children}
    </div>
  );
}

export function CodeBlock({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-melt-text-muted/10 bg-melt-frame/55 px-4 py-4">
      <div className="text-[9px] font-black tracking-[0.24em] uppercase text-melt-text-muted">
        {label}
      </div>
      <div className="mt-2 break-all font-mono text-sm text-melt-text-heading">{value}</div>
    </div>
  );
}

export function ColorStrip({ colors }: { colors: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-7 rounded-full border border-melt-text-muted/20 shadow-[0_0_18px_rgba(0,0,0,0.35)]"
          style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
        />
      ))}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      className="h-11 rounded-[16px] border border-melt-text-muted/10 bg-melt-frame/60 px-3 text-right text-sm text-melt-text-heading outline-none transition-colors duration-200 focus:border-melt-accent/35"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
  );
}

function defaultNumberFormat(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}
