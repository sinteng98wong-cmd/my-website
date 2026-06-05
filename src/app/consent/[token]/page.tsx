"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type ConsentField = {
  id: string;
  label: string;
  fieldType: "TEXT" | "LONG_TEXT" | "YES_NO" | "CHECKBOX" | "MULTIPLE_CHOICE" | "DATE" | "SIGNATURE";
  isRequired: boolean;
  options: string[];
  placeholder?: string;
  helpText?: string;
  showIfFieldId?: string;
  showIfValue?: string;
};

type ConsentData = {
  id: string;
  status: string;
  expiresAt: string;
  template: {
    id: string;
    name: string;
    type: string;
    version: number;
    introText?: string;
    consentText?: string;
    fields: ConsentField[];
  };
  clinic: { name: string };
};

export default function ConsentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ConsentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [signedByName, setSignedByName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  useEffect(() => {
    fetch(`/api/public/consent/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? "not_found");
        } else {
          const j = await res.json();
          setData(j);
        }
      })
      .catch(() => setError("network_error"))
      .finally(() => setLoading(false));
  }, [token]);

  // Canvas signature pad
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasSig(true);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const stopDraw = useCallback(() => { isDrawing.current = false; }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }, []);

  const visibleFields = data?.template.fields.filter((f) => {
    if (!f.showIfFieldId) return true;
    const depVal = responses[f.showIfFieldId];
    return String(depVal) === f.showIfValue;
  }) ?? [];

  function validate() {
    const errs: Record<string, string> = {};
    for (const f of visibleFields) {
      if (f.fieldType === "SIGNATURE") continue;
      if (f.isRequired) {
        const v = responses[f.id];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
          errs[f.id] = "This field is required.";
        }
      }
    }
    if (!hasSig) errs["__sig"] = "Signature is required.";
    if (!signedByName.trim()) errs["__name"] = "Please enter your full name.";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setValidationErrors(errs); return; }
    setValidationErrors({});

    const canvas = canvasRef.current;
    const signatureBase64 = canvas ? canvas.toDataURL("image/png") : "";

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/consent/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, signatureBase64, signedByName: signedByName.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "submission_failed");
      }
    } catch {
      setError("network_error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Loading consent form…</p>
      </div>
    );
  }

  if (error) {
    const msgs: Record<string, string> = {
      expired: "This consent link has expired. Please contact the clinic.",
      not_found: "This consent link is invalid or has been removed.",
      cancelled: "This consent request has been cancelled. Please contact the clinic.",
      already_completed: "This consent form has already been submitted. Thank you!",
      network_error: "Unable to load the form. Please check your connection and try again.",
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Consent Form Unavailable</h1>
          <p className="text-slate-500">{msgs[error] ?? "An error occurred. Please contact the clinic."}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Thank You!</h1>
          <p className="text-slate-600 text-base">
            Your consent form has been received and signed. The clinic has been notified.
          </p>
          <p className="text-slate-400 text-sm mt-4">You may now close this page.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <div>
              <p className="text-xs text-slate-500">{data.clinic.name}</p>
              <h1 className="text-base font-semibold text-slate-900 leading-tight">{data.template.name}</h1>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Intro */}
        {data.template.introText && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm text-blue-800 leading-relaxed">{data.template.introText}</p>
          </div>
        )}

        {/* Dynamic Fields */}
        {visibleFields.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {visibleFields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={responses[field.id]}
                onChange={(v) => setResponses((prev) => ({ ...prev, [field.id]: v }))}
                error={validationErrors[field.id]}
              />
            ))}
          </div>
        )}

        {/* Consent Clause */}
        {data.template.consentText && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Consent Agreement</h2>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {data.template.consentText}
            </p>
          </div>
        )}

        {/* Signature */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Your Signature</h2>
          <p className="text-xs text-slate-500 mb-3">Draw your signature in the box below using your finger or stylus.</p>

          <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full h-40 cursor-crosshair"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasSig && (
              <p className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none select-none">
                Sign here
              </p>
            )}
          </div>

          {validationErrors["__sig"] && (
            <p className="text-xs text-red-500 mt-1">{validationErrors["__sig"]}</p>
          )}

          <button
            type="button"
            onClick={clearSignature}
            className="mt-2 text-sm text-slate-500 underline underline-offset-2"
          >
            Clear signature
          </button>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signedByName}
              onChange={(e) => setSignedByName(e.target.value)}
              placeholder="Your full name"
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {validationErrors["__name"] && (
              <p className="text-xs text-red-500 mt-1">{validationErrors["__name"]}</p>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl text-base transition-colors"
        >
          {submitting ? "Submitting…" : "I Agree & Submit Consent Form"}
        </button>

        <p className="text-center text-xs text-slate-400 pb-6">
          This form is version {data.template.version} · Expires{" "}
          {new Date(data.expiresAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
        </p>
      </form>
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: ConsentField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const baseInput = "w-full border border-slate-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div className="p-4">
      <label className="block text-sm font-medium text-slate-800 mb-1.5">
        {field.label}
        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.helpText && <p className="text-xs text-slate-500 mb-2">{field.helpText}</p>}

      {field.fieldType === "TEXT" && (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInput}
        />
      )}

      {field.fieldType === "LONG_TEXT" && (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={baseInput + " resize-none"}
        />
      )}

      {field.fieldType === "YES_NO" && (
        <div className="flex gap-3">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                value === opt
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {field.fieldType === "CHECKBOX" && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">{field.placeholder ?? "Check to confirm"}</span>
        </label>
      )}

      {field.fieldType === "MULTIPLE_CHOICE" && (
        <div className="space-y-2">
          {field.options.map((opt) => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {field.fieldType === "DATE" && (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
