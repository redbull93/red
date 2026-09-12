import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Installation, InstallationQuery } from "@slack/bolt";

const path = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.data/slack-installs.json",
);

type Store = Record<string, Installation<"v2">>;

function load(): Store {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2));
}

function key(query: InstallationQuery<boolean>): string {
  return `${query.enterpriseId ?? "none"}:${query.teamId ?? "none"}`;
}

export function seedDefaultInstall() {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const teamId = process.env.SLACK_TEAM_ID?.trim();
  if (!token) return;
  const store = load();
  const id = `none:${teamId ?? "default"}`;
  if (store[id]) return;
  store[id] = {
    team: { id: teamId ?? "default", name: "default" },
    enterprise: undefined,
    user: { token: undefined, scopes: [], id: "unknown" },
    bot: {
      token,
      scopes: [
        "chat:write",
        "commands",
        "channels:history",
        "channels:read",
        "groups:history",
        "groups:read",
        "users:read",
      ],
      id: "standup",
      userId: "standup",
    },
    tokenType: "bot",
    isEnterpriseInstall: false,
    authVersion: "v2",
  };
  save(store);
}

export const fileInstallStore = {
  async storeInstallation(installation: Installation) {
    const store = load();
    const teamId = installation.team?.id ?? "default";
    store[`none:${teamId}`] = installation as Installation<"v2">;
    save(store);
  },
  async fetchInstallation(query: InstallationQuery<boolean>) {
    const store = load();
    return (
      store[key(query)] ??
      store["none:default"] ??
      Object.values(store)[0]
    );
  },
  async deleteInstallation(query: InstallationQuery<boolean>) {
    const store = load();
    delete store[key(query)];
    save(store);
  },
};
