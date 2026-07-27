/** Convert raw server / Postgres errors into human-friendly messages. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw =
    (err as any)?.message ??
    (typeof err === "string" ? err : "") ??
    "";
  const msg = String(raw);

  // Duplicate keys
  if (/duplicate key|already exists|unique constraint|23505/i.test(msg)) {
    if (/departments_name_key/i.test(msg)) return "A department with this name already exists.";
    if (/departments_code_key/i.test(msg)) return "A department with this code already exists.";
    if (/sections_.*_key/i.test(msg)) return "A section with that name already exists in this department.";
    if (/student_sections/i.test(msg)) return "That student is already in this section.";
    if (/faculty_sections/i.test(msg)) return "That faculty member is already assigned to this section.";
    if (/user_roles/i.test(msg)) return "That role is already assigned.";
    if (/profiles_handle_key/i.test(msg)) return "That handle is already taken.";
    return "That record already exists.";
  }

  // Foreign-key / not-found
  if (/violates foreign key|not present in table|23503/i.test(msg)) {
    return "One of the linked records was not found. Please refresh and try again.";
  }
  if (/not-null|23502/i.test(msg)) return "A required field is missing.";
  if (/check constraint|23514/i.test(msg)) return "One of the values is not allowed.";

  // Auth / permission
  if (/forbidden|only super admin|only admin|not authoriz/i.test(msg)) {
    return msg.replace(/^Error:\s*/i, "");
  }
  if (/permission denied|42501|row-level security|violates row-level security/i.test(msg)) {
    return "You don't have permission to perform this action.";
  }
  if (/jwt|unauthorized|401/i.test(msg)) return "Your session expired. Please sign in again.";

  // Network
  if (/failed to fetch|network|timeout/i.test(msg)) return "Network issue. Check your connection and try again.";

  return msg && msg.length < 200 ? msg : fallback;
}
