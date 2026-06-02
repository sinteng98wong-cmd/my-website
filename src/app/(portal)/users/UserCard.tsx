"use client";

import { useState } from "react";

const ALL_ROLES = [
  "SUPER_ADMIN",
  "FINANCE",
  "CLINIC_MANAGER",
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
  "STOREKEEPER",
] as const;

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN:    "Super Admin",
  FINANCE:        "Finance",
  CLINIC_MANAGER: "Clinic Manager",
  DOCTOR:         "Doctor",
  NURSE:          "Nurse",
  RECEPTIONIST:   "Receptionist",
  STOREKEEPER:    "Storekeeper",
};

const ROLE_CLASS: Record<string, string> = {
  SUPER_ADMIN:    "badge-red",
  FINANCE:        "badge-blue",
  CLINIC_MANAGER: "badge-amber",
  DOCTOR:         "badge-blue",
  NURSE:          "badge-green",
  RECEPTIONIST:   "badge-slate",
  STOREKEEPER:    "badge-slate",
};

type ClinicRow = {
  clinicId:     string;
  clinicName:   string;
  roleOverride: string | null;
};

type UserCardProps = {
  user: {
    id:          string;
    name:        string;
    email:       string;
    role:        string;
    active:      boolean;
    userClinics: ClinicRow[];
  };
  allClinics: { id: string; name: string }[];
};

