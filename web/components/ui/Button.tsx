import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-700 disabled:hover:bg-slate-900",
  secondary:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:hover:bg-white",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:hover:bg-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-colors focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-slate-900 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(
  variant: Variant = "primary",
  size: Size = "md",
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Same styling as Button, for navigation rather than an action. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonLinkProps): JSX.Element {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
