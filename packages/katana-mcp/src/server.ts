import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomUUID } from "crypto";
import { registerWalletTools } from "./tools/wallet/index.js";
import { registerSushiTools } from "./tools/sushi/index.js";
import { registerMorphoTools } from "./tools/morpho/index.js";
import { registerAnalyticsTools } from "./tools/analytics/index.js";
import { registerMerklTools } from "./tools/merkl/index.js";
import { registerPerpsTools } from "./tools/perps/index.js";
import { registerKatTools } from "./tools/kat/index.js";

function createMcpServer() {
  const server = new McpServer({
    name: "katana-mcp",
    version: "0.1.0",
  });

  registerWalletTools(server);
  registerSushiTools(server);
  registerMorphoTools(server);
  registerAnalyticsTools(server);
  registerMerklTools(server);
  registerPerpsTools(server);
  registerKatTools(server);

  return server;
}

// ─── Transport selection ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useHTTP = args.includes("--http");

if (useHTTP) {
  // Streamable HTTP transport for external/remote users (multi-session)
  const PORT = parseInt(process.env.PORT || "3001", 10);
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "katana-mcp", sessions: sessions.size }));
      return;
    }

    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // ── Session termination ──────────────────────────────────────────
    if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.close();
        sessions.delete(sessionId);
        res.writeHead(200);
        res.end();
      } else {
        res.writeHead(404);
        res.end("Session not found");
      }
      return;
    }

    // ── Existing session: route to its transport ─────────────────────
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }

    // ── New session: initialization request (POST without session ID) ─
    if (req.method === "POST" && !sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { server: mcpServer, transport });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // Unknown session ID or bad request
    res.writeHead(400);
    res.end("Bad request — missing or invalid session");
  });

  httpServer.listen(PORT, () => {
    console.error(`Katana MCP server (Streamable HTTP) running on http://localhost:${PORT}`);
    console.error(`  MCP endpoint: http://localhost:${PORT}/mcp`);
    console.error(`  Health check: http://localhost:${PORT}/health`);
  });
} else {
  // Default: stdio transport for local Claude Code / CLI usage
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Katana MCP server running on stdio");
}
