import { SakugaCheckbox } from "@/components/sakuga";

/** Accessible checkbox button with Sakuga completion burst & animated stroke checkmark. */
export function TaskCheck({
  checked,
  onToggle,
  label,
  celebrate = false,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  celebrate?: boolean;
  className?: string;
}) {
  return <SakugaCheckbox checked={checked} onToggle={onToggle} label={label} celebrate={celebrate} className={className} />;
}
