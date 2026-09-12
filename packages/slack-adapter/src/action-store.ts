import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type StoredAction = {
  userId: string;
  task: string;
  kind: "incomplete" | "check-in" | "blocker";
  openedAt: string;
};

type Store = Record<string, StoredAction[]>;

function storePath() {
  return (
    process.env.STANDUP_ACTIONS_PATH?.trim() ||
    join(process.cwd(), "../../.data/standup-actions.json")
  );
}

function readStore(): Store {
  try {
    return JSON.parse(readFileSync(storePath(), "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function loadOpenActions(channelId: string): StoredAction[] {
  return readStore()[channelId] ?? [];
}

export function saveOpenActions(channelId: string, items: StoredAction[]) {
  const store = readStore();
  store[channelId] = items;
  writeStore(store);
}

export function looksDone(text: string): boolean {
  return /\b(done|finished|shipped|pushed|merged|completed|closed|resolved)\b/i.test(
    text,
  );
}

export function mergeActions(
  channelId: string,
  next: Omit<StoredAction, "openedAt">[],
  closers: Map<string, string>,
): StoredAction[] {
  const prior = loadOpenActions(channelId);
  const kept: StoredAction[] = [];

  for (const item of prior) {
    const later = closers.get(item.userId);
    if (later && looksDone(later)) continue;
    const still = next.find(
      (n) => n.userId === item.userId && similar(n.task, item.task),
    );
    if (still) kept.push(item);
    else if (!later) kept.push(item);
  }

  for (const item of next) {
    if (kept.some((k) => k.userId === item.userId && similar(k.task, item.task))) {
      continue;
    }
    const later = closers.get(item.userId);
    if (later && looksDone(later) && item.kind !== "blocker") continue;
    kept.push({ ...item, openedAt: new Date().toISOString() });
  }

  saveOpenActions(channelId, kept);
  return kept;
}

function similar(a: string, b: string): boolean {
  const na = a.toLowerCase().slice(0, 40);
  const nb = b.toLowerCase().slice(0, 40);
  return na.includes(nb.slice(0, 16)) || nb.includes(na.slice(0, 16));
}
