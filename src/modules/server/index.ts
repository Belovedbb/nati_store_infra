import type { EnvironmentConfig } from "../../config/types.js"
import { fingerprint, remote } from "../../host.js"

const installScript = `set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  cat > /etc/apt/sources.list.d/docker.sources <<DOCKER_REPO
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
DOCKER_REPO
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker network inspect nati-net >/dev/null 2>&1 || docker network create nati-net
install -d -m 0700 /opt/nati-store
`

export async function runServer(action: "diff" | "deploy", config: EnvironmentConfig, ip: string): Promise<void> {
  const desired = fingerprint(installScript)
  const current = await remote(config, ip, `set -e
cat /opt/nati-store/server.sha256 2>/dev/null || true
docker --version 2>/dev/null || true
docker compose version 2>/dev/null || true
docker network inspect nati-net >/dev/null 2>&1 && echo network:present || echo network:missing
`)
  const installed = current.includes(desired) && current.includes("Docker version") && current.includes("network:present")
  console.log(`server: ${installed ? "No changes" : "Install/configure Docker and shared network"}`)
  if (current) console.log(current.split("\n").filter((line) => !line.match(/^[a-f0-9]{64}$/)).join("\n"))
  if (action === "diff" || installed) return

  const result = await remote(config, ip, installScript +
    `printf '%s\\n' '${desired}' > /opt/nati-store/server.sha256\n` +
    "docker --version\ndocker compose version\n")
  console.log(result)
}
