"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

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

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-red-100 text-red-600",
};

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
            <ConsentRow key={r.id} row={r} onRefresh={fetchRequests} patientName={patientName} patientPhone={patientPhone} clinicId={clinicId} />
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

function ConsentRow({
  row,
  onRefresh,
  patientName,
  patientPhone,
  clinicId,
}: {
  row: ConsentRequestRow;
  onRefresh: () => void;
  patientName: string;
  patientPhone?: string | null;
  clinicId: string;
}) {
  const [showResult, setShowResult] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const consentUrl = `${window.location.origin}/consent/${row.token}`;

  async function handleResend() {
    setBusy(true);
    const res = await fetch(`/api/consent/requests/${row.id}/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiryHours: 48 }),
    });
    if (res.ok) {
      const data = await res.json();
      setQrData(data.qrCodeData);
      setShowResult(true);
      onRefresh();
    }
    setBusy(false);
  }

  async function handleCancel() {
    if (!confirm("Cancel this consent request?")) return;
    setBusy(true);
    await fetch(`/api/consent/requests/${row.id}/cancel`, { method: "PATCH" });
    onRefresh();
    setBusy(false);
  }

  async function showQR() {
    const url = consentUrl;
    const data = await QRCode.toDataURL(url);
    setQrData(data);
    setShowResult(true);
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
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
                Signed {new Date(row.signedAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
              </span>
            )}
            {row.signMethod && <span className="text-xs text-slate-400">{row.signMethod}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {row.status === "COMPLETED" && row.pdfUrl && (
            <a href={row.pdfUrl} target="_blank" rel="noreferrer" className="btn-outline text-xs py-1 px-2">
              PDF
            </a>
          )}
          {row.status === "PENDING" && (
            <>
              <button onClick={showQR} className="btn-outline text-xs py-1 px-2">QR</button>
              <button
                onClick={() => {
                  const phone = (patientPhone ?? "").replace(/\D/g, "");
                  const p = phone.startsWith("0") ? "60" + phone.slice(1) : phone.startsWith("60") ? phone : "60" + phone;
                  const msg = `Dear ${patientName}, please complete your consent form: ${consentUrl}`;
                  window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, "_blank");
                }}
                className="btn-outline text-xs py-1 px-2"
              >
                WhatsApp
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(consentUrl); }}
                className="btn-outline text-xs py-1 px-2"
              >
                Copy Link
              </button>
              <button onClick={handleResend} disabled={busy} className="btn-outline text-xs py-1 px-2">
                Resend
              </button>
              <button onClick={handleCancel} disabled={busy} className="text-xs text-red-500 hover:text-red-700 px-1">
                Cancel
              </button>
            </>
          )}
          {(row.status === "EXPIRED" || row.status === "CANCELLED") && (
            <button onClick={handleResend} disabled={busy} className="btn-primary text-xs py-1 px-2">
              Resend
            </button>
          )}
        </div>
      </div>

      {showResult && qrData && (
        <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-start gap-4">
            <img src={qrData} alt="QR code" className="w-32 h-32 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 mb-2">Consent Link</p>
              <p className="text-xs text-slate-500 break-all font-mono mb-3">{consentUrl}</p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigator.clipboard.writeText(consentUrl)} className="btn-outline text-xs py-1 px-2">
                  Copy Link
                </button>
                <button
                  onClick={() => {
                    const phone = (patientPhone ?? "").replace(/\D/g, "");
                    const p = phone.startsWith("0") ? "60" + phone.slice(1) : phone.startsWith("60") ? phone : "60" + phone;
                    const msg = `Dear ${patientName}, please complete your consent form: ${consentUrl}`;
                    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="btn-outline text-xs py-1 px-2"
                >
                  WhatsApp
                </button>
                <a href={`/consent/${row.token}`} target="_blank" rel="noreferrer" className="btn-outline text-xs py-1 px-2">
                  Sign on This Device
                </a>
              </div>
            </div>
          </div>
          <button onClick={() => setShowResult(false)} className="mt-2 text-xs text-slate-400 underline">
            Hide
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [result, setResult] = useState<{
    consentUrl: string;
    whatsappLink: string;
    qrCodeData: string;
    token: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/consent/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.filter((t: ConsentTemplate) => t.isActive)));
  }, []);

  async function handleCreate() {
    if (!templateId) return;
    setBusy(true);
    const res = await fetch("/api/consent/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, patientId, clinicId, expiryHours }),
    });
    if (res.ok) {
      const data = await res.json();
      setResult({
        consentUrl: data.consentUrl,
        whatsappLink: data.whatsappLink,
        qrCodeData: data.qrCodeData,
        token: data.request.token,
      });
      onCreated();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(`Failed to create consent request: ${errData.error ?? res.status}`);
    }
    setBusy(false);
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Expires in (hours)</label>
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

              <button
                onClick={handleCreate}
                disabled={!templateId || busy}
                className="w-full btn-primary py-2"
              >
                {busy ? "Creating…" : "Create & Get Link"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-green-700 font-medium">Consent request created!</p>
              <div className="flex items-start gap-4">
                <img src={result.qrCodeData} alt="QR" className="w-28 h-28 flex-shrink-0 rounded border border-slate-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 break-all font-mono mb-3">{result.consentUrl}</p>
                  <div className="space-y-2">
                    <a
                      href={result.whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 w-full justify-center bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      Send via WhatsApp
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.consentUrl)}
                      className="w-full btn-outline text-sm py-2"
                    >
                      Copy Link
                    </button>
                    <a
                      href={`/consent/${result.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center w-full btn-outline text-sm py-2"
                    >
                      Sign on This Device
                    </a>
                  </div>
                </div>
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
