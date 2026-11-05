import { dev } from "../../environments/dev.js"
import { prod } from "../../environments/prod.js"
import type { EnvironmentConfig } from "./types.js"

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
  return config
}
