import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadConfig, parseFrontmatter, readTickets, renderBoard, validate } from '../src/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const bin = join(root, 'bin', 'plain-tickets.js')
const cli = (cwd, ...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })

const ticket = (fields = {}) => {
  const data = {
    id: 'T-0001',
    title: 'A ticket',
    type: 'feature',
    status: 'todo',
    priority: 'P2',
    epic: 'null',
    refs: '[]',
    commits: '[]',
    created: '2026-11-01',
    updated: '2026-11-02',
    ...fields,
  }
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
  return ['---', ...lines, '---', '', '# Body', ''].join('\n')
}

function project(files, config) {
  const dir = mkdtempSync(join(tmpdir(), 'plain-tickets-'))
  mkdirSync(join(dir, 'tickets'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'tickets', name), text)
  if (config) writeFileSync(join(dir, 'tickets.config.json'), JSON.stringify(config))
  return dir
}

test('parses scalars, null, empty lists, block lists and quotes', () => {
  const data = parseFrontmatter(
    [
      '---',
      'title: "Total: off by one"',
      "note: 'it''s fine'",
      'epic: null',
      'refs: []',
      'commits:',
      '  - abc1234',
      '  - "def5678"',
      'created: 2026-11-01',
      '---',
      'body',
    ].join('\n'),
  )
  assert.deepEqual(data, {
    title: 'Total: off by one',
    note: "it's fine",
    epic: null,
    refs: [],
    commits: ['abc1234', 'def5678'],
    created: '2026-11-01',
  })
})

test('parser rejects missing frontmatter, unclosed frontmatter, bad lines and duplicate keys', () => {
  assert.throws(() => parseFrontmatter('# no frontmatter'), /no frontmatter/)
  assert.throws(() => parseFrontmatter('---\ntitle: x\n'), /no closing ---/)
  assert.throws(() => parseFrontmatter('---\nTitle: x\n---'), /line 2 is not/)
  assert.throws(() => parseFrontmatter('---\n  - orphan\n---'), /line 2 is not/)
  assert.throws(() => parseFrontmatter('---\ntitle: a\ntitle: b\n---'), /"title" appears twice/)
})

test('validate accepts a good ticket and names each bad value', () => {
  const good = parseFrontmatter(ticket())
  assert.deepEqual(validate(good, 'T-0001', 'T'), [])

  const bad = parseFrontmatter(
    ticket({
      id: 'T-0002',
      title: '""',
      type: 'story',
      status: 'open',
      priority: 'P0',
      epic: 'JIRA-1',
      refs: 'src/a.js',
      created: '01.11.2026',
      updated: '2026-11-01',
    }),
  )
  assert.deepEqual(validate(bad, 'T-0001', 'T'), [
    'id "T-0002" does not match the file name',
    'title is empty',
    'type "story" is not one of epic, feature, bug, chore, idea',
    'status "open" is not one of in-progress, review, todo, backlog, done, wontfix',
    'priority "P0" is not one of P1, P2, P3, P4',
    'epic must be null or a ticket id, not "JIRA-1"',
    'refs must be a list',
    'created must be a YYYY-MM-DD date',
  ])
})

test('validate reports missing and unknown fields before anything else', () => {
  const data = parseFrontmatter(ticket({ priority: undefined, owner: 'me' }))
  assert.deepEqual(validate(data, 'T-0001', 'T'), ['missing "priority"', 'unknown field "owner"'])
})

test('validate rejects updated before created', () => {
  const data = parseFrontmatter(ticket({ created: '2026-11-02', updated: '2026-11-01' }))
  assert.deepEqual(validate(data, 'T-0001', 'T'), ['updated is before created'])
})

test('readTickets checks file names, duplicate ids and epic links across files', () => {
  const dir = project({
    'T-0001-epic.md': ticket({ type: 'epic' }),
    'T-0001-again.md': ticket(),
    'T-0002-child.md': ticket({ id: 'T-0002', epic: 'T-0009' }),
    'T-0003-child.md': ticket({ id: 'T-0003', epic: 'T-0004' }),
    'T-0004-not-epic.md': ticket({ id: 'T-0004' }),
    'T-0005-nested.md': ticket({ id: 'T-0005', type: 'epic', epic: 'T-0001' }),
    'notes.md': '# not a ticket',
    'README.md': '# ignored',
  })
  const { problems } = readTickets(loadConfig(dir), dir)
  assert.deepEqual(problems, [
    'tickets/notes.md: the file name must be T-####-short-slug.md',
    'tickets/T-0001-epic.md: id also used by T-0001-again.md',
    'tickets/T-0002-child.md: epic T-0009 does not exist',
    'tickets/T-0003-child.md: T-0004 is not an epic',
    'tickets/T-0005-nested.md: an epic cannot belong to an epic',
  ])
})

