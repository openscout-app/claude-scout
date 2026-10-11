// Pure helpers for the trace: no mods API, so tests can call them directly.

const INVOCATION_ID = /\binv-[a-z0-9]+-[a-z0-9]+\b/g;

export const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

/** Tools whose results carry the invocation ids of asks this session made. */
export const ASK_TOOL = /^mcp__(?:plugin_[\w-]+_)?scout__ask$/;
// The generated /scout:ask command runs the companion through node, rather
// than spelling "scout ask" in Bash. Watch both entry points.
export const SCOUT_ASK_COMMAND = /(?:^|[\s;&|(])(?:scout\s+(?:--json\s+)?ask\b|node\s+(?:"[^"\n]*\/scout-companion\.mjs"|'[^'\n]*\/scout-companion\.mjs'|[^\s"';&|]*\/scout-companion\.mjs)\s+ask\b)/;

/** Every invocation id mentioned in a tool result, in order, without repeats. */
export function invocationIdsIn(result) {
  let text;
  try {
    text = typeof result === "string" ? result : JSON.stringify(result);
  } catch {
    return [];
  }
  if (!text) return [];
  return [...new Set(text.match(INVOCATION_ID) ?? [])];
}

/** The fields the trace keeps from GET /v1/invocations/:id. */
export function flightFromInvocation(body, previous = {}) {
  const flight = body?.flight ?? {};
  const meta = flight.metadata ?? {};
  return {
    ...previous,
    invocationId: body?.invocationId ?? previous.invocationId,
    target:
      meta.targetDisplayName ??
      previous.target ??
      shortAgent(flight.targetAgentId ?? body?.invocation?.targetAgentId),
    state: flight.state ?? previous.state ?? "queued",
    summary: typeof flight.summary === "string" ? flight.summary : previous.summary,
    startedAt: flight.startedAt ?? previous.startedAt,
    completedAt: flight.completedAt ?? previous.completedAt,
  };
}

function shortAgent(id) {
  if (typeof id !== "string" || !id) return "agent";
  return id.split(".")[0];
}

export function isLive(flight) {
  return !TERMINAL_STATES.has(flight.state);
}

/** Live flights, plus finished ones for `lingerMs` after they finish. */
export function visibleFlights(flights, now, lingerMs = 90_000) {
  return flights.filter(
    (f) => isLive(f) || (f.completedAt != null && now - f.completedAt < lingerMs),
  );
}

export function elapsed(ms) {
  if (!(ms >= 0)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

const STATE_WORD = {
  queued: "queued",
  waking: "waking",
  running: "working",
  waiting: "waiting",
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
};

export function stateWord(state) {
  return STATE_WORD[state] ?? state ?? "?";
}

export function flightAge(flight, now) {
  const end = isLive(flight) ? now : (flight.completedAt ?? now);
  return flight.startedAt != null ? elapsed(end - flight.startedAt) : "";
}

/** One line for the band: "purcell-3 working 4m · russell-7 done", at most `max` named. */
export function bandText(flights, now, max = 3) {
  const parts = flights.slice(0, max).map((f) => {
    const age = isLive(f) ? flightAge(f, now) : "";
    return [f.target, stateWord(f.state), age].filter(Boolean).join(" ");
  });
  if (flights.length > max) parts.push(`+${flights.length - max}`);
  return parts.join(" · ");
}
