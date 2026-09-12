export const STANDUP_QUESTIONS = [
  { key: "finished", text: "What did you finish?" },
  { key: "workingOn", text: "What are you working on?" },
  { key: "blocking", text: "What's blocking you?" },
] as const;

export type QuestionKey = (typeof STANDUP_QUESTIONS)[number]["key"];

export type CollectedMember = {
  userId: string;
  displayName: string;
  finished?: string;
  workingOn?: string;
  blocking?: string;
};

export type Session = {
  receiptChannelId: string;
  threadTs?: string;
  members: Map<string, CollectedMember>;
};

const sessions = new Map<string, Session>();
const sessionsByThread = new Map<string, Session>();

export function startSession(
  receiptChannelId: string,
  members: CollectedMember[],
): Session {
  const session: Session = {
    receiptChannelId,
    members: new Map(members.map((m) => [m.userId, { ...m }])),
  };
  for (const member of members) {
    sessions.set(member.userId, session);
  }
  return session;
}

export function attachThread(session: Session, threadTs: string) {
  session.threadTs = threadTs;
  sessionsByThread.set(`${session.receiptChannelId}:${threadTs}`, session);
}

export function sessionForUser(userId: string): Session | undefined {
  return sessions.get(userId);
}

export function sessionForThread(
  channelId: string,
  threadTs: string | undefined,
): Session | undefined {
  if (!threadTs) return undefined;
  return sessionsByThread.get(`${channelId}:${threadTs}`);
}

export function recordAnswer(userId: string, text: string): QuestionKey | null {
  const session = sessions.get(userId);
  const member = session?.members.get(userId);
  if (!member) return null;
  const next = STANDUP_QUESTIONS.find((q) => !member[q.key]);
  if (!next) return null;
  member[next.key] = text.trim();
  return next.key;
}

export function nextQuestion(userId: string): string | null {
  const member = sessions.get(userId)?.members.get(userId);
  if (!member) return null;
  const next = STANDUP_QUESTIONS.find((q) => !member[q.key]);
  return next?.text ?? null;
}

export function allComplete(session: Session): boolean {
  return [...session.members.values()].every(
    (m) => m.finished && m.workingOn && m.blocking,
  );
}

export function clearSession(session: Session) {
  for (const userId of session.members.keys()) {
    sessions.delete(userId);
  }
  if (session.threadTs) {
    sessionsByThread.delete(`${session.receiptChannelId}:${session.threadTs}`);
  }
}
