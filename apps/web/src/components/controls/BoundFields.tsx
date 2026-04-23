import { useCallback } from 'react';
import type { Config } from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { RangeField, SelectField, ToggleField } from './ControlPrimitives.tsx';

// ---------------------------------------------------------------------------
// Bound field primitives
// ---------------------------------------------------------------------------
//
// The Studio page used to read the entire config (`useConfigStore(s =>
// s.config)`) at the top level. Every slider tick produced a new config
// object, which re-rendered Studio and made React walk its 100+ fields
// doing prop equality checks. That per-drag overhead was the real source
// of slider lag — even with memoized leaf components, the parent still had
// to pay the cost of the walk.
//
// These "bound" variants subscribe to exactly ONE field each. They only
// re-render when their own field changes, so dragging BULB_SCALE only
// re-renders the bulb-scale slider. Studio itself subscribes to nothing
// (other than stable `patch`), so the whole panel stays absolutely stable
// during a drag.
//
// Why two layers (BoundX + underlying X):
//   • The underlying `RangeField`/`ToggleField`/`SelectField` stay
//     controlled-component APIs for non-config use (e.g. preset draft
//     name, preset id) where the state isn't in the config store.
//   • The Bound* variants are the default used for every config slider
//     throughout Studio.

type NumericKey = {
  [K in keyof Config]: Config[K] extends number ? K : never
}[keyof Config];

type BooleanKey = {
  [K in keyof Config]: Config[K] extends boolean ? K : never
}[keyof Config];

type StringKey = {
  [K in keyof Config]: Config[K] extends string ? K : never
}[keyof Config];

interface BoundRangeProps {
  field: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  round?: boolean;
}

export function BoundRange({ field, label, min, max, step, round = false }: BoundRangeProps) {
  const value = useConfigStore((s) => s.config[field] as number);
  const patch = useConfigStore((s) => s.patch);

  const handleChange = useCallback(
    (next: number) => {
      const rounded = round ? Math.round(next) : next;
      // Patch is stable; the Config type indexing is too fine-grained for
      // TS to narrow here, but each call site is pinned to a numeric key
      // by the `field: NumericKey` constraint.
      void patch({ [field]: rounded } as Partial<Config>);
    },
    [field, patch, round],
  );

  return (
    <RangeField
      label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
    />
  );
}

interface BoundToggleProps {
  field: BooleanKey;
  label: string;
}

export function BoundToggle({ field, label }: BoundToggleProps) {
  const checked = useConfigStore((s) => s.config[field] as boolean);
  const patch = useConfigStore((s) => s.patch);

  const handleChange = useCallback(
    (next: boolean) => {
      void patch({ [field]: next } as Partial<Config>);
    },
    [field, patch],
  );

  return <ToggleField label={label} checked={checked} onChange={handleChange} />;
}

interface BoundSelectProps<T extends string> {
  field: StringKey;
  label: string;
  options: Array<{ label: string; value: T }>;
}

export function BoundSelect<T extends string>({ field, label, options }: BoundSelectProps<T>) {
  const value = useConfigStore((s) => s.config[field] as string);
  const patch = useConfigStore((s) => s.patch);

  const handleChange = useCallback(
    (next: string) => {
      void patch({ [field]: next } as Partial<Config>);
    },
    [field, patch],
  );

  return (
    <SelectField
      label={label}
      value={value}
      options={options}
      onChange={handleChange}
    />
  );
}
