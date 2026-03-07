"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calligraph } from "calligraph";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@avenire/ui/components/button";
import { Badge } from "@avenire/ui/components/badge";

/* ── Types ── */
interface ChatMessage {
  role: "user" | "ai";
  text: string;
  tag?: string;
  flashcard?: FlashcardArtifact;
}

interface FollowUp {
  label: string;
  response: ChatMessage[];
  streamFlashcards?: FlashcardArtifact[];
  docSections?: { heading: string; text: string }[];
  docTasks?: string[];
  docArtifacts?: DocArtifacts;
}

interface FlashcardArtifact {
  front: string;
  back: string;
  interval: string;
}

interface QuizArtifact {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface PlotArtifact {
  src: string;
  alt: string;
  caption: string;
}

interface DocArtifacts {
  flashcards?: FlashcardArtifact[];
  quiz?: QuizArtifact;
  plot?: PlotArtifact;
}

interface Session {
  id: string;
  icon: React.ReactNode;
  name: string;
  status: "in-progress" | "done" | "review";
  statusLabel: string;
  timeAgo: string;
  messages: ChatMessage[];
  followUps: FollowUp[];
  thinkingTime: string;
  thinkingSteps: string[];
  fileRef?: { name: string; changes: string };
  question?: { title: string; options: { id: number; label: string; selected: boolean }[] };
  docTitle: string;
  docBreadcrumb: string;
  docSections: { heading: string; text: string }[];
  docTasks: string[];
  artifacts?: DocArtifacts;
}

interface DocView {
  title: string;
  breadcrumb: string;
  sections: { heading: string; text: string }[];
  tasks: string[];
  artifacts?: DocArtifacts;
}

declare global {
  interface Window {
    katex?: {
      renderToString: (
        expression: string,
        options?: {
          displayMode?: boolean;
          throwOnError?: boolean;
        }
      ) => string;
    };
  }
}

const CALLIGRAPH_TEXTS = ["Collect.", "Think.", "Learn."] as const;

/* ── Icons ── */
const SearchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const CardsIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
const QuizIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const PlotIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
const FileIcon = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;

/* ── Session Data ── */
const sessions: Session[] = [
  {
    id: "rag",
    icon: SearchIcon,
    name: "Deep Tutor: Transformer Self-Attention",
    status: "in-progress",
    statusLabel: "Linking notes with core ML concepts...",
    timeAgo: "now",
    thinkingTime: "4s",
    thinkingSteps: [
      "Indexed uploaded-notes.pdf",
      "Connected attention to prior linear algebra concepts",
    ],
    fileRef: { name: "attention-notes.md", changes: "+24" },
    messages: [
      {
        role: "user",
        text: "Explain how self-attention works in transformer models using my uploaded notes",
      },
      {
        role: "ai",
        text:
          "Scanning your notes and aligning them with core linear algebra intuition...",
      },
      {
        role: "ai",
        text:
          "Self-attention represents each token with Query (Q), Key (K), and Value (V) vectors. Relevance is computed via $QK^T$ and scaled by $\\sqrt{d_k}$ to stabilize gradients.",
      },
      {
        role: "ai",
        text:
          'From your notes: "Attention lets each token selectively focus on the most informative tokens in the sequence."',
      },
    ],
    question: {
      title: "How should we deepen this?",
      options: [
        { id: 1, label: "Derive the attention equation step by step", selected: false },
        { id: 2, label: "Relate attention to dot-product similarity", selected: false },
        { id: 3, label: "Full derivation + geometric intuition", selected: true },
      ],
    },
    followUps: [
      {
        label: "Derive the attention equation",
        response: [
          {
            role: "ai",
            text:
              "$$Attention(Q,K,V)=softmax\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)\\cdot V$$\n\n1. $QK^T$ gives similarity scores\n2. divide by $\\sqrt{d_k}$ for variance control\n3. softmax turns scores into attention weights\n4. weighted sum with $V$ gives contextual embeddings",
            tag: "Deep Reasoning",
          },
        ],
        streamFlashcards: [
          {
            front: "$$Attention(Q,K,V)=softmax\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$",
            back: "Core attention equation combining similarity, normalization, and weighted values.",
            interval: "4d",
          },
        ],
        docArtifacts: {
          plot: {
            src: "/matplot/transformer-attention-light.svg",
            alt: "Transformer attention concentration across layers",
            caption: "Attention heads specialize across layers with stronger long-range signal in deeper blocks.",
          },
        },
        docSections: [
          {
            heading: "Derivation Snapshot",
            text: "$$Attention(Q,K,V)=softmax\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$",
          },
          {
            heading: "Attention Context",
            text: "Deeper layers focus on semantically relevant tokens while early layers stay broadly distributed.",
          },
        ],
      },
      {
        label: "Explain geometric intuition",
        response: [
          {
            role: "ai",
            text:
              "Dot product Q·K measures cosine-aligned similarity in embedding space. Higher alignment ⇒ higher attention weight ⇒ stronger contextual influence.",
            tag: "Concept Linking",
          },
        ],
        docArtifacts: {
          plot: {
            src: "/matplot/transformer-attention-light.svg",
            alt: "Transformer attention specialization graph",
            caption: "Geometric alignment improves as head attention sharpens layer by layer.",
          },
        },
      },
    ],
    docTitle: "Transformer Attention — Concept Graph",
    docBreadcrumb: "Memory > ML > attention-notes.md",
    docSections: [
      {
        heading: "Self-Attention Core Idea",
        text:
          "Each token computes relevance with every other token, enabling dynamic context-dependent representations.",
      },
      {
        heading: "Scaling Insight",
        text:
          "Dividing by √dₖ prevents large dot-product magnitudes that would saturate softmax and harm gradients.",
      },
    ],
    docTasks: [
      "Summarize Q/K/V geometrically",
      "Compare dot-product vs cosine similarity",
      "Generate derivation flashcards",
    ],
    artifacts: {
      plot: {
        src: "/matplot/transformer-attention-light.svg",
        alt: "Transformer attention head concentration graph",
        caption: "Attention distribution evolves from diffuse to focused representations.",
      },
    },
  },

  {
    id: "flashcards",
    icon: CardsIcon,
    name: "Flashcards: Integration Formulae",
    status: "in-progress",
    statusLabel: "18 formula cards added to revision graph",
    timeAgo: "8m",
    thinkingTime: "3s",
    thinkingSteps: [
      "Parsed integration-formulae.pdf",
      "Clustered by substitution / parts / standard forms",
    ],
    fileRef: { name: "integration-flashcards.md", changes: "+54" },
    messages: [
      {
        role: "user",
        text: "Create flashcards for important integration formulae for",
      },
      {
        role: "ai",
        text:
          "Extracting standard integrals and organizing by solving strategy...",
      },
      {
        role: "ai",
        text:
          "Generated 18 flashcards grouped into substitution, by-parts, and special integrals.",
      },
      {
        role: "ai",
        text:
          "Card 1 — Q: $\\int sin(ax)\\,dx$\nA: $-\\frac{cos(ax)}{a}+C$\n\nCard 2 — Q: $\\int e^{ax}\\,dx$\nA: $\\frac{e^{ax}}{a}+C$\n\nCard 3 — Q: $\\int \\frac{1}{x^2+a^2}\\,dx$\nA: $\\frac{1}{a}tan^{-1}(x/a)+C$",
      },
    ],
    followUps: [
      {
        label: "Make them problem-oriented",
        response: [
          {
            role: "ai",
            text:
              "Upgrading to application-based recall:\n\nQ: Evaluate ∫ x e^{x} dx\nA: Use integration by parts → (x−1)e^{x} + C",
            tag: "Deep Tutor",
          },
        ],
        streamFlashcards: [
          {
            front: "$$\\int xe^x\\,dx$$",
            back: "$$(x-1)e^x + C$$",
            interval: "2d",
          },
        ],
        docSections: [
          {
            heading: "Applied Recall Upgrade",
            text: "Deck now emphasizes worked integrals over direct formula recall.",
          },
        ],
      },
      {
        label: "Group by solving strategy",
        response: [
          {
            role: "ai",
            text:
              "Reorganized cards:\n• Direct standard forms\n• Trig substitution\n• Integration by parts\n• Partial fractions",
            tag: "Organization",
          },
        ],
        streamFlashcards: [
          {
            front: "When should you use integration by parts?",
            back: "When integrand is a product where differentiating one term simplifies it.",
            interval: "1d",
          },
        ],
        docSections: [
          {
            heading: "Deck Structure",
            text: "Cards are grouped into direct forms, trig substitution, by-parts, and partial fractions.",
          },
        ],
      },
    ],
    docTitle: "Integration Formulae — Revision Deck",
    docBreadcrumb: "Revision > Mathematics > integration-flashcards.md",
    docSections: [
      {
        heading: "Coverage",
        text:
          "Standard integrals, inverse trig forms, exponential integrals, and by-parts identities.",
      },
    ],
    docTasks: [
      "Review standard integrals daily",
      "Practice mixed application problems",
      "Mark weak formulae for spaced repetition",
    ],
    artifacts: {
      flashcards: [
        {
          front: "$$\\int e^{ax}\\,dx$$",
          back: "$$\\frac{e^{ax}}{a}+C$$",
          interval: "3d",
        },
        {
          front: "$$\\int \\frac{1}{x^2+a^2}\\,dx$$",
          back: "$$\\frac{1}{a}tan^{-1}(x/a)+C$$",
          interval: "1d",
        },
      ],
    },
  },

  {
    id: "quiz",
    icon: QuizIcon,
    name: "Adaptive Quiz: Quantum Mechanics Fundamentals",
    status: "review",
    statusLabel: "Score: 8/10 • Concept gaps detected",
    timeAgo: "30m",
    thinkingTime: "2s",
    thinkingSteps: [
      "Generated adaptive physics question bank",
      "Adjusted difficulty using response patterns",
    ],
    messages: [
      {
        role: "user",
        text: "Quiz me on quantum mechanics fundamentals",
      },
      {
        role: "ai",
        text:
          "Starting adaptive quiz — questions will target conceptual weak spots dynamically.",
      },
      {
        role: "ai",
        text:
          "Q1: What does the Heisenberg Uncertainty Principle imply?\n\n  1. Energy is discrete\n  2. Position and momentum cannot both be precisely determined\n  3. Light behaves as both wave and particle\n  4. Wavefunctions collapse on observation",
      },
    ],
    followUps: [
      {
        label: "Answer: Option 2",
        response: [
          {
            role: "ai",
            text:
              "Correct. $$\\Delta x\\Delta p \\geq \\hbar/2$$\n\nIncreasing precision in position increases uncertainty in momentum.\n\nQ2: What does $$|\\psi(x,t)|^2$$ represent physically?",
            tag: "Adaptive Quiz",
          },
        ],
      },
      {
        label: "Explain other options",
        response: [
          {
            role: "ai",
            text:
              "1 → Planck’s quantization.\n3 → Wave-particle duality.\n4 → Measurement postulate in Copenhagen interpretation.",
            tag: "Concept Clarification",
          },
        ],
      },
    ],
    docTitle: "Quantum Mechanics — Mastery Analysis",
    docBreadcrumb: "Quizzes > Physics > qm-fundamentals",
    docSections: [
      {
        heading: "Topics Covered",
        text:
          "Uncertainty principle, wavefunctions, measurement interpretation, and quantum states.",
      },
      {
        heading: "Performance Insight",
        text:
          "Strong conceptual clarity overall. Weakness detected in tunneling and superposition problems.",
      },
    ],
    docTasks: [
      "Review incorrect answers",
      "Solve tunneling numericals",
      "Retake quiz after revision",
    ],
    artifacts: {
      quiz: {
        question: "Which inequality encodes Heisenberg uncertainty?",
        options: [
          "$E=mc^2$",
          "$\\Delta x\\Delta p \\geq \\hbar/2$",
          "$F=ma$",
          "$\\nabla^2\\psi=0$",
        ],
        correctIndex: 1,
        explanation: "The lower bound is set by $\\hbar/2$ and links position and momentum uncertainty.",
      },
    },
  },

  {
    id: "plots",
    icon: PlotIcon,
    name: "Physics Plot: Projectile Trajectory Analysis",
    status: "done",
    statusLabel: "Interactive motion visualization ready",
    timeAgo: "20m",
    thinkingTime: "5s",
    thinkingSteps: [
      "Simulated projectile equations of motion",
      "Computed trajectory under varying angles",
    ],
    fileRef: { name: "projectile-sim.csv", changes: "+180 rows" },
    messages: [
      {
        role: "user",
        text:
          "Plot the trajectory of a projectile for different launch angles",
      },
      {
        role: "ai",
        text:
          "Using equations $$x=u\\,cos\\theta\\,t$$ and $$y=u\\,sin\\theta\\,t-\\frac{1}{2}gt^2$$ to simulate motion...",
      },
      {
        role: "ai",
        text:
          "Generated trajectory curves for θ = 15°, 30°, 45°, 60°.\n\n• Maximum range at 45°\n• Higher angles → greater height, shorter range\n• Symmetry observed for complementary angles (30° & 60°)",
      },
    ],
    followUps: [
      {
        label: "Add air resistance",
        response: [
          {
            role: "ai",
            text:
              "Included drag force F_d = kv². Trajectory becomes asymmetric with reduced range and lower peak height.",
            tag: "Physics Analysis",
          },
        ],
      },
      {
        label: "Show range vs angle graph",
        response: [
          {
            role: "ai",
            text:
              "Plotted R(θ) = (u² sin2θ)/g. Peak observed at θ = 45°, confirming theoretical maximum range.",
            tag: "Derivation Insight",
          },
        ],
      },
    ],
    docTitle: "Projectile Motion — Concept Visualization",
    docBreadcrumb: "Physics > Kinematics > projectile-analysis",
    docSections: [
      {
        heading: "Equations Used",
        text:
          "$$x=u\\,cos\\theta\\,t$$\n$$y=u\\,sin\\theta\\,t-\\frac{1}{2}gt^2$$\n$$R=\\frac{u^2 sin(2\\theta)}{g}$$",
      },
      {
        heading: "Key Insight",
        text:
          "Complementary angles yield equal ranges, while 45° maximizes horizontal displacement.",
      },
    ],
    docTasks: [
      "Verify range derivation",
      "Experiment with different initial velocities",
      "Extend to motion with drag",
    ],
    artifacts: {
      plot: {
        src: "/matplot/projectile-light.svg",
        alt: "Minimal matplotlib-style light projectile plot",
        caption: "Pre-generated static plot preview embedded in the doc panel.",
      },
    },
  },
];

function getInitialDocView(session: Session): DocView {
  return {
    title: session.docTitle,
    breadcrumb: session.docBreadcrumb,
    sections: session.docSections,
    tasks: session.docTasks,
    artifacts: session.artifacts,
  };
}

function getFollowUpDocView(session: Session, label: string, resultText: string): DocView {
  const firstLine = resultText.split("\n").find(Boolean)?.trim() ?? "Update applied.";
  const workspaceName = session.docBreadcrumb.split(" > ")[0] ?? "Workspace";

  return {
    title: `${session.docTitle} · Update`,
    breadcrumb: `${workspaceName} > live-update`,
    sections: [
      { heading: "Selected Follow-up", text: label },
      { heading: "Updated Result", text: firstLine },
      ...session.docSections.slice(0, 1),
    ],
    tasks: [
      `Review "${label}" output`,
      ...session.docTasks.slice(0, 2),
    ],
    artifacts: session.artifacts,
  };
}

function getFollowUpDocViewFromAction(session: Session, followUp: FollowUp): DocView {
  const firstLine = followUp.response[0]?.text.split("\n").find(Boolean)?.trim() ?? "Update applied.";
  const workspaceName = session.docBreadcrumb.split(" > ")[0] ?? "Workspace";

  return {
    title: `${session.docTitle} · Update`,
    breadcrumb: `${workspaceName} > live-update`,
    sections: [
      { heading: "Selected Follow-up", text: followUp.label },
      { heading: "Updated Result", text: firstLine },
      ...(followUp.docSections ?? session.docSections.slice(0, 1)),
    ],
    tasks: followUp.docTasks ?? [
      `Review "${followUp.label}" output`,
      ...session.docTasks.slice(0, 2),
    ],
    artifacts: followUp.docArtifacts ?? session.artifacts,
  };
}

function estimateStreamDuration(messages: ChatMessage[], speed = 12) {
  return messages.reduce((total, msg) => {
    if (msg.role === "user") {
      return total + 400;
    }
    return total + msg.text.length * speed + 300;
  }, 0);
}

/* ── Typewriter / Streamer ── */
function useStreamer(messages: ChatMessage[], speed = 12, enabled = true) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const activeVisibleCount = enabled ? visibleCount : messages.length;
  const activeCurrentText = enabled ? currentText : "";
  const isDone = activeVisibleCount >= messages.length;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (visibleCount >= messages.length) {
      return;
    }
    const msg = messages[visibleCount];
    if (msg.role === "user") {
      const t = setTimeout(() => { setVisibleCount(v => v + 1); setCurrentText(""); }, 400);
      return () => clearTimeout(t);
    }
    if (currentText.length < msg.text.length) {
      const t = setTimeout(() => setCurrentText(msg.text.slice(0, currentText.length + 1)), speed);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setVisibleCount(v => v + 1); setCurrentText(""); }, 300);
      return () => clearTimeout(t);
    }
  }, [enabled, visibleCount, currentText, messages, speed]);

  return {
    completed: messages.slice(0, activeVisibleCount),
    partial: !isDone
      ? {
        ...messages[activeVisibleCount],
        text: messages[activeVisibleCount].role === "user" ? messages[activeVisibleCount].text : activeCurrentText,
      }
      : null,
    isDone,
  };
}

