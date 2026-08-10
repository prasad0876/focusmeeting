# Fix "Only an administrator can change this" when approving a sign-up

## What's happening

Approving a pending user updates that person's profile (`status` → active, and department). The database has a safety rule that blocks anyone who isn't an admin from changing account status, blacklist, reputation, or department.

That rule decides "is this an admin?" from the signed-in user of the request. The approval is performed by the trusted server (service role), which has no signed-in user attached, so the rule sees "not an admin" and rejects the change — which the UI then shows as "Only an administrator can change this."

Confirmed by reading the guard function: it calls `private.is_admin(auth.uid())` and raises the exception otherwise. Same path affects approve, reject, and blacklist/unblacklist.

## The fix

1. Update the profile guard so it does not fire for trusted server-side writes (service role / no end-user session), while still blocking ordinary signed-in users from touching those protected columns.
2. Keep authorization where it belongs: the approve/reject/blacklist server functions already verify the caller is admin or DEO before writing, so nothing is loosened for regular users.
3. Verify by approving a pending user from the admin console and confirming their status changes to active with the assigned department/section, and that a normal user still cannot change their own status.

## Technical notes

- Migration alters `private.profiles_guard_self_update`: return `NEW` early when `auth.uid() IS NULL` or the effective role is `service_role`, before the protected-column comparison; keep the existing admin bypass, the exception for regular users, and the `NEW.id := OLD.id` pin.
- Also review the sibling guards (`private.mp_guard_self_update`, `private.as_guard_student_update`) for the same service-role blind spot, since moderation and grading writes were moved to privileged clients too — apply the same early return where needed.
- No RLS policy changes, no new grants, no client code changes expected.
