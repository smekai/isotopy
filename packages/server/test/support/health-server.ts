import { createServer } from "node:http";
import type { Server } from "node:http";

export interface HealthServer {
  url: string;
  close(): Promise<void>;
}

export async function startHealthServer(status: number): Promise<HealthServer> {
  const server = createServer((_request, response) => {
    response.statusCode = status;
    response.end("");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: addressOf(server), close: () => closeServer(server) };
}

function addressOf(server: Server): string {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return `http://127.0.0.1:${port}/`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
