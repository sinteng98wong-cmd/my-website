"use client";

import { useState, useEffect, useCallback } from "react";

type ConsentTemplate = {
  id: string;
  name: string;
  type: string;
  treatmentType?: string;
  isActive: boolean;
};

type ConsentRequestRow = {
  id: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  signedAt?: string | null;
  signMethod?: string | null;
  pdfUrl?: string | null;
  expiresAt: string;
  token: string;
  template: { name: string; type: string };
  sentBy?: { name: string } | null;
};

type ConsentRequestDetail = ConsentRequestRow & {
  responses: Record<string, unknown> | null;
  signatureUrl: string | null;
  signedByName: string | null;
  signedIp: string | null;
  template: {
    name: string;
    type: string;
    version?: number;
    introText?: string;
    consentText?: string;
    fields: {
      id: string;
      label: string;
      fieldType: string;
      order: number;
      options: string[];
    }[];
  };
  clinic: { name: string };
  patient: { name: string; patientRef: string };
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  EXPIRED:   "bg-slate-100 text-slate-500",
  CANCELLED: "bg-red-100 text-red-600",
};

function buildConsentUrl(token: string) {
  if (typeof window === "undefined") return `/consent/${token}`;
  return `${window.location.origin}/consent/${token}`;
}

function buildWhatsAppUrl(phone: string | null | undefined, patientName: string, consentUrl: string) {
  let p = (phone ?? "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "60" + p.slice(1);
  if (!p.startsWith("60")) p = "60" + p;
  const msg = `Dear ${patientName}, please complete your consent form: ${consentUrl}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`;
}

async function generateQR(url: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(url);
}

function formatFieldValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (fieldType === "DATE" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-MY", { dateStyle: "medium" });
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────

export function ConsentFormsTab({
  patientId,
  clinicId,
  patientName,
  patientPhone,
}: {
  patientId: string;
  clinicId: string;
  patientName: string;
  patientPhone?: string | null;
}) {
  const [requests, setRequests] = useState<ConsentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/consent/requests?patientId=${patientId}`);
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, [patientId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Consent Forms</h3>
        <button onClick={() => setShowModal(true)} className="btn-primary text-xs py-1.5 px-3">
          + Send Consent Form
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No consent forms sent yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {requests.map((r) => (
            <ConsentRow
              key={r.id}
              row={r}
              onRefresh={fetchRequests}
              patientName={patientName}
              patientPhone={patientPhone}
            />
          ))}
        </div>
      )}

      {showModal && (
        <SendConsentModal
          patientId={patientId}
          clinicId={clinicId}
          patientName={patientName}
          patientPhone={patientPhone}
          onClose={() => setShowModal(false)}
          onCreated={fetchRequests}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ConsentRow({
  row,
  onRefresh,
  patientName,
  patientPhone,
}: {
  row: ConsentRequestRow;
  onRefresh: () => void;
  patientName: string;
  patientPhone?: string | null;
}) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewDetail, setViewDetail] = useState<ConsentRequestDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // pdfUrl is always /api/consent/requests/{id}/pdf after completion
  const pdfUrl = row.pdfUrl ?? `/api/consent/requests/${row.id}/pdf`;

  const consentUrl = buildConsentUrl(row.token);

  async function handleShowQR() {
    if (qrData) { setShowQrPanel((v) => !v); return; }
    try {
      const data = await generateQR(consentUrl);
      setQrData(data);
      setShowQrPanel(true);
    } catch (err) {
      console.error("QR generation failed:", err);
      alert("QR generation failed. Use Copy Link instead.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(consentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", consentUrl);
    }
  }

  async function handleResend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/consent/requests/${row.id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiryHours: 48 }),
      });
      if (res.ok) {
        const data = await res.json();
        setQrData(data.qrCodeData ?? null);
        setShowQrPanel(true);
        onRefresh();
      } else {
        alert("Resend failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this consent request?")) return;
    setBusy(true);
    await fetch(`/api/consent/requests/${row.id}/cancel`, { method: "PATCH" });
    onRefresh();
    setBusy(false);
  }

  async function handleViewResponses() {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/consent/requests/${row.id}`);
      if (res.ok) {
        const data = await res.json();
        setViewDetail(data);
      } else {
        alert("Failed to load form responses.");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <>
      <div className="py-4">
        {/* Row header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{row.template.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[row.status]}`}>
                {row.status}
              </span>
              <span className="text-xs text-slate-400">
                Sent {new Date(row.createdAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
              </span>
              {row.signedAt && (
                <span className="text-xs text-slate-400">
                  · Signed {new Date(row.signedAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {/* COMPLETED */}
            {row.status === "COMPLETED" && (
              <>
                <button
                  onClick={handleViewResponses}
                  disabled={loadingDetail}
                  className="btn-primary text-xs py-1 px-2"
                >
                  {loadingDetail ? "Loading…" : "View Responses"}
                </button>
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-outline text-xs py-1 px-2">
                  Download PDF
                </a>
              </>
            )}

            {/* PENDING */}
            {row.status === "PENDING" && (
              <>
                <a
                  href={`/consent/${row.token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary text-xs py-1 px-2"
                >
                  Open Form ↗
                </a>
                <button onClick={handleShowQR} className="btn-outline text-xs py-1 px-2">QR Code</button>
                <button
                  onClick={() => window.open(buildWhatsAppUrl(patientPhone, patientName, consentUrl), "_blank")}
                  className="btn-outline text-xs py-1 px-2"
                >
                  WhatsApp
                </button>
                <button onClick={handleCopy} className="btn-outline text-xs py-1 px-2">
                  {copied ? "Copied!" : "Copy Link"}
                </button>
                <button onClick={handleResend} disabled={busy} className="btn-outline text-xs py-1 px-2">Resend</button>
                <button onClick={handleCancel} disabled={busy} className="text-xs text-red-500 hover:text-red-700 px-1">Cancel</button>
              </>
            )}

            {/* EXPIRED / CANCELLED */}
            {(row.status === "EXPIRED" || row.status === "CANCELLED") && (
              <button onClick={handleResend} disabled={busy} className="btn-primary text-xs py-1 px-2">
                Resend New Link
              </button>
            )}
          </div>
        </div>

        {/* QR panel */}
        {showQrPanel && (
          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-start gap-4">
              {qrData ? (
                <img src={qrData} alt="QR code" className="w-28 h-28 flex-shrink-0 border border-slate-200 rounded" />
              ) : (
                <div className="w-28 h-28 flex-shrink-0 bg-slate-200 rounded animate-pulse" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 font-mono break-all mb-3">{consentUrl}</p>
                <div className="flex gap-2 flex-wrap">
                  <a href={`/consent/${row.token}`} target="_blank" rel="noreferrer" className="btn-primary text-xs py-1 px-2">
                    Open Form ↗
                  </a>
                  <button onClick={handleCopy} className="btn-outline text-xs py-1 px-2">{copied ? "Copied!" : "Copy Link"}</button>
                  <button onClick={() => window.open(buildWhatsAppUrl(patientPhone, patientName, consentUrl), "_blank")} className="btn-outline text-xs py-1 px-2">WhatsApp</button>
                </div>
              </div>
            </div>
            <button onClick={() => setShowQrPanel(false)} className="mt-2 text-xs text-slate-400 underline">Hide</button>
          </div>
        )}
      </div>

      {/* View Responses Modal */}
      {viewDetail && (
        <ViewResponsesModal
          detail={viewDetail}
          pdfUrl={pdfUrl}
          onClose={() => setViewDetail(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ViewResponsesModal({
  detail,
  pdfUrl,
  onClose,
}: {
  detail: ConsentRequestDetail;
  pdfUrl: string;
  onClose: () => void;
}) {
  const responses = detail.responses ?? {};
  const fields = detail.template?.fields ?? [];
  const signedAt = detail.signedAt
    ? new Date(detail.signedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{detail.template.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Signed by {detail.signedByName ?? "—"} · {signedAt}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm py-1.5 px-3">
              Download PDF
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Intro text */}
          {detail.template.introText && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm text-blue-800">{detail.template.introText}</p>
            </div>
          )}

          {/* Field responses */}
          {fields.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Patient Responses</h3>
              <div className="space-y-3">
                {fields.map((f) => {
                  const value = (responses as Record<string, unknown>)[f.id];
                  const display = formatFieldValue(f.fieldType, value);
                  return (
                    <div key={f.id} className="flex gap-4 py-2 border-b border-slate-50 last:border-0">
                      <p className="text-sm font-medium text-slate-600 w-2/5 flex-shrink-0">{f.label}</p>
                      <p className={`text-sm flex-1 ${display === "—" ? "text-slate-300 italic" : "text-slate-900"}`}>
                        {display}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consent clause */}
          {detail.template.consentText && (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Consent Agreement</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{detail.template.consentText}</p>
            </div>
          )}

          {/* Signature */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Signature</h3>
            {detail.signatureUrl && detail.signatureUrl.startsWith("data:image") ? (
              <div className="border border-slate-200 rounded-lg p-3 bg-white inline-block">
                <img
                  src={detail.signatureUrl}
                  alt="Patient signature"
                  className="max-w-xs h-24 object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No signature image available</p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Signed by</p>
                <p className="text-slate-900 font-medium">{detail.signedByName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Date &amp; Time</p>
                <p className="text-slate-900">{signedAt}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">IP Address</p>
                <p className="text-slate-900 font-mono text-xs">{detail.signedIp ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Method</p>
                <p className="text-slate-900">{detail.signMethod ?? "digital_signature"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-outline text-sm py-1.5 px-4">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SendConsentModal({
  patientId,
  clinicId,
  patientName,
  patientPhone,
  onClose,
  onCreated,
}: {
  patientId: string;
  clinicId: string;
  patientName: string;
  patientPhone?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [expiryHours, setExpiryHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    consentUrl: string;
    qrCodeData: string;
    token: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/consent/templates")
      .then((r) => r.json())
      .then((data) => setTemplates((data ?? []).filter((t: ConsentTemplate) => t.isActive)));
  }, []);

  async function handleCreate() {
    if (!templateId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/consent/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, patientId, clinicId, expiryHours }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ consentUrl: data.consentUrl, qrCodeData: data.qrCodeData, token: data.request.token });
        onCreated();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to create consent request: ${errData.error ?? res.status}`);
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    const url = result?.consentUrl ?? "";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Send Consent Form</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          {!result ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Consent Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Link expires in</label>
                <select
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours (default)</option>
                  <option value={72}>72 hours</option>
                  <option value={168}>7 days</option>
                </select>
              </div>

              <button onClick={handleCreate} disabled={!templateId || busy} className="w-full btn-primary py-2">
                {busy ? "Creating…" : "Create Consent Link"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Consent link created!
              </p>
              {result.qrCodeData && (
                <div className="flex items-start gap-4">
                  <img src={result.qrCodeData} alt="QR" className="w-28 h-28 flex-shrink-0 border border-slate-200 rounded" />
                  <p className="text-xs text-slate-500 font-mono break-all mt-1">{result.consentUrl}</p>
                </div>
              )}
              <div className="space-y-2">
                <a href={`/consent/${result.token}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full btn-primary py-2.5">
                  Open Form on This Device ↗
                </a>
                <a href={buildWhatsAppUrl(patientPhone, patientName, result.consentUrl)} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                  Send via WhatsApp
                </a>
                <button onClick={handleCopy} className="w-full btn-outline text-sm py-2.5">
                  {copied ? "Link Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-outline text-sm py-1.5 px-4">Close</button>
        </div>
      </div>
    </div>
  );
}
