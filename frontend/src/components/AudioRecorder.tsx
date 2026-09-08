"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PROXY_PREFIX } from "@/lib/api";

const MAX_RECORDING_SECONDS = 180; // 3 minutes
const UPLOAD_PATH = `${PROXY_PREFIX}/submissions/upload`;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // must match the backend limit

type Phase =
  | "requesting"
  | "denied"
  | "idle"
  | "recording"
  | "preview"
  | "uploading"
  | "done";

/** First audio container the browser supports, best quality first. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/** The backend accepts audio/mpeg, audio/wav and audio/webm. */
function uploadContentType(blobType: string): string {
  const base = blobType.split(";")[0].toLowerCase();
  if (base.includes("mpeg") || base.includes("mp3")) return "audio/mpeg";
  if (base.includes("wav")) return "audio/wav";
  return "audio/webm";
}

function extensionFor(contentType: string): string {
  if (contentType === "audio/mpeg") return "mp3";
  if (contentType === "audio/wav") return "wav";
  return "webm";
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioRecorder({
  onUploaded,
}: {
  onUploaded?: (submissionId?: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("requesting");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* ---------------- permission: microphone only ---------------- */
  useEffect(() => {
    let cancelled = false;

    async function requestPermission() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setRecordingSupported(false);
        setPhase("denied");
        setError(
          "This browser cannot record audio. Use the file upload option below instead.",
        );
        return;
      }
      try {
        // Audio only - the camera is never requested.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setPhase("idle");
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setPhase("denied");
        setError(
          name === "NotAllowedError"
            ? "Microphone access was blocked."
            : name === "NotFoundError"
              ? "No microphone was found on this device."
              : `Could not start the microphone: ${
                  err instanceof Error ? err.message : String(err)
                }`,
        );
      }
    }

    void requestPermission();
    return () => {
      cancelled = true;
      clearTimer();
      stopTracks();
      xhrRef.current?.abort();
    };
  }, [clearTimer, stopTracks]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- recording ---------------- */
  const stopRecording = useCallback(() => {
    clearTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, [clearTimer]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
      setBlob(recorded);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(recorded);
      });
      setPhase("preview");
    };

    recorder.start();
    setElapsed(0);
    setPhase("recording");

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
  }, [stopRecording]);

  const reRecord = useCallback(() => {
    setBlob(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setElapsed(0);
    setProgress(0);
    setError(null);
    setPhase(recordingSupported && streamRef.current ? "idle" : "denied");
  }, [recordingSupported]);

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${(file.size / 1_048_576).toFixed(1)} MB; the limit is 20 MB.`);
      return;
    }
    setBlob(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setError(null);
    setPhase("preview");
  };

  /* ---------------- upload ---------------- */
  const submit = useCallback(() => {
    if (!blob) return;
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError(`Recording is ${(blob.size / 1_048_576).toFixed(1)} MB; the limit is 20 MB.`);
      return;
    }

    setPhase("uploading");
    setProgress(0);
    setError(null);

    const contentType = uploadContentType(blob.type);
    const form = new FormData();
    // Field name must be "audio" - that is what the endpoint binds.
    form.append(
      "audio",
      new Blob([blob], { type: contentType }),
      `recording.${extensionFor(contentType)}`,
    );

    // XMLHttpRequest rather than fetch: fetch exposes no upload progress.
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", UPLOAD_PATH);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        stopTracks();
        setPhase("done");
        let createdId: number | undefined;
        try {
          createdId = (JSON.parse(xhr.responseText) as { id?: number }).id;
        } catch {
          /* the redirect still works without an id */
        }
        onUploaded?.(createdId);
      } else {
        let detail = `Upload failed (HTTP ${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { detail?: unknown };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          /* keep the generic message */
        }
        setError(detail);
        setPhase("preview");
      }
    };
    xhr.onerror = () => {
      setError("Network error while uploading. Check your connection and try again.");
      setPhase("preview");
    };

    xhr.send(form);
  }, [blob, onUploaded, stopTracks]);

  /* ---------------- render ---------------- */
  const remaining = MAX_RECORDING_SECONDS - elapsed;

  return (
    <div className="space-y-4">
      {phase === "requesting" && (
        <p className="text-sm text-gray-600">Requesting microphone access&hellip;</p>
      )}

      {phase === "denied" && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Microphone unavailable</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2">
            To enable it, click the microphone icon in your browser&apos;s address bar
            and allow access, then reload this page. Or upload an audio file below.
          </p>
        </div>
      )}

      {(phase === "idle" || phase === "recording") && (
        <div className="space-y-3">
          {phase === "recording" ? (
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-sm font-medium text-red-600">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-600" />
                Recording {formatSeconds(elapsed)}
              </span>
              <span className="text-sm text-gray-600">
                {formatSeconds(remaining)} left
              </span>
              <button
                type="button"
                onClick={stopRecording}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
              >
                Stop
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Start recording
            </button>
          )}
          <p className="text-xs text-gray-500">
            Audio only &mdash; your camera is never used. Maximum{" "}
            {MAX_RECORDING_SECONDS / 60} minutes.
          </p>
        </div>
      )}

      {phase === "preview" && previewUrl && (
        <div className="space-y-3">
          <audio src={previewUrl} controls className="w-full max-w-xl" />
          {error && (
            <p
              role="alert"
              className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={submit}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={reRecord}
              className="rounded border border-gray-400 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Re-record
            </button>
          </div>
          {blob && (
            <p className="text-xs text-gray-500">
              {(blob.size / 1_048_576).toFixed(2)} MB &middot;{" "}
              {blob.type || "unknown type"}
            </p>
          )}
        </div>
      )}

      {phase === "uploading" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Uploading&hellip; {progress}%</p>
          <div className="h-2 w-full max-w-xl overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {phase === "done" && (
        <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          Recording submitted. Redirecting&hellip;
        </p>
      )}

      {phase !== "uploading" && phase !== "done" && (
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-sm font-medium text-gray-700">
            {recordingSupported ? "Or upload an audio file" : "Upload an audio file"}
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/webm,audio/ogg,.mp3,.wav,.webm"
              onChange={onFilePicked}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm"
            />
            <span className="mt-1 block text-xs text-gray-500">
              MP3, WAV or WebM, up to 20 MB.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
