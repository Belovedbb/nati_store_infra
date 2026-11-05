import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import type { EnvironmentConfig } from "./config/types.js"

export function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex")
}

export function base64(value: string): string {
  return Buffer.from(value).toString("base64")
}

export async function foundationIp(config: EnvironmentConfig): Promise<string | undefined> {
  const client = new CloudFormationClient({ region: config.aws.region })
  try {
    const result = await client.send(new DescribeStacksCommand({ StackName: config.lightsail.stackName }))
    return result.Stacks?.[0]?.Outputs?.find((output) => output.OutputKey === "PublicIp")?.OutputValue
  } catch (error) {
    if (error instanceof Error && /does not exist/i.test(error.message)) return undefined
    throw error
  } finally {
    client.destroy()
  }
}

export async function remote(
  config: EnvironmentConfig,
  ip: string,
  script: string,
): Promise<string> {
  if (!config.lightsail.sshCidr) throw new Error("Set lightsail.sshCidr in the environment configuration for SSH deployment")
  const key = process.env.NATI_SSH_KEY_PATH
  if (!key) throw new Error("Set NATI_SSH_KEY_PATH to your Lightsail SSH private key")
  const args = [
    "-i", key,
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "ConnectTimeout=10",
    `${config.lightsail.sshUser}@${ip}`,
    "sudo bash -s",
  ]
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60 * 1000)
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`SSH command failed (${code}): ${stderr.trim() || stdout.trim()}`))
    })
    child.stdin.end(script)
  })
}
