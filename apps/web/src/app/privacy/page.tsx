import fs from "fs";
import path from "path";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "Privacy Policy — Avenire",
  description: "Avenire privacy policy and data handling practices.",
};

const mdxComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mt-8 mb-4" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-2xl font-semibold text-foreground tracking-tight mt-8 mb-3" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-xl font-semibold text-foreground mt-6 mb-2" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-foreground/80 leading-relaxed mb-4" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-3 ml-5 space-y-2 list-disc text-foreground/80" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-3 ml-5 space-y-2 list-decimal text-foreground/80" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary underline underline-offset-4 hover:text-primary/80" {...props} />
  ),
  hr: () => <hr className="my-8 border-border" />,
};

export default function PrivacyPage() {
  const policyPath = path.join(process.cwd(), "content/legal/privacy.md");
  const source = fs.readFileSync(policyPath, "utf-8");

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="pt-32 pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <MDXRemote source={source} components={mdxComponents} />
        </div>
      </section>

      <Footer />
    </main>
  );
}
