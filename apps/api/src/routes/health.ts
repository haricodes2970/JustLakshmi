import type { FastifyInstance } from "fastify";
import { HealthResponseSchema, type HealthResponse } from "@justlakshmi/shared";

const API_SERVICE_NAME = "justlakshmi-api";
const API_PACKAGE_VERSION = "0.1.0";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    const payload: HealthResponse = {
      status: "ok",
      service: API_SERVICE_NAME,
      version: API_PACKAGE_VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
    return HealthResponseSchema.parse(payload);
  });
}
