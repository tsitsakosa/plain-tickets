# plain-tickets

Keep your tickets as markdown files in the repository, next to the code they are about. plain-tickets creates them from templates, lists them, checks their frontmatter strictly and writes a `BOARD.md` that shows every ticket by status and epic. It also writes the rules for AI coding agents into `AGENTS.md`, so agents handle tickets the same way people do.

It is one small Node package with no dependencies. There is no server, no database and no web UI. You edit tickets in your editor, and git keeps the history.

## Why

- A ticket and the code that closes it can land in the same commit and the same pull request.
- `git log`, `git blame` and code review work on tickets like on any other file.
- Tickets work offline and move with the repository. There is no account and nothing to migrate.
- AI coding agents read and update tickets with the file tools they already have. `AGENTS.md` tells them how.
- The validation is strict. A typo in a status or an epic that does not exist stops the board, so the board never lies.

## Quick start

Requires Node 18.3 or later.

```bash
npm install --save-dev github:tsitsakosa/plain-tickets
```

```bash
npx plain-tickets init --prefix WEB
```

```bash
npx plain-tickets new feature "Add a dark theme" --priority P2
```

`init` creates `tickets.config.json`, the `tickets/` folder, a first ticket, `tickets/BOARD.md` and a tickets section in `AGENTS.md`. `new` prints the path of the new ticket. Open it, fill in the body, then run `npx plain-tickets board`.

plain-tickets is not on the npm registry. Install it from GitHub as above. In a project without a `package.json`, run every command as `npx github:tsitsakosa/plain-tickets <command>`. Do not run `npx plain-tickets` without the local install: npx would look up that name on the registry.

The [`examples/`](examples/) folder has seven sample tickets for a web shop, a bug template and the [board](examples/BOARD.md) they produce.

## Commands

```text
plain-tickets init                  Create the config, the tickets folder, a first ticket, the board
                                    and a tickets section in AGENTS.md. Safe to run again.
plain-tickets new <type> "<title>"  Create the next ticket from its template and print its path.
plain-tickets list                  Show open tickets, one line each.
plain-tickets check                 Validate every ticket, write nothing.
plain-tickets board                 Validate every ticket, then write the board.
plain-tickets guide                 Print the tickets section for AGENTS.md.
```

Every command takes `--config <file>`. Without it, `tickets.config.json` in the current folder is used if it exists.

Exit codes: `0` ok, `1` invalid tickets, `2` bad command, option, config or input. `check` works as a CI step or a pre-commit hook.

### init

```text
$ npx plain-tickets init --prefix WEB
created tickets.config.json
created tickets/
created tickets/WEB-0001-set-up-plain-tickets.md
plain-tickets: wrote tickets/BOARD.md (1 ticket)
created AGENTS.md
```

- `--prefix <PREFIX>` sets the id prefix of a new config. Default: `T`.
- `--skip-agents` leaves `AGENTS.md` alone.

Running `init` again changes nothing that is already set up. It never overwrites the config or a ticket. In `AGENTS.md` it only touches the part between `<!-- plain-tickets:start -->` and `<!-- plain-tickets:end -->`, so run it again after changing the config to update the agent rules.

### new

```text
$ npx plain-tickets new bug "Total is off by one cent" --priority P1 --epic WEB-0002
tickets/WEB-0003-total-is-off-by-one-cent.md
```

