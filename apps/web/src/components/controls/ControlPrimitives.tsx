import { type ChangeEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 pb-6">{children}</div>;
}

export function SectionGrid({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={clsx(
        'grid gap-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 xl:grid-cols-2',
        columns === 3 && 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  dense = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-melt-text-muted/10 bg-melt-frame/40">
      <header className="flex items-center justify-between gap-3 border-b border-melt-text-muted/10 px-4 py-2.5">
        <h3 className="text-[10px] font-black tracking-[0.22em] uppercase text-melt-text-heading">
          {title}
        </h3>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </header>
      <div className={clsx('grid gap-2', dense ? 'p-3' : 'p-4')}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section — use inside the Studio tab to group categories
// ---------------------------------------------------------------------------

const COLLAPSE_STORAGE_PREFIX = 'melty.collapse.';

export function CollapsibleSection({
  id,
  title,
  hint,
  action,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `${COLLAPSE_STORAGE_PREFIX}${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return defaultOpen;
    return stored === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, open ? '1' : '0');
  }, [storageKey, open]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return (
    <section className="overflow-hidden rounded-xl border border-melt-text-muted/10 bg-melt-frame/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={clsx(
          'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors',
          'hover:bg-melt-surface/25',
          open ? 'border-b border-melt-text-muted/10' : 'border-b border-transparent',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ChevronDown
            aria-hidden
            className={clsx(
              'size-3.5 shrink-0 text-melt-text-muted transition-transform duration-200',
              open ? 'rotate-0' : '-rotate-90',
            )}
          />
          <h3 className="truncate text-[10px] font-black tracking-[0.22em] uppercase text-melt-text-heading">
            {title}
          </h3>
          {hint ? (
            <span className="truncate text-[10px] font-medium text-melt-text-muted">
              {hint}
            </span>
          ) : null}
        </div>
        {action ? (
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex items-center gap-2"
          >
            {action}
          </div>
        ) : null}
      </button>
      {open ? <div className="grid gap-1.5 p-3">{children}</div> : null}
    </section>
  );
}

export function SectionColumns({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 xl:grid-cols-2',
        columns === 3 && 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}

export function SubGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-melt-text-muted/5 bg-melt-surface/10 p-2">
      <div className="px-1.5 pb-1.5 pt-0.5 text-[9px] font-black tracking-[0.22em] uppercase text-melt-text-muted">
        {title}
      </div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field primitives — compact single-row layout
// ---------------------------------------------------------------------------

export function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format = defaultNumberFormat,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_64px] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-melt-surface/20">
      <label className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        {label}
      </label>
      <input
        className="h-2 w-full accent-melt-accent"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <input
        className="h-7 rounded border border-melt-text-muted/15 bg-melt-frame/60 px-2 text-right font-mono text-[11px] text-melt-text-heading outline-none transition focus:border-melt-accent/50"
        type="number"
        min={min}
        max={max}
        step={step}
        value={format(value)}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
      />
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-melt-surface/20">
      <label className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        {label}
      </label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors',
          checked
            ? 'border-melt-accent/50 bg-melt-accent/80'
            : 'border-melt-text-muted/20 bg-melt-surface/40',
        )}
      >
        <span
          className={clsx(
            'size-3.5 rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-[16px]' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-melt-surface/20">
      <label className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        {label}
      </label>
      <div className="relative">
        <select
          className={clsx(
            'peer h-8 w-full appearance-none rounded-md border border-melt-text-muted/15 bg-melt-frame/70 pl-2.5 pr-7 text-[12px] font-medium text-melt-text-heading outline-none transition-colors',
            'hover:border-melt-text-muted/30 hover:bg-melt-frame/90',
            'focus:border-melt-accent/60 focus:bg-melt-frame focus:shadow-[0_0_0_3px_rgba(227,178,91,0.12)]',
          )}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-melt-frame text-melt-text-heading"
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-melt-text-muted transition-colors peer-hover:text-melt-text-label peer-focus:text-melt-accent"
        />
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-melt-surface/20">
      <label className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        {label}
      </label>
      <input
        className="h-8 rounded border border-melt-text-muted/15 bg-melt-frame/60 px-2 text-[12px] text-melt-text-heading outline-none transition focus:border-melt-accent/50"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons + status
// ---------------------------------------------------------------------------

export function ActionButton({
  children,
  onClick,
  tone = 'primary',
  disabled = false,
  full = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex h-8 items-center justify-center rounded-md border px-3 text-[10px] font-black tracking-[0.18em] uppercase transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        full && 'w-full',
        tone === 'primary' &&
          'border-melt-accent bg-melt-accent text-melt-frame hover:bg-melt-accent-hover',
        tone === 'secondary' &&
          'border-melt-text-muted/15 bg-melt-surface/30 text-melt-text-heading hover:border-melt-accent/30 hover:text-melt-accent',
        tone === 'danger' &&
          'border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20',
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
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]',
        tone === 'neutral' && 'border-melt-text-muted/15 bg-melt-surface/30 text-melt-text-label',
        tone === 'good' && 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        tone === 'warn' && 'border-melt-accent/30 bg-melt-accent/10 text-melt-accent',
        tone === 'accent' && 'border-melt-accent/25 bg-melt-accent/10 text-melt-accent',
      )}
    >
      {label}
    </span>
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
        'rounded-md border px-3 py-2 text-[11px] leading-relaxed',
        tone === 'neutral' && 'border-melt-text-muted/15 bg-melt-surface/20 text-melt-text-label',
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
    <div className="rounded-md border border-dashed border-melt-text-muted/20 bg-melt-surface/10 px-3 py-4 text-[11px] text-melt-text-label">
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
    <div className="rounded-md border border-melt-text-muted/15 bg-melt-frame/60 px-3 py-2">
      <div className="text-[9px] font-black tracking-[0.22em] uppercase text-melt-text-muted">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-[11px] text-melt-text-heading">{value}</div>
    </div>
  );
}

export function ColorStrip({ colors }: { colors: number[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-5 rounded-full border border-melt-text-muted/25 shadow-sm"
          style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
        />
      ))}
    </div>
  );
}

// Accepts a legacy-compatible NumberInput for anyone who imported it directly.
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
      className="h-8 rounded border border-melt-text-muted/15 bg-melt-frame/60 px-2 text-right font-mono text-[11px] text-melt-text-heading outline-none focus:border-melt-accent/50"
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
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
