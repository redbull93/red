import assert from "node:assert/strict";
import { test } from "node:test";
import {
  highlightsToSnippet,
  mapExaResults,
  searchWeb,
} from "./exa-search.ts";

const ctx = {
  now: () => new Date(),
  readPlace: () => null,
  writeReceipt: () => ({ receiptId: "r1", landedAt: new Date().toISOString() }),
};

test("highlightsToSnippet joins highlight strings", () => {
  assert.equal(
    highlightsToSnippet(["PR #42 adds /users", "docs are in the repo"]),
    "PR #42 adds /users docs are in the repo",
  );
});

test("mapExaResults prefers highlights over raw text", () => {
  const mapped = mapExaResults([
    {
      title: "API docs",
      url: "https://example.com/docs",
      highlights: ["send the OpenAPI file to Eugene"],
      text: "this long page body should not be used",
    },
  ]);
  assert.equal(mapped[0]?.snippet, "send the OpenAPI file to Eugene");
  assert.equal(mapped[0]?.url, "https://example.com/docs");
});

test("search.web stubs when EXA_API_KEY is missing", async () => {
  const prev = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  try {
    const result = await searchWeb.handler({ query: "Brian API docs" }, ctx);
    assert.equal(result.ok, true);
    assert.equal(result.data.stub, true);
  } finally {
    if (prev !== undefined) process.env.EXA_API_KEY = prev;
  }
});

test("search.web rejects an empty query", async () => {
  const result = await searchWeb.handler({ query: "  " }, ctx);
  assert.equal(result.ok, false);
});
