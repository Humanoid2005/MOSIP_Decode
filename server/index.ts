import { createApplication } from "./app.js";
import { settings } from "./config/environment.js";
const { server } = createApplication();
server.listen(settings.port, settings.host, () =>
  console.info(`Inji playground API: http://${settings.host}:${settings.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => server.close(() => process.exit(0)));
