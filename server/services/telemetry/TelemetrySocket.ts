import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { TelemetryService } from "./TelemetryService.js";
export class TelemetrySocket {
  attach(
    server: Server,
    telemetry: TelemetryService,
    allowedOrigins: string[],
  ): void {
    const socket = new WebSocketServer({ noServer: true, maxPayload: 1024 });
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
        client.on("error", () => client.terminate());
        client.send(JSON.stringify({ type: "connected" }));
      });
    });
    const send = (runId: string) => {
      for (const client of socket.clients)
        if (client.readyState === WebSocket.OPEN) {
          if (client.bufferedAmount > 65536) client.terminate();
          else client.send(JSON.stringify({ type: "run.updated", runId }));
        }
    };
    telemetry.changes.on("change", send);
    server.on("close", () => {
      telemetry.changes.off("change", send);
      for (const client of socket.clients) client.terminate();
      socket.close();
    });
  }
}
