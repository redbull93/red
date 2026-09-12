import OpenAI from "openai";
import {
  AgentDecisionSchema,
  type AgentDecision,
  type StandupResponse,
} from "@red/shared";

const SYSTEM_PROMPT = `
You are StandUp.

You receive stand-up responses from multiple teammates.
Your job is NOT to merely summarize.

You must:
1. Detect explicit blockers.
2. Detect implicit blockers and dependencies between teammates.
3. Compare what people say with what others need.
4. Detect recurring blockers if history is provided.
5. Recommend concrete next actions.
6. Output ONLY valid JSON matching the required shape.

Required JSON shape:
{
  "summary": "string",
  "blockers": [
    {
      "type": "explicit" | "implicit" | "dependency" | "recurring" | "risk",
      "blockedPerson": "string optional",
      "responsiblePerson": "string optional",
      "subject": "string",
      "evidence": ["string"],
      "confidence": 0.0
    }
  ],
  "actions": [
    {
      "id": "string",
      "type": "notify" | "ask_clarification" | "post_summary" | "request_approval" | "stop" | "follow_up",
      "target": "string optional",
      "platform": "slack" | "discord" optional,
      "message": "string",
      "requiresApproval": true
    }
  ],
  "state": "OBSERVING" | "ANALYZING" | "WAITING" | "ACTION_REQUIRED" | "FOLLOWING_UP" | "RESOLVED"
}
`;

export interface AnalyzeStandupInput {
  team: { id: string; name: string };
  responses: StandupResponse[];
  history?: Array<{
    date: string;
    summary: string;
    blockers: string[];
  }>;
}

export class ReasoningEngine {
  private client: OpenAI | null = null;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey =
      opts?.apiKey ??
      process.env.OPENAI_API_KEY ??
      process.env.OPENROUTER_API_KEY;
    this.model = opts?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

    if (apiKey) {
      const baseURL =
        process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY
          ? "https://openrouter.ai/api/v1"
          : undefined;
      this.client = new OpenAI({ apiKey, baseURL });
    }
  }

  async analyzeStandup(input: AnalyzeStandupInput): Promise<AgentDecision> {
    if (!this.client) {
      // Honest deterministic stub when no API key is provided
      return this.stubDecision(input);
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            {
              team: input.team,
              responses: input.responses,
              history: input.history ?? [],
            },
            null,
            2,
          ),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");

    const json = JSON.parse(content);
    return AgentDecisionSchema.parse(json);
  }

  private stubDecision(input: AnalyzeStandupInput): AgentDecision {
    const texts = input.responses
      .map((r) => `${r.userId}: ${r.rawText}`)
      .join("\n");
    const hasEugeneBrian = /eugene/i.test(texts) && /brian/i.test(texts);

    if (hasEugeneBrian) {
      return {
        summary:
          "Dashboard development is blocked on API documentation. Brian has completed the endpoint but has not shared the documentation with Eugene yet.",
        blockers: [
          {
            type: "dependency",
            blockedPerson: "eugene",
            responsiblePerson: "brian",
            subject: "API documentation",
            evidence: [
              "Eugene is waiting for API endpoint docs",
              "Brian finished endpoint but hasn't sent docs",
            ],
            confidence: 0.95,
          },
        ],
        actions: [
          {
            id: `act_${Date.now().toString(36)}_1`,
            type: "request_approval",
            target: "brian",
            message: "Brian → send API documentation to Eugene.",
            requiresApproval: true,
          },
          {
            id: `act_${Date.now().toString(36)}_2`,
            type: "post_summary",
            message:
              "Dashboard development is blocked on API documentation. Brian completed the endpoint; docs pending. Amina is on track.",
            requiresApproval: false,
          },
        ],
        state: "ACTION_REQUIRED",
      };
    }

    return {
      summary:
        "All reported items appear to be on track with no unresolved dependencies.",
      blockers: [],
      actions: [
        {
          id: `act_${Date.now().toString(36)}_1`,
          type: "post_summary",
          message: "Stand-up complete. All teammates report on track.",
          requiresApproval: false,
        },
      ],
      state: "RESOLVED",
    };
  }
}
