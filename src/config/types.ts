export interface EnvironmentConfig {
  provider: "lightsail"
  aws: {
    region: string
    profile: string
    secretId: string
  }
  lightsail: {
    stackName: string
    availabilityZone: string
    instanceName: string
    blueprintId: string
    bundleId: string
    staticIpName: string
    snapshotTimeUtc: string
    sshCidr?: string
    sshUser: string
  }
  containers: {
    postgresMemory: string
    backendMemory: string
    storefrontMemory: string
    proxyMemory: string
    postgresImage: string
    proxyImage: string
    backendImage: string
    storefrontImage: string
    storeDomain: string
    apiDomain: string
  }
}
