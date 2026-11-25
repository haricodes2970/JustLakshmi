"use client";

import { SakugaTabs, type SakugaTabOption } from "@/components/sakuga";

export type SegmentOption<T extends string> = SakugaTabOption<T>;

/** Radio-group segmented control with spring-sliding Sakuga indicator. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return <SakugaTabs label={label} value={value} options={options} onChange={onChange} className={className} />;
}
