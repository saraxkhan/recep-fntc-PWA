import { createFileRoute, Link, Outlet, useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { Calendar, Users, Stethoscope, MessageSquare, BarChart3, ShieldCheck, LogOut, Loader2, FileClock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · MediVoice" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(sess.session.user.email ?? null);
      const { data, error } = await (supabase as any).rpc("has_role", {
        _user_id: sess.session.user.id,
        _role: "admin",
      });
      if (!mounted) return;
      if (error || !data) setStatus("denied");
      else setStatus("ok");
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth" });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth" });
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking access…
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center rounded-xl border bg-card p-8">
          <ShieldCheck className="w-10 h-10 mx-auto text-destructive mb-2" />
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your account ({email}) doesn't have the admin role. Ask an existing admin to grant you access.
          </p>
          <div className="mt-4 flex gap-2 justify-center">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>Go home</Button>
            <Button onClick={signOut}><LogOut className="w-4 h-4 mr-1" /> Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { to: "/admin", label: "Appointments", icon: Calendar, exact: true },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/conversations", label: "AI Conversations", icon: MessageSquare },
    { to: "/admin/doctors", label: "Doctors", icon: Stethoscope },
    { to: "/admin/patients", label: "Patients", icon: Users },
    { to: "/admin/audit", label: "Audit Logs", icon: FileClock },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Hospital operations overview</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign out
          </Button>
        </div>
      </div>
      <div className="flex gap-0.5 mb-6 border-b overflow-x-auto scrollbar-none">
        {tabs.map((t) => {
          const active = t.exact ? path === t.to : path.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap shrink-0 touch-manipulation ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">{t.label}</span><span className="sm:hidden text-xs">{t.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
