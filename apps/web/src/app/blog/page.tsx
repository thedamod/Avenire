import { getAllPostMetas } from "@/lib/blog";
import type { PostMeta } from "@/lib/blog";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { Calendar, Clock, Tag, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Blog — Avenire",
  description: "Thoughts on AI, reasoning, and the future of thinking from the Avenire team.",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function blogPostHref(slug: string): Route {
  return `/blog/${slug}` as Route;
}

function FeaturedPostCard({ post }: { post: PostMeta }) {
  return (
    <Link href={blogPostHref(post.slug)} className="group block">
      <article className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 md:p-10 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20">
        {post.coverImage ? (
          <div className="relative -mx-8 -mt-8 md:-mx-10 md:-mt-10 mb-6 md:mb-8 border-b border-border/70 overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              width={1600}
              height={900}
              className="w-full h-52 md:h-64 object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              priority
            />
          </div>
        ) : (
          <div className="relative -mx-8 -mt-8 md:-mx-10 md:-mt-10 mb-6 md:mb-8 h-44 md:h-52 border-b border-border/70 bg-gradient-to-br from-primary/10 via-secondary/40 to-accent/30" />
        )}

        {/* Subtle gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/3 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex flex-wrap gap-2 mb-5">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
              >
                <Tag className="size-2.5" />
                {tag}
              </span>
            ))}
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
              Featured
            </span>
          </div>

          <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-4 tracking-tight group-hover:text-primary transition-colors duration-200 leading-snug">
            {post.title}
          </h2>

          <p className="text-muted-foreground text-base leading-relaxed mb-6 max-w-2xl">
            {post.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {formatDate(post.date)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {post.readingTime}
              </span>
              <span className="font-medium text-foreground/70">{post.author}</span>
            </div>
            <span className="flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all duration-200">
              Read more <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link href={blogPostHref(post.slug)} className="group block h-full">
      <article className="h-full flex flex-col rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-black/10 hover:-translate-y-0.5">
        {post.coverImage ? (
          <div className="-mx-6 -mt-6 mb-5 overflow-hidden border-b border-border/70 rounded-t-xl">
            <Image
              src={post.coverImage}
              alt={post.title}
              width={1200}
              height={700}
              className="w-full h-36 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </div>
        ) : (
          <div className="-mx-6 -mt-6 mb-5 h-28 border-b border-border/70 rounded-t-xl bg-gradient-to-br from-primary/10 via-secondary/40 to-accent/30" />
        )}

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <h3 className="text-lg font-semibold text-foreground mb-3 leading-snug group-hover:text-primary transition-colors duration-200 flex-1">
          {post.title}
        </h3>

        <p className="text-sm text-muted-foreground leading-relaxed mb-5 line-clamp-3">
          {post.description}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-4 border-t border-border">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {formatDate(post.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {post.readingTime}
          </span>
        </div>
      </article>
    </Link>
  );
}

export default function BlogPage() {
  const posts = getAllPostMetas();
  const featuredPool = posts
    .filter((post) => post.featured)
    .sort((a, b) => {
      const orderDiff = (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (b.featuredOrder ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  const featured = featuredPool[0] ?? posts[0];
  const rest = featured ? posts.filter((post) => post.slug !== featured.slug) : posts;

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="mb-2">
            <span className="text-xs font-medium tracking-widest uppercase text-primary">
              From the blog
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight mb-4">
            Thoughts & Updates
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            Insights on AI reasoning, product updates, and ideas from the Avenire team.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 pb-24">
        <div className="max-w-5xl mx-auto space-y-12">
          {/* Featured post */}
          {featured && (
            <div>
              <FeaturedPostCard post={featured} />
            </div>
          )}

          {/* Rest of posts */}
          {rest.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-6">
                More posts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rest.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          )}

          {posts.length === 0 && (
            <div className="text-center py-24 text-muted-foreground">
              <p className="text-lg">No posts yet. Check back soon!</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
