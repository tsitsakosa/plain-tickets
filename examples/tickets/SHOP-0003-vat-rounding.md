---
id: SHOP-0003
title: "Total is off by one cent: VAT rounded per line"
type: bug
status: done
priority: P1
epic: SHOP-0001
refs:
  - src/checkout/totals.ts
commits:
  - 4f2a9c1
created: 2026-11-03
updated: 2026-11-05
---

# SHOP-0003: Total is off by one cent: VAT rounded per line

## Description

Carts with three or more items showed a total one cent higher than the invoice. The cart rounded VAT on every line, the invoice rounded it once.

## Acceptance criteria

- [x] Cart and invoice round VAT once, on the total.
- [x] A test covers a cart with three items at 0.99.

## Notes

The title has `: ` in it, so it is in double quotes.
