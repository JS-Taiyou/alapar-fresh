# Islands Review

## Serialization

**Doc reference**: Fresh V2 serialization supports `Set`, `Map`, `Date`, and
plain objects natively.

**Current implementation**: `Set<string>` passed as island props in
`_layout.tsx` (`ownerRegistryIds`, `deletableRegistryIds`) and `index.tsx`
(`entityIds`).

**Issue**: ~~`Set<string>` passed as island props serializes to `{}`~~
**VERIFIED**: Fresh V2 handles `Set` serialization correctly. This is NOT a bug.

**Severity**: N/A — false alarm

## Date Objects

**Doc reference**: Fresh serialization preserves `Date` objects.

**Current implementation**: Transaction data contains `Date` fields
(`createdAt`). After hydration these remain `Date` objects.

**Severity**: LOW — no runtime impact

## Access Token in Props

**Doc reference**: No specific guidance.

**Current implementation**: `accessToken` embedded in page HTML via serialized
props (`index.tsx:111`).

**Issue**: Access token is visible in page source. This is a security concern —
anyone with access to the HTML source can extract it.

**Recommendation**: Move token fetching to a dedicated API endpoint or use a
session-based approach for realtime subscriptions.

**Severity**: MEDIUM