export function UserCard({ user, allClinics }: UserCardProps) {
  // ── Clinic assignments state ──────────────────────────────────────────
  const [clinics, setClinics]         = useState<ClinicRow[]>(user.userClinics);
  const [addClinicId, setAddClinicId] = useState("");
  const [addRole, setAddRole]         = useState("__base__");
  const [adding, setAdding]           = useState(false);
  const [addOpen, setAddOpen]         = useState(false);
  const [busy, setBusy]               = useState<string | null>(null);

  // ── User profile state ────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    name:   user.name,
    email:  user.email,
    role:   user.role,
    active: user.active,
  });
  const [editOpen, setEditOpen]     = useState(false);
  const [editForm, setEditForm]     = useState({ ...profile, password: "", confirmPassword: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);
  const [deleted, setDeleted]       = useState(false);

  const unassigned = allClinics.filter(
    (c) => !clinics.some((uc) => uc.clinicId === c.id)
  );

  // ── Clinic assignment handlers ────────────────────────────────────────
  async function saveOverride(clinicId: string, value: string) {
    const roleOverride = value === "__base__" ? null : value;
    setBusy(clinicId);
    const res = await fetch(`/api/admin/users/${user.id}/clinic-role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId, roleOverride }),
    });
    if (res.ok) {
      setClinics((prev) =>
        prev.map((c) => c.clinicId === clinicId ? { ...c, roleOverride } : c)
      );
    }
    setBusy(null);
  }

  async function removeClinic(clinicId: string) {
    if (!confirm("Remove this branch assignment?")) return;
    setBusy(clinicId);
    const res = await fetch(`/api/admin/users/${user.id}/clinic-role`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId }),
    });
    if (res.ok) {
      setClinics((prev) => prev.filter((c) => c.clinicId !== clinicId));
    }
    setBusy(null);
  }

  async function addClinic() {
    if (!addClinicId) return;
    setAdding(true);
    const roleOverride = addRole === "__base__" ? null : addRole;
    const res = await fetch(`/api/admin/users/${user.id}/clinic-role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId: addClinicId, roleOverride }),
    });
    if (res.ok) {
      const clinic = allClinics.find((c) => c.id === addClinicId)!;
      setClinics((prev) =>
        [...prev, { clinicId: addClinicId, clinicName: clinic.name, roleOverride }]
          .sort((a, b) => a.clinicName.localeCompare(b.clinicName))
      );
      setAddClinicId("");
      setAddRole("__base__");
      setAddOpen(false);
    }
    setAdding(false);
  }

  // ── Edit user handlers ────────────────────────────────────────────────
  function openEdit() {
    setEditForm({ name: profile.name, email: profile.email, role: profile.role, active: profile.active, password: "", confirmPassword: "" });
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);

    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      setEditError("Passwords do not match");
      return;
    }
    if (editForm.password && editForm.password.length < 8) {
      setEditError("Password must be at least 8 characters");
      return;
    }

    setEditSaving(true);
    try {
      const body: Record<string, any> = {
        name:   editForm.name,
        email:  editForm.email,
        role:   editForm.role,
        active: editForm.active,
      };
      if (editForm.password) body.password = editForm.password;

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Failed to save changes");
        return;
      }
      setProfile({ name: data.name, email: data.email, role: data.role, active: data.active });
      setEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive() {
    const next = !profile.active;
    const label = next ? "activate" : "deactivate";
    if (!confirm(`Are you sure you want to ${label} this user?`)) return;

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (res.ok) {
      setProfile((p) => ({ ...p, active: next }));
    }
  }

  async function deleteUser() {
    if (!confirm("Delete this user? If they have clinical records they will be deactivated instead.")) return;

    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      if (data.deactivated) {
        setProfile((p) => ({ ...p, active: false }));
        alert("User has clinical records and was deactivated instead of deleted.");
      } else {
        setDeleted(true);
      }
    }
  }

  if (deleted) return null;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-semibold text-slate-900">{profile.name}</p>
            <span className={ROLE_CLASS[profile.role] ?? "badge-slate"}>
              {ROLE_LABEL[profile.role] ?? profile.role}
            </span>
            <span className={profile.active ? "badge-green" : "badge-red"}>
              {profile.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-sm text-slate-500">{profile.email}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/admin/module-config?tab=overrides"
            className="btn-ghost text-xs"
          >
            Module overrides →
          </a>
          <button
            type="button"
            onClick={openEdit}
            className="btn-ghost text-xs"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={toggleActive}
            className="btn-ghost text-xs"
          >
            {profile.active ? "Deactivate" : "Activate"}
          </button>
          <button
            type="button"
            onClick={deleteUser}
            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {editOpen && (
        <form
          onSubmit={saveEdit}
          className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
        >
          <p className="text-sm font-semibold text-slate-700">Edit User</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Full Name</label>
              <input
                className="form-input text-sm py-1.5"
                required
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
              <input
                className="form-input text-sm py-1.5"
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Base Role</label>
              <select
                className="form-input text-sm py-1.5"
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-700">Account active</span>
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                New Password <span className="text-slate-400">(leave blank to keep)</span>
              </label>
              <input
                className="form-input text-sm py-1.5"
                type="password"
                minLength={8}
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Confirm Password</label>
              <input
                className="form-input text-sm py-1.5"
                type="password"
                value={editForm.confirmPassword}
                onChange={(e) => setEditForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>
          </div>

          {editError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
              {editError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={editSaving}
              className="btn-primary text-sm py-1.5 disabled:opacity-50"
            >
              {editSaving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="btn-ghost text-sm py-1.5"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Branch assignments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Branch Assignments ({clinics.length})
          </p>
          {unassigned.length > 0 && (
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {addOpen ? "Cancel" : "+ Add Branch"}
            </button>
          )}
        </div>

        {/* Add branch panel */}
        {addOpen && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Branch</label>
              <select
                className="form-input text-sm py-1.5 w-48"
                value={addClinicId}
                onChange={(e) => setAddClinicId(e.target.value)}
              >
                <option value="">Select branch…</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Role at this branch
              </label>
              <select
                className="form-input text-sm py-1.5 w-44"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
              >
                <option value="__base__">
                  Same as base ({ROLE_LABEL[profile.role] ?? profile.role})
                </option>
                {ALL_ROLES.filter((r) => r !== "SUPER_ADMIN").map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={addClinic}
              disabled={!addClinicId || adding}
              className="btn-primary text-sm py-1.5 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        )}

        {/* Existing assignments */}
        {clinics.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">
            Not assigned to any branch.{" "}
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-blue-600 underline"
            >
              Add a branch
            </button>
          </p>
        ) : (
          <div className="space-y-2">
            {clinics.map((uc) => {
              const effective = uc.roleOverride ?? profile.role;
              const isBusy = busy === uc.clinicId;
              return (
                <div
                  key={uc.clinicId}
                  className="flex items-center gap-3 bg-slate-50 rounded-md px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{uc.clinicName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ROLE_LABEL[effective] ?? effective}
                      {uc.roleOverride && (
                        <span className="ml-1.5 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
                          overridden
                        </span>
                      )}
                    </p>
                  </div>

                  <select
                    className="form-input text-xs py-1 w-44"
                    value={uc.roleOverride ?? "__base__"}
                    disabled={isBusy}
                    onChange={(e) => saveOverride(uc.clinicId, e.target.value)}
                  >
                    <option value="__base__">
                      Base role ({ROLE_LABEL[profile.role] ?? profile.role})
                    </option>
                    {ALL_ROLES.filter((r) => r !== "SUPER_ADMIN").map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>

                  {isBusy ? (
                    <span className="text-xs text-slate-400 w-12 text-center">…</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeClinic(uc.clinicId)}
                      className="text-xs text-red-400 hover:text-red-600 w-12 text-center"
                      title="Remove from this branch"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
