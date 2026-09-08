/**
 * The shadcn/ui primitives this design system actually uses.
 *
 * shadcn/ui is not a dependency you install - it is source you own, built on
 * Radix and class-variance-authority. These are written directly rather than
 * pulled through its CLI for two reasons: the CLI rewrites globals.css and
 * tailwind.config.ts, which would flatten the token layer this pass exists to
 * establish, and it writes `components/ui/button.tsx` next to our existing
 * `components/ui/Button.tsx` - two files that collide on a case-insensitive
 * filesystem.
 *
 * So: same model, same dependencies (cva, clsx, tailwind-merge, Radix Slot),
 * living in components/ds/ where it cannot collide with the Step 1-8
 * components it will gradually replace.
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ button */

export const buttonVariants = cva(
  // Every button is at least 40px tall and states its focus ring the same way.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-input " +
    "text-body font-medium transition-colors " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-ring " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // 700, not the 600 brand colour: white on 600 is 3.65:1.
        primary: "bg-brand-700 text-ink-inverse hover:bg-brand-800",
        secondary:
          "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
        ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
        // For the one destructive action per screen, never for "cancel".
        danger: "bg-danger text-ink-inverse hover:opacity-90",
        link: "text-brand-700 underline underline-offset-4 hover:text-brand-800",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-6 text-[0.9375rem]",
        // Icon-only buttons are square and must carry an aria-label.
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element - a Link that looks like a button. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, asChild = false, ...props }, ref) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

/* -------------------------------------------------------------------- card */

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  // Border first, shadow second: structure should survive a screenshot on a
  // white background, which a shadow-only card does not.
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- badge */

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro uppercase " +
    "ring-1 ring-inset",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-ink-muted ring-line",
        brand: "bg-brand-50 text-brand-800 ring-brand-200",
        verified: "bg-verified-bg text-verified ring-verified/30",
        sponsored: "bg-sponsored-bg text-sponsored ring-sponsored/30",
        open: "bg-open-bg text-open ring-open/30",
        closed: "bg-closed-bg text-closed ring-closed/30",
        warning: "bg-warning-bg text-warning ring-warning/30",
        danger: "bg-danger-bg text-danger ring-danger/30",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ------------------------------------------------------------------- input */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-input border border-line-strong bg-surface px-3 " +
          "text-body text-ink placeholder:text-ink-subtle " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
          "focus-visible:outline-ring " +
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ select */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-input border border-line-strong bg-surface px-3 pr-8 " +
          "text-body text-ink " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
          "focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ label */

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): JSX.Element {
  return (
    <label
      className={cn("mb-1 block text-meta font-medium text-ink-muted", className)}
      {...props}
    />
  );
}
