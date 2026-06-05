"use client";

import { useState, useEffect, useCallback } from "react";

type FieldType = "TEXT" | "LONG_TEXT" | "YES_NO" | "CHECKBOX" | "MULTIPLE_CHOICE" | "DATE" | "SIGNATURE";

type ConsentField = {
  _key: string; // local drag/sort key
  id?: string;
  label: string;
  fieldType: FieldType;
  isRequired: boolean;
  order: number;
  options: string[];
  placeholder: string;
  helpText: string;
  showIfFieldId: string;
  showIfValue: string;
};

type ConsentTemplate = {
  id: string;
  name: string;
  type: "GENERAL" | "TREATMENT";
  treatmentType?: string;
  description?: string;
  introText?: string;
  consentText?: string;
  isActive: boolean;
  version: number;
  _count?: { fields: number; requests: number };
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Short Text",
  LONG_TEXT: "Long Text",
  YES_NO: "Yes / No",
  CHECKBOX: "Checkbox",
  MULTIPLE_CHOICE: "Multiple Choice",
  DATE: "Date",
  SIGNATURE: "Signature",
};

function uid() { return Math.random().toString(36).slice(2, 10); }

const EMPTY_FIELD = (): ConsentField => ({
  _key: uid(),
  label: "",
  fieldType: "TEXT",
  isRequired: false,
  order: 0,
  options: [],
  placeholder: "",
  helpText: "",
  showIfFieldId: "",
  showIfValue: "",
});

const EMPTY_TEMPLATE = (): Omit<ConsentTemplate, "id" | "version" | "_count"> & { fields: ConsentField[] } => ({
  name: "",
  type: "GENERAL",
  treatmentType: "",
  description: "",
  introText: "",
  consentText: "",
  isActive: true,
  fields: [],
});

