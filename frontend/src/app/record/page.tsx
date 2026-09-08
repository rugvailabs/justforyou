"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import AudioRecorder from "@/components/AudioRecorder";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ApiError, apiPost, type SubmissionResponse } from "@/lib/api";

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 10_000;

type Mode = "text" | "audio";

function TextForm({ onSubmitted }: { onSubmitted: (id: number) => void }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TEXT_LENGTH;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiPost<SubmissionResponse>("/submissions", {
        text: trimmed,
      });
      onSubmitted(created.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Describe your problem</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={MAX_TEXT_LENGTH}
          required
          placeholder="For example: my kitchen sink has been leaking under the cabinet for two days and the floor is starting to swell."
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
        <span className="mt-1 flex justify-between text-xs text-gray-500">
          <span>
            {tooShort
              ? `At least ${MIN_TEXT_LENGTH} characters, please.`
              : "Write as much or as little as you like."}
          </span>
          <span>
            {trimmed.length}/{MAX_TEXT_LENGTH}
          </span>
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || trimmed.length < MIN_TEXT_LENGTH}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}

function RecordPageInner() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("text");

  const done = (id?: number) =>
    router.push(`/dashboard?submitted=1${id ? `&latest=${id}` : ""}`);

  return (
    <div>
      <h1 className="text-xl font-semibold">Describe your problem</h1>
      <p className="mt-2 text-sm text-gray-600">
        Type it out, or record a short voice note &mdash; whichever is easier. We turn
        either one into a written summary.
      </p>

      <div className="mt-6 flex gap-2 border-b border-gray-200">
        {(["text", "audio"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              mode === m
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {m === "text" ? "Type it" : "Record audio"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {mode === "text" ? (
          <TextForm onSubmitted={done} />
        ) : (
          <AudioRecorder onUploaded={done} />
        )}
      </div>
    </div>
  );
}

export default function RecordPage() {
  return (
    <ProtectedRoute>
      <RecordPageInner />
    </ProtectedRoute>
  );
}
