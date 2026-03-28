"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { Dialog, DialogContent } from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { cn } from "@avenire/ui/lib/utils";
import {
  ArrowRight, BookOpen, Brain, CheckCircle as CheckCircle2, FileText, Flask as FlaskConical, GraduationCap, UploadSimple as Upload, Lightning as Zap } from "@phosphor-icons/react"
import type { FlashcardSetSummary } from "@/lib/flashcards";
import type { MisconceptionRecord } from "@/lib/learning-data";
import { StudentCalendar } from "@/components/student-calendar";
import { FlashcardDeckStack } from "@/components/flashcards/deck-stack";
import { useUploadThing } from "@/lib/uploadthing";
import { requestUploadPreflight } from "@/lib/upload-preflight";
import { useRouter } from "next/navigation";

interface WeakPointGroup {
  subject: string;
  topic: string;
}

interface OnboardingStepDefinition {
  content: OnboardingStepContent[];
  id: string;
  note: string;
  skippable: boolean;
  step: number;
  subtitle: string;
  tag: string;
  title: string;
}

interface OnboardingStepContent {
  detail: string;
  label: string;
}

type UploadPhase = "idle" | "picking" | "uploading" | "done" | "failed";
type GeneratedDeckState = "idle" | "loading" | "error" | "ready";

interface GeneratedFlashcard {
  backMarkdown: string;
  frontMarkdown: string;
  id?: string;
  notesMarkdown?: string | null;
  tags: string[];
}

interface OnboardingMemory {
  generatedCards: GeneratedFlashcard[];
  generatedDeckTitle: string | null;
  generatedSetId: string | null;
  uploadFileName: string | null;
  uploadAt: string | null;
}

const ONBOARDING_STORAGE_PREFIX = "avenire:onboarding-memory:v2";
const EMPTY_ONBOARDING_MEMORY: OnboardingMemory = {
  generatedCards: [],
  generatedDeckTitle: null,
  generatedSetId: null,
  uploadAt: null,
  uploadFileName: null,
};

export interface OnboardingModalProps {
  activeMisconceptions: MisconceptionRecord[];
  flashcardSets: FlashcardSetSummary[];
  onComplete: () => Promise<void>;
  onOpenFiles: () => void;
  onOpenFlashcards: () => void;
  onStartChatProbe: () => void;
  onStartReview: () => void;
  open: boolean;
  rootFolderId: string;
  setOnboardingStep: (stepIndex: number) => void;
  stepIndex: number;
  workspaceUuid: string;
  weakPointGroups: WeakPointGroup[];
}

