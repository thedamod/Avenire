import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: string;
  coverImage?: string;
  featured?: boolean;
  featuredOrder?: number;
}

export interface Post extends PostMeta {
  content: string;
}

function ensureBlogDir() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }
}

export function getAllPostMetas(): PostMeta[] {
  ensureBlogDir();
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

  return files
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const fullPath = path.join(BLOG_DIR, filename);
      const raw = fs.readFileSync(fullPath, "utf-8");
      const { data, content } = matter(raw);
      const rt = readingTime(content);

      return {
        slug,
        title: data.title ?? "Untitled",
        description: data.description ?? "",
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        author: data.author ?? "Avenire Team",
        tags: data.tags ?? [],
        readingTime: rt.text,
        coverImage: data.coverImage,
        featured: Boolean(data.featured),
        featuredOrder: typeof data.featuredOrder === "number" ? data.featuredOrder : undefined,
      } satisfies PostMeta;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): Post | null {
  ensureBlogDir();
  const fullPath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(fullPath)) return null;

  const raw = fs.readFileSync(fullPath, "utf-8");
  const { data, content } = matter(raw);
  const rt = readingTime(content);

  return {
    slug,
    title: data.title ?? "Untitled",
    description: data.description ?? "",
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    author: data.author ?? "Avenire Team",
    tags: data.tags ?? [],
    readingTime: rt.text,
    coverImage: data.coverImage,
    featured: Boolean(data.featured),
    featuredOrder: typeof data.featuredOrder === "number" ? data.featuredOrder : undefined,
    content,
  };
}

export function getAllSlugs(): string[] {
  ensureBlogDir();
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}
