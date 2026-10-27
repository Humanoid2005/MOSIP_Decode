import { createApplication } from "./app.js";
import { settings } from "./config/environment.js";
const { server, shutdown } = createApplication();
server.on("error", (error) => {
  console.error(`Inji playground API failed to start: ${error.message}`);
  process.exit(1);
});
server.listen(settings.port, settings.host, () =>
  console.info(`Inji playground API: http://${settings.host}:${settings.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close(() => process.exit(0));
    shutdown();
    setTimeout(() => process.exit(1), 5000).unref();
  });
