import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
};

export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