export default function ConsentTemplatesPage() {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | "new" | ConsentTemplate>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/consent/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    const res = await fetch(`/api/consent/templates/${id}`, { method: "DELETE" });
    if (res.ok) fetchTemplates();
    else {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Delete failed.");
    }
  }

  async function handleToggleActive(t: ConsentTemplate) {
    await fetch(`/api/consent/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    fetchTemplates();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Consent Templates</h1>
          <p className="text-sm text-slate-500 mt-1">Manage digital consent form templates sent to patients.</p>
        </div>
        <button onClick={() => setEditing("new")} className="btn-primary">
          + New Template
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-400 mb-4">No consent templates yet.</p>
          <button onClick={() => setEditing("new")} className="btn-primary">
            Create First Template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="card p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.type === "GENERAL" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                    {t.type}
                  </span>
                  {t.treatmentType && (
                    <span className="text-xs text-slate-500">({t.treatmentType})</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-slate-400">v{t.version}</span>
                </div>
                {t.description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-lg">{t.description}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  {t._count?.fields ?? 0} fields · {t._count?.requests ?? 0} requests sent
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setEditing(t)} className="btn-outline text-xs py-1 px-3">Edit</button>
                <button onClick={() => handleToggleActive(t)} className="btn-outline text-xs py-1 px-3">
                  {t.isActive ? "Deactivate" : "Activate"}
                </button>
                {(t._count?.requests ?? 0) === 0 && (
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-red-500 hover:text-red-700 px-1">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <TemplateBuilder
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={fetchTemplates}
        />
      )}
    </div>
  );
}

function TemplateBuilder({
  initial,
  onClose,
  onSaved,
}: {
  initial: ConsentTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !initial;
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    type: initial?.type ?? "GENERAL",
    treatmentType: initial?.treatmentType ?? "",
    description: initial?.description ?? "",
    introText: initial?.introText ?? "",
    consentText: initial?.consentText ?? "",
    isActive: initial?.isActive ?? true,
  }));
  const [fields, setFields] = useState<ConsentField[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "fields" | "preview">("info");
  const [editingField, setEditingField] = useState<ConsentField | null>(null);

  // Load existing fields when editing
  useEffect(() => {
    if (!initial) return;
    fetch(`/api/consent/templates/${initial.id}`)
      .then((r) => r.json())
      .then((data) => {
        setFields(
          (data.fields ?? []).map((f: any) => ({
            ...f,
            _key: f.id,
            placeholder: f.placeholder ?? "",
            helpText: f.helpText ?? "",
            showIfFieldId: f.showIfFieldId ?? "",
            showIfValue: f.showIfValue ?? "",
          }))
        );
      });
  }, [initial]);

  const setFormField = (k: keyof typeof form, v: any) => setForm((p) => ({ ...p, [k]: v }));

  function addField() {
    const f = EMPTY_FIELD();
    f.order = fields.length;
    setFields((prev) => [...prev, f]);
    setEditingField(f);
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f._key !== key).map((f, i) => ({ ...f, order: i })));
  }

  function moveField(key: string, dir: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f._key === key);
      if (idx + dir < 0 || idx + dir >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next.map((f, i) => ({ ...f, order: i }));
    });
  }

  function updateField(key: string, patch: Partial<ConsentField>) {
    setFields((prev) =>
      prev.map((f) => (f._key === key ? { ...f, ...patch } : f))
    );
    if (editingField?._key === key) {
      setEditingField((ef) => (ef ? { ...ef, ...patch } : ef));
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { alert("Template name is required."); return; }
    setBusy(true);
    const payload = {
      ...form,
      fields: fields.map((f, i) => ({
        label: f.label,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        order: i,
        options: f.options,
        placeholder: f.placeholder || null,
        helpText: f.helpText || null,
        showIfFieldId: f.showIfFieldId || null,
        showIfValue: f.showIfValue || null,
      })),
    };

    const res = isNew
      ? await fetch("/api/consent/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/consent/templates/${initial!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (res.ok) { onSaved(); onClose(); }
    else { const e = await res.json().catch(() => ({})); alert(e.error ?? "Save failed."); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isNew ? "New Consent Template" : `Edit: ${initial!.name}`}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {(["info", "fields", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                activeTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "info" ? "Template Info" : t === "fields" ? `Fields (${fields.length})` : "Preview"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Info Tab ── */}
          {activeTab === "info" && (
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setFormField("name", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. General Consent Form"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Form Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setFormField("type", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GENERAL">General</option>
                    <option value="TREATMENT">Treatment-Specific</option>
                  </select>
                </div>
              </div>

              {form.type === "TREATMENT" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Treatment Type</label>
                  <input
                    type="text"
                    value={form.treatmentType}
                    onChange={(e) => setFormField("treatmentType", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Implant, Extraction, Whitening"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setFormField("description", e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description for staff"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Introduction Text</label>
                <textarea
                  value={form.introText}
                  onChange={(e) => setFormField("introText", e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Shown at the top of the form to the patient"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Consent Clause</label>
                <textarea
                  value={form.consentText}
                  onChange={(e) => setFormField("consentText", e.target.value)}
                  rows={5}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Legal consent text shown above the signature"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setFormField("isActive", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <span className="text-sm text-slate-700">Active (visible when sending consent requests)</span>
              </label>
            </div>
          )}

          {/* ── Fields Tab ── */}
          {activeTab === "fields" && (
            <div className="flex gap-6">
              {/* Field list */}
              <div className="flex-1 min-w-0">
                {fields.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <p className="text-slate-400 text-sm mb-3">No fields yet</p>
                    <button onClick={addField} className="btn-primary text-sm">Add First Field</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fields.map((f, i) => (
                      <div
                        key={f._key}
                        onClick={() => setEditingField(f)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          editingField?._key === f._key
                            ? "border-blue-400 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-xs text-slate-400 w-5 text-center font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{f.label || <em className="text-slate-400">Untitled field</em>}</p>
                          <p className="text-xs text-slate-500">{FIELD_TYPE_LABELS[f.fieldType]}{f.isRequired ? " · Required" : ""}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); moveField(f._key, -1); }} disabled={i === 0} className="text-slate-400 hover:text-slate-600 px-1 disabled:opacity-30">↑</button>
                          <button onClick={(e) => { e.stopPropagation(); moveField(f._key, 1); }} disabled={i === fields.length - 1} className="text-slate-400 hover:text-slate-600 px-1 disabled:opacity-30">↓</button>
                          <button onClick={(e) => { e.stopPropagation(); removeField(f._key); if (editingField?._key === f._key) setEditingField(null); }} className="text-red-400 hover:text-red-600 px-1 ml-1">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={addField} className="mt-3 w-full btn-outline text-sm py-2 border-dashed">
                  + Add Field
                </button>
              </div>

              {/* Field editor */}
              {editingField && (
                <div className="w-72 flex-shrink-0 border-l border-slate-200 pl-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Field Settings</p>
                  <FieldEditor
                    field={editingField}
                    allFields={fields}
                    onChange={(patch) => updateField(editingField._key, patch)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Preview Tab ── */}
          {activeTab === "preview" && (
            <div className="max-w-lg mx-auto border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-white p-5">
                <p className="text-lg font-bold text-slate-900">{form.name || "Form Name"}</p>
                {form.introText && (
                  <div className="mt-3 bg-blue-50 rounded-lg p-3">
                    <p className="text-sm text-blue-800">{form.introText}</p>
                  </div>
                )}
                <div className="mt-4 space-y-4">
                  {fields.map((f) => (
                    <div key={f._key}>
                      <p className="text-sm font-medium text-slate-800">
                        {f.label || "Field label"}
                        {f.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      {f.helpText && <p className="text-xs text-slate-500">{f.helpText}</p>}
                      <PreviewInput field={f} />
                    </div>
                  ))}
                </div>
                {form.consentText && (
                  <div className="mt-4 bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-1">Consent Agreement</p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{form.consentText}</p>
                  </div>
                )}
                <div className="mt-4 border-2 border-dashed border-slate-200 rounded-lg h-20 flex items-center justify-center">
                  <p className="text-slate-300 text-xs">Signature pad</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-outline text-sm py-2 px-4">Cancel</button>
          <button onClick={handleSave} disabled={busy} className="btn-primary text-sm py-2 px-6">
            {busy ? "Saving…" : isNew ? "Create Template" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  allFields,
  onChange,
}: {
  field: ConsentField;
  allFields: ConsentField[];
  onChange: (patch: Partial<ConsentField>) => void;
}) {
  const needsOptions = field.fieldType === "MULTIPLE_CHOICE";
  const otherFields = allFields.filter((f) => f._key !== field._key && f.fieldType !== "SIGNATURE");

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Label *</label>
        <input type="text" value={field.label} onChange={(e) => onChange({ label: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Field label" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
        <select value={field.fieldType} onChange={(e) => onChange({ fieldType: e.target.value as FieldType })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={field.isRequired} onChange={(e) => onChange({ isRequired: e.target.checked })}
          className="w-4 h-4 rounded border-slate-300 text-blue-600" />
        <span className="text-xs text-slate-600">Required</span>
      </label>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Placeholder</label>
        <input type="text" value={field.placeholder} onChange={(e) => onChange({ placeholder: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Hint text" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Help Text</label>
        <input type="text" value={field.helpText} onChange={(e) => onChange({ helpText: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Help text below label" />
      </div>
      {needsOptions && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Options (one per line)</label>
          <textarea
            value={field.options.join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder={"Option 1\nOption 2\nOption 3"}
          />
        </div>
      )}
      {otherFields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1">Conditional Logic</p>
          <p className="text-xs text-slate-400 mb-1">Show only if:</p>
          <select value={field.showIfFieldId} onChange={(e) => onChange({ showIfFieldId: e.target.value, showIfValue: "" })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1">
            <option value="">Always show</option>
            {otherFields.map((f) => <option key={f._key} value={f._key}>{f.label || "Untitled"}</option>)}
          </select>
          {field.showIfFieldId && (
            <input type="text" value={field.showIfValue} onChange={(e) => onChange({ showIfValue: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="equals value…" />
          )}
        </div>
      )}
    </div>
  );
}

function PreviewInput({ field }: { field: ConsentField }) {
  const cls = "mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400";
  if (field.fieldType === "TEXT") return <input disabled className={cls} placeholder={field.placeholder || "Short answer"} />;
  if (field.fieldType === "LONG_TEXT") return <textarea disabled rows={3} className={cls + " resize-none"} placeholder={field.placeholder || "Long answer"} />;
  if (field.fieldType === "DATE") return <input disabled type="date" className={cls} />;
  if (field.fieldType === "YES_NO") return (
    <div className="flex gap-2 mt-1.5">
      <div className="flex-1 text-center border border-slate-200 rounded-lg py-2 text-sm text-slate-400">Yes</div>
      <div className="flex-1 text-center border border-slate-200 rounded-lg py-2 text-sm text-slate-400">No</div>
    </div>
  );
  if (field.fieldType === "CHECKBOX") return (
    <label className="flex items-center gap-2 mt-1.5 cursor-not-allowed">
      <input disabled type="checkbox" className="w-4 h-4" />
      <span className="text-sm text-slate-400">{field.placeholder || "Check to confirm"}</span>
    </label>
  );
  if (field.fieldType === "MULTIPLE_CHOICE") return (
    <div className="space-y-1 mt-1.5">
      {(field.options.length > 0 ? field.options : ["Option 1", "Option 2"]).map((o) => (
        <label key={o} className="flex items-center gap-2 cursor-not-allowed">
          <input disabled type="radio" className="w-3.5 h-3.5" />
          <span className="text-sm text-slate-400">{o}</span>
        </label>
      ))}
    </div>
  );
  if (field.fieldType === "SIGNATURE") return (
    <div className="mt-1.5 border-2 border-dashed border-slate-200 rounded-lg h-16 flex items-center justify-center">
      <span className="text-slate-300 text-xs">Signature</span>
    </div>
  );
  return null;
}