const KATEX_CSS_ID = "katex-css";
const KATEX_SCRIPT_ID = "katex-script";

/**
 * Ensures KaTeX CSS and script are present in the document and invokes `onReady` when KaTeX is usable.
 *
 * Adds the KaTeX stylesheet to the document head if missing, loads the KaTeX script if not already present, and calls `onReady` as soon as `window.katex.renderToString` is available. When the script finishes loading the function dispatches a `katex-ready` DOM event before invoking `onReady`.
 *
 * @param onReady - Callback invoked once KaTeX's `renderToString` is available.
 */
function ensureKatexAssets(onReady: () => void) {
  const doc = document;

  if (!doc.getElementById(KATEX_CSS_ID)) {
    const link = doc.createElement("link");
    link.id = KATEX_CSS_ID;
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    doc.head.appendChild(link);
  }

  if (typeof window.katex?.renderToString === "function") {
    onReady();
    return;
  }

  const existingScript = doc.getElementById(KATEX_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    const handleLoad = () => onReady();
    existingScript.addEventListener("load", handleLoad, { once: true });
    return;
  }

  const katexScript = doc.createElement("script");
  katexScript.id = KATEX_SCRIPT_ID;
  katexScript.src = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";
  katexScript.defer = true;
  katexScript.onload = () => {
    window.dispatchEvent(new Event("katex-ready"));
    onReady();
  };
  doc.head.appendChild(katexScript);
}

