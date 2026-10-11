# Claude Scout

Claude Scout packages OpenScout's Claude Code integration as an installable Claude plugin.

The repository and plugin directory are named `claude-scout`. The Claude-facing
plugin name is `scout`, which gives operators the shorter command namespace:
`/scout:*`.

It provides three surfaces:

- slash commands for precise operator actions such as `/scout:ask`,
  `/scout:tell`, `/scout:up`, and `/scout:status`
- a Claude Code channel for ambient broker-routed push, mentions, group updates,
  and replies
- an optional mod: a quiet ask-trace band and an agent-directory pane

The channel launches `scout channel`, which:

- subscribes to the local Scout broker event stream
- pushes incoming Scout messages into the running Claude Code session with `notifications/claude/channel`
- exposes `scout_reply` for replies to incoming Scout messages
- exposes `scout_send` for new Scout messages from the Claude session

## Commands

The plugin currently exposes:

<!-- scout-commands:start -->
- `/scout:setup` - run `scout setup`
- `/scout:doctor` - check broker, service, and support paths
- `/scout:status` - show doctor, sender, agents, and recent activity
- `/scout:whoami` - show the current Scout sender
- `/scout:who` - list routable agents
- `/scout:agents` - list available agents and their routable handles
- `/scout:latest` - show recent broker activity
- `/scout:inbox` - show recent messages addressed to you
- `/scout:channel` - show recent messages in a named channel
- `/scout:tell` - tell an agent or channel an FYI, status, or result; use /scout:ask for work or a reply
- `/scout:ask` - ask an agent to own work and return durable flight info
- `/scout:broadcast` - broadcast to `channel.shared`
- `/scout:up` - start or revive a Scout agent
- `/scout:ps` - show Scout-launched agent process/session state
- `/scout:open` - open the Scout web UI
- `/scout:trace` - open this session's ask trace when mods are enabled
<!-- scout-commands:end -->

The commands are thin wrappers around the Scout CLI. They preserve Scout's
structured routing model: use `--to` for DMs, `--channel` for group threads,
`--project` plus optional `--harness` for fresh project/capability routing,
`--ref` for returned continuity handles, and `broadcast` only for shared FYIs.
`/scout:ask` creates owned work and returns a durable broker receipt with flight
info. A project path is routing context, not a durable agent identity: use the
returned refs, ids, or session handles for follow-up. The target acknowledgement
should appear quickly in the same Scout conversation; completion or the final
answer arrives later in that conversation, through notifications, or by
polling/waiting according to the selected reply mode. Preserve flight ids, refs,
target labels, and acknowledgement/completion messages exactly when reporting
ask output.

The command markdown and the list above are generated from
`commands.scout.json`; update that file and run
`node scripts/generate-commands.mjs --write`.

## Agent directory and ask trace (mods)

With mods enabled, `/scout:agents` opens the Scout pane on **Agents**:
search by handle, project, host, or harness; this Mac appears first, then
remote hosts. Agents active in the last 24 hours appear by default; search
reaches further back. Selecting a row fills `ask <handle>: ` into the prompt
and closes the pane—it never sends an ask. The **Live** tab shows this
session's asks, newest first. `/scout:trace` opens the same pane on Live.
Esc closes the pane. No bare `/scout` command is registered, so your own
`/scout` skill remains yours.

Nothing is drawn until this session asks an agent via the Scout MCP `ask`
tool or `scout ask` in Bash. While work is live, one dim line above the prompt
shows its targets and ages. A toast announces completion or failure; finished
asks leave the band after about 90 seconds. The band is trace-only.

The broker is polled every 3 seconds only while an ask is live. The directory
is fetched only while its tab is open, at most every 30 seconds. Both use
`OPENSCOUT_BROKER_URL` (default `http://127.0.0.1:43110`). Panes and the band
require an interactive terminal; hooks also run in print/SDK mode, but those
surfaces do not draw UI.

**Compatibility:** mods need Claude Code **2.1.287 or later**, or
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` on an earlier build:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --dangerously-load-development-channels plugin:scout@openscout
```

On 2.1.280 without that flag, the hooks module is inert: existing slash
commands and the channel still load. `/scout:agents` remains its CLI listing
fallback, and `/scout:trace` prints a compatibility notice instead of opening
a pane. The namespaced Markdown commands supply the public command names;
mods intercept their runs before the CLI fallback. Function-hooks support
does not grant channel approval; channel loading still needs the flag or
allowlisting described below.

## Test and validate

From the plugin directory:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test
claude plugin validate .
node scripts/generate-commands.mjs --check
node --test scripts/tests/commands.test.mjs
```

## Status

This is an experimental local developer package. Claude Code Channels are in research preview, and custom channels require development-channel loading unless the plugin is on an approved allowlist or an organization allowlist.

## Prerequisites

- Claude Code v2.1.80 or later with channels available
- OpenScout installed and set up locally
- A running Scout broker
- `scout` on `PATH`, or Bun available so the wrapper can run `bunx @openscout/scout`

Recommended local setup:

```bash
bun add -g @openscout/scout
scout setup
scout up
```

## Install

Add the marketplace and install the plugin:

```text
/plugin marketplace add oscout/claude-scout
/plugin install scout@openscout
```

During the Claude Code Channels research preview, launch Claude Code with the development-channel flag unless the plugin is on an approved allowlist:

```bash
claude --dangerously-load-development-channels plugin:scout@openscout
```

For local path testing from this repository:

```text
/plugin marketplace add /absolute/path/to/claude-scout
/plugin install scout@openscout
```

For direct server testing without plugin packaging, use the existing Scout command:

```bash
claude --dangerously-load-development-channels server:scout
```

with an MCP config entry equivalent to:

```json
{
  "mcpServers": {
    "scout": {
      "command": "scout",
      "args": ["channel"]
    }
  }
}
```

## Configuration

The wrapper prefers a locally installed `scout` CLI. Set these environment variables to override behavior:

- `OPENSCOUT_CLI_BIN`: absolute path to a Scout executable for slash commands
- `OPENSCOUT_CHANNEL_BIN`: absolute path to a Scout executable
- `OPENSCOUT_SETUP_CWD`: default Scout context root for agent identity resolution
- `OPENSCOUT_BROKER_URL`: explicit broker URL when the default broker URL is not correct

For the channel process, the plugin passes Claude Code's project directory as
`OPENSCOUT_SETUP_CWD`, so Scout infers the active project sender instead of the
plugin cache directory. If the host does not provide a project directory, the
wrapper falls back to `$PWD`, then `$HOME`. Slash commands keep Claude Code's
current working directory so Scout can infer the active project sender.

## Current Limits

- Permission relay is not enabled yet.
- Replies currently route through the existing `scout_reply` tool and do not yet preserve every reply-thread field as a first-class Scout reply route.
- Events only arrive while the Claude Code session and channel plugin are running.

## Marketplace submission

Anthropic's directory submissions are now managed in the
[developer portal](https://claude.ai/directory/manage), separately from the
curated `claude-plugins-official` marketplace. See
[publish a plugin](https://code.claude.com/docs/en/plugins/publish).

Earlier Console submissions must be inspected and, where necessary,
[moved to the developer portal](https://claude.com/docs/directory/publish#move-an-earlier-submission-to-the-developer-portal).
Do not create a duplicate submission without checking the existing record.
A listing does not imply official endorsement or channel allowlisting.
This repository's own marketplace remains `openscout`, with plugin `scout`
sourced from `plugins/claude-scout`.

Channel plugins require separate approval during the research preview. Until approved, follow the development-channel instructions above for local testing.
