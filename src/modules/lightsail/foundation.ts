import type { EnvironmentConfig } from "../../config/types.js"

export function foundationTemplate(environment: string, config: EnvironmentConfig): string {
  const { availabilityZone, instanceName, blueprintId, bundleId, staticIpName, snapshotTimeUtc, sshCidr } = config.lightsail
  return JSON.stringify({
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Nati Store ${environment} Lightsail foundation`,
    Resources: {
      Instance: {
        Type: "AWS::Lightsail::Instance",
        Properties: {
          InstanceName: instanceName,
          AvailabilityZone: availabilityZone,
          BlueprintId: blueprintId,
          BundleId: bundleId,
          AddOns: [{
            AddOnType: "AutoSnapshot",
            Status: "Enabled",
            AutoSnapshotAddOnRequest: { SnapshotTimeOfDay: snapshotTimeUtc },
          }],
          Networking: {
            Ports: [
              { FromPort: 22, ToPort: 22, Protocol: "tcp", CidrListAliases: ["lightsail-connect"], ...(sshCidr ? { Cidrs: [sshCidr] } : {}) },
              { FromPort: 80, ToPort: 80, Protocol: "tcp", Cidrs: ["0.0.0.0/0"] },
              { FromPort: 443, ToPort: 443, Protocol: "tcp", Cidrs: ["0.0.0.0/0"] },
            ],
          },
          Tags: [
            { Key: "Application", Value: "nati-store" },
            { Key: "Environment", Value: environment },
          ],
        },
      },
      StaticIp: {
        Type: "AWS::Lightsail::StaticIp",
        Properties: {
          StaticIpName: staticIpName,
          AttachedTo: { Ref: "Instance" },
        },
      },
    },
    Outputs: {
      PublicIp: {
        Description: "Static public IPv4 address",
        Value: { "Fn::GetAtt": ["StaticIp", "IpAddress"] },
      },
    },
  })
}
