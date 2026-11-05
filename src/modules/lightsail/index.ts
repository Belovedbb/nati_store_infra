import { foundationTemplate } from "./foundation.js"
import type { EnvironmentConfig } from "../../config/types.js"

export interface StackDefinition {
  name: string
  stackName: string
  templateBody: string
}

export function lightsailStacks(environment: string, config: EnvironmentConfig): StackDefinition[] {
  return [{
    name: "foundation",
    stackName: config.lightsail.stackName,
    templateBody: foundationTemplate(environment, config),
  }]
}
