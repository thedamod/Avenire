"use client"

import type React from "react"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Button } from "@avenire/ui/components/button"
import { Input } from "@avenire/ui/components/input"
import { Label } from "@avenire/ui/components/label"
import { toast } from "sonner"
import { Envelope as Mail } from "@phosphor-icons/react"
import { z } from "zod"

const waitlistSchema = z.object({
  email: z.string().email("Invalid email address").nonempty("Email is required"),
})

export function WaitlistForm({ className, ...props }: React.ComponentProps<"form">) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [email, setEmail] = useState("")
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "none" | "pending" | "approved" | "registered">("idle")
  const [waitlistStatusMessage, setWaitlistStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setWaitlistStatus("idle")
      setWaitlistStatusMessage(null)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setWaitlistStatus("loading")
      void (async () => {
        try {
          const response = await fetch(`/api/waitlist/status?email=${encodeURIComponent(trimmedEmail)}`, {
            signal: controller.signal,
            cache: "no-store",
          })
          if (!response.ok) {
            setWaitlistStatus("none")
            setWaitlistStatusMessage(null)
            return
          }

          const payload = (await response.json()) as {
            status?: "none" | "pending" | "approved" | "registered";
          }
          const status = payload.status ?? "none"
          setWaitlistStatus(status)
          setWaitlistStatusMessage(
            status === "pending"
              ? "This email is on the waitlist, but it hasn't been approved yet."
              : status === "approved"
                ? "This email has been approved. Use the registration link from your approval email."
              : status === "registered"
                ? "This email already has access."
                : null,
          )
        } catch {
          if (controller.signal.aborted) {
            return
          }
          setWaitlistStatus("none")
          setWaitlistStatusMessage(null)
        }
      })()
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [email])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    const result = waitlistSchema.safeParse({ email })
    if (!result.success) {
      const formattedErrors = result.error.format()
      setWaitlistStatus("none")
      setWaitlistStatusMessage(formattedErrors.email?._errors.join(", ") ?? null)
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch("/api/waitlist/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (!response.ok) {
        throw new Error("Unable to join the waitlist.")
      }

      const payload = (await response.json()) as {
        status?: "pending" | "approved" | "registered";
      }
      const nextStatus = payload.status ?? "pending"
      setWaitlistStatus(nextStatus)
      setWaitlistStatusMessage(
        nextStatus === "approved"
          ? "This email has already been approved. Use the registration link from your approval email."
        : nextStatus === "registered"
          ? "This email already has access."
          : "You're on the waitlist now. We’ll email you when access opens.",
      )
      toast("You're on the waitlist", {
        description: `We saved ${email.trim()} for access.`,
      })
    } catch (error) {
      toast.error("Oops! Something went wrong", {
        description: error instanceof Error ? error.message : "Unable to join the waitlist.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit} {...props}>
      <div className="flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Image
              alt="Avenire"
              className="h-7 w-7"
              height={28}
              src="/branding/avenire-logo-mark.svg"
              width={28}
            />
          </div>
          <h1 className="text-2xl font-bold">Join the waitlist</h1>
          <p className="text-balance text-muted-foreground">
            Leave your email and we’ll let you know when access opens.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              required
              className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          {waitlistStatusMessage ? (
            <p className="text-xs text-muted-foreground">{waitlistStatusMessage}</p>
          ) : null}
        </div>

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Joining waitlist..." : "Join waitlist"}
        </Button>
      </div>
    </form>
  )
}
