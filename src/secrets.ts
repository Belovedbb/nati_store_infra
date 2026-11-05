import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import type { EnvironmentConfig } from "./config/types.js"

export interface DatabaseSecrets {
  postgresPassword: string
}

export interface AppSecrets extends DatabaseSecrets {
  jwtSecret: string
  cookieSecret: string
  medusaPublishableKey: string
}

export async function loadSecrets(config: EnvironmentConfig, includeApp: true): Promise<AppSecrets>
export async function loadSecrets(config: EnvironmentConfig, includeApp: false): Promise<DatabaseSecrets>
export async function loadSecrets(config: EnvironmentConfig, includeApp: boolean): Promise<DatabaseSecrets | AppSecrets> {
  const client = new SecretsManagerClient({ region: config.aws.region })
  try {
    const result = await client.send(new GetSecretValueCommand({ SecretId: config.aws.secretId }))
    if (!result.SecretString) throw new Error(`Secret ${config.aws.secretId} has no SecretString`)
    let value: unknown
    try { value = JSON.parse(result.SecretString) }
    catch { throw new Error(`Secret ${config.aws.secretId} must contain a JSON object`) }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Secret ${config.aws.secretId} must contain a JSON object`)
    }
    const fields = value as Record<string, unknown>
    const required = (name: keyof AppSecrets): string => {
      const field = fields[name]
      if (typeof field !== "string" || !field || /[\r\n]/.test(field)) {
        throw new Error(`Secret ${config.aws.secretId} needs a nonempty single-line ${name}`)
      }
      return field
    }
    const database = { postgresPassword: required("postgresPassword") }
    if (!includeApp) return database
    return { ...database, jwtSecret: required("jwtSecret"), cookieSecret: required("cookieSecret"),
      medusaPublishableKey: required("medusaPublishableKey") }
  } finally {
    client.destroy()
  }
}
