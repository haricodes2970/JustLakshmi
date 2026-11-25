import { SakugaButton, type SakugaButtonSize, type SakugaButtonVariant } from "@/components/sakuga";

export function Button(
  props: React.ComponentProps<"button"> & {
    variant?: SakugaButtonVariant;
    size?: SakugaButtonSize;
    effect?: "none" | "ticks" | "burst";
  },
) {
  return <SakugaButton {...props} />;
}
