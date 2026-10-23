# Architecture rules
- Public information and legal pages use a shared PublicPage shell and route-specific metadata; private meeting routes remain behind the existing authentication layout.
- Keep Google advertising disabled until a certified consent integration and audience safeguards are configured; use a publisher meta tag and ads.txt for non-tracking ownership verification.
- Require an explicit meeting data-processing acknowledgement before mounting LiveKitRoom; acknowledgement is scoped to the current meeting, not blanket advertising consent.