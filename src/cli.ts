import { existsSync } from "node:fs"
import { loadEnvironment } from "./config/index.js"
import { foundationIp } from "./host.js"
import { loadSecrets } from "./secrets.js"
import { runStack } from "./cloudformation.js"
import { lightsailStacks } from "./modules/lightsail/index.js"
import { runServer } from "./modules/server/index.js"
import { runPostgres } from "./modules/postgres/index.js"
import { runApp } from "./modules/app/index.js"

const [action, environment, scope, stackName] = process.argv.slice(2)
if ((action !== "diff" && action !== "deploy") || !environment ||
    !((scope === "--all" && !stackName) || (scope === "--stack" && stackName))) {
  throw new Error("Usage: pnpm diff|deploy <environment> --all | --stack foundation|server|postgres|app")
}

const config = loadEnvironment(environment)
if (process.env.AWS_PROFILE && process.env.AWS_PROFILE !== config.aws.profile) {
  throw new Error(`AWS_PROFILE=${process.env.AWS_PROFILE} does not match ${environment} profile ${config.aws.profile}`)
}
process.env.AWS_PROFILE ??= config.aws.profile
const order = ["foundation", "server", "postgres", "app"] as const
type Unit = typeof order[number]
if (scope === "--stack" && !order.includes(stackName as Unit)) {
  throw new Error(`Unknown stack: ${stackName}`)
}
const selected: readonly Unit[] = scope === "--all" ? order : [stackName as Unit]

if (action === "deploy" && selected.some((unit) => unit !== "foundation")) {
  if (!config.lightsail.sshCidr) throw new Error("Set lightsail.sshCidr before deploying host units")
  const key = process.env.NATI_SSH_KEY_PATH
  if (!key || !existsSync(key)) throw new Error("Set NATI_SSH_KEY_PATH to an existing Lightsail SSH private key")
  if (selected.includes("app")) {
    if (!config.containers.backendImage || !config.containers.storefrontImage ||
        !config.containers.storeDomain || !config.containers.apiDomain) {
      throw new Error("Set both app image references and domains in the environment configuration")
    }
  }
}

const foundation = lightsailStacks(environment, config)[0]
for (const unit of selected) {
  if (unit === "foundation") {
    await runStack(action, config.aws.region, environment, foundation)
    continue
  }
  const ip = await foundationIp(config)
  if (!ip) {
    if (action === "diff") {
      console.log(`${unit}: pending foundation deployment`)
      continue
    }
    throw new Error(`Deploy foundation before ${unit}`)
  }
  if (unit === "server") await runServer(action, config, ip)
  if (unit === "postgres") await runPostgres(action, config, ip, await loadSecrets(config, false))
  if (unit === "app") await runApp(action, config, ip, await loadSecrets(config, true))
}
