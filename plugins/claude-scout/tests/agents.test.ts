import { expect, mock, test } from "claude-code/testing";

import {
  agentRowText,
  defaultAgents,
  groupByHost,
  isRecentlyActive,
  parseAgents,
  searchAgents,
} from "../hooks/agents.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const LOCAL_NODE_ID = "arts-mini-openscout";

// Trimmed from a real GET /v1/mesh/snapshot `agents` map and GET /v1/endpoints
// list: one local agent with a live local endpoint, one local agent with no
// endpoint (a cardless/tmux session, the common case on this broker), one
// remote agent (no endpoint, since /v1/endpoints only covers this node), and
// one local agent that's been quiet for days.
const SNAPSHOT = {
  agents: {
    "purcell-3.arts-mini": {
      id: "purcell-3.arts-mini",
      homeNodeId: "arts-mini-openscout",
      authorityNodeId: "arts-mini-openscout",
      displayName: "Session Purcell 3",
      handle: "purcell-3",
      defaultSelector: "@purcell-3",
      metadata: { project: "openscout", transport: "claude_stream_json" },
      createdAt: NOW - 10 * DAY,
    },
    "drover.arts-mini": {
      id: "drover.arts-mini",
      homeNodeId: "arts-mini-openscout",
      authorityNodeId: "arts-mini-openscout",
      displayName: "Session Drover",
      handle: "drover",
      defaultSelector: "@drover",
      metadata: { project: "hudson", transport: "tmux" },
      createdAt: NOW - 2 * 60 * 60 * 1000,
    },
    "russell-7.mini": {
      id: "russell-7.mini",
      homeNodeId: "mini-openscout",
      authorityNodeId: "mini-openscout",
      displayName: "Session Russell 7",
      handle: "russell-7",
      defaultSelector: "@russell-7",
      metadata: { project: "scoutcore", transport: "codex_app_server" },
      createdAt: NOW - 5 * 60 * 1000,
    },
    "stale-1.arts-mini": {
      id: "stale-1.arts-mini",
      homeNodeId: "arts-mini-openscout",
      authorityNodeId: "arts-mini-openscout",
      displayName: "Session Stale 1",
      handle: "stale-1",
      defaultSelector: "@stale-1",
      metadata: { project: "openscout", transport: "claude_stream_json" },
      createdAt: NOW - 10 * DAY,
    },
  },
};

const ENDPOINTS = [
  {
    agentId: "purcell-3.arts-mini",
    nodeId: "arts-mini-openscout",
    harness: "claude",
    state: "waiting",
    projectRoot: "/Users/art/dev/openscout",
    metadata: { project: "openscout", lastStartedAt: NOW - 4 * 60 * 1000 },
  },
  {
    agentId: "stale-1.arts-mini",
    nodeId: "arts-mini-openscout",
    harness: "claude",
    state: "offline",
    metadata: { project: "openscout", lastCompletedAt: NOW - 3 * DAY },
  },
];

test("parseAgents joins the snapshot's agents with this node's endpoints", () => {
  const rows = parseAgents({ snapshot: SNAPSHOT, endpoints: ENDPOINTS, localNodeId: LOCAL_NODE_ID });
  expect(rows).toHaveLength(4);

  const purcell = rows.find((r) => r.handle === "purcell-3");
  expect(purcell).toMatchObject({
    name: "Session Purcell 3",
    harness: "claude",
    project: "openscout",
    hostLabel: "this mac",
    isLocal: true,
    lastActiveAt: NOW - 4 * 60 * 1000,
    state: "waiting",
  });

  // No endpoint on this node for drover: harness falls back to the transport,
  // and tmux alone doesn't say which harness it is.
  const drover = rows.find((r) => r.handle === "drover");
  expect(drover).toMatchObject({
    harness: null,
    project: "hudson",
    hostLabel: "this mac",
    isLocal: true,
    state: null,
    lastActiveAt: NOW - 2 * 60 * 60 * 1000,
  });

  // A remote agent: no local endpoint to join, but still listed under its own host.
  const russell = rows.find((r) => r.handle === "russell-7");
  expect(russell).toMatchObject({
    hostLabel: "mini",
    isLocal: false,
    harness: "codex",
    project: "scoutcore",
    state: null,
  });
});

test("live sessions with only an endpoint are agents too, and second timestamps read as ms", () => {
  const rows = parseAgents({
    snapshot: { agents: {} },
    endpoints: [
      {
        agentId: "session-mv2pax79-ww6skk",
        nodeId: "arts-mini-openscout",
        harness: "grok-acp",
        state: "idle",
        metadata: { handle: "project-purcell-3", project: "openscout", startedAt: "1791655294" },
      },
    ],
    localNodeId: "arts-mini-openscout",
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].handle).toBe("project-purcell-3");
  expect(rows[0].isLocal).toBe(true);
  expect(rows[0].lastActiveAt).toBe(1791655294000);
});

