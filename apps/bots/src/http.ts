import http from "node:http";
import type { AgentPlatformPort } from "@red/agent";
import { handleActionDecision, startStandup } from "@red/agent";
import {
  getAction,
  getWorkspace,
  isSupabaseConfigured,
  listWorkspaces,
} from "@red/database";
import type { Platform } from "@red/shared";

export function createHttpServer(
  portDeps: AgentPlatformPort,
  port = 3001,
): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          name: "StandUp Bot & Orchestration Service",
          uptime: process.uptime(),
          supabaseConfigured: isSupabaseConfigured(),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/trigger-standup") {
      try {
        const body = await parseJsonBody<{
          workspaceId?: string;
          platform?: Platform;
        }>(req);

        let targetWorkspace = body.workspaceId
          ? await getWorkspace(body.workspaceId)
          : null;

        if (!targetWorkspace) {
          const all = await listWorkspaces();
          targetWorkspace = all[0] ?? null;
        }

        if (!targetWorkspace) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "No workspace found to trigger standup. Please seed or configure a workspace first.",
            }),
          );
          return;
        }

        const standup = await startStandup({
          workspaceId: targetWorkspace.id,
          platform: targetWorkspace.platform,
          port: portDeps,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, standup }));
      } catch (err) {
        console.error("Error in /trigger-standup:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/execute-action") {
      try {
        const body = await parseJsonBody<{
          actionId: string;
          decision: "approved" | "rejected";
          approverUserId?: string;
        }>(req);

        if (!body.actionId || !body.decision) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing actionId or decision" }));
          return;
        }

        const result = await handleActionDecision(
          body.actionId,
          body.decision,
          body.approverUserId || "admin",
          portDeps,
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("Error in /execute-action:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    console.log(`🌐 StandUp Webhook & Control API running on http://localhost:${port}`);
  });

  return server;
}

function parseJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
