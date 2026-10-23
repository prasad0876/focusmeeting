import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function PublicLinks() {
  return <nav aria-label="Information and policies" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
    <Link to="/" className="hover:text-primary">About focus.meet</Link>
    <Link to="/meeting-guide" className="hover:text-primary">Meeting guide</Link>
    <Link to="/privacy" className="hover:text-primary">Privacy</Link>
    <Link to="/safety" className="hover:text-primary">Safety & acceptable use</Link>
  </nav>;
}

export function PublicPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-6 text-primary" />focus.meet</Link>
        <Button asChild variant="outline" size="sm"><Link to="/auth">Open meetings</Link></Button>
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <h1 className="text-4xl font-semibold leading-tight">{title}</h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">{subtitle}</p>
      <div className="mt-12 space-y-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:max-w-3xl [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:leading-relaxed [&_li]:text-muted-foreground">{children}</div>
    </main>
    <footer className="border-t border-border px-6 py-8"><PublicLinks /><p className="mt-5 text-center text-xs text-muted-foreground">focus.meet · Private institutional meetings</p></footer>
  </div>;
}