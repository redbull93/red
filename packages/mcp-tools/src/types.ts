export type ToolResult = {
  ok: boolean;
  tool: string;
  data: Record<string, unknown>;
  error?: string;
  receiptId?: string;
};

export type PlaceSnapshot = {
  environmentName: string;
  environmentKind: string;
  channelId: string;
  threadId?: string;
  recent: string[];
  placeOnlyContext: string;
};

export type ToolContext = {
  readPlace: (channelId: string) => PlaceSnapshot | null;
  writeReceipt: (input: {
    channelId: string;
    body: string;
    receiptId?: string;
  }) => { receiptId: string; landedAt: string };
  now: () => Date;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
};
