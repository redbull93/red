import type { ToolSpec } from "../types";

/** Slack/Discord receipts stay short — intentional product cap, not a tool arg. */
const CHANNEL_RESULT_CAP = 3;

export type ExaHit = {
  title?: string;
  url?: string;
  highlights?: string[];
  text?: string;
};

export function highlightsToSnippet(highlights: unknown): string {
  if (!Array.isArray(highlights)) return "";
  return highlights
    .filter((h): h is string => typeof h === "string")
    .join(" ")
    .trim();
}

export function mapExaResults(results: ExaHit[]) {
  return results.map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: highlightsToSnippet(r.highlights),
  }));
}

/**
 * Live web search for StandUp blocker enrichment.
 * Canonical Exa request: /search + type auto + highlights only.
 * The app already has an LLM — do not use /answer.
 */
export const searchWeb: ToolSpec = {
  name: "search.web",
  description:
    "Search the live web (Exa) and return relevant URLs plus short highlights. Use to enrich a real stand-up blocker with a PR, docs, or prior fix. Write a natural-language query (subject + constraint). Do not search if the Slack/Discord thread already has the fact.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
  async handler(args) {
    const query = String(args.query ?? "").trim();
    if (!query) {
      return {
        ok: false,
        tool: "search.web",
        data: {},
        error: "query is required",
      };
    }

    const key = process.env.EXA_API_KEY;
    if (!key) {
      return {
        ok: true,
        tool: "search.web",
        data: {
          stub: true,
          query,
          results: [
            {
              title: "Stub result — set EXA_API_KEY for live search",
              url: "https://exa.ai",
              snippet:
                "Honest stub. The tool ran. The web was not contacted.",
            },
          ],
        },
      };
    }

    try {
      let results: Array<{ title: string; url: string; snippet: string }> = [];

      try {
        const { default: Exa } = (await import("exa-js")) as unknown as {
          default: new (k: string) => {
            search: (
              q: string,
              opts: unknown,
            ) => Promise<{ results?: ExaHit[] }>;
          };
        };
        const exa = new Exa(key);
        const result = await exa.search(query, {
          type: "auto",
          contents: { highlights: true },
          numResults: CHANNEL_RESULT_CAP,
        });
        results = mapExaResults((result.results ?? []) as ExaHit[]);
      } catch {
        // Fallback to native HTTP fetch if exa-js package is not installed
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
          },
          body: JSON.stringify({
            query,
            numResults: CHANNEL_RESULT_CAP,
            contents: { text: true },
          }),
        });

        if (!response.ok) {
          const detail = await response.text();
          return {
            ok: false,
            tool: "search.web",
            data: { query, status: response.status },
            error: detail.slice(0, 400),
          };
        }

        const json = (await response.json()) as {
          results?: Array<{ title?: string; url?: string; text?: string; highlights?: string[] }>;
        };
        results = (json.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: highlightsToSnippet(r.highlights) || (r.text ?? "").slice(0, 280),
        }));
      }

      return { ok: true, tool: "search.web", data: { query, results } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        tool: "search.web",
        data: { query },
        error: message.slice(0, 400),
      };
    }
  },
};
