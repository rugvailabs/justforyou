"use client";

/**
 * Two-step phone sign-in: number, then the code sent to it.
 *
 * The phone number is held in state across both steps and is never cleared on
 * a failed code, so a wrong digit costs one field, not the whole form.
 *
 * Failure modes come back from the API as distinct HTTP statuses rather than
 * one generic 400, which is what lets this say "expired" and "incorrect" as
 * different things:
 *   404 no code requested · 410 expired · 400 incorrect · 429 throttled
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { FIELD } from "@/components/ui/field";


/** Digits a real number has, ignoring punctuation. Loose on purpose. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

type Step = "phone" | "code";

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** Client-side check, so an obviously bad number never costs a round trip. */
function phoneProblem(value: string): string | null {
  const digits = digitsOf(value);
  if (digits.length === 0) return "Enter your phone number.";
  if (digits.length < MIN_DIGITS) return "That number looks too short.";
  if (digits.length > MAX_DIGITS) return "That number looks too long.";
  return null;
}

export default function OtpLoginForm({ next }: { next: string }): JSX.Element {
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Countdown for the resend button. The server enforces the real limit and
  // returns 429; this only stops the user asking for something they cannot
  // have yet.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = useCallback(
    async (resend: boolean): Promise<void> => {
      const problem = phoneProblem(phone);
      if (problem !== null) {
        setError(problem);
        return;
      }

      setError(null);
      setNotice(null);
      setBusy(true);
      try {
        const res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.trim() }),
        });
        const body: unknown = await res.json().catch(() => null);
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : null;

        if (!res.ok) {
          if (res.status === 429) {
            // Trust the server's own clock over ours.
            const seconds = Number(res.headers.get("Retry-After")) || 30;
            setCooldown(seconds);
            setStep("code");
          }
          setError(detail ?? `Could not send a code (HTTP ${res.status}).`);
          return;
        }

        const accepted = body as { resend_after?: number } | null;
        setCooldown(accepted?.resend_after ?? 30);
        setStep("code");
        setNotice(
          resend
            ? "A new code is on its way."
            : "We sent a 6-digit code to that number.",
        );
      } catch {
        setError("Could not reach the server. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [phone],
  );

  async function submitCode(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the code we sent you.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "otp",
          phone: phone.trim(),
          code: code.trim(),
          name: name.trim() || undefined,
        }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : null;

        // The status is the distinction; the copy just makes it readable.
        if (res.status === 410) {
          setError(detail ?? "That code has expired. Request a new one.");
          setCooldown(0);
        } else if (res.status === 404) {
          setError(detail ?? "No code has been requested for that number.");
          setCooldown(0);
        } else if (res.status === 429) {
          setError(detail ?? "Too many attempts. Request a new code.");
          setCooldown(0);
        } else {
          setError(detail ?? "That code is not correct.");
        }
        // The phone number is deliberately kept: only the code is wrong.
        setCode("");
        return;
      }

      router.replace(next || "/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Progress. Encodes which step you are on, and lets you go back. */}
      <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <li
          className={`rounded-full px-2.5 py-1 ${
            step === "phone"
              ? "bg-slate-900 text-white"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          1 · Your number
        </li>
        <li aria-hidden="true" className="h-px w-4 bg-slate-300" />
        <li
          className={`rounded-full px-2.5 py-1 ${
            step === "code" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          2 · Enter code
        </li>
      </ol>

      {step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode(false);
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Phone number
            </span>
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
              placeholder="+1 604 555 0142"
              className={FIELD}
            />
          </label>

          {error !== null ? (
            <Alert tone="error">{error}</Alert>
          ) : null}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-3">
          <p className="text-sm text-slate-600">
            Code sent to <strong>{phone}</strong>.{" "}
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              className="rounded underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Change number
            </button>
          </p>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              6-digit code
            </span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              placeholder="123456"
              className={`${FIELD} tracking-[0.4em]`}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Your name{" "}
              <span className="font-normal text-slate-500">
                (only needed if this is your first time)
              </span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={FIELD}
            />
          </label>

          {error !== null ? (
            <Alert tone="error">{error}</Alert>
          ) : null}
          {notice !== null && error === null ? (
            <Alert tone="info">{notice}</Alert>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || cooldown > 0}
              onClick={() => void sendCode(true)}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
