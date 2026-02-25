"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import type { Route } from "next"

import { AvenireMark } from "@/components/branding/AvenireMark"
import { cn } from "@/lib/utils"
import { Button } from "@avenire/ui/components/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@avenire/ui/components/navigation-menu"
import { MenuIcon, XIcon } from "lucide-react"

const SIGN_UP_HREF = "/register"
const SIGN_IN_HREF = "/login"

const highlightedBlog = {
  title: "Introducing Avenire: Think Deeper, Not Just Faster",
  href: "/blog/introducing-avenire",
  description:
    "Why we built Avenire and how we think AI should scaffold reasoning, not replace it.",
  image: "/blog/introducing-avenire.svg",
} as const

const productLinks = [
  {
    title: "Roadmap",
    href: "/roadmap",
    description: "Track what is shipping now and what is coming next.",
  },
  {
    title: "Pricing",
    href: "/pricing",
    description: "Compare plans and see what you get at each level.",
  },
  {
    title: "Privacy",
    href: "/privacy",
    description: "Review how your data is handled and protected.",
  },
] as const

const pageLinks = [
  {
    title: "About",
    href: "/about",
    description: "Learn the mission and philosophy behind Avenire.",
  },
  {
    title: "Roadmap",
    href: "/roadmap",
    description: "Track what is shipping now and what is coming next.",
  },
  {
    title: "Privacy",
    href: "/privacy",
    description: "Review how your data is handled and protected.",
  },
] as const

const mobileLinks = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Meet Apollo", href: "/#meet-apollo" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Privacy", href: "/privacy" },
] as const

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  return (
    <>
      <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
        <nav
          className={cn(
            "flex w-full max-w-5xl items-center justify-between rounded-full border border-border px-4 py-1.5 transition-all duration-300",
            scrolled
              ? "bg-background/90 shadow-lg backdrop-blur-xl"
              : "bg-background/60 backdrop-blur-md"
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-2 px-2 py-1 text-sm font-semibold text-foreground"
          >
            <AvenireMark className="h-4 w-auto shrink-0" />
            <span>Avenire</span>
          </Link>

          <div className="hidden md:flex md:items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="h-7 rounded-full px-2.5 text-[11px] hover:bg-muted/60 focus:bg-muted/60 data-[state=open]:bg-muted/70">
                    Solution
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid gap-2 p-3 md:w-[420px] lg:w-[560px] lg:grid-cols-[1.1fr_0.9fr]">
                      {productLinks.map((link) => (
                        <ListItem key={link.title} href={link.href} title={link.title}>
                          {link.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="h-7 rounded-full px-2.5 text-[11px] hover:bg-muted/60 focus:bg-muted/60 data-[state=open]:bg-muted/70">
                    Resources
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[360px] gap-2 p-3 md:w-[500px] md:grid-cols-2 lg:w-[560px]">
                      <li className="row-span-3">
                        <NavigationMenuLink
                          render={<Link href={highlightedBlog.href} />}
                          className="from-muted/50 to-muted flex h-full w-full select-none flex-col justify-end rounded-md bg-gradient-to-b p-3 no-underline outline-none focus:shadow-md"
                        >
                          <div className="relative mb-2 h-24 w-full overflow-hidden rounded-md border border-border/60 bg-background">
                            <Image
                              src={highlightedBlog.image}
                              alt={highlightedBlog.title}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                            Highlighted blog
                          </p>
                          <div className="mt-1 text-xs font-medium leading-tight">
                            {highlightedBlog.title}
                          </div>
                          <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                            {highlightedBlog.description}
                          </p>
                        </NavigationMenuLink>
                      </li>
                      {pageLinks.map((link) => (
                        <ListItem key={link.title} href={link.href} title={link.title}>
                          {link.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link href="/pricing" />}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "h-7 rounded-full px-2.5 text-[11px] hover:bg-muted/60 focus:bg-muted/60 data-[active]:bg-muted/70"
                    )}
                  >
                    Pricing
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="hidden items-center gap-1.5 md:flex">
            <Button 
              variant="ghost" 
              size="sm" 
              className="rounded-full px-3 text-xs"
              nativeButton={false}
              render={<Link href={SIGN_IN_HREF} />}
            >
              Log in
            </Button>
            <Button
              size="sm"
              className="rounded-full px-3 text-xs"
              nativeButton={false}
              render={<Link href={SIGN_UP_HREF} />}
            >
              Sign Up
            </Button>
          </div>

          <div className="mobile-only">
            <button
              className="flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/50"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="size-4" />
            </button>
          </div>
        </nav>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[100] flex flex-col bg-background transition-all duration-300 ease-out",
          mobileOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-4 opacity-0"
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <AvenireMark className="h-4 w-auto shrink-0" />
            <span>Avenire</span>
          </Link>
          <button
            className="flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/50"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1 px-6 pt-6">
          {mobileLinks.map((link, i) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="border-b border-border py-3 text-2xl font-medium text-foreground transition-all hover:bg-muted/30 hover:text-foreground"
              style={{
                transitionDelay: mobileOpen ? `${i * 50}ms` : "0ms",
                opacity: mobileOpen ? 1 : 0,
                transform: mobileOpen ? "translateX(0)" : "translateX(-12px)",
                transitionDuration: "300ms",
              }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex flex-col gap-3 px-6 pb-8">
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-full"
            onClick={() => setMobileOpen(false)}
            nativeButton={false}
            render={<Link href={SIGN_UP_HREF} />}
          >
            Log in
          </Button>
          <Button
            size="lg"
            className="w-full rounded-full"
            onClick={() => setMobileOpen(false)}
            nativeButton={false}
            render={<Link href={SIGN_UP_HREF} />}
          >
            Sign Up
          </Button>
        </div>
      </div>
    </>
  )
}

function ListItem({
  className,
  title,
  children,
  href,
}: {
  className?: string
  title: string
  href: Route
  children: React.ReactNode
}) {
  return (
    <li>
      <NavigationMenuLink
        render={<Link href={href} />}
        className={cn(
          "block select-none space-y-0.5 rounded-md p-2.5 leading-none no-underline outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus:bg-muted/60 focus:text-foreground",
          className
        )}
      >
        <div className="text-xs font-medium leading-none">{title}</div>
        <p className="line-clamp-2 text-muted-foreground text-xs leading-snug">
          {children}
        </p>
      </NavigationMenuLink>
    </li>
  )
}
