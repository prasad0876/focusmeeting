# Architecture rules
- Public information and legal pages use a shared PublicPage shell and route-specific metadata; private meeting routes remain behind the existing authentication layout.
- Keep Google advertising disabled until a certified consent integration and audience safeguards are configured; use a publisher meta tag and ads.txt for non-tracking ownership verification.
- Require an explicit meeting data-processing acknowledgement before mounting LiveKitRoom; acknowledgement is scoped to the current meeting, not blanket advertising consent.
- Centralise published privacy targets and entry acknowledgement rules in a browser-safe privacy policy module; distinguish configured targets from verified expiry enforcement.
- Public discovery files list only public content; pageHead applies noindex to named private utility pages, with authentication remaining the actual access control.
- Public product screenshots must be inspected, identity-free captures of actual controls, stored as CDN asset pointers; label unsaved example data so demonstrations are not mistaken for real classroom records.