type LatexChunk =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

function splitLatexChunks(text: string): LatexChunk[] {
  const chunks: LatexChunk[] = [];
  const regex = /\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      chunks.push({ type: "math", value: match[1], display: true });
    } else if (match[2]) {
      chunks.push({ type: "math", value: match[2], display: false });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    chunks.push({ type: "text", value: text.slice(lastIndex) });
  }
  return chunks;
}

function renderPlainText(text: string, keyPrefix: string) {
  return text.split("\n").map((line, i, arr) => (
    <span key={`${keyPrefix}-${i}`}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));
}

function LatexText({ text, katexReady }: { text: string; katexReady: boolean }) {
  const chunks = splitLatexChunks(text);

  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.type === "text") {
          return renderPlainText(chunk.value, `text-${i}`);
        }

        const canRender =
          typeof window !== "undefined" &&
          katexReady &&
          typeof window.katex?.renderToString === "function";

        if (!canRender) {
          return (
            <span
              key={`math-fallback-${i}`}
              className={chunk.display ? "block font-mono text-[10px] my-1" : "font-mono text-[10px]"}
            >
              {chunk.display ? `$$${chunk.value}$$` : `$${chunk.value}$`}
            </span>
          );
        }

        const html = window.katex!.renderToString(chunk.value, {
          displayMode: chunk.display,
          throwOnError: false,
        });

        return (
          <span
            key={`math-${i}`}
            className={chunk.display ? "block my-1 overflow-x-auto" : "inline-block align-middle"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </>
  );
}

