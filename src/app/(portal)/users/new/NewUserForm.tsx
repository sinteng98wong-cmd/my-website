"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ALL_ROLES = [
  { value: "SUPER_ADMIN",    label: "Super Admin" },
  { value: "FINANCE",        label: "Finance" },
  { value: "CLINIC_MANAGER", label: "Clinic Manager" },
  { value: "DOCTOR",         label: "Doctor" },
  { value: "NURSE",          label: "Nurse" },
  { value: "RECEPTIONIST",   label: "Receptionist" },
  { value: "STOREKEEPER",    label: "Storekeeper" },
];

export function NewUserForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "", role: "RECEPTIONIST",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     form.name,
          email:    form.email,
          password: form.password,
          role:     form.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create user");
        return;
      }
      router.push("/users");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-5">
      <div>
        <label className="form-label">Full Name</label>
        <input
          className="form-input"
          type="text"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Dr. Sarah Lim"
        />
      </div>

      <div>
        <label className="form-label">Email Address</label>
        <input
          className="form-input"
          type="email"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="sarah@clinic.com"
        />
      </div>

      <div>
        <label className="form-label">Role</label>
        <select
          className="form-input"
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
        >
          {ALL_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          Per-branch role overrides can be configured after creation.
        </p>
      </div>

      <div>
        <label className="form-label">Password</label>
        <input
          className="form-input"
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder="Minimum 8 characters"
        />
      </div>

      <div>
        <label className="form-label">Confirm Password</label>
        <input
          className="form-input"
          type="password"
          required
          value={form.confirmPassword}
          onChange={(e) => set("confirmPassword", e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create User"}
        </button>
        <a href="/users" className="btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  );
}
