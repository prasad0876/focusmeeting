import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, LayoutDashboard, Inbox, Plus, LogOut, Crown, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [handle, setHandle] = useState<string>("");
  const { isAdmin } = useIsAdmin(user.id);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setHandle(data.handle);
      });
  }, [user.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/60 bg-surface/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="size-8 rounded-md bg-primary/15 grid place-items-center glow-ring">
              <ShieldCheck className="size-4 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">Sentinel<span className="text-primary">.</span>meet</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
            <NavLink to="/invitations" icon={<Inbox className="size-4" />} label="Invitations" />
            <NavLink to="/new-meeting" icon={<Plus className="size-4" />} label="New meeting" />
            <NavLink to="/assessments" icon={<ClipboardList className="size-4" />} label="Assessments" />
            {isAdmin && <NavLink to="/admin" icon={<Crown className="size-4" />} label="Admin" />}
          </nav>
          <div className="flex items-center gap-3">
            {handle && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md bg-secondary/60 border border-border/60">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                @{handle}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition flex items-center gap-2"
      activeProps={{ className: "text-foreground bg-secondary/80" }}
    >
      {icon}
      {label}
    </Link>
  );
}
