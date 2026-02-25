"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, BellRing, LockKeyhole, Repeat2 } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Badge } from "@avenire/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@avenire/ui/components/card";
import { buttonVariants } from "@avenire/ui/components/button";
import { cn } from "@/lib/utils";

type BillingPeriod = "monthly" | "yearly";

type Plan = {
  name: "Access" | "Core" | "Scholar";
  monthly: number;
  yearly: number;
  credits: number;
  summary: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Access",
    monthly: 0,
    yearly: 0,
    credits: 120,
    summary: "For curious learners getting started with reasoning-first workflows.",
    features: [
      "Core AI chat workspace",
      "Basic flashcard generation",
      "Interactive graphs (limited)",
      "Whiteboard reasoning (light mode)",
      "Session history (7 days)",
      "Community prompt library",
      "Standard response speed",
    ],
    cta: "Get Started Free",
  },
  {
    name: "Core",
    monthly: 5,
    yearly: 45,
    credits: 1800,
    summary: "For daily users who want depth, continuity, and faster iteration.",
    features: [
      "Everything in Access",
      "Advanced reasoning + step-by-step thinking",
      "Full graphing & physics plot tools",
      "Smart flashcards + spaced repetition",
      "Notebook memory across sessions",
      "Export notes to Markdown/PDF",
      "Priority generation queue",
      "Extended session context",
    ],
    cta: "Start Core",
    featured: true,
  },
  {
    name: "Scholar",
    monthly: 15,
    yearly: 150,
    credits: 6500,
    summary: "For high-intensity learners and research-heavy workflows.",
    features: [
      "Everything in Core",
      "Deep Research mode (multi-source synthesis)",
      "High-context long sessions",
      "AI video explanations for topics",
      "Research-grade document workflows",
      "Concept mastery tracking & analytics",
      "Custom study plans (JEE/Exam focused)",
      "Early access to experimental features",
    ],
    cta: "Start Scholar",
  },
];

const policyNotes = [
  { icon: Repeat2, text: "Credit rollover up to 2 months (Core/Scholar)" },
  { icon: BellRing, text: "Usage alerts & hard caps" },
  { icon: LockKeyhole, text: "Private sessions & encrypted notes" },
] as const;

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="relative overflow-hidden px-4 pt-32 pb-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,var(--muted),transparent_72%)] opacity-60 dark:opacity-25" />
          <div className="absolute left-1/2 top-16 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--foreground),transparent_68%)] opacity-[0.03] dark:opacity-[0.06] blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4 }}
          >
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              Pricing
            </Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.05]">
              Clear plans. Credit-based usage.
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Pick a tier based on depth and monthly credits. When credits run out, usage continues at metered rates.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.35, delay: 0.06 }}
            className="mx-auto mt-7 inline-grid grid-cols-2 rounded-full border border-border bg-card p-1"
          >
            {(["monthly", "yearly"] as const).map((period) => {
              const active = billing === period;

              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => setBilling(period)}
                  className={cn(
                    "relative min-w-30 rounded-full px-4 py-2 text-xs font-medium capitalize transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="billing-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-primary/12"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  ) : null}
                  {period}
                </button>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const price = billing === "monthly" ? plan.monthly : plan.yearly;
            const suffix = billing === "monthly" ? "/mo" : "/yr";
            const monthlyEquivalent = billing === "yearly" && plan.yearly > 0 ? (plan.yearly / 12).toFixed(2) : null;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: index * 0.07 }}
              >
                <Card
                  className={cn(
                    "h-full rounded-2xl border bg-card p-2",
                    plan.featured ? "border-primary/35 shadow-lg shadow-primary/8" : "border-border/80"
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg font-semibold text-foreground">{plan.name}</CardTitle>
                      {plan.featured ? (
                        <Badge variant="secondary" className="bg-primary/15 text-primary">
                          Most Popular
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{plan.summary}</p>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-5">
                    <div className="min-h-[6rem] rounded-xl border border-border/70 bg-background/70 p-4">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`${plan.name}-${billing}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.18 }}
                        >
                          <p className="text-3xl font-semibold tracking-tight text-foreground">
                            ${price}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              monthlyEquivalent ? "text-muted-foreground" : "invisible"
                            )}
                          >
                            {monthlyEquivalent ? `$${monthlyEquivalent}/mo billed annually` : "placeholder"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{plan.credits.toLocaleString()} credits / month</p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <ul className="flex-1 space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={{
                        pathname: "/",
                        query: { plan: plan.name.toLowerCase(), billing },
                      }}
                      className={cn(
                        buttonVariants({ size: "lg", variant: plan.featured ? "default" : "outline" }),
                        "mt-4 w-full gap-1.5"
                      )}
                    >
                      {plan.cta}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.35 }}
          className="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-3"
        >
          {policyNotes.map((note) => {
            const Icon = note.icon;

            return (
              <div key={note.text} className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2.5">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-3.5" />
                </span>
                <p className="text-xs text-muted-foreground">{note.text}</p>
              </div>
            );
          })}
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
