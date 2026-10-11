// Pure helpers for the Agents tab: no mods API, so tests can call them directly.
//
// Turns a GET /v1/mesh/snapshot body (the `agents` map) plus this node's
// GET /v1/endpoints list into rows worth showing and asking.

import { elapsed } from "./trace.js";

const HOST_SUFFIX = /-openscout$/;

/** `endpoint.metadata.transport` values seen with no `endpoint.harness` to fall back to. */
const HARNESS_BY_TRANSPORT = {
  claude_stream_json: "claude",
  codex_app_server: "codex",
  kimi_acp: "kimi",
  grok_acp: "grok",
  devin_acp: "devin",
};

const ENDPOINT_STATE_RANK = {
  active: 5,
  waiting: 4,
  idle: 3,
  registered: 2,
  stopped: 1,
  offline: 0,
};

function rankEndpointState(state) {
  return ENDPOINT_STATE_RANK[state] ?? -1;
}

function stripAt(value) {
  return typeof value === "string" && value.startsWith("@") ? value.slice(1) : value;
}

/** Epoch milliseconds from a number or numeric string; values that read as seconds are scaled up. */
function numberOrNull(value) {
  let n = null;
  if (typeof value === "number" && Number.isFinite(value)) n = value;
  else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) n = Number(value);
  if (n === null) return null;
  return n < 1e12 ? n * 1000 : n;
}

function basename(path) {
  if (typeof path !== "string" || !path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/** "mini-openscout" -> "mini"; the local node gets its own plain label. */
function hostLabelFor(nodeId, localNodeId) {
  if (!nodeId) return "unknown";
  if (localNodeId && nodeId === localNodeId) return "this mac";
  return nodeId.replace(HOST_SUFFIX, "");
}

function handleFor(agentId, endpoint, agent) {
  return (
    endpoint?.metadata?.handle ??
    agent?.handle ??
    stripAt(agent?.defaultSelector) ??
    agentId
  );
}

function nameFor(endpoint, agent, handle) {
  return endpoint?.metadata?.displayName ?? agent?.displayName ?? handle;
}

function harnessFor(endpoint, agent) {
  if (endpoint?.harness) return endpoint.harness;
  const transport = agent?.metadata?.transport;
  return HARNESS_BY_TRANSPORT[transport] ?? null;
}

function projectFor(endpoint, agent) {
  return (
    agent?.metadata?.project ??
    endpoint?.metadata?.project ??
    basename(endpoint?.projectRoot) ??
    null
  );
}

/** Best guess at "last touched": a completed or started run, else when it registered. */
function lastActiveAtFor(endpoint, agent) {
  const meta = endpoint?.metadata ?? {};
  return (
    numberOrNull(meta.lastCompletedAt) ??
    numberOrNull(meta.lastStartedAt) ??
    numberOrNull(meta.observedRuntimeAt) ??
    numberOrNull(meta.startedAt) ??
    numberOrNull(agent?.createdAt) ??
    null
  );
}

/**
 * Turn a mesh snapshot's `agents` map plus this node's `/v1/endpoints` into
 * search/display rows. `endpoints` is optional: without it rows still
 * have a handle, name, project, and host, just no state or live harness.
 */
export function parseAgents({ snapshot, endpoints = [], localNodeId = null }) {
  const agents = snapshot?.agents ?? {};
  const endpointByAgentId = new Map();
  for (const endpoint of endpoints) {
    if (!endpoint?.agentId) continue;
    const existing = endpointByAgentId.get(endpoint.agentId);
    if (!existing || rankEndpointState(endpoint.state) > rankEndpointState(existing.state)) {
      endpointByAgentId.set(endpoint.agentId, endpoint);
    }
  }

  // Live harness sessions often have an endpoint and no agent record, so the
  // roster is every agent record plus every endpoint-only agent.
  const agentIds = new Set([...Object.keys(agents), ...endpointByAgentId.keys()]);
  const rows = [];
  for (const agentId of agentIds) {
    const agent = agents[agentId] ?? null;
    if (agentId === "operator" || agent?.id === "operator") continue;
    const endpoint = endpointByAgentId.get(agentId) ?? null;
    const handle = handleFor(agentId, endpoint, agent);
    const nodeId = agent?.homeNodeId ?? agent?.authorityNodeId ?? endpoint?.nodeId ?? null;
    rows.push({
      handle,
      name: nameFor(endpoint, agent, handle),
      harness: harnessFor(endpoint, agent),
      project: projectFor(endpoint, agent),
      hostLabel: hostLabelFor(nodeId, localNodeId),
      isLocal: Boolean(localNodeId) && nodeId === localNodeId,
      lastActiveAt: lastActiveAtFor(endpoint, agent),
      state: endpoint?.state ?? null,
    });
  }
  return rows;
}

/** This Mac's group first, then remotes with the most recently active leading; each group by recency. */
export function groupByHost(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.hostLabel)) groups.set(row.hostLabel, { hostLabel: row.hostLabel, isLocal: row.isLocal, rows: [] });
    groups.get(row.hostLabel).rows.push(row);
  }
  const byRecency = (a, b) => (b.lastActiveAt ?? -Infinity) - (a.lastActiveAt ?? -Infinity);
  for (const group of groups.values()) group.rows.sort(byRecency);

  const list = [...groups.values()];
  list.sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return (b.rows[0]?.lastActiveAt ?? -Infinity) - (a.rows[0]?.lastActiveAt ?? -Infinity);
  });
  return list;
}

/** Case-insensitive match on handle, name, project, host, or harness. Reaches every row. */
export function searchAgents(rows, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.handle, row.name, row.project, row.hostLabel, row.harness].some(
      (field) => typeof field === "string" && field.toLowerCase().includes(q),
    ),
  );
}

export function isRecentlyActive(row, now, windowMs = 24 * 60 * 60 * 1000) {
  return row.lastActiveAt != null && now - row.lastActiveAt < windowMs;
}

/** The default view before a search: agents active in the last 24h. */
export function defaultAgents(rows, now) {
  return rows.filter((row) => isRecentlyActive(row, now));
}

function agentStateText(row, now) {
  if (row.state === "active" || row.state === "waiting") return "working";
  if (row.state === "idle") {
    const age = row.lastActiveAt != null ? elapsed(now - row.lastActiveAt) : "";
    return age ? `idle ${age}` : "idle";
  }
  if (row.state === "offline" || row.state === "stopped") return "offline";
  if (row.state === "registered") return "registered";
  return row.state ?? "unknown";
}

/** "handle   harness · project   idle 3m" for one row's button label. */
export function agentRowText(row, now) {
  const meta = [row.harness, row.project].filter(Boolean).join(" · ");
  return [row.handle, meta, agentStateText(row, now)].filter(Boolean).join("   ");
}