- The id is the highest number in the folder plus one.
- The file name slug comes from the title: lowercase a-z, digits and hyphens, at most 50 characters. A title with no a-z letters, for example in Greek, needs `--slug card-payment`.
- `--status` and `--priority` default to `backlog` and `P3` (see `defaults` in the config). `--epic <id>` must name an epic. `--ref <path>` adds to `refs` and can be repeated.
- The body comes from the template for the type. See [Templates](#templates).
- The new ticket is checked like any other before it is written. `new` never overwrites a file.

### list

```text
$ npx plain-tickets list
id         status       priority  type     epic       title
SHOP-0001  in-progress  P1        epic     -          Checkout
SHOP-0002  in-progress  P1        feature  SHOP-0001  Guest checkout without an account
SHOP-0005  review       P3        chore    -          Upgrade the server to Node 24
SHOP-0004  todo         P2        feature  SHOP-0001  Order confirmation email
SHOP-0006  backlog      P4        idea     -          Wishlist

5 of 7 tickets. Closed (done, wontfix) hidden, --all shows them.
```

- Sorted like the board: status, then priority, then id.
- `--all` adds closed tickets. Filter with `--status`, `--type`, `--priority` and `--epic`, each comma-separated: `--status todo,review`. `--epic` shows the epic and its tickets. An unknown value or an id that is not an epic is an error.
- `--json` prints the tickets as JSON, with each `file` path relative to the current folder.
- With invalid tickets, `list` shows the valid ones and exits with `1`.

## Ticket format

One file per ticket, named `<PREFIX>-<digits>-<slug>.md`, for example `T-0042-guest-checkout.md`. The id in the file name and the `id` field must match.

Every ticket starts with YAML frontmatter. All fields are required. The body after the frontmatter is free markdown, unless the config lists required [sections](#config).

```markdown
---
id: T-0003
title: "Total is off by one cent: VAT rounded per line"
type: bug
status: done
priority: P1
epic: T-0001
refs:
  - src/checkout/totals.ts
  - docs/decisions/0003-rounding.md
commits:
  - 4f2a9c1
created: 2026-11-03
updated: 2026-11-05
---

# T-0003: Total is off by one cent: VAT rounded per line

## Description

Carts with three or more items showed a total one cent higher than the invoice.

## Acceptance criteria

- [x] Cart and invoice round VAT once, on the total.

## Notes

Found by support, see the refund on order 1182.
```

### Fields

| Field      | Allowed values (defaults; all lists can be changed in the config)               |
| ---------- | ------------------------------------------------------------------------------- |
| `id`       | `<PREFIX>-####`, the same as the file name                                      |
| `title`    | Any non-empty text. Put it in double quotes if it contains `: ` or `#`          |
| `type`     | `epic`, `feature`, `bug`, `chore`, `idea`                                       |
| `status`   | `in-progress`, `review`, `todo`, `backlog`, `done`, `wontfix`                   |
| `priority` | `P1` (urgent) to `P4` (when there is time)                                      |
| `epic`     | The id of an `epic` ticket, or `null`. An epic cannot belong to another epic    |
| `refs`     | A list of paths, documents or URLs. Empty: `refs: []`                           |
| `commits`  | A list of commit SHAs or ranges like `9b0e7d2..c13f5a8`. Empty: `commits: []`   |
| `created`  | `YYYY-MM-DD`                                                                    |
| `updated`  | `YYYY-MM-DD`, not before `created`                                              |

### Frontmatter syntax

The parser reads a small, strict subset of YAML on purpose:

- `key: value`, `key: null` and `key: []`
- a list as `key:` followed by lines of `  - item` (two spaces, a hyphen, a space)
- values in `"double"` or `'single'` quotes

Anything else, such as a field that appears twice, is an error. `new` quotes values for you.

### Working with tickets

- New ticket: run `plain-tickets new`. Ids are never reused, also not for closed tickets.
- Change status: edit `status` and `updated`, then run `plain-tickets board`.
- Close: set a closed status (`done`, `wontfix`) and list the commits. For `wontfix`, write the reason in the body.
- Link a commit to a ticket: add the SHA to `commits`. You can also add a `Refs: T-0042` footer to the commit message.
- Two branches can create the same id at the same time. `check` reports the duplicate. Give the newer ticket the next free id.

## Templates

`new` builds the body of a ticket from a template. Without one, the body is the title heading and one heading per required section, or `## Description`, `## Acceptance criteria` and `## Notes` when the config requires none.

Set a template per type in the config. Paths are relative to the config file. Keep templates outside the tickets folder, or in a subfolder of it, so they are not read as tickets.

```json
{
  "templates": {
    "bug": "tickets/templates/bug.md"
  }
}
```

A template is the markdown body only. `new` writes the frontmatter. These placeholders are replaced: `{{id}}`, `{{title}}`, `{{type}}` and `{{date}}` (today, `YYYY-MM-DD`). The bug template in the examples:

```markdown
# {{id}}: {{title}}

## Description

What happens, and what should happen instead.

## Steps to reproduce

1. First step.

## Acceptance criteria

- [ ] The steps above no longer show the bug.
- [ ] A test covers it.

## Notes

Reported on {{date}}.
```

If a template misses a required section, `new` refuses to write the ticket and says which section.

## Config

Put a `tickets.config.json` in the project root, or pass `--config <file>`. Every key is optional. Paths are relative to the config file. Unknown keys and values that do not fit are an error, so a typo does not go unnoticed. Without a config file, these defaults apply:

```json
{
  "prefix": "T",
  "idDigits": 4,
  "dir": "tickets",
  "board": "tickets/BOARD.md",
  "types": ["epic", "feature", "bug", "chore", "idea"],
  "statuses": ["in-progress", "review", "todo", "backlog", "done", "wontfix"],
  "priorities": ["P1", "P2", "P3", "P4"],
  "closed": ["done", "wontfix"],
  "defaults": { "status": "backlog", "priority": "P3" },
  "sections": [],
  "templates": {},
  "labels": {
    "title": "Tickets",
    "intro": "Generated by `plain-tickets board` from the ticket frontmatter. Do not edit by hand.",
    "status": "Status",
    "total": "Total",
    "epics": "Epics",
    "noEpic": "No epic",
    "empty": "_No tickets._"
  }
}
```

| Key          | Meaning |
| ------------ | ------- |
| `prefix`     | Id prefix. Capital letters and digits, starting with a letter, like `T`, `WEB` or `APP2`. |
| `idDigits`   | Digits in an id, 1 to 9. Every id has exactly this many. Changing it means renaming the existing tickets. |
| `dir`        | Folder with the tickets. `README.md` and the board file in it are skipped. |
| `board`      | Where to write the board. Must end in `.md`. It can be outside `dir`. |
| `types`      | Allowed types, in the order of the board's count table. The type `epic` groups other tickets. Without it, every `epic` field must be `null`. |
| `statuses`   | Allowed statuses, in board order. Put work in flight first. |
| `priorities` | Allowed priorities, most urgent first. Tickets sort by their position in this list, so `high`, `medium`, `low` works. |
| `closed`     | Statuses that count as finished. `list` hides them. Default: whichever of `done` and `wontfix` are in `statuses`. |
| `defaults`   | `status` and `priority` for `new`. Default: `backlog` (or the last open status) and `P3` (or the last priority). |
| `sections`   | Headings every ticket body must have, as whole lines, like `"## Description"`. `check` and `board` report a missing one. |
| `templates`  | A template file per type for `new`. See [Templates](#templates). |
| `labels`     | Headings and texts of the board, for example to write it in another language. An empty `intro` leaves the line out. |

Values in `types`, `statuses`, `priorities` and `closed` are letters, digits and hyphens. They end up in frontmatter, headings and table cells, so spaces and symbols are not allowed.

## The board

`plain-tickets board` writes a count table and then one section per status, in the order of `statuses`. Within a status, epics come first, then the other tickets grouped by epic, then the tickets without an epic. Each group is sorted by priority, then id. Links point to the ticket files and work on GitHub and in editors.

This is the start of [`examples/BOARD.md`](examples/BOARD.md):

```markdown
# Tickets

Generated by `plain-tickets board` from the ticket frontmatter. Do not edit by hand.

| Status | epic | feature | bug | chore | idea | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| in-progress | 1 | 1 | 0 | 0 | 0 | 2 |
| review | 0 | 0 | 0 | 1 | 0 | 1 |
| todo | 0 | 1 | 0 | 0 | 0 | 1 |
| backlog | 0 | 0 | 0 | 0 | 1 | 1 |
| done | 0 | 0 | 1 | 0 | 0 | 1 |
| wontfix | 0 | 1 | 0 | 0 | 0 | 1 |
| **Total** | 1 | 3 | 1 | 1 | 1 | 7 |

## in-progress (2)

### Epics

- [SHOP-0001](tickets/SHOP-0001-checkout.md) P1 · epic · Checkout

### [SHOP-0001](tickets/SHOP-0001-checkout.md) Checkout

- [SHOP-0002](tickets/SHOP-0002-guest-checkout.md) P1 · feature · Guest checkout without an account
```

Commit the board with the tickets, so it is readable on GitHub without running anything.

## When a ticket is invalid

The board is not written and every problem is listed, with the file and the reason:

```text
$ npx plain-tickets board
plain-tickets: tickets/BOARD.md was not written. Fix these 4 problems:
  tickets/SHOP-0001-checkout.md: missing "priority"
  tickets/SHOP-0004-confirmation-email.md: status "open" is not one of in-progress, review, todo, backlog, done, wontfix
  tickets/confirmation-email.md: the file name must be SHOP-####-short-slug.md
  tickets/SHOP-0002-guest-checkout.md: epic SHOP-0009 does not exist
```

It also catches duplicate ids, an id that does not match its file name, an epic link to a ticket that is not an epic, unknown fields, bad dates, `updated` before `created` and missing required sections.

## AI coding agents

[AGENTS.md](https://agents.md/) is an open format for instructions to coding agents: plain markdown in the repository root, with no required fields. When there are several, the one closest to the edited file wins.

`plain-tickets init` adds a tickets section to `AGENTS.md`, or creates the file. The section is generated from your config, so it lists your own types, statuses, priorities and required sections. It uses `npx --no plain-tickets` when the project has plain-tickets in its `package.json`, and `npx github:tsitsakosa/plain-tickets` otherwise. With `--no`, npx refuses to install a missing package, so an agent in a fresh clone gets an error instead of a package from the registry. Run `npm install` first. To paste it somewhere else, print it with `plain-tickets guide`. Run `init` again after you change the config.

With the default config it reads:

```markdown
## Tickets

Work is tracked as markdown files in `tickets/`, one file per ticket, with [plain-tickets](https://github.com/tsitsakosa/plain-tickets). `tickets/BOARD.md` is generated: never edit it by hand.

### Commands

- `npx --no plain-tickets list`: open tickets, one line each. Add `--all` for closed ones, `--json` for JSON, or filter with `--status`, `--type`, `--priority`, `--epic` (comma-separated).
- `npx --no plain-tickets new <type> "<title>"`: creates the next ticket from its template and prints the path. Options: `--priority`, `--status`, `--epic T-0001`, `--ref <path>` (repeatable), `--slug <short-slug>` (needed when the title has no a-z letters).
- `npx --no plain-tickets check`: validates every ticket and names each problem.
- `npx --no plain-tickets board`: validates every ticket, then rewrites `tickets/BOARD.md`.

### Rules

- `type`: `epic`, `feature`, `bug`, `chore`, `idea`. `priority`: `P1`, `P2`, `P3`, `P4`, most urgent first.
- `status`: `in-progress`, `review`, `todo`, `backlog`, `done`, `wontfix`. Open: `in-progress`, `review`, `todo`, `backlog`. Closed: `done`, `wontfix`.
- Create tickets with `new`, never by choosing an id yourself. Ids are never reused, and tickets are not deleted: close them.
- If `check` reports a duplicate id (two branches created one at the same time), give the newer ticket the next free id: rename the file and change `id`.
- Write the title and body in the language the existing tickets use.
- Fill every section of the body that the template created.
- On every edit, set `updated` to today (YYYY-MM-DD). Put related files, docs and URLs in `refs`.
- Change `status` when the work moves. When closing, add the commit SHAs or ranges to `commits` and tick the checklist items that are done. If the work will not be done, write why in the body.
- After changing tickets, run `npx --no plain-tickets board` and commit the tickets and `tickets/BOARD.md` together with the code they describe.

### Reporting ticket state

- Run `npx --no plain-tickets list` to see the state. Do not read every ticket file or paste the board.
- Report briefly: group by status, one line per ticket with id, title and priority, and link the file.
- After a change, say which ids you created, moved or closed.
```

Which tools read `AGENTS.md`, checked in November 2026:

| Tool | What to do |
| ---- | ---------- |
| OpenAI Codex, Cursor, Devin Desktop | Nothing. They read `AGENTS.md`. |
| GitHub Copilot | Nothing for the cloud agent, code review, VS Code and Copilot CLI. They read `AGENTS.md`. |
| Claude Code | Nothing, unless the project has a `CLAUDE.md`. Claude Code then reads `CLAUDE.md` instead, so add the line `@AGENTS.md` to it. `init` reminds you. |
| Gemini CLI | Add `"AGENTS.md"` to `context.fileName` in `.gemini/settings.json`. It reads `GEMINI.md` by default. |
| Aider | Add `read: AGENTS.md` to `.aider.conf.yml`. |

Sources: [agents.md](https://agents.md/), [Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Cursor](https://cursor.com/docs/context/rules), [Devin Desktop](https://docs.devin.ai/desktop/cascade/agents-md), [GitHub Copilot](https://docs.github.com/en/copilot/reference/custom-instructions-support), [Claude Code](https://code.claude.com/docs/en/memory), [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/).

## Use from code

```js
import { loadConfig, readTickets, renderBoard, listTickets, formatList } from 'plain-tickets'

const config = loadConfig(process.cwd())
const { tickets, byId, problems } = readTickets(config)
if (!problems.length) console.log(renderBoard(tickets, byId, config))
console.log(formatList(listTickets(tickets, config, { status: ['todo'] })).join('\n'))
```

Also exported: `parseTicket`, `parseFrontmatter`, `validate`, `checkTicket`, `createTicket`, `nextId`, `slugify`, `agentGuide` and `upsertBlock`. Only the CLI writes files.

## Similar tools

The idea is not new. These tools do more. Checked in November 2026.

- [Backlog.md](https://github.com/MrLesk/Backlog.md) stores tasks the same way: one markdown file with YAML frontmatter per task, in a folder in the project. It has a larger CLI, a Kanban board in the terminal and in the browser, and MCP support for AI agents, and it also writes agent instructions. TypeScript, MIT. Choose it if you want those views. plain-tickets stays a small set of commands over plain files, with configurable strict validation.
- [git-bug](https://github.com/git-bug/git-bug) stores issues as git objects under their own refs, not as files in the working tree. It has a CLI, a terminal UI, a web UI and bridges to GitHub, GitLab and Jira. Go binary, GPL-3.0. plain-tickets keeps tickets as ordinary files that you read, diff and review in pull requests.
- [Fossil](https://fossil-scm.org/home/doc/trunk/www/bugtheory.wiki) has a ticket system built into its version control, kept in the repository's SQLite database and used mainly through Fossil's web UI. It only works with Fossil. plain-tickets is an add-on for any git repository.

## Development

```bash
npm test
```

The tests use `node:test` and need no install. They also check that `examples/BOARD.md` and the agent guide in this README match what the code generates. After changing the example tickets, run `npm run example`. After changing the guide, update the copy above. See [AGENTS.md](AGENTS.md) for the rules of this repository.

## License

[MIT](LICENSE)
