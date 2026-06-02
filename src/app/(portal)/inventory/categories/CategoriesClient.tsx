"use client";

import { useState } from "react";

type Sub  = { id: string; name: string; parentId: string };
type Cat  = { id: string; name: string; parentId: null; children: Sub[] };

// Preset top-level categories aligned with clinic usage
const PRESETS = [
  { name: "Dental Materials", subs: ["Implant", "Restorative", "Endodontic", "Periodontic", "Orthodontic", "Preventive", "Impression", "Anaesthetic"] },
  { name: "Products",         subs: ["Whitening", "Oral Hygiene", "Retail"] },
  { name: "Printing & Lab",   subs: ["Lab Materials", "3D Printing", "Stationery"] },
  { name: "Instruments",      subs: ["Handpieces", "Burs", "Hand Instruments"] },
  { name: "PPE & Consumables",subs: ["Gloves", "Masks", "Bibs", "Disposables"] },
  { name: "Office Supplies",  subs: [] },
];

export function CategoriesClient({ initialCategories }: { initialCategories: Cat[] }) {
  const [cats, setCats]           = useState<Cat[]>(initialCategories);
  const [newTop, setNewTop]       = useState("");
  const [newSub, setNewSub]       = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);

  async function addTop(e: React.FormEvent) {
    e.preventDefault();
    if (!newTop.trim()) return;
    setSaving(true);
    const res = await fetch("/api/inventory/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTop.trim() }),
    });
    if (res.ok) {
      const cat = await res.json();
      setCats((prev) => [...prev, { ...cat, children: [] }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTop("");
    }
    setSaving(false);
  }

  async function addSub(parentId: string) {
    const name = newSub[parentId]?.trim();
    if (!name) return;
    const res = await fetch("/api/inventory/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    if (res.ok) {
      const sub = await res.json();
      setCats((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? { ...c, children: [...c.children, sub].sort((a, b) => a.name.localeCompare(b.name)) }
            : c
        )
      );
      setNewSub((prev) => ({ ...prev, [parentId]: "" }));
    }
  }

  async function loadPresets() {
    if (!confirm("This will add the standard dental clinic categories. Existing categories won't be duplicated.")) return;
    setPresetBusy(true);
    for (const p of PRESETS) {
      // Create top-level
      let topId: string | null = null;
      const existing = cats.find((c) => c.name === p.name);
      if (existing) {
        topId = existing.id;
      } else {
        const res = await fetch("/api/inventory/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name }),
        });
        if (res.ok) {
          const cat = await res.json();
          topId = cat.id;
          setCats((prev) => [...prev, { ...cat, children: [] }].sort((a, b) => a.name.localeCompare(b.name)));
        }
      }
      if (!topId) continue;
      // Create subcategories
      for (const subName of p.subs) {
        const parent = cats.find((c) => c.id === topId) ?? null;
        const subExists = parent?.children.some((s) => s.name === subName);
        if (subExists) continue;
        const res = await fetch("/api/inventory/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: subName, parentId: topId }),
        });
        if (res.ok) {
          const sub = await res.json();
          setCats((prev) =>
            prev.map((c) =>
              c.id === topId
                ? { ...c, children: [...c.children, sub].sort((a, b) => a.name.localeCompare(b.name)) }
                : c
            )
          );
        }
      }
    }
    setPresetBusy(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Stock Categories</h1>
          <p className="text-sm text-slate-500 mt-0.5">{cats.length} top-level categories</p>
        </div>
        <button
          type="button"
          onClick={loadPresets}
          disabled={presetBusy}
          className="btn-ghost text-sm disabled:opacity-50"
        >
          {presetBusy ? "Loading…" : "Load Dental Presets"}
        </button>
      </div>

      {/* Add top-level category */}
      <form onSubmit={addTop} className="flex gap-3 mb-6">
        <input
          className="form-input flex-1"
          value={newTop}
          onChange={(e) => setNewTop(e.target.value)}
          placeholder="New top-level category name…"
        />
        <button type="submit" disabled={saving || !newTop.trim()} className="btn-primary disabled:opacity-50">
          Add Category
        </button>
      </form>

      {cats.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          No categories yet. Add one above or load the dental presets.
        </div>
      )}

      <div className="space-y-4">
        {cats.map((cat) => (
          <div key={cat.id} className="card overflow-hidden">
            {/* Category header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
              <p className="font-semibold text-slate-800">{cat.name}</p>
              <span className="text-xs text-slate-400">{cat.children.length} subcategories</span>
            </div>

            {/* Subcategories */}
            <div className="px-5 py-3">
              <div className="flex flex-wrap gap-2 mb-3">
                {cat.children.map((sub) => (
                  <span
                    key={sub.id}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                  >
                    {sub.name}
                  </span>
                ))}
                {cat.children.length === 0 && (
                  <span className="text-xs text-slate-400">No subcategories yet</span>
                )}
              </div>

              {/* Add subcategory inline */}
              <div className="flex gap-2 mt-2">
                <input
                  className="form-input text-sm py-1.5 flex-1 max-w-xs"
                  placeholder="Add subcategory…"
                  value={newSub[cat.id] ?? ""}
                  onChange={(e) => setNewSub((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(cat.id); } }}
                />
                <button
                  type="button"
                  onClick={() => addSub(cat.id)}
                  disabled={!newSub[cat.id]?.trim()}
                  className="btn-ghost text-xs py-1.5 disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