test('board groups by status then epic and links relative to the board', () => {
  const dir = project(
    {
      'WEB-0001-epic.md': ticket({ id: 'WEB-0001', type: 'epic', status: 'in-progress' }),
      'WEB-0002-child.md': ticket({ id: 'WEB-0002', epic: 'WEB-0001', priority: 'P3' }),
      'WEB-0003-loose.md': ticket({ id: 'WEB-0003', type: 'bug', priority: 'P1' }),
    },
    { prefix: 'WEB', board: 'docs/BOARD.md', labels: { title: 'Board', intro: '', noEpic: 'Loose' } },
  )
  const config = loadConfig(dir)
  const { tickets, byId, problems } = readTickets(config, dir)
  assert.deepEqual(problems, [])
  const board = renderBoard(tickets, byId, config)
  assert.match(board, /^# Board\n\n\| Status \|/)
  assert.match(board, /\| todo \| 0 \| 1 \| 1 \| 0 \| 0 \| 2 \|/)
  assert.match(board, /\| \*\*Total\*\* \| 1 \| 1 \| 1 \| 0 \| 0 \| 3 \|/)
  const todo = board.slice(board.indexOf('## todo'), board.indexOf('## backlog'))
  assert.equal(
    todo,
    [
      '## todo (2)',
      '',
      '### [WEB-0001](../tickets/WEB-0001-epic.md) A ticket',
      '',
      '- [WEB-0002](../tickets/WEB-0002-child.md) P3 · feature · A ticket',
      '',
      '### Loose',
      '',
      '- [WEB-0003](../tickets/WEB-0003-loose.md) P1 · bug · A ticket',
      '',
      '',
    ].join('\n'),
  )
  assert.match(board, /## review \(0\)\n\n_No tickets\._/)
})

test('config rejects unknown keys, bad prefix and bad JSON', () => {
  const dir = project({}, { prefix: 'web', colour: 'red', labels: { titel: 'x' } })
  assert.throws(
    () => loadConfig(dir),
    /unknown key "colour"; prefix must be capital letters.*; unknown label "titel"/,
  )
  writeFileSync(join(dir, 'tickets.config.json'), '{ nope')
  assert.throws(() => loadConfig(dir), /is not valid JSON/)
  assert.throws(() => loadConfig(dir, 'missing.json'), /missing.json does not exist/)
})

test('cli board refuses to write and names every problem', () => {
  const dir = project({
    'T-0001-good.md': ticket(),
    'T-0002-bad.md': ticket({ id: 'T-0002', status: 'open' }),
    'T-0003-bad.md': 'no frontmatter',
  })
  const result = cli(dir, 'board')
  assert.equal(result.status, 1)
  assert.equal(
    result.stderr,
    [
      'plain-tickets: tickets/BOARD.md was not written. Fix these 2 problems:',
      '  tickets/T-0002-bad.md: status "open" is not one of in-progress, review, todo, backlog, done, wontfix',
      '  tickets/T-0003-bad.md: no frontmatter: the file must start with a --- line',
      '',
    ].join('\n'),
  )
  assert.equal(existsSync(join(dir, 'tickets', 'BOARD.md')), false)
})

test('cli board writes the board and skips it on the next run', () => {
  const dir = project({ 'T-0001-good.md': ticket() })
  assert.equal(cli(dir, 'board').status, 0)
  const second = cli(dir, 'board')
  assert.equal(second.status, 0, second.stderr)
  assert.equal(second.stdout, 'plain-tickets: wrote tickets/BOARD.md (1 ticket)\n')
  assert.equal(cli(dir, 'check').stdout, 'plain-tickets: no problems in 1 ticket\n')
})

test('cli rejects unknown commands and options', () => {
  assert.equal(cli(root, 'move').status, 2)
  assert.equal(cli(root, 'board', '--force').status, 2)
})

test('examples/BOARD.md matches the example tickets', () => {
  const examples = join(root, 'examples')
  const config = loadConfig(examples)
  const { tickets, byId, problems } = readTickets(config, examples)
  assert.deepEqual(problems, [])
  assert.equal(renderBoard(tickets, byId, config), readFileSync(join(examples, 'BOARD.md'), 'utf8'))
})
