# Fresh project

Your new Fresh project is ready to go. You can follow the Fresh "Getting
Started" guide here: https://fresh.deno.dev/docs/getting-started

### Usage

Make sure to install Deno:
https://docs.deno.com/runtime/getting_started/installation

Then start the project in development mode:

```
deno task dev
```

This will watch the project directory and restart as necessary.

### Testing

Unit tests cover the pure logic (balance calculations, split builders, pairwise
breakdown, input sanitizers, ETag hashing, and routing rules). Run them with:

```
deno task test
```

The full check (format, lint, type-check, and tests) runs with:

```
deno task check
```

Tests live alongside the source as `*_test.ts` files under `lib/`.
