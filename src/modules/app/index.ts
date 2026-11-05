import type { EnvironmentConfig } from "../../config/types.js"
import { remote } from "../../host.js"
import type { AppSecrets } from "../../secrets.js"
import { runHostStack } from "../host-stack.js"

export async function runApp(
  action: "diff" | "deploy",
  config: EnvironmentConfig,
  ip: string,
  secrets: AppSecrets,
): Promise<void> {
  const { backendImage, storefrontImage, proxyImage, storeDomain, apiDomain,
    backendMemory, storefrontMemory, proxyMemory } = config.containers
  if (!backendImage || !storefrontImage) {
    throw new Error("Set containers.backendImage and containers.storefrontImage in the environment configuration")
  }
  if (!validDomain(storeDomain) || !validDomain(apiDomain)) {
    throw new Error("Set real storeDomain and apiDomain values in the environment configuration")
  }
  const password = secrets.postgresPassword
  const jwt = secrets.jwtSecret
  const cookie = secrets.cookieSecret
  const publishableKey = secrets.medusaPublishableKey
  const databaseUrl = `postgres://nati_store:${encodeURIComponent(password)}@postgres:5432/nati_store`
  const backendEnv = [
    "NODE_ENV=production",
    `DATABASE_URL=${databaseUrl}`,
    "DATABASE_SSL=false",
    `STORE_CORS=https://${storeDomain}`,
    `ADMIN_CORS=https://${apiDomain}`,
    `AUTH_CORS=https://${storeDomain},https://${apiDomain}`,
    `JWT_SECRET=${jwt}`,
    `COOKIE_SECRET=${cookie}`,
  ].join("\n") + "\n"
  const storefrontEnv = [
    "NODE_ENV=production",
    "PORT=8000",
    "HOSTNAME=0.0.0.0",
    "MEDUSA_BACKEND_URL=http://backend:9000",
    `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://${apiDomain}`,
    `NEXT_PUBLIC_BASE_URL=https://${storeDomain}`,
    `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${publishableKey}`,
  ].join("\n") + "\n"
  const compose = `services:
  backend:
    image: ${JSON.stringify(backendImage)}
    container_name: nati-backend
    restart: unless-stopped
    mem_limit: ${JSON.stringify(backendMemory)}
    cpus: 1.0
    env_file:
      - path: ./backend.env
        format: raw
    networks: [nati]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 6
      start_period: 90s
    logging:
      options: { max-size: "10m", max-file: "3" }
  storefront:
    image: ${JSON.stringify(storefrontImage)}
    container_name: nati-storefront
    restart: unless-stopped
    mem_limit: ${JSON.stringify(storefrontMemory)}
    cpus: 0.75
    env_file:
      - path: ./storefront.env
        format: raw
    depends_on:
      backend: { condition: service_healthy }
    networks: [nati]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 6
      start_period: 60s
    logging:
      options: { max-size: "10m", max-file: "3" }
  proxy:
    image: ${JSON.stringify(proxyImage)}
    container_name: nati-proxy
    restart: unless-stopped
    mem_limit: ${JSON.stringify(proxyMemory)}
    cpus: 0.25
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      backend: { condition: service_healthy }
      storefront: { condition: service_healthy }
    networks: [nati]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:2019/config/ >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
    logging:
      options: { max-size: "10m", max-file: "3" }
  migrate:
    image: ${JSON.stringify(backendImage)}
    profiles: [migrate]
    mem_limit: ${JSON.stringify(backendMemory)}
    env_file:
      - path: ./backend.env
        format: raw
    entrypoint: ["/bin/sh", "-lc"]
    command: "cd /server/apps/backend && pnpm medusa db:migrate"
    networks: [nati]
volumes:
  caddy_data:
  caddy_config:
networks:
  nati:
    external: true
    name: nati-net
`
  const caddyfile = `${storeDomain} {\n  reverse_proxy storefront:8000\n}\n\n${apiDomain} {\n  reverse_proxy backend:9000\n}\n`
  if (action === "deploy") {
    const dbHealth = await remote(config, ip,
      "docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' nati-postgres 2>/dev/null || true\n")
    if (dbHealth.trim() !== "healthy") throw new Error("PostgreSQL must be healthy before deploying the app")
  }
  await runHostStack(action, config, ip, {
    name: "app",
    files: { "compose.yaml": compose, "backend.env": backendEnv,
      "storefront.env": storefrontEnv, Caddyfile: caddyfile },
    containers: ["nati-backend", "nati-storefront", "nati-proxy"],
    beforeUp: `docker compose -p nati-app -f compose.yaml stop proxy storefront backend >/dev/null 2>&1 || true
docker compose -p nati-app -f compose.yaml --profile migrate run --rm migrate`,
  })
}

function validDomain(value: string): boolean {
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value) && !value.endsWith("example.com")
}
