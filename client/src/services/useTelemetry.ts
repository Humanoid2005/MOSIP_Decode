import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
