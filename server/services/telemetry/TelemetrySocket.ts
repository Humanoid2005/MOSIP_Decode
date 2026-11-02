import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { TelemetryService } from "./TelemetryService.js";
// Live-update channel at /api/v1/events. Messages only name the run that
// changed ("run.updated"); the browser then refetches it over the REST API, so
// no protocol data is sent on the socket. Connections from origins outside the
// API's allowlist are refused.
export class TelemetrySocket {
  // Attaches the endpoint to the HTTP server and returns a function that
  // closes it and every client. Clients never need to send data, so inbound
  // messages are capped at 1 KB.
  attach(
    server: Server,
    telemetry: TelemetryService,
    allowedOrigins: string[],
  ): () => void {
    const socket = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    const alive = new WeakSet<WebSocket>();
    server.on("upgrade", (request, connection, head) => {
      if (
        request.url !== "/api/v1/events" ||
        !request.headers.origin ||
        !allowedOrigins.includes(request.headers.origin)
      ) {
        connection.destroy();
        return;
      }
      socket.handleUpgrade(request, connection, head, (client) => {
        alive.add(client);
        client.on("pong", () => alive.add(client));
        client.on("error", () => client.terminate());
        client.send(JSON.stringify({ type: "connected" }));
      });
    });
    // Pings keep idle proxies from closing the socket and reveal dead peers.
    const heartbeat = setInterval(() => {
      for (const client of socket.clients) {
        if (!alive.has(client)) {
          client.terminate();
          continue;
        }
        alive.delete(client);
        client.ping();
      }
    }, 30000);
    heartbeat.unref();
    // A client more than 64 KB behind is dropped instead of buffered without
    // limit; the workbench reconnects and refetches.
    const send = (runId: string) => {
      for (const client of socket.clients)
        if (client.readyState === WebSocket.OPEN) {
          if (client.bufferedAmount > 65536) client.terminate();
          else client.send(JSON.stringify({ type: "run.updated", runId }));
        }
    };
    telemetry.changes.on("change", send);
    const close = () => {
      clearInterval(heartbeat);
      telemetry.changes.off("change", send);
      for (const client of socket.clients) client.terminate();
      socket.close();
    };
    server.once("close", close);
    return close;
  }
}
