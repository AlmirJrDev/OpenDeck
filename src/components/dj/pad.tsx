import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

interface PadProps extends ComponentProps<"button"> {
  /** Lit state: `signal` for an active function, `set` for a stored hot cue. */
  active?: boolean;
  tone?: "signal" | "set";
  /** For toggles: exposes the on/off state as `aria-pressed`. */
  toggle?: boolean;
  size?: "md" | "sm" | "lg";
}

const SIZE = {
  lg: "h-14 text-sm",
  md: "h-10 text-xs",
  sm: "h-8 text-[11px]",
};

/** DESIGN.md `pad`, `pad-active`, `pad-set` and `pad-transport`. */
export const Pad = ({
  active = false,
  tone = "signal",
  toggle = false,
  size = "md",
  className,
  ...props
}: PadProps) => (
  <button
    aria-pressed={toggle ? active : undefined}
    className={cn(
      "inline-flex min-w-0 items-center justify-center border border-pad-outline bg-background px-2 font-mono font-semibold tracking-[0.05em] text-foreground uppercase select-none",
      "transition-colors duration-75 ease-linear hover:border-foreground active:bg-foreground active:text-background",
      "disabled:pointer-events-none disabled:text-text-tertiary",
      active && tone === "signal" && "border-signal bg-signal text-on-signal hover:border-signal",
      active && tone === "set" && "border-set bg-set text-on-set hover:border-set",
      SIZE[size],
      className
    )}
    type="button"
    {...props}
  />
);
