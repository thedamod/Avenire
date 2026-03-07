"use client";

import { Badge } from "@avenire/ui/components/badge";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@avenire/ui/components/card";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Check,
  LockKeyhole,
  Repeat2,
} from "lucide-react";
import { useState } from "react";
import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";
import { cn } from "@/lib/utils";

type BillingPeriod = "monthly" | "yearly";

type Plan = {
  name: "Access" | "Core" | "Scholar";
  monthly: number;
  yearly: number;
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
    summary:
      "For curious learners getting started with reasoning-first workflows.",
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
    summary:
      "For daily users who want depth, continuity, and faster iteration.",
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
          <div className="absolute top-16 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--foreground),transparent_68%)] opacity-[0.03] blur-3xl dark:opacity-[0.06]" />
        </div>

        <div className="mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.4 }}
            viewport={{ once: true, amount: 0.4 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <Badge
              className="border-primary/30 bg-primary/10 text-primary"
              variant="outline"
            >
              Pricing
            </Badge>
            <h1 className="mt-4 font-semibold text-4xl text-foreground tracking-tight md:text-6xl md:leading-[1.05]">
              Clear plans.
            </h1>
          </motion.div>

          <motion.div
            className="mx-auto mt-7 inline-grid grid-cols-2 rounded-full border border-border bg-card p-1"
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, delay: 0.06 }}
            viewport={{ once: true, amount: 0.3 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            {(["monthly", "yearly"] as const).map((period) => {
              const active = billing === period;

              return (
                <Button
                  className={cn(
                    "relative min-w-30 rounded-full px-4 py-2 font-medium text-xs capitalize transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={period}
                  onClick={() => setBilling(period)}
                  type="button"
                  variant="ghost"
                >
                  {active ? (
                    <motion.span
                      className="absolute inset-0 -z-10 rounded-full bg-primary/12"
                      layoutId="billing-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                    />
                  ) : null}
                  {period}
                </Button>
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
            const monthlyEquivalent =
              billing === "yearly" && plan.yearly > 0
                ? (plan.yearly / 12).toFixed(2)
                : null;

            return (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                key={plan.name}
                transition={{ duration: 0.35, delay: index * 0.07 }}
                viewport={{ once: true, amount: 0.2 }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <Card
                  className={cn(
                    "h-full rounded-2xl border bg-card p-2",
                    plan.featured
                      ? "border-primary/35 shadow-lg shadow-primary/8"
                      : "border-border/80"
                  )}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="font-semibold text-foreground text-lg">
                        {plan.name}
                      </CardTitle>
                      {plan.featured ? (
                        <Badge
                          className="bg-primary/15 text-primary"
                          variant="secondary"
                        >
                          Most Popular
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {plan.summary}
                    </p>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-5">
                    <div className="min-h-[6rem] rounded-xl border border-border/70 bg-background/70 p-4">
                      <AnimatePresence initial={false} mode="wait">
                        <motion.div
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          initial={{ opacity: 0, y: 8 }}
                          key={`${plan.name}-${billing}`}
                          transition={{ duration: 0.18 }}
                        >
                          <p className="font-semibold text-3xl text-foreground tracking-tight">
                            ${price}
                            <span className="ml-1 font-normal text-muted-foreground text-sm">
                              {suffix}
                            </span>
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              monthlyEquivalent
                                ? "text-muted-foreground"
                                : "invisible"
                            )}
                          >
                            {monthlyEquivalent
                              ? `$${monthlyEquivalent}/mo billed annually`
                              : "placeholder"}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <ul className="flex-1 space-y-2">
                      {plan.features.map((feature) => (
                        <li
                          className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed"
                          key={feature}
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <a
                      className={cn(
                        buttonVariants({
                          size: "lg",
                          variant: plan.featured ? "default" : "outline",
                        }),
                        "mt-4 w-full gap-1.5"
                      )}
                      href={
                        plan.monthly === 0 && plan.yearly === 0
                          ? "/register"
                          : `/api/billing/checkout?plan=${plan.name.toLowerCase()}&billing=${billing}`
                      }
                    >
                      {plan.cta}
                      <ArrowRight className="size-3.5" />
                    </a>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-24">
        <motion.div
          className="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-3"
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.35 }}
          viewport={{ once: true, amount: 0.3 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          {policyNotes.map((note) => {
            const Icon = note.icon;

            return (
              <div
                className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2.5"
                key={note.text}
              >
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-3.5" />
                </span>
                <p className="text-muted-foreground text-xs">{note.text}</p>
              </div>
            );
          })}
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
