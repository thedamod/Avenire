import fs from "fs";
import path from "path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "About — Avenire",
  description: "Avenire vision and mission.",
};

const mdxComponents = {
  h1: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="mb-6 border-b border-border/80 pb-4 font-sans text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="mb-3 mt-8 font-sans text-lg font-semibold tracking-tight text-foreground md:text-xl"
      {...props}
    >
      {children}
    </h2>
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-4 leading-relaxed text-foreground/85" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-4 ml-5 list-disc space-y-2 text-foreground/85" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-4 ml-5 list-decimal space-y-2 text-foreground/85" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  hr: () => <hr className="my-7 border-border/80" />,
};

export default function AboutPage() {
  const visionPath = path.join(process.cwd(), "content/legal/vision.md");
  const source = fs.readFileSync(visionPath, "utf-8");

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="px-4 pt-32 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Avenire Mission Document</p>
            </div>

            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-45"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, color-mix(in oklab, var(--border) 75%, transparent) 28px)",
                }}
              />

              <article className="relative px-5 py-8 font-mono text-[13px] md:px-10 md:py-10 md:text-[14px]">
                <Markdown components={mdxComponents} remarkPlugins={[remarkGfm]}>
                  {source}
                </Markdown>
              </article>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
