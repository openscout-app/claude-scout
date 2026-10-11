import { expect, mock, test } from "claude-code/testing";

import { bandText, invocationIdsIn, SCOUT_ASK_COMMAND, visibleFlights } from "../hooks/trace.js";

const BAND = {
  plugin: "scout",
  component: "AbovePrompt",
  requestId: "above-prompt",
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 116,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const;

function invocation(state: string, extra: Record<string, unknown> = {}) {
  return {
    invocationId: "inv-abc123-xyz9",
    flight: {
      state,
      targetAgentId: "session-mv2pax79-ww6skk",
      startedAt: 1_000,
      metadata: { targetDisplayName: "purcell-3" },
      ...extra,
    },
  };
}

test("invocation ids come out of MCP and CLI results", () => {
  expect(invocationIdsIn({ content: [{ type: "text", text: "flight flt-a1-b2 for inv-abc123-xyz9" }] })).toEqual([
    "inv-abc123-xyz9",
  ]);
  expect(invocationIdsIn("inv-a1-b2 inv-a1-b2 inv-c3-d4")).toEqual(["inv-a1-b2", "inv-c3-d4"]);
  expect(invocationIdsIn(undefined)).toEqual([]);
});

test("only scout ask commands are watched", () => {
  expect(SCOUT_ASK_COMMAND.test('scout ask --to hudson "look"')).toBe(true);
  expect(SCOUT_ASK_COMMAND.test("cd x && scout --json ask --to a b")).toBe(true);
  expect(SCOUT_ASK_COMMAND.test("scout status ref:1")).toBe(false);
  expect(SCOUT_ASK_COMMAND.test("echo askscout ask")).toBe(false);
});

test("finished flights linger briefly, then leave the band", () => {
  const live = { invocationId: "a", target: "a", state: "running", startedAt: 0 };
  const done = { invocationId: "b", target: "b", state: "completed", startedAt: 0, completedAt: 10_000 };
  expect(visibleFlights([live, done], 20_000)).toHaveLength(2);
  expect(visibleFlights([live, done], 200_000)).toEqual([live]);
  expect(bandText([live, done], 240_000)).toBe("a working 4m · b done");
});

test("an ask shows one band line, then a toast when it finishes", async ($, on) => {
  const clock = mock.clock(on);
  mock.store(on, {});
  mock.env(on, {});
  let state = "running";
  const toasts: string[] = [];
  on("session.start", () => ({ cwd: "/work" }));
  on("session.id", () => ({ value: "s1" }));
  on("command.register", () => ({ value: undefined }));
  on("http.fetch", () => ({ value: { ok: true, status: 200, text: JSON.stringify(invocation(state)) } }));
  on("ui.toast", ($, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  on("tool.call", () => ({ result: { content: [{ type: "text", text: "asked purcell-3: inv-abc123-xyz9" }] } }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

  const idle = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await idle.find({ type: "Text", text: /^scout / })).toBeUndefined();
  await idle.unmount();

  await $.tool.call({ tool: "mcp__scout__ask", to: "purcell-3", body: "look" });
  await clock.advance(3000);
  const band = await $.ui.mount({ ...BAND, surface: "terminal" });
  expect(await band.find({ type: "Text", text: /^scout {2}purcell-3 working/ })).toBeDefined();
  await band.unmount();

  state = "completed";
  await clock.advance(3000);
  expect(toasts).toEqual(["purcell-3 done"]);
});

test("namespaced file commands avoid native aliases and preserve the user's /scout", async ($, on) => {
  mock.clock(on);
  mock.store(on, {});
  mock.env(on, {});
  on("session.id", () => ({ value: "s-command-files" }));
  on("command.list", () => ({ value: [{ name: "scout:agents" }, { name: "scout:trace" }, { name: "scout" }] }));
  const registered: string[] = [];
  on("command.register", ($, e) => {
    registered.push(e.name);
    return { value: undefined };
  });
  on("session.start", () => ({ cwd: "/work" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  expect(registered).toEqual([]);
  expect(await $.command.run({ command: "scout:trace", args: "" })).toEqual({ text: "No Scout asks from this session yet." });
});

test("a refused registration cannot stop the other registration or session startup", async ($, on) => {
  const clock = mock.clock(on);
  mock.store(on, {});
  mock.env(on, {});
  on("session.id", () => ({ value: "s-refused-command" }));
  on("command.list", () => ({ value: [] }));
  const registered: string[] = [];
  on("command.register", ($, e) => {
    registered.push(e.name);
    if (e.name === "agents") throw new Error("User command already owns this name");
    return { value: undefined };
  });
  let continued = false;
  on("session.start", () => {
    continued = true;
    return { cwd: "/work" };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await clock.advance(3000);
  expect(registered).toEqual(["agents", "trace"]);
  expect(registered.includes("scout")).toBe(false);
  expect(continued).toBe(true);
});
