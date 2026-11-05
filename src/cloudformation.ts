import {
  CloudFormationClient,
  CreateChangeSetCommand,
  DeleteChangeSetCommand,
  DeleteStackCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  type Change,
} from "@aws-sdk/client-cloudformation"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import type { StackDefinition } from "./modules/lightsail/index.js"

export async function runStack(
  action: "diff" | "deploy",
  region: string,
  environment: string,
  stack: StackDefinition,
): Promise<void> {
  const client = new CloudFormationClient({ region })
  const changeSetName = `nati-${Date.now()}-${randomUUID().slice(0, 8)}`
  let changeSetCreated = false
  let executed = false
  let createdPlaceholder = false
  try {
    const stackStatus = await getStackStatus(client, stack.stackName)
    if (stackStatus && stackStatus !== "REVIEW_IN_PROGRESS" &&
        !["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].includes(stackStatus)) {
      throw new Error(`Stack ${stack.stackName} is ${stackStatus}; resolve it before deploying`)
    }
    const type = !stackStatus || stackStatus === "REVIEW_IN_PROGRESS" ? "CREATE" : "UPDATE"
    createdPlaceholder = !stackStatus
    await client.send(new CreateChangeSetCommand({
      StackName: stack.stackName,
      ChangeSetName: changeSetName,
      ChangeSetType: type,
      TemplateBody: stack.templateBody,
      Tags: [
        { Key: "Application", Value: "nati-store" },
        { Key: "Environment", Value: environment },
      ],
    }))
    changeSetCreated = true

    const result = await waitForChangeSet(client, stack.stackName, changeSetName)
    console.log(`\n${environment}/${stack.name} (${stack.stackName}):`)
    if (result.status === "FAILED" && /didn't contain changes|no updates are to be performed/i.test(result.reason ?? "")) {
      console.log("  No changes")
      return
    }
    if (result.status !== "CREATE_COMPLETE") {
      throw new Error(`Change set failed: ${result.reason ?? result.status}`)
    }

    const changes = await getChanges(client, stack.stackName, changeSetName)
    for (const change of changes) {
      const resource = change.ResourceChange
      if (!resource) continue
      console.log(`  ${resource.Action ?? "Unknown"} ${resource.LogicalResourceId ?? "?"} (${resource.ResourceType ?? "?"})` +
        (resource.Replacement && resource.Replacement !== "False" ? `; replacement: ${resource.Replacement}` : ""))
    }
    if (changes.length === 0) console.log("  No resource changes reported")

    if (action === "diff") return
    await client.send(new ExecuteChangeSetCommand({ StackName: stack.stackName, ChangeSetName: changeSetName }))
    executed = true
    console.log(`  Executing change set ${changeSetName}`)
    await waitForStack(client, stack.stackName)
  } finally {
    if (changeSetCreated && !executed) {
      await client.send(new DeleteChangeSetCommand({ StackName: stack.stackName, ChangeSetName: changeSetName }))
    }
    if (createdPlaceholder && !executed) {
      await client.send(new DeleteStackCommand({ StackName: stack.stackName }))
      await waitForStackDeletion(client, stack.stackName)
    }
    client.destroy()
  }
}

async function getStackStatus(client: CloudFormationClient, name: string): Promise<string | undefined> {
  try {
    const result = await client.send(new DescribeStacksCommand({ StackName: name }))
    return result.Stacks?.[0]?.StackStatus
  } catch (error) {
    if (isMissingStack(error)) return undefined
    throw error
  }
}

async function waitForChangeSet(client: CloudFormationClient, stackName: string, name: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await client.send(new DescribeChangeSetCommand({ StackName: stackName, ChangeSetName: name }))
    if (result.Status === "CREATE_COMPLETE" || result.Status === "FAILED") {
      return { status: result.Status, reason: result.StatusReason }
    }
    await delay(2000)
  }
  throw new Error(`Timed out waiting for change set ${name}`)
}

async function getChanges(client: CloudFormationClient, stackName: string, name: string): Promise<Change[]> {
  const changes: Change[] = []
  let nextToken: string | undefined
  do {
    const result = await client.send(new DescribeChangeSetCommand({
      StackName: stackName,
      ChangeSetName: name,
      NextToken: nextToken,
    }))
    changes.push(...(result.Changes ?? []))
    nextToken = result.NextToken
  } while (nextToken)
  return changes
}

async function waitForStack(client: CloudFormationClient, name: string): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt++) {
    const status = await getStackStatus(client, name)
    if (status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE") {
      console.log(`  Stack ${name}: ${status}`)
      return
    }
    if (!status || status.includes("FAILED") || status.includes("ROLLBACK")) {
      throw new Error(`Stack ${name} failed: ${status ?? "missing"}`)
    }
    await delay(5000)
  }
  throw new Error(`Timed out waiting for stack ${name}`)
}

async function waitForStackDeletion(client: CloudFormationClient, name: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const status = await getStackStatus(client, name)
    if (!status || status === "DELETE_COMPLETE") return
    if (status === "DELETE_FAILED") throw new Error(`Could not remove review stack ${name}`)
    await delay(1000)
  }
  throw new Error(`Timed out removing review stack ${name}`)
}

function isMissingStack(error: unknown): boolean {
  return error instanceof Error && /does not exist/i.test(error.message)
}
