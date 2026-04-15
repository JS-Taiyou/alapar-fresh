# Serialization Review

## Supported Types

**Doc reference**: Fresh V2 serialization supports: primitives, `Date`, `Set`,
`Map`, `Array`, plain objects, `null`, `undefined`.

**Current implementation**: Uses `Set<string>` for owner/deletable registry IDs,
`Date` for transaction timestamps.

## Set Serialization

**Initial concern**: `Set<string>` might serialize to `{}`.

**Verification**: Fresh V2 docs confirm `Set` IS supported. Runtime behavior
confirmed correct.

**Severity**: N/A — not a bug

## Date Serialization

**Status**: Fresh V2 preserves `Date` objects through serialization. No type
mismatch after hydration.

**Severity**: N/A — correct

## Large Data Serialization

**Issue**: Transaction arrays are serialized inline in HTML. For registries with
many transactions, this increases page size significantly.

**Recommendation**: Consider pagination or lazy-loading for large datasets.

**Severity**: LOW
