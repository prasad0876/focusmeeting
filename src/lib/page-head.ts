const privatePageTitles = new Set(["Sign in", "Section roster", "New meeting", "Meeting memory", "Meeting", "Invitations", "Gradebook", "Dashboard", "Attendance", "Assessments", "Admin console"]);

export function pageHead(title: string, description: string) {
  return { meta: [
    { title: `${title} · focus.meet` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · focus.meet` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    ...(privatePageTitles.has(title) ? [{ name: "robots", content: "noindex, nofollow" }] : []),
  ] };
}