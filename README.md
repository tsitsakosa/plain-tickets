# plain-tickets

Keep your tickets as markdown files in the repository, next to the code they are about. plain-tickets checks their frontmatter and writes a `BOARD.md` that shows every ticket by status and epic.

It is one small Node script with no dependencies. There is no server, no database and no web UI. You create and edit tickets in your editor, and git keeps the history.

## Why

- A ticket and the code that closes it can land in the same commit and the same pull request.
- `git log`, `git blame` and code review work on tickets like on any other file.
- Tickets work offline and move with the repository. There is no account and nothing to migrate.
- AI coding agents can read and update tickets with the file tools they already have.
- The validation is strict. A typo in a status or an epic that does not exist stops the board, so the board never lies.

## Install

Requires Node 18.3 or later. Run it without installing:

```bash
npx github:tsitsakosa/plain-tickets board
```

Or add it to the project:

```bash
npm install --save-dev github:tsitsakosa/plain-tickets
```

and add a script to `package.json`:

```json
{
  "scripts": {
    "tickets": "plain-tickets board"
  }
}
```

## Quick start

1. Create a `tickets/` folder.
2. Add a ticket, for example `tickets/T-0001-first-ticket.md` (see the format below).
3. Run `npx github:tsitsakosa/plain-tickets board`.
4. Open `tickets/BOARD.md`.

The [`examples/`](examples/) folder has seven sample tickets for a web shop and the [board](examples/BOARD.md) they produce. To build it yourself:

```bash
cd examples
npx github:tsitsakosa/plain-tickets board
```

## Commands

```text
plain-tickets board [--config <file>]   Validate every ticket, then write the board.
plain-tickets check [--config <file>]   Validate every ticket, write nothing.
```

Both exit with `1` when a ticket is invalid, so `check` works as a CI step or a pre-commit hook. A bad command, option or config exits with `2`.

## Ticket format

One file per ticket, named `<PREFIX>-<4 digits>-<slug>.md`. The slug is lowercase letters, digits and hyphens, for example `T-0042-guest-checkout.md`. The id in the file name and the `id` field must match.

Every ticket starts with YAML frontmatter. All fields are required. The body after the frontmatter is free markdown and is not checked.

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

The body sections above are a suggestion. Use whatever helps your team.

### Fields

| Field      | Allowed values                                                                  |
| ---------- | ------------------------------------------------------------------------------- |
| `id`       | `<PREFIX>-####`, the same as the file name                                      |
| `title`    | Any non-empty text. Put it in double quotes if it contains `: ` or `#`          |
| `type`     | `epic`, `feature`, `bug`, `chore`, `idea`                                       |
| `status`   | `backlog`, `todo`, `in-progress`, `review`, `done`, `wontfix`                   |
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

Anything else, such as a field that appears twice, is an error.

### Working with tickets

- New ticket: take the highest id in the folder plus one. Ids are never reused, also not for `wontfix` tickets.
- Change status: edit `status` and `updated`, then run `plain-tickets board`.
- Close: set `status: done` and list the commits. For `wontfix`, write the reason in the body.
- Link a commit to a ticket: add the SHA to `commits`. You can also add a `Refs: T-0042` footer to the commit message.

## Config

Put a `tickets.config.json` in the folder where you run the command, or pass `--config <file>`. Every key is optional. Paths are relative to the config file. Without a config file, these defaults apply:

```json
{
  "prefix": "T",
  "dir": "tickets",
  "board": "tickets/BOARD.md",
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

| Key      | Meaning                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| `prefix` | Id prefix. Capital letters and digits, starting with a letter, like `T`, `WEB` or `APP2` |
| `dir`    | Folder with the tickets. `README.md` and the board file in it are skipped                 |
| `board`  | Where to write the board. Must end in `.md`. It can be outside `dir`                      |
| `labels` | Headings and texts of the board, for example to write it in another language. An empty `intro` leaves the line out |

Unknown keys are an error, so a typo in the config does not go unnoticed.

## The board

`plain-tickets board` writes a count table and then one section per status, in this order: `in-progress`, `review`, `todo`, `backlog`, `done`, `wontfix`. Within a status, epics come first, then the other tickets grouped by epic, then the tickets without an epic. Each group is sorted by priority, then id. Links point to the ticket files and work on GitHub and in editors.

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
$ npx github:tsitsakosa/plain-tickets board
plain-tickets: tickets/BOARD.md was not written. Fix these 4 problems:
  tickets/SHOP-0001-checkout.md: missing "priority"
  tickets/SHOP-0004-confirmation-email.md: status "open" is not one of in-progress, review, todo, backlog, done, wontfix
  tickets/confirmation-email.md: the file name must be SHOP-####-short-slug.md
  tickets/SHOP-0002-guest-checkout.md: epic SHOP-0009 does not exist
```

It also catches duplicate ids, an id that does not match its file name, an epic link to a ticket that is not an epic, unknown fields, bad dates and `updated` before `created`.

## Use from code

```js
import { loadConfig, readTickets, renderBoard } from 'plain-tickets'

const config = loadConfig(process.cwd())
const { tickets, byId, problems } = readTickets(config)
if (!problems.length) console.log(renderBoard(tickets, byId, config))
```

`parseFrontmatter(text)` and `validate(ticket, idFromFileName, prefix)` are exported too.

## Similar tools

The idea is not new. These tools do much more. Checked in November 2026.

- [Backlog.md](https://github.com/MrLesk/Backlog.md) stores tasks the same way: one markdown file with YAML frontmatter per task, in a folder in the project. It adds a full CLI to create, edit and search tasks, a Kanban board in the terminal and in the browser, and MCP support for AI agents. TypeScript, MIT. Choose it if you want those commands and views. plain-tickets only validates the files and writes the board.
- [git-bug](https://github.com/git-bug/git-bug) stores issues as git objects under their own refs, not as files in the working tree. It has a CLI, a terminal UI, a web UI and bridges to GitHub, GitLab and Jira. Go binary, GPL-3.0. plain-tickets keeps tickets as ordinary files that you read, diff and review in pull requests.
- [Fossil](https://fossil-scm.org/home/doc/trunk/www/bugtheory.wiki) has a ticket system built into its version control, kept in the repository's SQLite database and used mainly through Fossil's web UI. It only works with Fossil. plain-tickets is an add-on for any git repository.

## Development

```bash
npm test
```

The tests use `node:test` and need no install. `examples/BOARD.md` is part of the tests: after changing the example tickets, run `npm run example`.

## License

[MIT](LICENSE)
