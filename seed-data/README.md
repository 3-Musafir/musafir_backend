Place your legacy CSV exports here.

## Required files

### `users.csv`
Headers:
- `userKey,fullName,email,phone,city,roles,verification`

Notes:
- `roles` can be `["musafir"]` (JSON) or `musafir,admin` (comma-separated).
- `verification` can be `{}` (JSON) or left empty.
- `phone` is required by the current schema.

### `flagships.csv`
Headers:
- `flagshipKey,canonicalName`

### `registrations.csv`
Headers:
- `registrationKey,userKey,flagshipKey,flagshipNameRaw,isPaid,status`

Notes:
- `isPaid` accepts `true/false`, `1/0`, `yes/no`.
- `status` is imported as-is (examples: `pending`, `confirmed`, `completed`, `refunded`, etc).


