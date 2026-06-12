import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { MessageSquare, CalendarPlus, LayoutDashboard, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediVoice · AI receptionist for clinics" },
      {
        name: "description",
        content:
          "Chat or call our AI receptionist to book, check, or cancel appointments. Same tools across voice and web.",
      },
      { property: "og:title", content: "MediVoice · AI receptionist" },
      {
        property: "og:description",
        content: "Book, check, and cancel appointments via AI chat or voice.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const tiles: Array<{
    to: "/receptionist" | "/book" | "/admin";
    title: string;
    desc: string;
    icon: typeof MessageSquare;
    accent?: boolean;
  }> = [
    {
      to: "/receptionist",
      title: "Chat with Maya",
      desc: "AI receptionist — same workflow as the voice line.",
      icon: MessageSquare,
      accent: true,
    },
    {
      to: "/book",
      title: "Book yourself",
      desc: "Pick a specialty, slot, and confirm.",
      icon: CalendarPlus,
    },
    {
      to: "/admin",
      title: "Admin dashboard",
      desc: "Appointments, doctors, patients.",
      icon: LayoutDashboard,
    },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Stethoscope className="w-4 h-4" />
          </div>
          MediVoice
        </div>
        <nav className="text-sm flex gap-4">
          <Link to="/receptionist" className="text-muted-foreground hover:text-foreground">Receptionist</Link>
          <Link to="/book" className="text-muted-foreground hover:text-foreground">Book</Link>
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="max-w-2xl">
          <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-card text-muted-foreground mb-5">
            One assistant. Voice + chat. Real bookings.
          </span>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            AI receptionist that actually books appointments.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Maya checks doctor schedules, finds open slots, books, cancels and sends
            confirmations — the same way she does on the phone.
          </p>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-2xl border p-6 hover:shadow-sm transition group ${t.accent ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
            >
              <t.icon className={`w-5 h-5 ${t.accent ? "opacity-90" : "text-primary"}`} />
              <div className="mt-3 font-semibold">{t.title}</div>
              <div className={`text-sm mt-1 ${t.accent ? "opacity-80" : "text-muted-foreground"}`}>
                {t.desc}
              </div>
              <div className={`text-xs mt-4 ${t.accent ? "opacity-90" : "text-primary"} group-hover:underline`}>
                Open →
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
