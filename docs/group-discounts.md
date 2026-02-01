# Group Discount Rules

This document explains how group discounts are applied for flagship registrations.

## What qualifies
- Group discounts only apply to registrations with `tripType = group`.
- Discounts are calculated per member based on group size:
  - 4 members: PKR 500 off each
  - 5 members: PKR 600 off each
  - 6 members: PKR 800 off each
  - 7+ members: PKR 1000 off each
- Groups smaller than 4 are not eligible.

## Admin controls
Group discounts are only applied when the flagship has group discounts enabled:
- `discounts.group.enabled = true`
- `discounts.group.value` = total budget for group discounts (PKR)
- `discounts.group.count` = total discounted seats available (optional cap)

If the budget or count is exhausted, new groups will not receive a discount.
If either value is set to 0, group discounts are treated as unavailable.

## Allocation policy
When discounts are (re)calculated, groups are processed in order of the earliest
registration time in each group. This makes discount allocation predictable and
stable across updates.

## When discounts are recalculated
Discounts are recalculated after:
- A group link is created or completed
- A group member cancels or is refunded
- An admin deletes a group registration
- Admin updates group discount settings on the flagship

## What users see
For group registrations, the backend returns a status to the client:
- `applied`: discount is applied for all members
- `not_eligible`: group size is below 4
- `budget_exhausted`: group qualifies, but discount budget/count is exhausted
- `disabled`: group discounts are off for this flagship

The client should surface this status to avoid confusion.
