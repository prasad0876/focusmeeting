import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/PublicPage";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/safety")({
  head: () => pageHead("Safety & acceptable use", "Meeting conduct, moderation, student privacy, and reporting information for focus.meet."),
  component: SafetyPage,
});
function SafetyPage() {
  return <PublicPage title="Safety & acceptable use" subtitle="Respectful participation matters in every classroom and meeting.">
    <section><h2>Respect people and their rights</h2><p>Do not use meetings, chat, screen shares, or submissions for harassment, hate speech, threats, sexual exploitation, illegal activity, impersonation, copyright infringement, or unauthorised surveillance. Never distribute child sexual abuse material. Share only material you have permission to use.</p></section>
    <section><h2>What moderation can do</h2><p>AI classifies chat and transcribed microphone speech. Depending on severity, the app may warn a participant, mute them, notify the host, or remove them. Audio processing occurs in chunks, not instantaneously. Moderation is not a guarantee that every abusive message or action will be detected.</p></section>
    <section><h2>Report a concern</h2><p>Tell the meeting host or the institution administrator who invited you. Include the meeting title, approximate time, and a brief description without unnecessarily forwarding sensitive material. Ask an authorised administrator to review the relevant incident records if you believe moderation made an error. For immediate danger or suspected child exploitation, contact local emergency or child-protection authorities.</p></section>
    <section><h2>Student privacy</h2><p>Do not expose student grades, identifiers, or private messages through screen sharing. Inform participants before sharing or recording personal information and follow your institution’s rules. See the <Link to="/privacy">privacy notice</Link> for microphone transcription and AI data use.</p></section>
    <section><h2>No ads in private classrooms</h2><p>Advertising is currently disabled throughout focus.meet. Private meetings, chat, student records, sign-in, and administration pages are not advertising inventory. Any future public advertising must meet Google’s content, privacy, placement, and child-safety requirements.</p></section>
  </PublicPage>;
}