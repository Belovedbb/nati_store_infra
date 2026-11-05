import type { EnvironmentConfig } from "../src/config/types.js"

export const dev = {
  provider: "lightsail",
  aws: { region: "eu-north-1", profile: "nati-store-deployer", secretId: "nati-store/dev/app" },
  lightsail: {
    stackName: "nati-store-dev-foundation",
    availabilityZone: "eu-north-1a",
    instanceName: "nati-store-dev",
    blueprintId: "ubuntu_24_04",
    bundleId: "small_3_0",
    staticIpName: "nati-store-dev-ip",
    snapshotTimeUtc: "02:00",
    // Set to your public IP /32 before using SSH deployment units.
    sshCidr: "88.193.130.228/32",
    sshUser: "ubuntu",
  },
  containers: {
    postgresMemory: "256m",
    backendMemory: "768m",
    storefrontMemory: "512m",
    proxyMemory: "128m",
    postgresImage: "postgres:15-alpine",
    proxyImage: "caddy:2-alpine",
    backendImage: "ghcr.io/belovedbb/nati-backend",
    storefrontImage: "ghcr.io/belovedbb/nati-storefront",
    storeDomain: "nati-store.duckdns.org",
    apiDomain: "nati-store-admin.duckdns.org",
  },
} satisfies EnvironmentConfig
