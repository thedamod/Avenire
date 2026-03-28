import Link from "next/link";
import { GithubLogo as Github, Envelope as Mail, ChatCircle as MessageCircle } from "@phosphor-icons/react/ssr"
import { AvenireMark } from "@/components/branding/AvenireMark";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Roadmap", href: "/roadmap" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Privacy", href: "/privacy" },
      { label: "Contact", href: "mailto:support@avenire.space", external: true },
    ],
  },
] as const;

const socialLinks = [
  { label: "Discord", href: "https://discord.gg/avenire", icon: MessageCircle },
  { label: "GitHub", href: "https://github.com/thedamod/Avenire", icon: Github },
  { label: "Email", href: "mailto:support@avenire.space", icon: Mail },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="md:w-[24rem]">
            <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <AvenireMark className="h-5 w-auto shrink-0" />
              <span>Avenire</span>
            </Link>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Follow the build:</p>
              <div className="mt-2 flex items-center gap-2">
                {socialLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="inline-flex size-7 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Icon className="size-3.5" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:ml-auto md:w-[20rem]">
            {columns.map((column) => (
              <div key={column.title}>
                <h4 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">{column.title}</h4>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground/60">© {new Date().getFullYear()} Avenire. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground">
              Privacy
            </Link>
            <Link href="/about" className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground">
              About
            </Link>
            <Link href="/blog" className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground">
              Blog
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
