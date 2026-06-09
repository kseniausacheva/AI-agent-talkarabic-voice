import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-[140ms] " +
  "disabled:cursor-not-allowed disabled:opacity-50 rounded-md " +
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-ink hover:bg-primary-hover shadow-[0_1px_0_oklch(0_0_0/0.04)]",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-surface-elev",
  ghost: "bg-transparent text-ink hover:bg-surface",
  destructive: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-14 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
