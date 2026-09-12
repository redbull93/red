"use client";

import { useEffect, useState } from "react";
import type { User } from "@red/shared";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newPlatformId, setNewPlatformId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newPlatformId) return;
    setSaving(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          role: newRole,
          platformUserId: newPlatformId,
          email: newEmail,
        }),
      });

      if (res.ok) {
        setNewName("");
        setNewRole("");
        setNewPlatformId("");
        setNewEmail("");
        setShowAddModal(false);
        await loadUsers();
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.role && u.role.toLowerCase().includes(q)) ||
      u.platformUserId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Team Roster & Participants
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Engineers and teammates monitored by StandUp Agent across Slack and Discord
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search teammates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-md bg-ember px-3.5 py-1.5 font-mono text-xs font-semibold text-white shadow hover:bg-ember/90 transition"
          >
            + Add Teammate
          </button>
        </div>
      </div>

      {/* Add Teammate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d0d12] p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white mb-4">
              Add Teammate to Supabase
            </h3>
            <form onSubmit={handleAddUser} className="grid gap-3.5 font-mono text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 p-2 text-white focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Role</label>
                <input
                  type="text"
                  placeholder="e.g. Frontend Engineer"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 p-2 text-white focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Slack / Discord User ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. U_ALEX or 123456789"
                  value={newPlatformId}
                  onChange={(e) => setNewPlatformId(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 p-2 text-white focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="alex@team.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded border border-white/10 bg-white/5 p-2 text-white focus:outline-none focus:border-ember"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded px-3 py-1.5 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-ember px-4 py-1.5 font-bold text-white shadow hover:bg-ember/90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save to Supabase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center font-mono text-xs text-zinc-500">
            Querying teammate directory from Supabase...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No teammates found</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Add a teammate above or run <code className="text-ember font-mono">npm run seed</code> in your terminal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 font-display font-bold text-white text-base border border-white/10">
                  {u.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-white truncate">
                    {u.name}
                  </h3>
                  <p className="font-mono text-xs text-ember truncate">
                    {u.role || "Software Engineer"}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-zinc-500 truncate">
                    Platform ID: {u.platformUserId}
                  </p>
                  {u.email && (
                    <p className="font-mono text-[11px] text-zinc-400 truncate">
                      {u.email}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
