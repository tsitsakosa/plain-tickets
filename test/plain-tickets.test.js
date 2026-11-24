import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  agentGuide,
  createTicket,
  formatList,
  listTickets,
  loadConfig,
  nextId,
  parseFrontmatter,
  parseTicket,
  readTickets,
  renderBoard,
  slugify,
  upsertBlock,
  validate,
  yamlValue,
} from '../src/index.js'

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
  assert.deepEqual(validate(good, 'T-0001'), [])

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
  assert.deepEqual(validate(bad, 'T-0001'), [
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
  assert.deepEqual(validate(data, 'T-0001'), ['missing "priority"', 'unknown field "owner"'])
})

test('validate rejects updated before created', () => {
  const data = parseFrontmatter(ticket({ created: '2026-11-02', updated: '2026-11-01' }))
  assert.deepEqual(validate(data, 'T-0001'), ['updated is before created'])
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
    /unknown key "colour"; prefix must be capital letters.*; unknown labels key "titel"/,
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

const configIn = (config, files = {}) => {
  const dir = project(files, config)
  return { dir, config: loadConfig(dir) }
}

test('config checks custom lists, idDigits, sections, templates and defaults', () => {
  const dir = project(
    {},
    {
      types: ['bug', 'bug'],
      statuses: ['in progress'],
      priorities: [],
      closed: ['null'],
      idDigits: 12,
      sections: ['Notes'],
      defaults: { owner: 'me' },
      templates: { bug: '' },
    },
  )
  assert.throws(() => loadConfig(dir), (error) => {
    for (const part of [
      'idDigits must be a whole number from 1 to 9',
      'types has a value twice',
      'statuses value "in progress" must be letters, digits and hyphens',
      'priorities must be a non-empty list',
      'closed value "null" must be letters, digits and hyphens',
      'section "Notes" must be a markdown heading like "## Notes"',
      'templates "bug" must be a non-empty string',
      'unknown defaults key "owner"',
    ]) assert.ok(error.message.includes(part), `missing: ${part}\n${error.message}`)
    return true
  })
})

test('config checks that keys agree with each other', () => {
  const dir = project(
    {},
    {
      statuses: ['open', 'shipped'],
      closed: ['done'],
      defaults: { priority: 'urgent' },
      templates: { story: 'a.md', bug: 'missing.md' },
    },
  )
  assert.throws(
    () => loadConfig(dir),
    /closed status "done" is not in statuses; default priority "urgent" is not in priorities; template for unknown type "story"; template missing.md does not exist/,
  )
})

test('config fills closed and defaults from custom lists', () => {
  const { config } = configIn({ statuses: ['doing', 'next', 'later', 'done'], priorities: ['high', 'medium', 'low'] })
  assert.deepEqual(config.closed, ['done'])
  assert.deepEqual(config.defaults, { status: 'later', priority: 'low' })
})

test('custom priorities sort by their position in the list, not by name', () => {
  const { dir, config } = configIn(
    { priorities: ['high', 'medium', 'low'] },
    {
      'T-0001-a.md': ticket({ priority: 'low' }),
      'T-0002-b.md': ticket({ id: 'T-0002', priority: 'high' }),
      'T-0003-c.md': ticket({ id: 'T-0003', priority: 'medium' }),
    },
  )
  const { tickets, byId, problems } = readTickets(config, dir)
  assert.deepEqual(problems, [])
  assert.deepEqual(listTickets(tickets, config).map((t) => t.id), ['T-0002', 'T-0003', 'T-0001'])
  const board = renderBoard(tickets, byId, config)
  assert.ok(board.indexOf('T-0002') < board.indexOf('T-0003') && board.indexOf('T-0003') < board.indexOf('T-0001'))
})

test('without an epic type, epic links are rejected and the board has no epic groups', () => {
  const { dir, config } = configIn(
    { types: ['task', 'bug'] },
    {
      'T-0001-a.md': ticket({ type: 'task' }),
      'T-0002-b.md': ticket({ id: 'T-0002', type: 'bug', epic: 'T-0001' }),
    },
  )
  assert.deepEqual(readTickets(config, dir).problems, ['tickets/T-0002-b.md: T-0001 is not an epic'])
  writeFileSync(join(dir, 'tickets', 'T-0002-b.md'), ticket({ id: 'T-0002', type: 'bug' }))
  const { tickets, byId } = readTickets(config, dir)
  const board = renderBoard(tickets, byId, config)
  assert.match(board, /\| Status \| task \| bug \| Total \|/)
  assert.doesNotMatch(board, /### Epics/)
})

test('idDigits sets the length of ids and file names', () => {
  const { dir, config } = configIn({ idDigits: 3 }, { 'T-001-a.md': ticket({ id: 'T-001' }), 'T-0002-b.md': ticket({ id: 'T-0002' }) })
  assert.deepEqual(readTickets(config, dir).problems, ['tickets/T-0002-b.md: the file name must be T-###-short-slug.md'])
})

test('required sections are checked as whole lines, also with CRLF line ends', () => {
  const { dir, config } = configIn(
    { sections: ['## Description', '## Notes'] },
    {
      'T-0001-a.md': ticket().replace('# Body', '## Description\n\nText.\n\n## Notes').replaceAll('\n', '\r\n'),
      'T-0002-b.md': ticket({ id: 'T-0002' }).replace('# Body', '## Descriptions\n\n### Notes'),
    },
  )
  assert.deepEqual(readTickets(config, dir).problems, [
    'tickets/T-0002-b.md: missing section "## Description"',
    'tickets/T-0002-b.md: missing section "## Notes"',
  ])
})

test('slugify keeps a-z and digits, drops accents and caps the length at whole words', () => {
  assert.equal(slugify('Café: crème brûlée #2!'), 'cafe-creme-brulee-2')
  assert.equal(slugify('Πληρωμή με κάρτα'), '')
  const long = slugify('one two three four five six seven eight nine ten eleven twelve')
  assert.equal(long, 'one-two-three-four-five-six-seven-eight-nine-ten')
  assert.ok(long.length <= 50)
})

test('titles survive a write and read through the frontmatter', () => {
  for (const title of ['Total: off by one', '#1 bug', '"quoted"', "it's", 'null', '42', 'true', 'Πληρωμή με κάρτα', 'a [b] {c}']) {
    const text = `---\ntitle: ${yamlValue(title)}\n---\n`
    assert.equal(parseFrontmatter(text).title, title, `round trip of ${title}`)
  }
  assert.equal(yamlValue('Plain title'), 'Plain title')
})

test('nextId counts broken files and stops at idDigits', () => {
  const { config } = configIn({ idDigits: 2 }, { 'T-07-broken.md': 'no frontmatter', 'T-03-ok.md': ticket({ id: 'T-03' }) })
  assert.equal(nextId(config), 'T-08')
  writeFileSync(join(config.dir, 'T-99-last.md'), 'x')
  assert.throws(() => nextId(config), /no free id: T-100 has more than idDigits \(2\) digits/)
})

test('createTicket fills the template and checks the result before anything is written', () => {
  const dir = project(
    { 'T-0001-epic.md': ticket({ type: 'epic' }).replace('# Body', '## Steps') },
    { sections: ['## Steps'], templates: { bug: 'bug.md', chore: 'chore.md' } },
  )
  writeFileSync(join(dir, 'bug.md'), '# {{id}}: {{title}} ({{type}}, {{date}})\n\n## Steps\n')
  writeFileSync(join(dir, 'chore.md'), '# {{title}}\n')
  const config = loadConfig(dir)
  const made = createTicket(config, { type: 'bug', title: 'Login: fails', epic: 'T-0001', refs: ['src/a.js'] }, '2026-11-24')
  assert.equal(made.file, 'T-0002-login-fails.md')
  const { data, body } = parseTicket(made.text)
  assert.deepEqual(data, {
    id: 'T-0002',
    title: 'Login: fails',
    type: 'bug',
    status: 'backlog',
    priority: 'P3',
    epic: 'T-0001',
    refs: ['src/a.js'],
    commits: [],
    created: '2026-11-24',
    updated: '2026-11-24',
  })
  assert.equal(body, '\n# T-0002: Login: fails (bug, 2026-11-24)\n\n## Steps\n')

  assert.throws(() => createTicket(config, { type: 'story', title: 'x' }), /type "story" is not one of/)
  assert.throws(() => createTicket(config, { type: 'bug', title: ' ' }), /the title is empty/)
  assert.throws(() => createTicket(config, { type: 'bug', title: 'Σφάλμα' }), /Pass --slug/)
  assert.throws(() => createTicket(config, { type: 'bug', title: 'x', slug: 'Bad Slug' }), /slug "Bad Slug"/)
  assert.throws(() => createTicket(config, { type: 'bug', title: 'x', epic: 'T-0009' }), /T-0009 is not a valid epic/)
  assert.throws(() => createTicket(config, { type: 'chore', title: 'x' }), /would be invalid: missing section "## Steps"/)
  assert.match(createTicket(config, { type: 'feature', title: 'x' }).text, /\n## Steps\n$/)
})

test('cli new writes the next ticket and prints its path', () => {
  const dir = project({ 'T-0001-good.md': ticket() })
  const result = cli(dir, 'new', 'feature', 'Πληρωμή με κάρτα', '--slug', 'card-payment', '--priority', 'P1')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'tickets/T-0002-card-payment.md\n')
  assert.equal(cli(dir, 'check').status, 0)
  const bad = cli(dir, 'new', 'feature', 'x', '--priority', 'P9')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /priority "P9" is not one of P1, P2, P3, P4/)
  assert.equal(cli(dir, 'new', 'feature').status, 2)
})

test('list hides closed tickets, filters, and rejects unknown values', () => {
  const { dir, config } = configIn(undefined, {
    'T-0001-epic.md': ticket({ type: 'epic', status: 'in-progress' }),
    'T-0002-child.md': ticket({ id: 'T-0002', epic: 'T-0001', status: 'done' }),
    'T-0003-loose.md': ticket({ id: 'T-0003', type: 'bug', priority: 'P1' }),
  })
  const { tickets } = readTickets(config, dir)
  const ids = (filters) => listTickets(tickets, config, filters).map((t) => t.id)
  assert.deepEqual(ids({}), ['T-0001', 'T-0003'])
  assert.deepEqual(ids({ all: true }), ['T-0001', 'T-0003', 'T-0002'])
  assert.deepEqual(ids({ status: ['done'] }), ['T-0002'])
  assert.deepEqual(ids({ epic: ['T-0001'], all: true }), ['T-0001', 'T-0002'])
  assert.deepEqual(ids({ type: ['bug'], priority: ['P1'] }), ['T-0003'])
  assert.throws(() => ids({ status: ['open'] }), /unknown status open. Allowed: in-progress/)
  assert.throws(() => ids({ epic: ['nope'] }), /epic nope is not a ticket id/)
  assert.deepEqual(formatList(listTickets(tickets, config)), [
    'id      status       priority  type  epic  title',
    'T-0001  in-progress  P2        epic  -     A ticket',
    'T-0003  todo         P1        bug   -     A ticket',
  ])
})

test('cli list prints JSON with paths and fails on invalid tickets', () => {
  const dir = project({ 'T-0001-good.md': ticket(), 'T-0002-bad.md': ticket({ id: 'T-0002', status: 'open' }) })
  const result = cli(dir, 'list', '--json')
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stdout)[0].file, 'tickets/T-0001-good.md')
  assert.match(result.stderr, /1 problem in the tickets/)
  assert.equal(cli(dir, 'list', '--slug', 'x').status, 2)
})

