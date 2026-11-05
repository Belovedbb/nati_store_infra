import type { EnvironmentConfig } from "../src/config/types.js"

export const prod = {
  provider: "lightsail",
  aws: { region: "eu-north-1", profile: "nati-store-deployer", secretId: "nati-store/prod/app" },
  lightsail: {
    stackName: "nati-store-prod-foundation",
    availabilityZone: "eu-north-1a",
    instanceName: "nati-store-prod",
    blueprintId: "ubuntu_24_04",
    bundleId: "small_3_0",
    staticIpName: "nati-store-prod-ip",
    snapshotTimeUtc: "02:00",
    // Set to your public IP /32 before using SSH deployment units.
    sshCidr: undefined,
    sshUser: "ubuntu",
  },
  containers: {
    postgresMemory: "256m",
    backendMemory: "768m",
    storefrontMemory: "512m",
    proxyMemory: "128m",
    postgresImage: "postgres:15-alpine",
    proxyImage: "caddy:2-alpine",
    backendImage: "",
    storefrontImage: "",
    storeDomain: "",
    apiDomain: "",
  },
} satisfies EnvironmentConfig
