# Jinji Farm Manager — Formal Web

This directory is the formal Web client for the Jinji Farm Manager product.

## Authority

- Formal repository: `aitest00898/jinji-farm-manager`
- Formal Web path: `/web`
- Production Worker/D1/API: the repository root Worker
- `aitest00898/jinji-web-v14r-lab` remains a non-authoritative Prototype / Pre-Production Lab.

The initial contents of this directory were restored exactly from
`legacy/web-default-main-20260831` without merging unrelated Git histories.

## Migration rule

The V14R Lab is a capability donor, not the product authority. Features may be
ported only when they preserve the current Worker API/access policy and pass the
formal Web test suite. Lab fixture identity, IndexedDB-only behavior, test-page
branding, and Lab deployment assumptions must not be promoted.

Port priority:

1. canonical record read/write and authoritative readback;
2. PUBLIC / SHARED_EDIT / ADMIN session boundaries;
3. master-data/stock views;
4. LINE group claim/authorization controls;
5. recovery (single, batch, selective PIT, Finance);
6. guided recording taxonomy and mobile usability;
7. regression, security, and cross-browser coverage.

Production Pages must not cut over to this directory until formal CI is green
and the Worker origin/CORS boundary has been reviewed against the new Pages
origin.
