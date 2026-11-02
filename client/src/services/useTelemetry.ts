import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
// Listens on the /api/v1/events WebSocket and reports whether it is
// connected. Messages only say that a run changed; the hook invalidates that
// run and the run list so they are refetched over REST. Each connection
// invalidates all run data to catch up on missed updates, and a dropped
// socket reconnects after five seconds while polling carries on.
export function useTelemetry() {
  const query = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    function connect() {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/events`,
      );
      socket.onopen = () => {
        setConnected(true);
        void query.invalidateQueries({ queryKey: ["runs"] });
        void query.invalidateQueries({ queryKey: ["run"] });
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (
            message.type === "run.updated" &&
            typeof message.runId === "string"
          ) {
            void query.invalidateQueries({ queryKey: ["run", message.runId] });
            void query.invalidateQueries({ queryKey: ["runs"] });
          }
        } catch {
          /* Polling still refreshes data if a notification is malformed. */
        }
      };
      socket.onclose = () => {
        if (!stopped) {
          setConnected(false);
          timer = setTimeout(connect, 5000);
        }
      };
      socket.onerror = () => socket?.close();
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [query]);
  return connected;
}
