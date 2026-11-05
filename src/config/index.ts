import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dev } from "../../environments/dev.js"
import { prod } from "../../environments/prod.js"
import type { EnvironmentConfig } from "./types.js"

// Images without a tag (for example "ghcr.io/me/nati-backend") get one at deploy time:
// NATI_IMAGE_TAG if set (a SHA to roll back to, or "latest"), otherwise the HEAD commit of
// the app repository, which is the tag the GitHub workflow pushes for that commit.
const hasTag = (image: string) => /:[^/]+$/.test(image)

function resolveImageTag(): string {
  const override = process.env.NATI_IMAGE_TAG
  const tag = override || (() => {
    const repo = process.env.NATI_APP_REPO || fileURLToPath(new URL("../../../nati_store", import.meta.url))
    try {
      return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    } catch {
      throw new Error(`Could not read the app commit from ${repo}. Set NATI_IMAGE_TAG or NATI_APP_REPO`)
    }
  })()
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)) throw new Error(`Invalid image tag: ${tag}`)
  return tag
}

const environments = { dev, prod } satisfies Record<string, EnvironmentConfig>

export function loadEnvironment(name: string): EnvironmentConfig {
  if (!Object.hasOwn(environments, name)) {
    throw new Error(`Unknown environment: ${name}. Choose ${Object.keys(environments).join(", ")}`)
  }
  const config = environments[name as keyof typeof environments]
  if (!config.aws.region || !config.aws.profile || !config.aws.secretId ||
      !config.lightsail.availabilityZone.startsWith(config.aws.region)) {
    throw new Error(`Invalid AWS region or availability zone in ${name} configuration`)
  }
  if (!/^([01]\d|2[0-3]):00$/.test(config.lightsail.snapshotTimeUtc)) {
    throw new Error(`Invalid UTC snapshot time in ${name} configuration`)
  }
  for (const [service, memory] of Object.entries({
    postgres: config.containers.postgresMemory,
    backend: config.containers.backendMemory,
    storefront: config.containers.storefrontMemory,
    proxy: config.containers.proxyMemory,
  })) {
    if (!/^[1-9]\d*(m|g)$/.test(memory)) throw new Error(`Invalid ${service} memory limit: ${memory}`)
  }
  if (config.lightsail.sshCidr && !/^\d{1,3}(\.\d{1,3}){3}\/(3[0-2]|[12]?\d)$/.test(config.lightsail.sshCidr)) {
    throw new Error(`Invalid SSH IPv4 CIDR in ${name} configuration`)
  }
  const { backendImage, storefrontImage } = config.containers
  if ((backendImage && !hasTag(backendImage)) || (storefrontImage && !hasTag(storefrontImage))) {
    const tag = resolveImageTag()
    console.log(`images: using tag ${tag}`)
    const withTag = (image: string) => (image && !hasTag(image) ? `${image}:${tag}` : image)
    return { ...config, containers: { ...config.containers,
      backendImage: withTag(backendImage), storefrontImage: withTag(storefrontImage) } }
  }
  return config
}