const STEP_TRANSITION: Variants = {
  enter: (dir: number) => ({
    filter: "blur(5px)",
    opacity: 0,
    x: dir > 0 ? 36 : -36,
  }),
  center: {
    filter: "blur(0px)",
    opacity: 1,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
    x: 0,
  },
  exit: (dir: number) => ({
    filter: "blur(5px)",
    opacity: 0,
    x: dir > 0 ? -36 : 36,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

function getOnboardingStorageKey(workspaceUuid: string) {
  return `${ONBOARDING_STORAGE_PREFIX}:${workspaceUuid}`;
}

function parseOnboardingMemory(input: string | null): OnboardingMemory {
  if (!input) {
    return EMPTY_ONBOARDING_MEMORY;
  }

  try {
    const parsed = JSON.parse(input) as Partial<OnboardingMemory>;
    const generatedCards = Array.isArray(parsed.generatedCards)
      ? parsed.generatedCards
          .filter((card): card is GeneratedFlashcard => {
            return (
              typeof card === "object" &&
              card !== null &&
              typeof card.frontMarkdown === "string" &&
              typeof card.backMarkdown === "string" &&
              Array.isArray(card.tags) &&
              card.tags.every((tag) => typeof tag === "string")
            );
          })
          .slice(0, 12)
      : [];

    return {
      generatedCards,
      generatedDeckTitle:
        typeof parsed.generatedDeckTitle === "string"
          ? parsed.generatedDeckTitle
          : null,
      generatedSetId:
        typeof parsed.generatedSetId === "string"
          ? parsed.generatedSetId
          : null,
      uploadAt: typeof parsed.uploadAt === "string" ? parsed.uploadAt : null,
      uploadFileName:
        typeof parsed.uploadFileName === "string"
          ? parsed.uploadFileName
          : null,
    };
  } catch {
    return EMPTY_ONBOARDING_MEMORY;
  }
}

function memoryToDeckCards(memory: OnboardingMemory) {
  return memory.generatedCards.map((card, index) => ({
    back: (
      <div className="space-y-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Answer
        </p>
        <p className="whitespace-pre-wrap text-base leading-7 text-foreground">
          {card.backMarkdown}
        </p>
      </div>
    ),
    front: (
      <div className="space-y-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Prompt
        </p>
        <p className="whitespace-pre-wrap text-base leading-7 text-foreground">
          {card.frontMarkdown}
        </p>
      </div>
    ),
    id: card.id ?? `${memory.generatedSetId ?? "generated"}-${index}`,
    meta: card.notesMarkdown ? (
      <span className="text-muted-foreground">Notes available for review</span>
    ) : (
      <span className="text-muted-foreground">Ready for study</span>
    ),
    title: card.tags[0] ?? `Card ${index + 1}`,
  }));
}

const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    content: [
      {
        detail: "Avenire turns passive studying into active thinking.",
        label: "Active learning",
      },
      {
        detail: "Know what you know. Fix what you don't.",
        label: "Gap detection",
      },
      {
        detail: "Built for JEE by someone taking JEE.",
        label: "Built in context",
      },
    ],
    id: "welcome",
    note: "The first screen should feel sharp, not crowded. This is the promise, not the product dump.",
    skippable: false,
    step: 1,
    subtitle: "A short pitch that tells them why this workspace exists.",
    tag: "Welcome",
    title: "What is Avenire?",
  },
  {
    content: [
      {
        detail: "PDFs, notes, textbooks, past papers.",
        label: "Accepted files",
      },
      {
        detail: "Handwritten notes and whiteboard photos.",
        label: "Visuals",
      },
      {
        detail: "Lecture recordings, then OCR -> chunk -> embed -> index.",
        label: "Video sources",
      },
    ],
    id: "upload",
    note: "Let people skip this if they want to keep moving with demo material. Friction here hurts activation.",
    skippable: true,
    step: 2,
    subtitle: "Where Avenire earns trust with ingestion and indexing.",
    tag: "Upload",
    title: "Bring your material",
  },
  {
    content: [
      {
        detail: "Apollo asks targeted concept checks from your material.",
        label: "3-question probe",
      },
      {
        detail: "Wrong answers become misconceptions with concept tags.",
        label: "Misconception capture",
      },
      {
        detail: "Weak-point maps make the hidden gaps visible.",
        label: "Confidence map",
      },
    ],
    id: "misconceptions",
    note: "This is the moment the product gets specific. It should feel like the system saw something the student missed.",
    skippable: false,
    step: 3,
    subtitle: "Surface the gap before you ask them to study harder.",
    tag: "Misconceptions",
    title: "Find the broken model",
  },
  {
    content: [
      {
        detail: "Review load stays sustainable when the calendar is doing the work.",
        label: "7-day preview",
      },
      {
        detail: "Choose a review time that fits the student's day.",
        label: "Daily reminder",
      },
      {
        detail: "Start the first session immediately so the habit feels real.",
        label: "First session",
      },
    ],
    id: "review_loop",
    note: "This is the retention hook. The UI should make the review loop feel inevitable, not optional.",
    skippable: true,
    step: 4,
    subtitle: "Turn the first visit into a durable routine.",
    tag: "Review loop",
    title: "Lock in the habit",
  },
  {
    content: [
      {
        detail: "The mismatch between weak points and dashboard nudges is the payoff.",
        label: "Suggested task",
      },
      {
        detail: "Today’s cards and the note they started are already waiting.",
        label: "Immediate context",
      },
      {
        detail: "No dead-end empty states. The home screen should already be useful.",
        label: "Ready-made home",
      },
    ],
    id: "dashboard",
    note: "Day 1 should feel like day 10. This final state is a proof of utility, not a farewell screen.",
    skippable: false,
    step: 5,
    subtitle: "Land them in a workspace that already knows what to do next.",
    tag: "Dashboard",
    title: "You're in. Here's your home.",
  },
];

function StepPanels({ content }: { content: OnboardingStepContent[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {content.map((entry, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border/70 bg-muted/20 p-4 shadow-sm shadow-black/5"
          initial={{ opacity: 0, y: 12 }}
          key={entry.label}
          transition={{ delay: 0.05 + index * 0.05, duration: 0.24, ease: "easeOut" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {entry.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/90">{entry.detail}</p>
        </motion.div>
      ))}
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="space-y-3">
      {[
        {
          desc: "Avenire turns passive studying into active thinking.",
          icon: <Brain className="h-4 w-4" />,
          label: "Active learning",
        },
        {
          desc: "Know what you know. Fix what you don't.",
          icon: <CheckCircle2 className="h-4 w-4" />,
          label: "Gap detection",
        },
        {
          desc: "Built for JEE by someone taking JEE.",
          icon: <GraduationCap className="h-4 w-4" />,
          label: "Built in context",
        },
      ].map((item, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-3xl border border-white/12 bg-white/6 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          initial={{ opacity: 0, y: 10 }}
          key={item.label}
          transition={{ delay: 0.06 + index * 0.06, duration: 0.24, ease: "easeOut" }}
        >
          <span className="mt-0.5 text-[#f4a259]">{item.icon}</span>
          <div>
            <p className="text-sm font-medium leading-none text-white">{item.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">{item.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function UploadStep({
  rememberedFileName,
  rememberedUploadAt,
  onOpenFiles,
  onPickUpload,
  uploadMessage,
  uploadName,
  uploadPhase,
}: {
  rememberedFileName: string | null;
  rememberedUploadAt: string | null;
  onOpenFiles: () => void;
  onPickUpload: () => void;
  uploadMessage: string | null;
  uploadName: string | null;
  uploadPhase: UploadPhase;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm shadow-black/5">
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
          <motion.div
            animate={
              uploadPhase === "uploading"
                ? { scale: [1, 1.04, 1], opacity: [0.9, 1, 0.95] }
                : { scale: 1, opacity: 1 }
            }
            transition={
              uploadPhase === "uploading"
                ? { duration: 1.1, repeat: Number.POSITIVE_INFINITY }
                : { duration: 0.2 }
            }
          >
            <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          </motion.div>
          <p className="text-sm font-medium">
            {uploadPhase === "uploading"
              ? "Uploading inside onboarding"
              : "Drop a PDF or browse from here"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The file stays in flow and lands in your workspace root.
          </p>
          <Button className="mt-4 w-full" onClick={onPickUpload} type="button">
            {uploadPhase === "uploading" ? "Uploading..." : "Upload PDF"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              icon: <FileText className="h-4 w-4" />,
              label: "PDFs",
              sub: "Notes and textbooks",
            },
            {
              icon: <BookOpen className="h-4 w-4" />,
              label: "Images",
              sub: "Handwritten pages",
            },
            {
              icon: <FlaskConical className="h-4 w-4" />,
              label: "Videos",
              sub: "Lecture uploads",
            },
          ].map((item) => (
            <div
              className="rounded-2xl border border-border/70 bg-background px-3 py-3 text-center shadow-sm shadow-black/5"
              key={item.label}
            >
              <span className="mb-1 flex justify-center text-muted-foreground">
                {item.icon}
              </span>
              <p className="text-xs font-medium">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {rememberedFileName || uploadPhase !== "idle" ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm shadow-black/5"
              initial={{ opacity: 0, y: 8 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Uploaded file
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {uploadName ?? rememberedFileName ?? "Preparing upload"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {uploadMessage ??
                      (rememberedUploadAt
                        ? `Saved locally${rememberedUploadAt ? ` · ${new Date(rememberedUploadAt).toLocaleDateString()}` : ""}`
                        : "Working through the upload pipeline.")}
                  </p>
                </div>
                <Badge className="rounded-sm" variant="outline">
                  {uploadPhase === "done"
                    ? "Ready"
                    : uploadPhase === "uploading"
                      ? "Uploading"
                      : rememberedFileName
                        ? "Remembered"
                        : "Queued"}
                </Badge>
              </div>
              {uploadPhase === "uploading" ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    animate={{ x: ["-40%", "120%"] }}
                    className="h-full w-1/3 rounded-full bg-foreground/60"
                    transition={{
                      duration: 1.3,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "linear",
                    }}
                  />
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Button className="w-full" onClick={onOpenFiles} type="button" variant="outline">
        Open manage workspace
      </Button>
    </div>
  );
}

function MisconceptionsStep({
  activeMisconceptions,
  generatedCards,
  generationError,
  generationStatus,
  onGenerateFlashcards,
  onStartChatProbe,
  weakPointGroups,
}: {
  activeMisconceptions: MisconceptionRecord[];
  generatedCards: GeneratedFlashcard[];
  generationError: string | null;
  generationStatus: GeneratedDeckState;
  onGenerateFlashcards: () => void;
  onStartChatProbe: () => void;
  weakPointGroups: WeakPointGroup[];
}) {
  const activeMisconception = activeMisconceptions[0] ?? null;
  const physicsFocused = weakPointGroups.some((group) =>
    `${group.subject} ${group.topic}`.toLowerCase().includes("physics")
  );
  const generatedDeckItems = useMemo(
    () =>
      memoryToDeckCards({
        generatedCards,
        generatedDeckTitle: null,
        generatedSetId: null,
        uploadAt: null,
        uploadFileName: null,
      }),
    [generatedCards]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm shadow-black/5">
        <div className="mb-3 flex items-center gap-2">
          <Badge className="text-[10px] font-medium" variant="secondary">
            Concept check · 1 of 3
          </Badge>
        </div>
        <p className="text-sm font-medium leading-snug">
          A Gaussian surface encloses a dipole. What is the net electric flux through it?
        </p>
        <div className="mt-4 grid gap-2">
          {["Q / ε₀", "Zero", "2Q / ε₀", "Depends on orientation"].map((option, index) => (
            <button
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                index === 1
                  ? "border-border bg-muted/40 text-foreground"
                  : "border-border/60 bg-background hover:bg-muted/30"
              )}
              key={option}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
            <p className="text-sm font-medium">Probe this gap</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Let Apollo ask targeted questions from your current material and turn wrong answers into misconceptions.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={onStartChatProbe} type="button">
                Method with Apollo
              </Button>
              <Button
                disabled={generationStatus === "loading"}
                onClick={onGenerateFlashcards}
                type="button"
                variant="outline"
              >
                {generationStatus === "loading"
                  ? "Generating..."
                  : generatedCards.length > 0
                    ? "Regenerate deck"
                    : "Generate mindset"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
            <p className="text-sm font-medium">Captured misconception</p>
            {activeMisconception ? (
              <div className="mt-2 rounded-xl border border-border/60 bg-background p-3">
                <p className="text-sm text-foreground">{activeMisconception.concept}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeMisconception.subject} / {activeMisconception.topic}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Your first wrong answer will populate this panel.
              </p>
            )}
          </div>

          {physicsFocused ? (
            <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
              <p className="text-sm font-medium">Physics sim path is available</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your weak-point map suggests Physics, so Apollo can spin up a simulation-focused explanation next.
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm shadow-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Generated mindset</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The deck stays in onboarding, stored locally, and can be reviewed without leaving this flow.
              </p>
            </div>
            <Badge className="rounded-sm" variant="outline">
              {generationStatus === "loading"
                ? "Generating"
                : generatedCards.length > 0
                  ? "Saved locally"
                  : "Not generated"}
            </Badge>
          </div>

          <div className="mt-4">
            {generationStatus === "loading" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {["Drafting", "Checking", "Saving"].map((label, index) => (
                  <div
                    className="rounded-2xl border border-border/70 bg-background px-4 py-5"
                    key={label}
                  >
                    <motion.div
                      animate={{ opacity: [0.35, 1, 0.35] }}
                      className="h-2 w-16 rounded-full bg-foreground/40"
                      transition={{
                        duration: 1.1,
                        repeat: Number.POSITIVE_INFINITY,
                        delay: index * 0.1,
                      }}
                    />
                    <p className="mt-3 text-sm font-medium text-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Building the deck in place.
                    </p>
                  </div>
                ))}
              </div>
            ) : generatedDeckItems.length > 0 ? (
              <FlashcardDeckStack
                cards={generatedDeckItems}
                className="max-w-none"
                deckLabel="Generated deck"
                showCounter={false}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                Generate a deck here and it will render without sending you away to another page.
              </div>
            )}
          </div>

          {generationError ? (
            <p className="mt-3 text-sm text-muted-foreground">{generationError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewLoopStep({
  flashcardSets,
  onStartReview,
}: {
  flashcardSets: FlashcardSetSummary[];
  onStartReview: () => void;
}) {
  const [reviewTimeLocal, setReviewTimeLocal] = useState("");

  const currentReviewTarget = useMemo(
    () =>
      flashcardSets
        .slice()
        .sort(
          (left, right) =>
            right.dueCount + right.newCount - (left.dueCount + left.newCount)
        )
        .find((set) => set.dueCount > 0 || set.newCount > 0) ?? null,
    [flashcardSets]
  );

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const counts = [5, 3, 8, 2, 6, 4, 7];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm shadow-black/5">
        <StudentCalendar />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-muted/10 p-4 shadow-sm shadow-black/5">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Next 7 days · cards due
          </p>
          <div className="flex items-end gap-1.5">
            {days.map((day, index) => (
              <div className="flex flex-1 flex-col items-center gap-1" key={day}>
                <motion.div
                  animate={{ height: `${counts[index] * 6}px` }}
                  className={cn(
                    "w-full rounded-sm",
                    index === 0 ? "bg-foreground/70" : "bg-foreground/20"
                  )}
                  initial={{ height: 0 }}
                  transition={{
                    delay: 0.1 + index * 0.05,
                    duration: 0.38,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
                <span className="text-[9px] text-muted-foreground">{day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
          <p className="text-sm font-medium">Daily review time</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This sets the default time for your review reminder. It does not
            start a session by itself. It just tells Avenire when to nudge you
            back tomorrow.
          </p>
          <Input
            className="mt-4"
            onChange={(event) => setReviewTimeLocal(event.target.value)}
            type="time"
            value={reviewTimeLocal}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
          <p className="text-sm font-medium">First review</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Start with the cards that matter most right now.
          </p>
          <Button className="mt-4 w-full" onClick={onStartReview} type="button">
            Start review session
          </Button>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm shadow-black/5">
          <p className="text-sm font-medium">Why this matters</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A consistent reminder time keeps the review loop predictable.
          </p>
          {reviewTimeLocal ? (
            <p className="mt-3 text-sm text-foreground">
              Reminder time: {reviewTimeLocal}
            </p>
          ) : null}
          {currentReviewTarget ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Reviewing {currentReviewTarget.title} first.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardStep({
  onOpenFlashcards,
  onStartReview,
  onStartChatProbe,
}: {
  onOpenFlashcards: () => void;
  onStartReview: () => void;
  onStartChatProbe: () => void;
}) {
  return (
    <div className="space-y-3">
      {[
        {
          action: "Redirect to study",
          bg: "border-border/70 bg-background",
          icon: <Brain className="h-4 w-4 text-muted-foreground" />,
          sub: "Gauss' Law · Electric Flux",
          title: "Fix your misconception",
        },
        {
          action: "Start review session",
          bg: "border-border/70 bg-background",
          icon: <Zap className="h-4 w-4 text-muted-foreground" />,
          sub: "Based on your FSRS schedule",
          title: "5 mindset cards due today",
        },
        {
          action: "Open mindset",
          bg: "border-border/70 bg-background",
          icon: <FileText className="h-4 w-4 text-muted-foreground" />,
          sub: "Electrostatics - Chapter 1",
          title: "Continue your note",
        },
      ].map((item, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", item.bg)}
          initial={{ opacity: 0, y: 10 }}
          key={item.title}
          transition={{ delay: 0.06 + index * 0.06, duration: 0.24, ease: "easeOut" }}
        >
          <span>{item.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-sm font-medium leading-none">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.sub}</p>
          </div>
          <Button
            className="shrink-0 gap-1 text-xs"
            onClick={
              item.title === "Fix your misconception"
                ? onStartChatProbe
                : item.title === "5 mindset cards due today"
                  ? onStartReview
                  : onOpenFlashcards
            }
            type="button"
            variant="outline"
          >
            {item.action}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </motion.div>
      ))}
      <p className="mt-1 text-center text-xs italic text-muted-foreground">
        Your home from here on. No empty states - ever.
      </p>
    </div>
  );
}

export function OnboardingModal({
  activeMisconceptions,
  flashcardSets,
  onComplete,
  onOpenFiles,
  onOpenFlashcards,
  onStartChatProbe,
  onStartReview,
  open,
  rootFolderId,
  setOnboardingStep,
  stepIndex,
  workspaceUuid,
  weakPointGroups,
}: OnboardingModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [direction, setDirection] = useState(1);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [memory, setMemory] = useState<OnboardingMemory>(EMPTY_ONBOARDING_MEMORY);
  const [memoryReady, setMemoryReady] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] =
    useState<GeneratedDeckState>("idle");
  const activeStepIndex = Math.min(
    stepIndex,
    ONBOARDING_STEPS.length - 1
  );
  const step = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0];
  const isLast = activeStepIndex === ONBOARDING_STEPS.length - 1;
  const { startUpload } = useUploadThing("fileExplorerUploader", {
    onUploadError: () => {
      setUploadPhase("failed");
      setUploadMessage("Upload failed. Try another PDF.");
    },
  });

  useEffect(() => {
    setMemory(EMPTY_ONBOARDING_MEMORY);
    setMemoryReady(false);

    if (!workspaceUuid) {
      setMemoryReady(true);
      return;
    }

    try {
      const stored = window.localStorage.getItem(
        getOnboardingStorageKey(workspaceUuid)
      );
      const parsed = parseOnboardingMemory(stored);
      setMemory(parsed);
      setGenerationStatus(parsed.generatedCards.length > 0 ? "ready" : "idle");
    } catch {
      setMemory(EMPTY_ONBOARDING_MEMORY);
      setGenerationStatus("idle");
    } finally {
      setMemoryReady(true);
    }
  }, [workspaceUuid]);

  useEffect(() => {
    if (!memoryReady || !workspaceUuid) {
      return;
    }

    try {
      window.localStorage.setItem(
        getOnboardingStorageKey(workspaceUuid),
        JSON.stringify(memory)
      );
    } catch {
      // Ignore storage failures and keep the in-memory state alive.
    }
  }, [memory, memoryReady, workspaceUuid]);

  useEffect(() => {
    if (open) {
      setDirection(1);
    }
  }, [open]);

  useEffect(() => {
    if (activeStepIndex >= ONBOARDING_STEPS.length) {
      setOnboardingStep(ONBOARDING_STEPS.length - 1);
    }
  }, [activeStepIndex, setOnboardingStep]);

  const goTo = (nextIndex: number) => {
    const targetIndex = Math.max(
      0,
      Math.min(nextIndex, ONBOARDING_STEPS.length - 1)
    );
    setDirection(targetIndex > activeStepIndex ? 1 : -1);
    setOnboardingStep(targetIndex);
  };

  const handleNext = () => {
    if (isLast) {
      onComplete().catch(() => undefined);
      return;
    }
    goTo(activeStepIndex + 1);
  };

  const handleBack = () => {
    if (activeStepIndex > 0) {
      goTo(activeStepIndex - 1);
    }
  };

  const pickUpload = () => {
    setUploadPhase("picking");
    fileInputRef.current?.click();
  };

  const registerUpload = async (
    file: File,
    uploaded: {
      key?: string;
      name?: string;
      size?: number;
      contentType?: string;
      ufsUrl?: string;
    }
  ) => {
    if (!(workspaceUuid && rootFolderId && uploaded.key && uploaded.ufsUrl)) {
      throw new Error("Upload metadata is incomplete.");
    }

    const response = await fetch(
      `/api/workspaces/${workspaceUuid}/files/register`,
      {
        body: JSON.stringify({
          folderId: rootFolderId,
          metadata: { source: "onboarding" },
          mimeType: uploaded.contentType ?? file.type ?? null,
          name: uploaded.name ?? file.name,
          sizeBytes: uploaded.size ?? file.size,
          storageKey: uploaded.key,
          storageUrl: uploaded.ufsUrl,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "Unable to register uploaded file.");
    }
  };

  const handleUploadSelection = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      setUploadPhase("idle");
      return;
    }

    setUploadName(file.name);
    setUploadMessage("Preparing the upload.");
    setUploadPhase("uploading");

    try {
      if (workspaceUuid && rootFolderId) {
        await requestUploadPreflight({
          file,
          folderId: rootFolderId,
          workspaceUuid,
        });
      }
      const uploadedResults = (await startUpload([file])) ?? [];
      const uploaded = uploadedResults[0];
      if (!uploaded) {
        throw new Error("Upload returned no storage payload.");
      }
      setUploadMessage("Registering the file in your workspace.");
      await registerUpload(file, uploaded);
      setUploadPhase("done");
      setUploadMessage("Uploaded and queued for ingestion.");
      setMemory((current) => ({
        ...current,
        uploadAt: new Date().toISOString(),
        uploadFileName: uploaded.name ?? file.name,
      }));
      setTimeout(() => {
        router.refresh();
      }, 600);
    } catch (error) {
      setUploadPhase("failed");
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    }
  };

  const sourceMisconception =
    activeMisconceptions[0] ?? {
      concept: weakPointGroups[0]?.topic ?? "Concept check",
      reason: weakPointGroups[0]
        ? `${weakPointGroups[0].subject} / ${weakPointGroups[0].topic}`
        : "This concept surfaced during onboarding.",
      subject: weakPointGroups[0]?.subject ?? "General",
      topic: weakPointGroups[0]?.topic ?? "Review",
    };

  const generateFlashcards = async () => {
    setGenerationStatus("loading");
    setGenerationError(null);

    const request = {
      concept: sourceMisconception.concept,
      count: 5,
      reason: sourceMisconception.reason,
      subject: sourceMisconception.subject,
      title: `${sourceMisconception.concept} flashcards`,
      topic: sourceMisconception.topic,
    };

    try {
      const response = await fetch("/api/flashcards/onboarding", {
        body: JSON.stringify(request),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to generate flashcards.");
      }

      const payload = (await response.json()) as {
        cards?: GeneratedFlashcard[];
        set?: { id?: string; title?: string };
      };
      const cards = Array.isArray(payload.cards) ? payload.cards : [];
      if (cards.length === 0) {
        throw new Error("Flashcard generation returned no cards.");
      }

      setMemory((current) => ({
        ...current,
        generatedCards: cards.slice(0, 12),
        generatedDeckTitle:
          payload.set?.title ?? request.title ?? current.generatedDeckTitle,
        generatedSetId: payload.set?.id ?? current.generatedSetId,
      }));
      setGenerationStatus("ready");
    } catch (error) {
      setGenerationStatus("error");
      setGenerationError(
        error instanceof Error ? error.message : "Unable to generate flashcards."
      );
    }
  };

  const generatedDeckItems = useMemo(
    () =>
      memoryToDeckCards({
        ...memory,
        generatedSetId: memory.generatedSetId ?? "generated",
      }),
    [memory]
  );

  const stepDotNavigator = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {ONBOARDING_STEPS.map((item, index) => {
        const isActive = index === activeStepIndex;
        const isComplete = index < activeStepIndex;

        return (
          <button
            aria-label={`${item.step}. ${item.title}`}
            className="group relative p-1"
            key={item.id}
            onClick={() => goTo(index)}
            title={`${item.title} · ${item.subtitle}`}
            type="button"
          >
            <span
              className={cn(
                "block size-2.5 rounded-full transition-all duration-200",
                isActive
                  ? "scale-125 bg-foreground"
                  : isComplete
                    ? "bg-foreground/50"
                    : "bg-border group-hover:bg-foreground/40"
              )}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max max-w-[12rem] -translate-x-1/2 rounded-md border border-border/70 bg-popover px-2 py-1 text-left text-[11px] text-popover-foreground shadow-sm group-hover:block group-focus-visible:block">
              <span className="block uppercase tracking-[0.18em] text-muted-foreground">
                {item.tag}
              </span>
              <span className="block text-xs">{item.title}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="h-[100dvh] w-[min(100vw-1rem,78rem)] max-w-none overflow-hidden rounded-[2rem] border border-[#2f2d2a] bg-[#161616] p-0 shadow-[0_50px_120px_-60px_rgba(0,0,0,0.75)] sm:h-[92vh] sm:w-[min(100vw-2rem,78rem)]"
        largeWidth
        showCloseButton={false}
      >
        <input
          accept="application/pdf"
          aria-hidden="true"
          className="hidden"
          onChange={handleUploadSelection}
          ref={fileInputRef}
          type="file"
        />

        <div className="grid h-full min-h-0 bg-[#161616] lg:grid-cols-[minmax(280px,0.44fr)_minmax(0,0.56fr)]">
          <aside className="flex min-h-0 flex-col justify-between border-[#2f2d2a] border-b px-5 py-5 text-white lg:border-r lg:border-b-0 lg:px-8 lg:py-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                  Onboarding
                </p>
                <h2 className="max-w-sm font-mono text-4xl leading-none tracking-tight text-white">
                  Q&amp;A agents
                </h2>
                <p className="max-w-sm text-sm leading-6 text-white/62">
                  Answers repeat questions using your workspace, files, misconceptions, and connected study tools.
                </p>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/4 p-5">
                <div className="rounded-[1.6rem] bg-[#8c5931] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {step.id === "welcome" ? (
                    <div className="space-y-6 rounded-[1.45rem] bg-[#181818] p-5 text-white">
                      <div className="space-y-1">
                        <p className="font-semibold text-lg">Jason</p>
                        <p className="max-w-[14rem] text-base leading-6 text-white/88">
                          Where should I start if my weak point is electric flux?
                        </p>
                      </div>
                      <div className="space-y-1 border-white/8 border-t pt-4">
                        <p className="font-semibold text-base">Apollo workspace assistant</p>
                        <p className="max-w-[15rem] text-base leading-6 text-white/84">
                          Start with the misconception probe, then review the first due deck and land in the calendar.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1.45rem] bg-[#181818] p-5 text-white">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                        Step {step.step}
                      </p>
                      <p className="mt-3 font-mono text-3xl leading-none">
                        {step.title}
                      </p>
                      <p className="mt-4 text-sm leading-6 text-white/68">
                        {step.subtitle}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {stepDotNavigator}
            </div>

            <div className="hidden items-center gap-2 text-white/45 text-sm lg:flex">
              <span className="block size-2 rounded-full bg-white/70" />
              <span className="block size-2 rounded-full bg-white/25" />
              <span className="block size-2 rounded-full bg-white/25" />
            </div>
          </aside>

          <div className="flex min-h-0 flex-col bg-[#f7f4ed]">
            <header className="flex items-start justify-between gap-4 border-[#e4dccd] border-b px-4 py-4 sm:px-6">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full bg-[#ece6da] text-[#5a5347]" variant="secondary">
                    {step.tag}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#8a8274]">
                    Step {step.step}
                  </span>
                </div>
                <h3 className="font-mono text-3xl leading-none text-[#1f2833]">
                  {step.title}
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-[#6f695d]">
                  {step.note}
                </p>
              </div>
              <div className="hidden shrink-0 rounded-full border border-[#dad1c0] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#7f7769] sm:block">
                {step.skippable ? "Optional" : "Required"}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={`${step.id}-body`}
                  animate="center"
                  custom={direction}
                  exit="exit"
                  initial="enter"
                  transition={{ duration: 0.3 }}
                  variants={STEP_TRANSITION}
                >
                  {step.id === "welcome" ? (
                    <WelcomeStep />
                  ) : step.id === "upload" ? (
                    <UploadStep
                      rememberedFileName={memory.uploadFileName}
                      rememberedUploadAt={memory.uploadAt}
                      onOpenFiles={onOpenFiles}
                      onPickUpload={pickUpload}
                      uploadMessage={uploadMessage}
                      uploadName={uploadName}
                      uploadPhase={uploadPhase}
                    />
                  ) : step.id === "misconceptions" ? (
                    <MisconceptionsStep
                      activeMisconceptions={activeMisconceptions}
                      generatedCards={memory.generatedCards}
                      generationError={generationError}
                      generationStatus={generationStatus}
                      onGenerateFlashcards={generateFlashcards}
                      onStartChatProbe={onStartChatProbe}
                      weakPointGroups={weakPointGroups}
                    />
                  ) : step.id === "review_loop" ? (
                    <ReviewLoopStep
                      flashcardSets={flashcardSets}
                      onStartReview={onStartReview}
                    />
                  ) : step.id === "dashboard" ? (
                    <DashboardStep
                      onOpenFlashcards={onOpenFlashcards}
                      onStartReview={onStartReview}
                      onStartChatProbe={onStartChatProbe}
                    />
                  ) : (
                    <StepPanels content={step.content} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="border-[#e4dccd] border-t bg-[#f7f4ed]/96 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                disabled={activeStepIndex === 0}
                onClick={handleBack}
                type="button"
                variant="ghost"
              >
                Back
              </Button>

              {stepDotNavigator}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {step.skippable && !isLast ? (
                  <Button
                    onClick={() => goTo(activeStepIndex + 1)}
                    type="button"
                    variant="outline"
                  >
                    Skip for now
                  </Button>
                ) : null}
                <Button onClick={handleNext} type="button">
                  {step.id === "review_loop"
                    ? "Save & continue"
                    : isLast
                      ? "Finish setup"
                      : "Continue"}
                </Button>
              </div>
            </div>
          </footer>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
