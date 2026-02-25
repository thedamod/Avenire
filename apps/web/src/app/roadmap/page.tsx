import { getRoadmapGroups } from "@/lib/roadmap";
import type { RoadmapGroup, RoadmapItem } from "@/lib/roadmap";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CheckCircle2, Circle, Loader2, ExternalLink } from "lucide-react";

export const metadata = {
  title: "Roadmap — Avenire",
  description: "See what we're building next. The public roadmap for Avenire.",
};

const statusConfig = {
  planned: {
    icon: Circle,
    label: "Planned",
    color: "text-muted-foreground",
    dotColor: "bg-muted-foreground/50",
    borderColor: "border-border",
    badgeBg: "bg-muted",
    badgeText: "text-muted-foreground",
  },
  "in-progress": {
    icon: Loader2,
    label: "In Progress",
    color: "text-primary",
    dotColor: "bg-primary",
    borderColor: "border-primary/30",
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
  },
  shipped: {
    icon: CheckCircle2,
    label: "Shipped",
    color: "text-chart-2",
    dotColor: "bg-chart-2",
    borderColor: "border-chart-2/20",
    badgeBg: "bg-chart-2/10",
    badgeText: "text-chart-2",
  },
};

function RoadmapCard({ item }: { item: RoadmapItem }) {
  const cfg = statusConfig[item.status];
  const Icon = cfg.icon;

  return (
    <article
      className={`group rounded-xl border ${cfg.borderColor} bg-card p-5 transition-all duration-200 hover:shadow-md hover:shadow-black/10 hover:-translate-y-0.5`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
          <Icon
            className={`size-4.5 ${item.status === "in-progress" ? "animate-spin [animation-duration:3s]" : ""}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-sm font-medium text-foreground leading-snug">{item.title}</h3>
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Learn more about ${item.title}`}
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>

          {item.category && (
            <div className="mt-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {item.category}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RoadmapColumn({ group }: { group: RoadmapGroup }) {
  const cfg = statusConfig[group.status];

  return (
    <div className="flex flex-col gap-4">
      {/* Column header */}
      <div className="flex items-center gap-2.5 pb-4 border-b border-border">
        <div className={`size-2 rounded-full ${cfg.dotColor}`} />
        <h2 className="text-sm font-semibold text-foreground">
          {group.label}
        </h2>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
          {group.items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {group.items.map((item) => (
          <RoadmapCard key={item.id} item={item} />
        ))}
        {group.items.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center py-6">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const groups = getRoadmapGroups();

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-2">
            <span className="text-xs font-medium tracking-widest uppercase text-primary">
              Roadmap
            </span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight mb-4">
                What &apos;s Coming Next
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                A transparent look at what we&apos;re building. We update this as our plans evolve.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap columns */}
      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {groups.map((group) => (
              <RoadmapColumn key={group.status} group={group} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
