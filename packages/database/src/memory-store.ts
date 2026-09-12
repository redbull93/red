import type {
  AgentEventRecord,
  DependencyRecord,
  PendingActionRecord,
  Standup,
  StandupResponse,
  StandupSummaryRecord,
  User,
  Workspace,
} from "@red/shared";

interface MemoryStoreData {
  workspaces: Workspace[];
  users: User[];
  standups: Standup[];
  standupResponses: StandupResponse[];
  dependencies: DependencyRecord[];
  pendingActions: PendingActionRecord[];
  standupSummaries: StandupSummaryRecord[];
  agentEvents: AgentEventRecord[];
}

const memoryStore: MemoryStoreData = {
  workspaces: [],
  users: [],
  standups: [],
  standupResponses: [],
  dependencies: [],
  pendingActions: [],
  standupSummaries: [],
  agentEvents: [],
};

export function getMemoryStore(): MemoryStoreData {
  return memoryStore;
}

export function resetMemoryStore(): void {
  memoryStore.workspaces = [];
  memoryStore.users = [];
  memoryStore.standups = [];
  memoryStore.standupResponses = [];
  memoryStore.dependencies = [];
  memoryStore.pendingActions = [];
  memoryStore.standupSummaries = [];
  memoryStore.agentEvents = [];
}
