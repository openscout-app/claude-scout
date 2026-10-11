// Scout trace: follows the asks this Claude Code session hands to Scout agents,
// and a directory to find other Scout agents to ask.
//
// Polite by construction:
// - nothing is drawn until this session asks an agent for something
// - one dim line above the prompt while work is live, gone ~90s after it ends
// - the broker is polled only while a flight is live
// - the pane opens only when the user runs /scout:agents or /scout:trace
// - the agent directory is fetched only while its tab is open, at most every 30s

import {
  ASK_TOOL,
  SCOUT_ASK_COMMAND,
  bandText,
  flightAge,
  flightFromInvocation,
  invocationIdsIn,
  isLive,
  stateWord,
  visibleFlights,
} from "./trace.js";
import { agentRowText, defaultAgents, groupByHost, parseAgents, searchAgents } from "./agents.js";

const PANE = "scout";
const POLL_MS = 3000;
const AGENTS_REFRESH_MS = 30_000;
const AGENTS_ROW_CAP = 40;
const DEFAULT_BROKER = "http://127.0.0.1:43110";

/** invocationId -> flight, in the order this session asked. */
let flights = new Map();
let storeKey = null;
let brokerUrl = DEFAULT_BROKER;
let lastNow = 0;

/** Which pane tab is open, and the Agents tab's own state. */
let tab = "live";
let agentsQuery = "";
let agentsRows = null; // null until the first successful load
let agentsError = null;
let agentsLoading = false;
let agentsFetchedAt = 0;
let localNodeId = null;

const list = () => [...flights.values()];

/** A mods API call whose failure should never surface in the session. */
async function quietly(call) {
  try {
    return await call();
  } catch {
    return undefined;
  }
}

async function getJson($, path) {
  try {
    const res = await $.http.fetch(`${brokerUrl}${path}`);
    if (!res || res.status !== 200) return null;
    return JSON.parse(res.text);
  } catch {
    return null;
  }
}

async function save($) {
  if (!storeKey) return;
  // Keep only this session's recent asks; older ones are the broker's record, not ours.
  const keep = list().slice(-20);
  await quietly(() => $.store.set(storeKey, keep));
}

async function fetchFlight($, invocationId) {
  return getJson($, `/v1/invocations/${encodeURIComponent(invocationId)}`);
}

async function refresh($, ids) {
  let changed = false;
  for (const id of ids) {
    const body = await fetchFlight($, id);
    if (!body) continue;
    const before = flights.get(id);
    const next = flightFromInvocation(body, before);
    flights.set(id, next);
    if (!before || before.state !== next.state || before.summary !== next.summary) changed = true;
    if (before && isLive(before) && !isLive(next)) {
      await quietly(() => $.ui.toast(`${next.target} ${stateWord(next.state)}`));
    }
  }
  if (changed) await save($);
  return changed;
}

async function track($, ids) {
  const fresh = ids.filter((id) => !flights.has(id));
  if (fresh.length === 0) return;
  for (const id of fresh) flights.set(id, { invocationId: id, target: "agent", state: "queued" });
  await refresh($, fresh);
  $.ui.invalidate("ui.render");
}

async function ensureLocalNodeId($) {
  if (localNodeId) return localNodeId;
  const body = await getJson($, "/v1/node");
  localNodeId = typeof body?.id === "string" ? body.id : null;
  return localNodeId;
}

