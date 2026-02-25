import { getPostBySlug, getAllSlugs } from "@/lib/blog";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, Clock, ArrowLeft, Tag } from "lucide-react";

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Avenire Blog`,
    description: post.description,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const mdxComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-3xl font-semibold text-foreground mt-10 mb-4 tracking-tight" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-2xl font-semibold text-foreground mt-10 mb-3 tracking-tight" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-xl font-semibold text-foreground mt-8 mb-3" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-foreground/80 leading-relaxed mb-5" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-4 ml-6 space-y-2 list-none" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-4 ml-6 space-y-2 list-decimal list-outside" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-foreground/80 leading-relaxed pl-1 before:content-['—'] before:mr-2 before:text-primary" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      {...props}
    />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-foreground/90" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-6 pl-5 border-l-2 border-primary/50 text-muted-foreground italic"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded text-foreground/90"
      {...props}
    />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl bg-card border border-border p-5 text-sm font-mono leading-relaxed"
      {...props}
    />
  ),
  hr: () => <hr className="my-10 border-border" />,
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  return (
    <main className="min-h-screen">
      <Navbar />

      <article className="pt-32 pb-24 px-4">
        <div className="max-w-2xl mx-auto">

          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 group"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            All posts
          </Link>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  <Tag className="size-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {post.coverImage && (
            <div className="mb-8 overflow-hidden rounded-xl border border-border/70">
              <Image
                src={post.coverImage}
                alt={post.title}
                width={1600}
                height={900}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight leading-tight mb-4">
            {post.title}
          </h1>

          {/* Description */}
          {post.description && (
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              {post.description}
            </p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pb-8 mb-10 border-b border-border">
            <span className="font-medium text-foreground/70">{post.author}</span>
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatDate(post.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {post.readingTime}
            </span>
          </div>

          {/* MDX Content */}
          <div className="prose-avenire">
            <MDXRemote source={post.content} components={mdxComponents} />
          </div>

          {/* Footer navigation */}
          <div className="mt-16 pt-8 border-t border-border">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
            >
              <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
              Back to all posts
            </Link>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
