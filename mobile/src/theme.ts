/**
 * The web app's design system, expressed as React Native values.
 *
 * The web app is Tailwind with the stock palette: slate for everything
 * structural, amber for ratings and warnings, emerald for "live", red for
 * errors. Those are the literal hex values behind the class names
 * (web/components/ui/*), lifted here so the two apps are the same product
 * rather than two products that resemble each other.
 *
 * Spacing follows Tailwind's 4px step and radius.md is Tailwind's rounded-md,
 * which is the corner on every button and card on the web.
 */

export const color = {
  // slate
  ink: "#0f172a", //  900 - headings, primary button fill
  body: "#334155", //  700 - body copy
  muted: "#475569", //  600 - secondary copy
  subtle: "#64748b", //  500 - metadata
  faint: "#94a3b8", //  400 - placeholders
  line: "#cbd5e1", //   300 - input borders
  hairline: "#e2e8f0", // 200 - card borders, dividers
  wash: "#f1f5f9", //   100 - pressed states, chips
  canvas: "#f8fafc", //  50 - screen background
  surface: "#ffffff", //     - cards, inputs, tab bar

  // amber - ratings, pending, warnings
  star: "#f59e0b", //   500
  warnBg: "#fffbeb", //  50
  warnLine: "#fde68a", // 200
  warnText: "#92400e", // 800

  // emerald - approved / live
  goodBg: "#ecfdf5", //  50
  goodLine: "#a7f3d0", // 200
  goodText: "#065f46", // 800

  // red - errors, rejected
  badBg: "#fef2f2", //   50
  badLine: "#fecaca", // 200
  badText: "#b91c1c", // 700

  onInk: "#ffffff",
} as const;

/**
 * Tailwind's type scale. The web app's body text is text-sm (14/20), which
 * reads small on a phone, so `body` is 15 here and everything else keeps its
 * relative step - the hierarchy is the web app's, the base size is native.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
} as const;

/** Tailwind's 4px spacing step, named for the sizes this app actually uses. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 6, // Tailwind rounded-md: the corner on every button and card
  lg: 12,
  pill: 999,
} as const;

/**
 * The minimum comfortable touch target. The web app's 32px buttons are fine
 * for a mouse and too small for a thumb; every pressable here clears 44.
 */
export const TOUCH_TARGET = 44;