test('upsertBlock appends once, replaces in place and keeps the text around it', () => {
  const first = upsertBlock('# Rules\n\nBe kind.', 'v1')
  assert.equal(first, '# Rules\n\nBe kind.\n\n<!-- plain-tickets:start -->\nv1\n<!-- plain-tickets:end -->\n')
  const later = `${first}\n## After\n`
  assert.equal(upsertBlock(later, 'v2'), later.replace('\nv1\n', '\nv2\n'))
  assert.equal(upsertBlock('', 'v1'), '<!-- plain-tickets:start -->\nv1\n<!-- plain-tickets:end -->\n')
  assert.throws(() => upsertBlock('<!-- plain-tickets:start -->\n', 'v'), /without its pair/)
})

test('cli init sets up a project and a second run changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plain-tickets-init-'))
  writeFileSync(join(dir, 'AGENTS.md'), '# House rules\r\n\r\nKeep this line.\r\n')
  writeFileSync(join(dir, 'CLAUDE.md'), '# Claude\n')
  const first = cli(dir, 'init', '--prefix', 'WEB')
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /created tickets.config.json\ncreated tickets\/\ncreated tickets\/WEB-0001-set-up-plain-tickets.md\nplain-tickets: wrote tickets\/BOARD.md \(1 ticket\)\nupdated AGENTS.md\nnote: Claude Code reads CLAUDE.md/)
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
  assert.ok(agents.startsWith('# House rules\r\n\r\nKeep this line.\r\n\n<!-- plain-tickets:start -->\n## Tickets\n'))
  assert.ok(agents.includes('npx github:tsitsakosa/plain-tickets list'))

  const snapshot = () => Object.fromEntries(
    ['AGENTS.md', 'tickets.config.json', ...readdirSync(join(dir, 'tickets')).map((f) => `tickets/${f}`)].map((f) => [f, readFileSync(join(dir, f), 'utf8')]),
  )
  const before = snapshot()
  const second = cli(dir, 'init')
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /unchanged AGENTS.md/)
  assert.deepEqual(snapshot(), before)
  assert.equal(cli(dir, 'init', '--prefix', 'APP').status, 2)
})

test('the guide uses the plain command only when the project installed plain-tickets', () => {
  const { dir, config } = configIn({ prefix: 'WEB', statuses: ['doing', 'done'], sections: ['## Why'] })
  const guide = agentGuide(config)
  assert.match(guide, /`npx github:tsitsakosa\/plain-tickets new <type> "<title>"`/)
  assert.match(guide, /`status`: `doing`, `done`. Open: `doing`. Closed: `done`./)
  assert.match(guide, /The body must keep these headings: `## Why`/)
  assert.match(guide, /--epic WEB-0001/)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { 'plain-tickets': 'github:tsitsakosa/plain-tickets' } }))
  assert.match(agentGuide(config), /`npx plain-tickets list`/)
})

test('the README shows the guide exactly as the default config generates it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plain-tickets-guide-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { 'plain-tickets': '*' } }))
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  assert.ok(readme.includes(`\`\`\`markdown\n${agentGuide(loadConfig(dir))}\`\`\``), 'README guide is out of date')
})
