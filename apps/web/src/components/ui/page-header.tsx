import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle ? <div className="text-sm text-ink-3">{subtitle}</div> : null}
      </div>
      {action}
    </header>
  );
}

export function SectionHeading({
  children,
  trailing,
  id,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-3 uppercase">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-sk-violet" />
        {children}
      </h2>
      {trailing}
    </div>
  );
}
