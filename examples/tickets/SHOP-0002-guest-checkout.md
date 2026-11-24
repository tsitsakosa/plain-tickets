---
id: SHOP-0002
title: Guest checkout without an account
type: feature
status: in-progress
priority: P1
epic: SHOP-0001
refs:
  - src/checkout/guest.ts
  - docs/decisions/0003-guest-orders.md
commits: []
created: 2026-11-02
updated: 2026-11-12
---

# SHOP-0002: Guest checkout without an account

## Description

Half of the carts are abandoned on the sign-up step. Let customers pay with only an email address.

## Acceptance criteria

- [x] The checkout asks for an email address instead of an account.
- [ ] The guest gets a link to see the order status.

## Notes

The decision record explains why guest orders are not merged into accounts later.
