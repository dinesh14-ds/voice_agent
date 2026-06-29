# OpenCode Custom Setup — Install Guide

This package gives you a customized OpenCode installation with:

- **3 custom meta-agents** (athena-god, Athena-Max, athena)
- **6 sub-agents** for delegating specialized work
- **An improver memory system** that logs patterns, decisions, plugins, skills, and token usage across sessions

Drop the contents of this folder into `~/.config/opencode/` and you get the same setup.

---

## What's in this folder

```
D:\Custom-agent\
├── agents\            ← 9 agent definitions (3 meta + 6 sub)
├── improver\          ← 7 memory/log files (the "persistent brain")
└── INSTALL.md         ← this file
```

### agents/ (9 files)

| File | Role |
|---|---|
| `Athena-god.md` | Default meta-agent. Full local control, no confirmations. |
| `Athena-Max.md` | High-power meta-agent variant. |
| `Athena.md` | Ask-first meta-agent. Confirms before running shell commands. |
| `backend.md` | Sub-agent for APIs, auth, server-side logic. |
| `frontend.md` | Sub-agent for UI/UX, React/Vue/etc. |
| `general.md` | Sub-agent for cross-domain tasks. |
| `testing.md` | Sub-agent for unit/integration/e2e tests. |
| `explore.md` | Sub-agent for codebase exploration. |
| `hermes.md` | Sub-agent for learning new tools/libs on demand. |

### improver/ (7 files)

| File | What it stores |
|---|---|
| `knowledge.md` | Durable learnings, patterns, decisions with outcomes. |
| `plugins.md` | Every MCP server installed — what it does, why, footprint. |
| `skills.md` | Every skill installed — source, install command, purpose. |
| `token-audit.md` | Token-heavy patterns observed and fixes applied. |
| `changelog.md` | Dated log of every config change with rationale. |
| `session-handoff.md` | Compressed snapshot of the current session. |
| `agent-permissions.md` | Notes on the 3 meta-agents — when to use which. |

---

## Install

### Windows (PowerShell)

```powershell
# Create target dirs if they don't exist
New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\agents" -Force | Out-Null
New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\improver" -Force | Out-Null

# Copy the agents and improver memory
Copy-Item -Path ".\agents\*"        -Destination "$env:USERPROFILE\.config\opencode\agents\"   -Force
Copy-Item -Path ".\improver\*"      -Destination "$env:USERPROFILE\.config\opencode\improver\" -Force
```

### macOS / Linux (bash / zsh)

```bash
mkdir -p ~/.config/opencode/agents
mkdir -p ~/.config/opencode/improver

cp ./agents/*   ~/.config/opencode/agents/
cp ./improver/* ~/.config/opencode/improver/
```

### Set the default agent (optional)

Edit `~/.config/opencode/opencode.json` and add:

```json
{
  "default_agent": "athena-god"
}
```

### Restart OpenCode

Close and reopen your OpenCode session. The new agents and improver memory will load on the next session start.

---

## Verify it worked

After restarting, try these prompts with your agent:

- *"List the 3 meta-agents and explain when to use each."*
- *"What files are in the improver folder and what does each one do?"*
- *"Show me the most recent entry in changelog.md."*
- *"Compare athena-god and athena — which is right for X?"*

If the agent reads from `improver/knowledge.md` and `improver/agent-permissions.md` to answer, your setup is working.

---

## Sample prompts you can paste

### Discover what's installed

```
Read ~/.config/opencode/improver/plugins.md and ~/.config/opencode/improver/skills.md.
Summarize what MCPs and skills are configured, and which ones might be unused.
```

### Use the improver system

```
Add this discovery to knowledge.md: [your finding here].
Then update changelog.md with a dated entry explaining what changed and why.
```

### Audit token usage

```
Read token-audit.md. Based on what's logged there, what are the top 3
token-cost patterns you've observed, and what's the proposed fix for each?
```

### Decide which agent to use

```
Compare athena-god and athena. I want to [describe your task].
Which one should I use, and why?
```

---

## How the improver system actually works

The 7 files in `improver/` are the agent's **persistent memory across sessions**. The flow is:

```
Session starts
   ↓
Agent reads all 7 improver files → "prior knowledge"
   ↓
Makes decisions without re-researching
   ↓
After every meaningful action
   ↓
Appends a dated entry to the relevant file(s)
   ↓
Session ends — files persist, ready for next session
```

**Why this matters:** A 30-message session can cost 40 KB of context. If the improver memory lets the next session pick up at 2 KB instead, that's a **20x cost reduction** for the same continuity.

The files are deliberately small and structured (bullet points, not prose) so re-reading them at session start is cheap.

---

## Customizing

After using this for a while, you'll want to evolve it. The right moves:

- **Add to `knowledge.md`** when you discover a pattern that future sessions would benefit from.
- **Update `plugins.md` / `skills.md`** when you install or remove something.
- **Log in `token-audit.md`** whenever you notice an agent is being wasteful (verbose prompts, redundant tool calls, etc.).
- **Append to `changelog.md`** whenever you change a config — even small ones. The audit trail pays off months later.

---

## License

Use freely. No warranty. Have fun.
