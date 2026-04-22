interface PlaceholderProps {
  title: string;
  description: string;
}

export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-lg font-medium text-zinc-200">{title}</h2>
      <p className="max-w-md text-sm text-[var(--color-text-dim)]">{description}</p>
      <p className="text-[11px] text-[var(--color-text-dim)]">
        Controls land in Phase 4 of the rework.
      </p>
    </div>
  );
}
