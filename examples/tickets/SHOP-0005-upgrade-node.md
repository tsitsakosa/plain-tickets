---
id: SHOP-0005
title: Upgrade the server to Node 24
type: chore
status: review
priority: P3
epic: null
refs:
  - .nvmrc
  - Dockerfile
commits:
  - 9b0e7d2..c13f5a8
created: 2026-11-06
updated: 2026-11-09
---

# SHOP-0005: Upgrade the server to Node 24

## Description

Node 20 reached end of life in April 2026.

## Acceptance criteria

- [x] `.nvmrc` and the Dockerfile use Node 24.
- [ ] The staging deploy runs for a day without new errors.

## Notes

The commit range is the whole branch.
