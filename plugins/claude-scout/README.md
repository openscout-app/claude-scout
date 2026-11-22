# Claude Scout

Claude Scout packages OpenScout's Claude Code integration as an installable Claude plugin.

The repository and plugin directory are named `claude-scout`. The Claude-facing
plugin name is `scout`, which gives operators the shorter command namespace:
`/scout:*`.

It works in Claude Code, on a host where Scout is installed. It does nothing
in Claude chat on the web or in Cowork, because both parts run the Scout CLI
on your computer.

It provides two surfaces:

- slash commands for precise operator actions such as `/scout:ask`,
  `/scout:tell`, `/scout:up`, and `/scout:status`
- a Claude Code channel for ambient runtime-routed push, mentions, group updates,
  and replies

The channel launches `scout channel`, which:

- subscribes to the local Scout runtime's event stream
- pushes incoming Scout messages into the running Claude Code session with `notifications/claude/channel`
- exposes `scout_reply` for replies to incoming Scout messages
- exposes `scout_send` for new Scout messages from the Claude session

## Commands

The plugin currently exposes:

<!-- scout-commands:start -->
- `/scout:setup` - run `scout setup`
- `/scout:doctor` - check runtime, service, and support paths
- `/scout:status` - show doctor, sender, agents, and recent activity
- `/scout:whoami` - show the current Scout sender
- `/scout:who` - list routable agents
- `/scout:agents` - list available agents and their routable handles
- `/scout:latest` - show recent runtime activity
- `/scout:inbox` - show recent messages addressed to you
- `/scout:channel` - show recent messages in a named channel
- `/scout:tell` - tell an agent or channel an FYI, status, or result; use /scout:ask for work or a reply
- `/scout:ask` - ask an agent to own work and return durable flight info
- `/scout:broadcast` - broadcast to `channel.shared`
- `/scout:up` - start or revive a Scout agent
- `/scout:ps` - show Scout-launched agent process/session state
- `/scout:open` - open the Scout web UI
<!-- scout-commands:end -->

The commands are thin wrappers around the Scout CLI. They preserve Scout's
structured routing model: use `--to` for DMs, `--channel` for group threads,
`--project` plus optional `--harness` for fresh project/capability routing,
`--ref` for returned continuity handles, and `broadcast` only for shared FYIs.
`/scout:ask` creates owned work and returns a durable runtime receipt with flight
info. A project path is routing context, not a durable agent identity: use the
returned refs, ids, or session handles for follow-up. The target acknowledgement
should appear quickly in the same Scout conversation; completion or the final
answer arrives later in that conversation, through notifications, or by
polling/waiting according to the selected reply mode. Preserve flight ids, refs,
target labels, and acknowledgement/completion messages exactly when reporting
ask output.

The command markdown and the list above are generated from
`commands.scout.json`; update that file and run
`node scripts/generate-commands.mjs --write` from the repository root.

## Status

This is an experimental local developer package. Claude Code Channels are in research preview, and custom channels require development-channel loading unless the plugin is on an approved allowlist or an organization allowlist.

## Prerequisites

- Claude Code v2.1.80 or later with channels available
- OpenScout installed and set up locally
- A running Scout runtime
- `scout` on `PATH`, or Bun available so the wrapper can run `bunx @openscout/scout@0.5.3`

Recommended local setup:

```bash
bun add -g @openscout/scout
scout setup
scout up
```

## Install

Add the marketplace and install the plugin:

```text
/plugin marketplace add openscout-app/claude-scout
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
- `OPENSCOUT_SETUP_CWD`: default Scout context root for agent identity resolution
- `OPENSCOUT_BROKER_URL`: the Scout runtime's URL, when the default is not correct

For the channel process, the launcher sets `OPENSCOUT_SETUP_CWD` from
`CLAUDE_PROJECT_DIR` in its environment, so Scout infers the active project
sender instead of the plugin cache directory. If that variable is not set, the
launcher falls back to its working folder, then your home folder. Slash commands keep Claude Code's
current working directory so Scout can infer the active project sender.

## Current Limits

- Permission relay is not enabled yet.
- Replies currently route through the existing `scout_reply` tool and do not yet preserve every reply-thread field as a first-class Scout reply route.
- Events only arrive while the Claude Code session and channel plugin are running.

## What the plugin runs and sends

The plugin's own code is two small Node scripts that start the Scout CLI. All
of Scout's work happens in that CLI and in the Scout runtime on your machine.

- **The channel.** Claude Code starts `node scripts/run-scout-channel.mjs`, which runs
  `scout channel`. That process connects to the local Scout runtime, passes
  Scout messages into the session, and sends your replies back to the runtime.
- **The slash commands.** Each `/scout:*` command runs
  `node scripts/scout-companion.mjs`, which maps it to one `scout` command and
  prints the result. Commands run only when you type them; Claude can't invoke
  them on its own.
- **Which Scout it runs.** The channel runs `scout` on `PATH`. Slash commands
  run `OPENSCOUT_CLI_BIN` when set, then `scout` on `PATH`. If neither exists and Bun is installed, it runs
  `bunx @openscout/scout@0.5.3`, which downloads that exact release from the
  npm registry.
- **What Claude can do on its own.** The channel gives Claude two tools:
  `scout_reply` answers a Scout message that reached the session, and
  `scout_send` sends a new Scout message. Claude Code asks before it uses them,
  unless you allow them in your permission settings.
- **What some commands start.** `/scout:setup` configures project discovery
  and installs and starts the Scout runtime as a background service.
  `/scout:up` starts an agent session (Claude Code or another harness) for a
  project. `/scout:ask` can hand work to an agent on this host or on another
  host connected to your Scout runtime. `/scout:open` opens Scout's local web
  page in your browser.
- **What leaves your machine.** The plugin sends nothing anywhere itself.
  Messages go to your local Scout runtime, which delivers them to the agents and
  hosts you have connected to it. The plugin collects no analytics and reads no
  credentials.

## Directory listing

The plugin is submitted to the Claude plugin directory from the developer
portal at [claude.ai/directory/manage](https://claude.ai/directory/manage), as a
plugin bundle with the folder `plugins/claude-scout`. Before you submit a new
version, raise `version` in `plugin.json` and run
`claude plugin validate plugins/claude-scout --profile directory`.

Channel plugins require separate approval during the research preview. Until
approved, follow the development-channel instructions above for local testing.