/** Load the agent directory, unless a load is already in flight or the last one is still fresh. */
async function loadAgents($, { force = false } = {}) {
  if (agentsLoading) return;
  const now = await $.clock.now();
  if (!force && agentsFetchedAt && now - agentsFetchedAt < AGENTS_REFRESH_MS) return;

  agentsLoading = true;
  $.ui.invalidate("ui.render");

  const nodeId = await ensureLocalNodeId($);
  const [snapshot, endpointsBody] = await Promise.all([
    getJson($, "/v1/mesh/snapshot"),
    getJson($, "/v1/endpoints"),
  ]);

  agentsLoading = false;
  agentsFetchedAt = await $.clock.now();
  if (!snapshot) {
    // Keep showing the last good directory, if there was one; only report the
    // error while there's nothing else on screen.
    if (agentsRows === null) agentsError = "Broker unreachable";
  } else {
    agentsError = null;
    agentsRows = parseAgents({ snapshot, endpoints: endpointsBody?.endpoints ?? [], localNodeId: nodeId });
  }
  $.ui.invalidate("ui.render");
}

// The Live tab: every ask from this session, newest first. Unchanged from before tabs existed.
function renderLiveTab({ Box, Text }, now) {
  const rows = list()
    .reverse()
    .map((f) =>
      Box({
        flexDirection: "column",
        children: [
          Box({
            flexDirection: "row",
            columnGap: 1,
            children: [
              Text({ bold: isLive(f), dimColor: !isLive(f), children: [f.target] }),
              Text({ dimColor: true, children: [`${stateWord(f.state)} ${flightAge(f, now)}`.trim()] }),
            ],
          }),
          ...(f.summary
            ? [Text({ dimColor: true, wrap: "truncate-end", children: [`  ${f.summary}`] })]
            : []),
        ],
      }),
    );
  return Box({ flexDirection: "column", children: rows });
}

