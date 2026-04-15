# Layouts Review

## _layout.tsx Pattern

**Doc reference**: `_layout.tsx` wraps all sibling routes. Can be async.
Children render via `<ctx.Component />`.

**Current implementation**: `routes/dashboard/_layout.tsx` is async — awaits
`getTransactionCounts()` (now cached).

**Issues**: See `data-fetching.md` for blocking call analysis.

**Severity**: MEDIUM (improved with caching)

## Layout Inheritance

**Current implementation**: Single layout level for dashboard routes. No
`skipInheritedLayouts` needed.

**Severity**: N/A — correct

## Sidebar Props

**Current implementation**: Sidebar receives all necessary props including
`deletableRegistryIds` (Set) and `ownerRegistryIds` (Set). Fresh V2 serializes
Sets correctly.

**Severity**: N/A — correct