function ChatFlashcard({ card, katexReady }: { card: FlashcardArtifact; katexReady: boolean }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[280px]"
      style={{ perspective: "900px" }}
    >
      <motion.div
        className="relative w-full aspect-[4/3] cursor-pointer"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.65, type: "spring", stiffness: 105, damping: 16 }}
        style={{ transformStyle: "preserve-3d" }}
        onClick={() => setFlipped((v) => !v)}
      >
        <div
          className="absolute inset-0 rounded-xl bg-card border border-border p-4 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[8px] h-4">Question</Badge>
            <span className="text-[8px] font-mono text-primary">{card.interval}</span>
          </div>
          <div className="text-[11px] text-foreground leading-relaxed">
            <LatexText text={card.front} katexReady={katexReady} />
          </div>
          <span className="text-[8px] text-muted-foreground/70">Click to flip</span>
        </div>

        <div
          className="absolute inset-0 rounded-xl bg-card border border-primary/25 p-4 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <Badge variant="secondary" className="text-[8px] h-4 w-fit">Answer</Badge>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            <LatexText text={card.back} katexReady={katexReady} />
          </div>
          <span className="text-[8px] text-muted-foreground/70">Click to flip back</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Message Bubble ── */
function Msg({ msg, isStreaming = false, katexReady }: { msg: ChatMessage; isStreaming?: boolean; katexReady: boolean }) {
  const isUser = msg.role === "user";

  if (msg.flashcard) {
    return (
      <div className="flex justify-start">
        <ChatFlashcard card={msg.flashcard} katexReady={katexReady} />
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[92%] rounded-md px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${isUser && "bg-primary/10 text-foreground border border-primary/20"
        }`}>
        {msg.tag && (
          <Badge variant="secondary" className="text-[8px] mb-1 mr-1 h-4">{msg.tag}</Badge>
        )}
        <LatexText text={msg.text} katexReady={katexReady} />
        {isStreaming && <span className="inline-block w-[1.5px] h-3 bg-primary ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}

/**
 * Renders the interactive demo chat and document workspace for a session.
 *
 * Presents a streaming chat view with user and AI messages, interactive question and follow-up controls,
 * and a synchronized document panel showing sections, tasks, and study artifacts (flashcards, quiz, plot).
 *
 * @param session - Session data used to initialize messages, questions, follow-ups, document view, and artifacts.
 * @param onStreamComplete - Callback invoked with the session id when streaming of an in-progress session finishes.
 * @returns The React element that composes the demo chat and document panels for the provided session.
 */
function DemoWindow({
  session,
  onStreamComplete,
}: {
  session: Session;
  onStreamComplete: (sessionId: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [question, setQuestion] = useState(session.question);
  const [followUps, setFollowUps] = useState(session.followUps);
  const [docView, setDocView] = useState<DocView>(() => getInitialDocView(session));
  const [docFlashcardIndex, setDocFlashcardIndex] = useState(0);
  const [katexReady, setKatexReady] = useState(false);

  const shouldStream = session.status === "in-progress";
  const { completed, partial, isDone } = useStreamer(messages, 12, shouldStream);
  const chatRef = useRef<HTMLDivElement>(null);
  const pendingTimersRef = useRef<number[]>([]);
  const hasPromotedRef = useRef(false);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [completed, partial]);

  useEffect(() => {
    const markReady = () => setKatexReady(typeof window.katex?.renderToString === "function");
    ensureKatexAssets(markReady);
    window.addEventListener("katex-ready", markReady);
    markReady();
    return () => {
      window.removeEventListener("katex-ready", markReady);
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      pendingTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    hasPromotedRef.current = false;
  }, [session.id]);

  useEffect(() => {
    if (!shouldStream || !isDone || hasPromotedRef.current) {
      return;
    }

    hasPromotedRef.current = true;
    onStreamComplete(session.id);
  }, [isDone, onStreamComplete, session.id, shouldStream]);

  const handleOptionClick = (optId: number) => {
    if (!question) return;
    const selectedOpt = question.options.find(o => o.id === optId)!;

    // Briefly show visual selection
    setQuestion({
      ...question,
      options: question.options.map(o => ({ ...o, selected: o.id === optId }))
    });

    // Simulate following the option
    setTimeout(() => {
      const responseText = `I've updated the workspace with the changes requested for "${selectedOpt.label}". The relevant files and plots are now available in your sidebar.`;
      setMessages(prev => [
        ...prev,
        { role: "user", text: selectedOpt.label },
        { role: "ai", text: responseText }
      ]);
      setDocView(getFollowUpDocView(session, selectedOpt.label, responseText));
      setDocFlashcardIndex(0);
      setQuestion(undefined);
    }, 300);
  };

  const handleFollowUpClick = (fu: FollowUp) => {
    const streamedMessages = [
      { role: "user" as const, text: fu.label },
      ...fu.response,
    ];

    setMessages(prev => [
      ...prev,
      { role: "user", text: fu.label },
      ...fu.response
    ]);
    const nextDocView = getFollowUpDocViewFromAction(session, fu);

    if (fu.streamFlashcards && fu.streamFlashcards.length > 0) {
      nextDocView.artifacts = {
        ...(nextDocView.artifacts ?? {}),
        flashcards: [
          ...(nextDocView.artifacts?.flashcards ?? []),
          ...fu.streamFlashcards,
        ],
      };
    }

    setDocView(nextDocView);
    setDocFlashcardIndex(0);
    setFollowUps(prev => prev.filter(f => f.label !== fu.label));

    if (fu.streamFlashcards && fu.streamFlashcards.length > 0) {
      const delay = estimateStreamDuration(streamedMessages) + 120;
      const timer = window.setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          ...fu.streamFlashcards!.map((card) => ({
            role: "ai" as const,
            text: "",
            tag: "Flashcard",
            flashcard: card,
          })),
        ]);
      }, delay);

      pendingTimersRef.current.push(timer);
    }
  };

  const [docRoot, ...docRest] = docView.breadcrumb.split(" > ");
  const docLeaf = docRest.join(" > ");
  const docCards = docView.artifacts?.flashcards ?? [];
  const activeDocCardIndex = docCards.length > 0
    ? ((docFlashcardIndex % docCards.length) + docCards.length) % docCards.length
    : 0;

  return (
    <div className="flex min-h-[460px] overflow-x-auto">
      {/* ── Chat Panel ── */}
      <div className="flex-1 lg:flex-none lg:w-[500px] shrink-0 flex flex-col min-w-[320px]">
        {/* Chat header */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground truncate">{session.name.replace("...", "")}</span>
          <Badge variant="outline" className="text-[8px] h-4">
            {session.status === "in-progress" ? "In Progress" : session.status === "done" ? "Done" : "Review"}
          </Badge>
        </div>

        {/* Messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
          {completed.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}>
              <Msg msg={m} katexReady={katexReady} />
            </motion.div>
          ))}
          {partial && (
            <motion.div key="partial" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Msg msg={partial} isStreaming katexReady={katexReady} />
            </motion.div>
          )}

          {/* Thinking steps + file ref (after first AI message) */}
          {completed.length >= 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span>Thought {session.thinkingTime}</span>
              {session.thinkingSteps.map((s, i) => (
                <span key={i} className="text-muted-foreground/60">· {s}</span>
              ))}
            </motion.div>
          )}
          {completed.length >= 2 && session.fileRef && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="flex items-center gap-1.5 bg-muted/30 border border-border rounded px-2.5 py-1.5 w-fit"
            >
              <span className="text-primary">{FileIcon}</span>
              <span className="text-[10px] text-primary font-medium">{session.fileRef.name}</span>
              <span className="text-[10px] text-muted-foreground">{session.fileRef.changes}</span>
            </motion.div>
          )}

          {/* Questions */}
          {isDone && question && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="space-y-2 pt-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-medium">Questions</span>
                <div className="flex gap-0.5">
                  <button className="text-muted-foreground/40 hover:text-muted-foreground"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
                  <button className="text-muted-foreground/40 hover:text-muted-foreground"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg></button>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-foreground/90">{question.title}</p>
              <div className="space-y-1">
                {question.options.map((opt) => (
                  <div key={opt.id}
                    onClick={() => handleOptionClick(opt.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-[11px] cursor-pointer transition-all ${opt.selected
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/20"
                      }`}
                  >
                    <span className="font-mono text-primary/70 text-[10px]">{opt.id}</span>
                    {opt.label}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Follow-up buttons */}
          {isDone && !question && followUps.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="pt-1 space-y-1">
              {followUps.map((fu, i) => (
                <button key={i} onClick={() => handleFollowUpClick(fu)}
                  className="block w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-3 py-2 rounded-md border border-border hover:border-primary/20 hover:bg-primary/5 transition-all"
                >
                  {fu.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Input bar */}
        <div className="px-4 py-2 border-t border-border">
          <div className="flex items-center bg-muted/20 border border-border rounded-md px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground/40 flex-1">Add a follow-up...</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground/40">Apollo 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Doc Panel ── */}
      <div className="hidden lg:flex flex-col w-[280px] shrink-0 border-l border-border bg-muted/5">
        {/* Doc header */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
            <span className="text-muted-foreground/50">{docRoot} ›</span>
            <span className="text-foreground/80 font-medium">{docLeaf}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground/40">Apollo 1</span>
          </div>
        </div>

        {/* Doc content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <h3 className="text-sm font-bold text-foreground">{docView.title}</h3>

          {docView.sections.map((sec, i) => (
            <div key={i}>
              <h4 className="text-[10px] font-semibold text-foreground/70 mb-1">{sec.heading}</h4>
              <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                <LatexText text={sec.text} katexReady={katexReady} />
              </div>
            </div>
          ))}

          {(docView.artifacts?.flashcards || docView.artifacts?.quiz || docView.artifacts?.plot) && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-semibold text-foreground/70">Study Artifacts</h4>

              {docView.artifacts?.flashcards && docView.artifacts.flashcards.length > 0 && (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-card/70 p-2">
                    <ChatFlashcard card={docCards[activeDocCardIndex]} katexReady={katexReady} />
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setDocFlashcardIndex((i) => i - 1)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/20 transition-colors disabled:opacity-40"
                      disabled={docCards.length <= 1}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Prev
                    </button>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {activeDocCardIndex + 1} / {docCards.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocFlashcardIndex((i) => i + 1)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/20 transition-colors disabled:opacity-40"
                      disabled={docCards.length <= 1}
                    >
                      Next
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {docView.artifacts?.quiz && (
                <div className="rounded-md border border-border bg-card/70 p-2.5 space-y-2">
                  <span className="text-[8px] uppercase tracking-wide text-muted-foreground">Quiz Check</span>
                  <div className="text-[10px] text-foreground/90 leading-relaxed">
                    <LatexText text={docView.artifacts.quiz.question} katexReady={katexReady} />
                  </div>
                  <div className="space-y-1">
                    {docView.artifacts.quiz.options.map((opt, i) => (
                      <div
                        key={i}
                        className={`rounded px-2 py-1 text-[10px] border ${i === docView.artifacts?.quiz?.correctIndex
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                          }`}
                      >
                        <LatexText text={opt} katexReady={katexReady} />
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    <LatexText text={docView.artifacts.quiz.explanation} katexReady={katexReady} />
                  </div>
                </div>
              )}

              {docView.artifacts?.plot && (
                <div className="rounded-md border border-border bg-card/70 p-2.5 space-y-2">
                  <span className="text-[8px] uppercase tracking-wide text-muted-foreground">Plot Preview</span>
                  <Image
                    src={docView.artifacts.plot.src}
                    alt={docView.artifacts.plot.alt}
                    width={760}
                    height={460}
                    className="w-full rounded border border-border/70 bg-background object-cover"
                  />
                  <p className="text-[9px] text-muted-foreground leading-relaxed">{docView.artifacts.plot.caption}</p>
                </div>
              )}
            </div>
          )}

          {docView.tasks.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-foreground/70 mb-2">{docView.tasks.length} Tasks</h4>
              <div className="space-y-2">
                {docView.tasks.map((task, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-3.5 h-3.5 rounded-full border border-border mt-0.5 flex-shrink-0" />
                    <span className="text-[10px] text-muted-foreground leading-relaxed">{task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground/40 pt-2">
            Add a task, ⌘K to generate...
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Hero ── */
export function Hero() {
  const [sessionState, setSessionState] = useState<Session[]>(sessions);
  const [activeId, setActiveId] = useState(sessions[0].id);
  const active = sessionState.find((s) => s.id === activeId) ?? sessionState[0];
  const inProgress = sessionState.filter((s) => s.status === "in-progress");
  const readyForReview = sessionState.filter((s) => s.status !== "in-progress");

  const handleSessionClick = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleStreamComplete = useCallback((id: string) => {
    setSessionState((prev) =>
      prev.map((session) =>
        session.id === id && session.status === "in-progress"
          ? {
            ...session,
            status: "done",
            statusLabel: "Completed",
            timeAgo: "now",
          }
          : session
      )
    );
  }, []);

  // Calligraph text rotation
  const [calligraphIndex, setCalligraphIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCalligraphIndex((prev) => (prev + 1) % CALLIGRAPH_TEXTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="pt-28 pb-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] xl:grid-cols-[1fr_1.4fr] gap-6 lg:gap-10 items-center min-h-[480px]">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
              <span className="text-foreground inline-flex items-center">
                <Calligraph animation="snappy">
                  {CALLIGRAPH_TEXTS[calligraphIndex]}
                </Calligraph>
              </span>
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              An interactive AI workspace that breaks down complex ideas step by step and builds genuine understanding.
            </p>
            <div className="flex items-center gap-2">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Get started free
              </Link>
            </div>
          </motion.div>

          {/* Right: Cursor-style Demo Window */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <div className="rounded-xl border border-border overflow-hidden bg-card shadow-xl">
              {/* Window chrome */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
                <span className="text-[11px] self-middle text-foreground font-medium">Avenire</span>
                <Link href="/register" className="text-[10px] text-primary font-medium cursor-pointer hover:underline">
                  Get Avenire
                </Link>
              </div>

              <div className="flex  h-[600px]">
                {/* Sidebar — Cursor style */}
                <div className="hidden md:flex flex-col w-[185px] border-r border-border bg-muted/10">
                  {/* In progress */}
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      In Progress {inProgress.length}
                    </span>
                  </div>
                  {inProgress.map(s => (
                    <button key={s.id} onClick={() => handleSessionClick(s.id)}
                      className={`w-full text-left px-3 py-2.5 transition-all border-l-2 ${s.id === activeId ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/30"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={s.id === activeId ? "text-primary" : "text-muted-foreground/60"}>{s.icon}</span>
                        <span className={`text-[11px] truncate ${s.id === activeId ? "text-foreground font-medium" : "text-foreground/60"}`}>{s.name}</span>
                        <span className="text-[9px] text-muted-foreground/40 ml-auto flex-shrink-0">{s.timeAgo}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate pl-[22px] mt-0.5">{s.statusLabel}</p>
                    </button>
                  ))}

                  {/* Ready for review */}
                  <div className="px-3 py-2 border-t border-b border-border">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Ready for Review {readyForReview.length}
                    </span>
                  </div>
                  {readyForReview.map(s => (
                    <button key={s.id} onClick={() => handleSessionClick(s.id)}
                      className={`w-full text-left px-3 py-2.5 transition-all border-l-2 ${s.id === activeId ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/30"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={s.id === activeId ? "text-primary" : "text-muted-foreground/60"}>{s.icon}</span>
                        <span className={`text-[11px] truncate ${s.id === activeId ? "text-foreground font-medium" : "text-foreground/60"}`}>{s.name}</span>
                        <span className="text-[9px] text-muted-foreground/40 ml-auto flex-shrink-0">{s.timeAgo}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate pl-[22px] mt-0.5">{s.statusLabel}</p>
                    </button>
                  ))}
                </div>

                {/* Main demo content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 flex min-w-0"
                  >
                    <DemoWindow session={active} onStreamComplete={handleStreamComplete} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="text-center text-2xl font-medium text-muted-foreground mt-24"
        >
          Built for <span className="text-primary font-bold">thinkers</span>,{" "}
          <span className="text-primary font-bold">builders</span>, and{" "}
          <span className="text-primary font-bold">curious minds</span>.
        </motion.p>
      </div>
    </section>
  );
}
