import type { ToolSpec } from "../types";

export const searchWeb: ToolSpec = {
  name: "search.web",
  description:
    "Search the live web (Exa when EXA_API_KEY is set). Use only when the place does not already contain the fact.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      numResults: { type: "number" },
    },
    required: ["query"],
  },
  async handler(args) {
    const query = String(args.query ?? "").trim();
    const numResults = Number(args.numResults ?? 3);
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

    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({
        query,
        numResults: Math.min(Math.max(numResults, 1), 5),
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
      results?: Array<{ title?: string; url?: string; text?: string }>;
    };
    const results = (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.text ?? "").slice(0, 280),
    }));

    return { ok: true, tool: "search.web", data: { query, results } };
  },
};