// The Agents tab: a find field, then this Mac's agents and remote hosts', most recent first.
function renderAgentsTab($, { Box, Text, Button, Input }, now) {
  const input = Input({
    key: "find",
    label: "Find",
    placeholder: "handle, project, host, harness",
    value: agentsQuery,
    onInput: (value) => {
      agentsQuery = value;
      $.ui.invalidate("ui.render");
    },
    onSubmit: (value) => {
      agentsQuery = value;
      $.ui.invalidate("ui.render");
    },
  });

  if (agentsRows === null) {
    return Box({
      flexDirection: "column",
      children: [input, Text({ dimColor: true, children: [agentsError ?? "Loading…"] })],
    });
  }

  const query = agentsQuery.trim();
  const base = query ? agentsRows : defaultAgents(agentsRows, now);
  const visible = query ? searchAgents(base, query) : base;
  const groups = groupByHost(visible);

  const rows = [];
  let shown = 0;
  for (const group of groups) {
    if (shown >= AGENTS_ROW_CAP) break;
    const groupRows = group.rows.slice(0, AGENTS_ROW_CAP - shown);
    if (groupRows.length === 0) continue;
    rows.push(Text({ key: `host-${group.hostLabel}`, dimColor: true, children: [group.hostLabel] }));
    for (const row of groupRows) {
      rows.push(
        Button({
          key: `agent-${row.handle}`,
          label: agentRowText(row, now),
          plain: true,
          onPress: async () => {
            await quietly(() => $.prompt.fill({ text: `ask ${row.handle}: `, mode: "replace" }));
            await quietly(() => $.ui.close({ id: PANE }));
          },
        }),
      );
    }
    shown += groupRows.length;
  }
  if (visible.length > shown) {
    rows.push(Text({ dimColor: true, children: [`+${visible.length - shown} more, refine search`] }));
  }
  if (rows.length === 0) {
    rows.push(
      Text({
        dimColor: true,
        children: [query ? "No matches." : "No agents active in the last day. Search reaches further back."],
      }),
    );
  }

  return Box({ flexDirection: "column", children: [input, ...rows] });
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const env = await quietly(() => $.env.get("OPENSCOUT_BROKER_URL"));
    if (typeof env === "string" && env.trim()) brokerUrl = env.trim().replace(/\/+$/, "");
    const sessionId = await quietly(() => $.session.id());
    storeKey = sessionId ? `flights:${sessionId}` : null;
    if (storeKey) {
      const saved = await quietly(() => $.store.get(storeKey));
      if (Array.isArray(saved)) flights = new Map(saved.map((f) => [f.invocationId, f]));
    }
    // File-backed commands provide /scout:agents and /scout:trace. Native mods
    // registrations cannot contain a colon on early-access builds. Reuse the
    // file-backed command when present; each fallback registers on its own.
    // One refusal (a user command with the same name wins) must not stop the rest of start-up. /scout is left to the user.
    await quietly(async () => {
      if ((await $.command.list()).some((c) => c.name === "scout:agents")) return;
      return $.command.register({
        name: "agents",
        description: "Find Scout agents to ask, and see the ones this session asked for",
        immediate: true,
      });
    });
    await quietly(async () => {
      if ((await $.command.list()).some((c) => c.name === "scout:trace")) return;
      return $.command.register({
        name: "trace",
        description: "Show the Scout agents this session asked for",
        immediate: true,
      });
    });

    $.clock.every(POLL_MS, async () => {
      lastNow = await $.clock.now();
      const live = list().filter(isLive).map((f) => f.invocationId);
      const shown = visibleFlights(list(), lastNow).length > 0;
      if (live.length > 0) await refresh($, live);
      // Redraw while something is on screen so ages tick and finished rows fall away.
      if (live.length > 0 || shown) $.ui.invalidate("ui.render");
    });
    return next(e);
  });

  // Catch the invocation ids of asks this session makes, through MCP or the CLI.
  on("tool.call", { tool: ASK_TOOL }, async ($, e, next) => {
    const result = await next(e);
    if (!result?.deny && !result?.isError) await track($, invocationIdsIn(result));
    return result;
  });

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const result = await next(e);
    if (typeof e.command === "string" && SCOUT_ASK_COMMAND.test(e.command) && !result?.deny) {
      await track($, invocationIdsIn(result));
    }
    return result;
  });

  on("command.run", { command: "scout:agents" }, async ($) => {
    tab = "agents";
    await $.ui.open({ id: PANE, title: "Scout", focus: true, closeOnEscape: true });
    if (tab === "agents") await loadAgents($);
    return {};
  });

  // /scout:trace is the original command: same pane, forced back to the Live tab.
  on("command.run", { command: "scout:trace" }, async ($) => {
    tab = "live";
    if (flights.size === 0) return { text: "No Scout asks from this session yet." };
    await $.ui.open({ id: PANE, title: "Scout", focus: true, closeOnEscape: true });
    return {};
  });

  // The band: one dim line, only while there is something to say. Trace-only; the
  // Agents directory never draws here.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const now = lastNow || (await $.clock.now());
    const shown = visibleFlights(list(), now);
    if (shown.length === 0) return next(e);
    const { Box, Text } = $.ui.resolve(e);
    const theirs = await next(e);
    const line = Text({ dimColor: true, wrap: "truncate-end", children: [`scout  ${bandText(shown, now)}`] });
    return Box({ flexDirection: "column", children: theirs ? [theirs, line] : [line] });
  });

  // The pane: plain tab buttons over the Live rows or the Agents directory.
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const now = lastNow || (await $.clock.now());
    const { Box, Text, Button, Input } = $.ui.resolve(e);
    const redraw = () => $.ui.invalidate("ui.render");

    const tabButton = (name, label, hotkey) =>
      Button({
        key: `tab-${name}`,
        label,
        hotkey,
        plain: true,
        dimColor: tab !== name,
        onPress: async () => {
          tab = name;
          redraw();
          if (name === "agents") await loadAgents($);
        },
      });

    const body =
      tab === "live"
        ? renderLiveTab({ Box, Text }, now)
        : renderAgentsTab($, { Box, Text, Button, Input }, now);

    return Box({
      flexDirection: "column",
      children: [
        Box({ flexDirection: "row", columnGap: 3, children: [tabButton("live", "Live", "1"), tabButton("agents", "Agents", "2")] }),
        Text({ children: [" "] }),
        body,
      ],
    });
  });
}