test("groupByHost puts this Mac first, each group newest first", () => {
  const rows = [
    { handle: "old-local", hostLabel: "this mac", isLocal: true, lastActiveAt: NOW - DAY },
    { handle: "new-local", hostLabel: "this mac", isLocal: true, lastActiveAt: NOW },
    { handle: "remote-a", hostLabel: "mini", isLocal: false, lastActiveAt: NOW - 1000 },
    { handle: "remote-b", hostLabel: "archie", isLocal: false, lastActiveAt: NOW },
  ];
  const groups = groupByHost(rows);
  expect(groups.map((g) => g.hostLabel)).toEqual(["this mac", "archie", "mini"]);
  expect(groups[0].rows.map((r) => r.handle)).toEqual(["new-local", "old-local"]);
});

test("searchAgents matches handle, name, project, host, or harness, reaching every row", () => {
  const rows = parseAgents({ snapshot: SNAPSHOT, endpoints: ENDPOINTS, localNodeId: LOCAL_NODE_ID });
  // "stale-1" is outside the 24h default window, but search still reaches it.
  expect(searchAgents(rows, "stale").map((r) => r.handle)).toEqual(["stale-1"]);
  expect(searchAgents(rows, "SCOUTCORE").map((r) => r.handle)).toEqual(["russell-7"]);
  // "mini" is the remote host's label (russell-7's), not a substring of "this mac".
  expect(searchAgents(rows, "mini").map((r) => r.handle)).toEqual(["russell-7"]);
  expect(searchAgents(rows, "")).toBe(rows);
});

test("defaultAgents keeps only the last 24h; search reaches further back", () => {
  const rows = parseAgents({ snapshot: SNAPSHOT, endpoints: ENDPOINTS, localNodeId: LOCAL_NODE_ID });
  expect(
    defaultAgents(rows, NOW)
      .map((r) => r.handle)
      .sort(),
  ).toEqual(["drover", "purcell-3", "russell-7"]);
  expect(isRecentlyActive(rows.find((r) => r.handle === "stale-1"), NOW)).toBe(false);
});

test("agentRowText reads 'handle   harness · project   state'", () => {
  const rows = parseAgents({ snapshot: SNAPSHOT, endpoints: ENDPOINTS, localNodeId: LOCAL_NODE_ID });
  const purcell = rows.find((r) => r.handle === "purcell-3");
  expect(agentRowText(purcell, NOW)).toBe("purcell-3   claude · openscout   working");
});

// What Claude Code passes to a ui.render hook for the scout pane
const PANE = {
  plugin: "scout",
  component: "Pane",
  requestId: "scout",
  viewport: { columns: 100, rows: 30 },
  props: {
    title: "Scout",
    isFocused: true,
    bodyColumns: 60,
    placement: "inline",
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const;

test("the Agents tab finds an agent by search, and pressing it fills the prompt and closes the pane", async ($, on) => {
  mock.clock(on, { now: NOW });
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", () => ({ value: undefined }));
  const fills: string[] = [];
  on("prompt.fill", ($, e) => {
    fills.push(e.text);
    return { isFilled: true };
  });
  on("http.fetch", ($, e: { url: string }) => {
    if (e.url.endsWith("/v1/node")) {
      return { value: { status: 200, ok: true, text: JSON.stringify({ id: LOCAL_NODE_ID }) } };
    }
    if (e.url.endsWith("/v1/mesh/snapshot")) {
      return { value: { status: 200, ok: true, text: JSON.stringify(SNAPSHOT) } };
    }
    if (e.url.endsWith("/v1/endpoints")) {
      return { value: { status: 200, ok: true, text: JSON.stringify({ endpoints: ENDPOINTS }) } };
    }
    return { value: { status: 404, ok: false, text: "" } };
  });

  // Open /scout:agents, which lands on the Agents tab
  await $.command.run({ command: "scout:agents", args: "" });

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  // Switch to Agents, which loads the directory
  await ui.press({ key: "tab-agents" });
  // Find narrows to the remote agent, by project
  await ui.input({ key: "find", text: "scoutcore" });
  expect(await ui.find({ type: "Button", text: /^russell-7/ })).toBeDefined();
  expect(await ui.find({ type: "Button", text: /^purcell-3/ })).toBeUndefined();

  await ui.press({ key: "agent-russell-7" });
  expect(fills).toEqual(["ask russell-7: "]);

  await ui.unmount();
});
