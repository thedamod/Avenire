"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, AnimatePresence, useMotionValueEvent, useScroll } from "framer-motion";
import { Badge } from "@avenire/ui/components/badge";

const features = [
  {
    id: "drive",
    title: "A Drive that actually remembers",
    description:
      "Upload PDFs, notes, and videos — Avenire reads, indexes, and interconnects your content. Ask questions across all sources, trace where you learned something, and discover hidden connections.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "compound",
    title: "Compound interest for your brain",
    description:
      "Every concept connects to what you already know. Avenire builds a knowledge graph that compounds over time — revisiting a topic brings back all linked context, reasoning chains, and insights.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: "interactive",
    title: "Interactivity",
    description:
      "Click into any reasoning step to explore \"why.\" Branch into tangents. Every interaction deepens your understanding graph and adapts to how you learn.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

/* ── Compound Visual: Animated learning timeline ── */
const timelineSteps = [
  { label: "Entropy", sub: "Core concept", time: "Day 1" },
  { label: "Thermodynamics", sub: "Connected", time: "Day 3" },
  { label: "Statistical Mech", sub: "Linked insight", time: "Day 5" },
  { label: "Arrow of Time", sub: "Emerged from graph", time: "Day 8" },
];

function CompoundVisual() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveStep((s) => (s + 1) % timelineSteps.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex items-center justify-center p-8"
    >
      <div className="w-full max-w-[280px] flex flex-col gap-0">
        {timelineSteps.map((step, i) => {
          const isActive = i <= activeStep;
          const isCurrent = i === activeStep;
          return (
            <div key={step.label} className="flex gap-3">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full border-2 shrink-0 z-10"
                  animate={{
                    borderColor: isActive ? "var(--primary)" : "var(--border)",
                    backgroundColor: isCurrent ? "var(--primary)" : "transparent",
                    boxShadow: isCurrent ? "0 0 10px var(--primary)" : "none",
                    scale: isCurrent ? 1.2 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                />
                {i < timelineSteps.length - 1 && (
                  <motion.div
                    className="w-[1.5px] flex-1 min-h-[32px]"
                    animate={{
                      backgroundColor: isActive ? "var(--primary)" : "var(--border)",
                      opacity: isActive ? 0.5 : 0.2,
                    }}
                    transition={{ duration: 0.4 }}
                  />
                )}
              </div>
              {/* Content */}
              <motion.div
                className="pb-5 -mt-0.5"
                animate={{ opacity: isActive ? 1 : 0.3 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-2">
                  <p className={`text-[12px] font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {isCurrent && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-[8px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded"
                    >
                      NEW
                    </motion.span>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                  {step.sub} · <span className="font-mono">{step.time}</span>
                </p>
                {/* Connection lines for current */}
                {isCurrent && i > 0 && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "100%" }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mt-2 flex items-center gap-1.5"
                  >
                    <div className="h-[1px] flex-1 bg-primary/20" />
                    <span className="text-[8px] font-mono text-primary/50 whitespace-nowrap">linked to {timelineSteps[i - 1].label}</span>
                    <div className="h-[1px] w-4 bg-primary/20" />
                  </motion.div>
                )}
              </motion.div>
            </div>
          );
        })}

        {/* Counter */}
        <motion.div
          className="flex items-center gap-2 mt-1 pl-[22px]"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-1 h-1 rounded-full bg-primary/50" />
          <span className="text-[8px] font-mono text-muted-foreground/40">
            {activeStep + 1} of {timelineSteps.length} concepts compounding
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ── Drive Visual: Multi-step file indexing ── */
const driveFiles = [
  { name: "lecture-7.pdf", type: "PDF", size: "2.4 MB" },
  { name: "research-notes.md", type: "MD", size: "14 KB" },
  { name: "quantum-vid.mp4", type: "VID", size: "340 MB" },
];

const extractedContent = [
  { heading: "Self-Attention Mechanism", text: "Each position attends to all positions in the previous layer..." },
  { heading: "Key Concepts Extracted", text: "Query (Q), Key (K), Value (V) vectors — scaled dot-product" },
  { heading: "3 Flashcards Generated", text: "Q: How is attention computed? → softmax(QKᵀ/√dₖ)V" },
];

function DriveVisual() {
  const [phase, setPhase] = useState<"scanning" | "indexed" | "expanded">("scanning");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (phase === "scanning") {
      timer = setTimeout(() => setPhase("indexed"), 3000);
    } else if (phase === "indexed") {
      timer = setTimeout(() => setPhase("expanded"), 1500);
    } else {
      // Hold expanded state, then restart cycle.
      timer = setTimeout(() => setPhase("scanning"), 5500);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  const isExpanded = phase === "expanded";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex items-center justify-center p-8"
    >
      <div className="w-full max-w-[290px] flex flex-col gap-2">
        {driveFiles.map((file, i) => {
          const isMiddle = i === 1;
          const shouldHide = isExpanded && !isMiddle;
          const shouldExpand = isExpanded && isMiddle;

          return (
            <motion.div
              key={file.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: shouldHide ? 0 : 1,
                x: 0,
                height: shouldHide ? 0 : "auto",
                marginBottom: shouldHide ? 0 : undefined,
              }}
              transition={{ duration: 0.5, delay: shouldHide ? 0 : i * 0.12 }}
              className="overflow-hidden"
            >
              <div className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-card/80 border transition-all duration-500 ${shouldExpand ? "border-primary/30 bg-primary/[0.03]" : "border-border/60"
                }`}>
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-[8px] font-bold font-mono text-primary tracking-wider">{file.type}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-[9px] text-muted-foreground/60">{file.size}</p>
                </div>
                {/* Status indicator */}
                <AnimatePresence mode="wait">
                  {phase === "scanning" ? (
                    <motion.div
                      key="scan"
                      className="w-1.5 h-1.5 rounded-full bg-primary/80"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 1.5, delay: i * 0.4, repeat: Infinity }}
                    />
                  ) : (
                    <motion.div
                      key="done"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-3.5 h-3.5 rounded-full bg-green-500/20 flex items-center justify-center"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="oklch(0.72 0.17 142)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Expanded content for middle file */}
              <AnimatePresence>
                {shouldExpand && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-2 pl-[44px]">
                      {extractedContent.map((item, j) => (
                        <motion.div
                          key={item.heading}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 + j * 0.15 }}
                          className="border-l-2 border-primary/20 pl-3 py-1"
                        >
                          <p className="text-[10px] font-medium text-foreground/80">{item.heading}</p>
                          <p className="text-[9px] text-muted-foreground/50 leading-relaxed mt-0.5">{item.text}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {/* Progress / status bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-1"
        >
          <AnimatePresence mode="wait">
            {phase === "scanning" ? (
              <motion.div key="progress" exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">Indexing</span>
                  <span className="text-[9px] font-mono text-primary">3/3</span>
                </div>
                <div className="h-[3px] w-full bg-border/40 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary/70 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 2.5, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                  {isExpanded ? "3 concepts extracted · 3 flashcards ready" : "All files indexed"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}

function FlashcardsVisual() {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setFlipped((f) => !f), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-8"
      style={{ perspective: "800px" }}
    >
      <div className="relative w-full max-w-[260px]">
        <motion.div
          className="relative w-full aspect-[4/3] cursor-pointer"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.7, type: "spring", stiffness: 100, damping: 15 }}
          onClick={() => setFlipped(!flipped)}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-xl bg-card border border-border flex flex-col items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <Badge variant="outline" className="mb-4 text-[8px]">Question</Badge>
            <p className="text-sm font-medium text-foreground leading-relaxed font-serif">
              What explains the Arrow of Time?
            </p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-xl bg-card border border-primary/20 flex flex-col items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <Badge variant="secondary" className="mb-4 text-[8px]">Answer</Badge>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The statistical tendency of macroscopic systems to evolve toward states of higher entropy.
            </p>
          </div>
        </motion.div>

        {/* Spaced repetition buttons */}
        <div className="h-14 flex items-end justify-center">
          <AnimatePresence>
            {flipped && (
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                {[
                  { label: "Again", time: "<1m", hover: "hover:border-red-500/30 hover:text-red-400" },
                  { label: "Hard", time: "2d", hover: "hover:border-orange-500/30 hover:text-orange-400" },
                  { label: "Good", time: "4d", hover: "hover:border-green-500/30 hover:text-green-400" },
                  { label: "Easy", time: "7d", hover: "hover:border-blue-500/30 hover:text-blue-400" },
                ].map((btn) => (
                  <motion.button
                    key={btn.label}
                    className={`flex flex-col items-center px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground transition-all duration-200 ${btn.hover}`}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="text-[10px] font-mono font-medium leading-none mb-0.5">{btn.time}</span>
                    <span className="text-[8px] opacity-50 leading-none">{btn.label}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function Visualizer({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="relative w-full aspect-square md:aspect-[4/3] rounded-2xl bg-background border border-border overflow-hidden flex items-center justify-center shadow-lg">
      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")", backgroundSize: "128px" }} />
      {/* Radial accent */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,var(--primary)/0.06,transparent_65%)]" />

      <AnimatePresence mode="wait">
        {activeIndex === 0 && <DriveVisual key="drive" />}
        {activeIndex === 1 && <CompoundVisual key="compound" />}
        {activeIndex === 2 && <FlashcardsVisual key="flashcards" />}
      </AnimatePresence>
    </div>
  );
}

/* ── Main Section ── */
export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-80px" });
  const [activeIndex, setActiveIndex] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sequenceRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!Number.isFinite(value)) {
      return;
    }
    const nextIndex = Math.min(features.length - 1, Math.floor(value * features.length));
    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  });

  return (
    <section id="how-it-works" className="py-24 md:py-28" ref={sectionRef}>
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10 md:hidden"
        >
          <span className="text-xs text-primary font-medium tracking-wider font-mono">
            {"{ How it works }"}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-3 text-foreground mb-2">
            How it works
          </h2>
          <p className="text-sm text-muted-foreground/70 max-w-xl">
            Scroll through three phases. The section stays pinned while each phase activates the next interactive state.
          </p>
        </motion.div>

        <div className="hidden md:block" ref={sequenceRef} style={{ height: `${features.length * 90}vh` }}>
          <div className="sticky top-20 h-[calc(100vh-5rem)]">
            <div className="h-full flex flex-col">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5 }}
                className="mb-3 shrink-0"
              >
                <span className="text-xs text-primary font-medium tracking-wider font-mono">
                  {"{ How it works }"}
                </span>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-3 text-foreground mb-2">
                  How it works
                </h2>
                <p className="text-sm text-muted-foreground/70 max-w-xl">
                  Scroll through three phases. The section stays pinned while each phase activates the next interactive state.
                </p>
              </motion.div>

              <div className="min-h-0 flex-1 grid grid-cols-[1fr_1.05fr] gap-14 items-center">
                <div className="relative pr-4">
                  <div className="space-y-3">
                    {features.map((feature, index) => {
                      const isActive = index === activeIndex;

                      return (
                        <motion.article
                          key={feature.id}
                          animate={{
                            opacity: isActive ? 1 : 0.45,
                            x: isActive ? 0 : -8,
                            scale: isActive ? 1 : 0.985,
                          }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className={`relative rounded-xl border px-6 py-6 pl-9 transition-colors duration-300 ${isActive
                            ? "border-primary/25 bg-primary/[0.05]"
                            : "border-border/80 bg-card/45"
                            }`}
                        >
                          <div
                            className={`absolute right-[2rem] top-7 h-2.5 w-2.5 rounded-full border transition-all duration-300 ${isActive
                              ? "border-primary bg-primary shadow-[0_0_8px_var(--primary)]"
                              : "border-border bg-background"
                              }`}
                          />
                          <div className="flex items-center gap-3">
                            <div className={`transition-all duration-300 ${isActive ? "text-primary opacity-100" : "text-muted-foreground opacity-45"}`}>
                              {feature.icon}
                            </div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-mono">
                              Step {(index + 1).toString().padStart(2, "0")}
                            </p>
                          </div>
                          <h3 className={`text-base font-medium mt-2 transition-colors duration-300 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                            {feature.title}
                          </h3>
                          <p className={`text-sm leading-relaxed mt-2 transition-colors duration-300 ${isActive ? "text-muted-foreground" : "text-muted-foreground/75"}`}>
                            {feature.description}
                          </p>
                        </motion.article>
                      );
                    })}
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.15 }}
                  className="relative"
                >
                  <Visualizer activeIndex={activeIndex} />
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:hidden space-y-7">
          {features.map((feature, index) => (
            <motion.article
              key={feature.id}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="rounded-2xl border border-border/80 bg-card/55 p-5"
            >
              <div className="flex items-center gap-3">
                <div className="text-primary">{feature.icon}</div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-mono">
                  Step {(index + 1).toString().padStart(2, "0")}
                </p>
              </div>
              <h3 className="text-xl font-semibold mt-3 text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground mt-2">
                {feature.description}
              </p>
              <div className="mt-5">
                <Visualizer activeIndex={index} />
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
