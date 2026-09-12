"use client";

import { useEffect, useState } from "react";
import type { User } from "@red/shared";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Team Roster & Participants
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          Engineers and teammates monitored by StandUp
        </p>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-12 text-center font-mono text-xs text-zinc-500">
            Loading team roster...
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No teammates registered</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Run <code className="text-ember font-mono">npm run seed</code> to seed demo engineers (Eugene, Brian, Mary, Amina).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((u) => (
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
                    {u.role || "Engineer"}
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
