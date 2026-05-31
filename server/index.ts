import { buildServer } from "./app.js";

const port = Number(process.env.NETDRAW_API_PORT ?? "3001");
const host = process.env.NETDRAW_API_HOST ?? "127.0.0.1";

const app = await buildServer();
await app.listen({ host, port });
console.log(`NetDraw backend listening on http://${host}:${port}`);
