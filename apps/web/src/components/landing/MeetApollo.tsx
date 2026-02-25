"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import { Badge } from "@avenire/ui/components/badge";

/* ── Jargon / Simple pairs for the text eraser ── */
const textPairs = [
  {
    jargon: "The utilization of thermodynamic principles combined with statistical mechanical approaches yields an optimal framework for elucidating macroscopic entropy variations.",
    simple: "Heat and probability explain why things naturally become disordered over time.",
  },
  {
    jargon: "Quantum mechanical superposition of eigenstates enables non-deterministic wave function evolution prior to decoherence-induced collapse.",
    simple: "Particles exist in multiple states at once — until you look at them.",
  },
  {
    jargon: "Neuroplasticity-dependent synaptic potentiation facilitates engram consolidation during slow-wave oscillatory epochs.",
    simple: "Your brain strengthens memories while you sleep.",
  },
];

function TextEraser() {
  const [isSimplified, setIsSimplified] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);

  const handleSimplify = () => {
    if (isSimplified) return;
    setIsSimplified(true);
  };

  // Auto-reset after showing simplified text for a few seconds
  useEffect(() => {
    if (!isSimplified) return;
    const t = setTimeout(() => {
      setIsSimplified(false);
      setPairIndex((p) => (p + 1) % textPairs.length);
    }, 6000);
    return () => clearTimeout(t);
  }, [isSimplified]);

  const pair = textPairs[pairIndex];

  return (
    <div className="relative w-full aspect-square md:aspect-[4/3] rounded-2xl border border-border bg-background overflow-hidden flex flex-col shadow-lg">
      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")", backgroundSize: "128px" }} />
      {/* Radial accent */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,var(--primary)/0.05,transparent_60%)]" />
      {/* Content area */}
      <div className="relative flex-1 flex flex-col justify-center items-center px-8 md:px-12 z-10">
        {/* Jargon text */}
        <div className="absolute inset-x-8 md:inset-x-12 flex items-center justify-center pointer-events-none">
          <motion.p
            className="text-sm md:text-base text-muted-foreground/90 leading-relaxed font-mono text-center"
            animate={{
              opacity: isSimplified ? 0 : 0.7,
              filter: isSimplified ? "blur(6px)" : "blur(0px)",
            }}
            transition={{ duration: 0.8, delay: isSimplified ? 0 : 0.6 }}
          >
            &ldquo;{pair.jargon}&rdquo;
          </motion.p>
        </div>

        {/* Simplified text */}
        <div className="absolute inset-x-8 md:inset-x-12 flex items-center justify-center pointer-events-none">
          <motion.p
            className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground leading-snug text-center font-serif"
            animate={{
              opacity: isSimplified ? 1 : 0,
              filter: isSimplified ? "blur(0px)" : "blur(6px)",
            }}
            transition={{ duration: 0.8, delay: isSimplified ? 0.6 : 0 }}
          >
            &ldquo;{pair.simple}&rdquo;
          </motion.p>
        </div>
      </div>

      {/* Bottom bar with Simplify button */}
      <div className="relative z-10 flex items-center justify-between px-5 py-3 border-t border-border/60">
        <div className="flex items-center gap-2.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            animate={{
              backgroundColor: isSimplified
                ? "oklch(0.72 0.17 142)"
                : "var(--primary)",
              boxShadow: isSimplified
                ? "0 0 8px oklch(0.72 0.17 142 / 0.5)"
                : "0 0 8px var(--primary)",
            }}
            transition={{ duration: 0.3 }}
          />
          <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
            {isSimplified ? "First principles applied" : "Jargon detected"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-muted-foreground/30">
            {pairIndex + 1}/{textPairs.length}
          </span>
          <motion.button
            onClick={handleSimplify}
            disabled={isSimplified}
            className={`text-[11px] font-medium px-4 py-1.5 rounded-lg border transition-all duration-200 ${isSimplified
              ? "border-border/40 text-muted-foreground/30 cursor-default"
              : "border-primary/40 text-primary bg-primary/10 hover:bg-primary/15 hover:shadow-[0_0_12px_var(--primary)] cursor-pointer"
              }`}
            whileHover={!isSimplified ? { scale: 1.04 } : {}}
            whileTap={!isSimplified ? { scale: 0.96 } : {}}
          >
            {isSimplified ? "Simplifying..." : "✦ Simplify"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Section ── */
export function MeetApollo() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="meet-apollo" className="py-28" ref={ref}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
          {/* Left: Text Eraser Visual */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <TextEraser />
          </motion.div>

          {/* Right: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="order-1 lg:order-2"
          >
            <span className="text-xs text-primary font-medium tracking-wider font-mono">
              {"{ Your AI Tutor }"}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-3 mb-2 text-foreground">
              Meet Apollo
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground mb-6 font-serif italic">
              The Ghost of Richard Feynman
            </p>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-lg">
              Apollo doesn&apos;t hand you answers — it teaches. Inspired by Feynman&apos;s philosophy,
              it breaks complex ideas into first principles, identifies gaps in your understanding,
              and translates dense jargon into clear, intuitive concepts.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Step-by-step reasoning",
                "Gap detection",
                "First principles",
                "Adaptive depth",
              ].map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] px-3 py-1 h-auto font-normal hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-default"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
