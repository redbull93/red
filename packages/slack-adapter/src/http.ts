import { createServer } from "node:http";
import type { WebClient } from "@slack/web-api";
import { fixtureEvent, ingestEnvironmentEvent } from "@red/orchestrator";
import { beginStandup } from "./begin-standup.ts";

export function startControlServer(options: {
  client: WebClient;
  botUserId?: string;
  displayName: (userId: string) => Promise<string>;
  port: number;
}) {
  const secret = process.env.STANDUP_WEBHOOK_SECRET?.trim();
  const defaultChannel = process.env.SLACK_STANDUP_CHANNEL?.trim();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200).end("ok");
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/internal/standup/start") {
      res.writeHead(404).end("not found");
      return;
    }
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }

    const body = await readJson(req);
    const channelId = String(body.channelId ?? defaultChannel ?? "");
    if (!channelId) {
      res.writeHead(400).end("channelId or SLACK_STANDUP_CHANNEL required");
      return;
    }

    const demo = body.demo === true;
    try {
      if (demo) {
        await ingestEnvironmentEvent(
          fixtureEvent({
            channelId,
            environmentName: "Slack stand-up",
            environmentKind: "slack",
          }),
        );
      } else {
        await beginStandup({
          client: options.client,
          channelId,
          invokerUserId: String(body.invokerUserId ?? "USLACKBOT"),
          botUserId: options.botUserId,
          displayName: options.displayName,
        });
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({ ok: true, channelId, demo }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500).end(message);
    }
  });

  server.listen(options.port, "0.0.0.0");
  return server;
}

function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
