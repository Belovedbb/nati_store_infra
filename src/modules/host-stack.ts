import type { EnvironmentConfig } from "../config/types.js"
import { base64, fingerprint, remote } from "../host.js"

export interface HostStack {
  name: "postgres" | "app"
  files: Record<string, string>
  containers: string[]
  beforeUp?: string
}

export async function runHostStack(
  action: "diff" | "deploy",
  config: EnvironmentConfig,
  ip: string,
  stack: HostStack,
): Promise<void> {
  const root = `/opt/nati-store/${stack.name}`
  const contentHash = fingerprint(...Object.entries(stack.files).flat())
  const inspection = await remote(config, ip, `set -e
cat ${root}/.sha256 2>/dev/null || true
for name in ${stack.containers.join(" ")}; do
  docker inspect --format "{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} memory={{.HostConfig.Memory}}" "$name" 2>/dev/null || echo "$name missing"
done
docker stats --no-stream --format '{{.Name}} memory={{.MemUsage}}' ${stack.containers.join(" ")} 2>/dev/null || true
`)
  const lines = inspection.split("\n")
  const currentHash = lines.find((line) => /^[a-f0-9]{64}$/.test(line))
  const healthy = stack.containers.every((name) => inspection.includes(`/${name} status=running health=healthy`))
  const unchanged = currentHash === contentHash && healthy
  console.log(`${stack.name}: ${unchanged ? "No changes" : currentHash ? "Update or repair" : "Create"}`)
  console.log(lines.filter((line) => line !== currentHash).join("\n"))
  if (action === "diff" || unchanged) return

  const writes = Object.entries(stack.files).map(([filename, content]) => {
    if (!/^[A-Za-z][A-Za-z0-9.-]*$/.test(filename)) throw new Error(`Invalid deployment filename: ${filename}`)
    return `printf '%s' '${base64(content)}' | base64 -d > ${root}/${filename}\nchmod 0600 ${root}/${filename}\n`
  }).join("")
  const script = `set -euo pipefail
docker network inspect nati-net >/dev/null
install -d -m 0700 ${root}
${writes}cd ${root}
docker compose -p nati-${stack.name} -f compose.yaml config -q
${stack.beforeUp ?? ""}
docker compose -p nati-${stack.name} -f compose.yaml up -d --wait
printf '%s\\n' '${contentHash}' > ${root}/.sha256
docker compose -p nati-${stack.name} -f compose.yaml ps
`
  console.log(await remote(config, ip, script))
}
