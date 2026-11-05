import type { EnvironmentConfig } from "../../config/types.js"
import type { DatabaseSecrets } from "../../secrets.js"
import { runHostStack } from "../host-stack.js"

export async function runPostgres(
  action: "diff" | "deploy",
  config: EnvironmentConfig,
  ip: string,
  secrets: DatabaseSecrets,
): Promise<void> {
  const password = secrets.postgresPassword
  const compose = `services:
  postgres:
    image: ${JSON.stringify(config.containers.postgresImage)}
    container_name: nati-postgres
    restart: unless-stopped
    mem_limit: ${JSON.stringify(config.containers.postgresMemory)}
    cpus: 0.5
    shm_size: 64m
    stop_grace_period: 60s
    env_file:
      - path: ./postgres.env
        format: raw
    volumes:
      - data:/var/lib/postgresql/data
    networks:
      nati:
        aliases: [postgres]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nati_store -d nati_store"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 30s
    logging:
      options:
        max-size: "10m"
        max-file: "3"
volumes:
  data:
    name: nati-postgres-data
networks:
  nati:
    external: true
    name: nati-net
`
  const env = `POSTGRES_DB=nati_store\nPOSTGRES_USER=nati_store\nPOSTGRES_PASSWORD=${password}\n`
  await runHostStack(action, config, ip, {
    name: "postgres",
    files: { "compose.yaml": compose, "postgres.env": env },
    containers: ["nati-postgres"],
  })
}
