"use client"

import type React from "react"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Button } from "@avenire/ui/components/button"
import { Input } from "@avenire/ui/components/input"
import { Label } from "@avenire/ui/components/label"
import { toast } from "sonner"
import { Envelope as Mail, Lock, ArrowRight } from "@phosphor-icons/react"
import { authClient, requestPasswordReset, signIn } from "../client"
import { getErrorMessage } from "../error_codes"
import { getWaitlistErrorDetails } from "../waitlist-shared"
import { GithubIcon, GoogleIcon, LoadingIcon, PasskeyIcon } from "./icons"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email("Invalid email address").nonempty("Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters long").nonempty("Password is required"),
})

export function LoginForm({
  className,
  initialEmail = "",
  initialError,
  ...props
}: React.ComponentProps<"div"> & {
  initialEmail?: string
  initialError?: string | null
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{
    email: string | undefined
    password: string | undefined
  } | undefined>(undefined)
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null)
  const [canJoinWaitlist, setCanJoinWaitlist] = useState(false)
  const lastLoginMethod = authClient.getLastUsedLoginMethod()

  useEffect(() => {
    if (
      !PublicKeyCredential.isConditionalMediationAvailable ||
      !PublicKeyCredential.isConditionalMediationAvailable()
    ) {
      return
    }

    signIn.passkey({ autoFill: true })
  }, [])

  useEffect(() => {
    const details = getWaitlistErrorDetails(initialError)

    setWaitlistMessage(details?.message ?? null)
    setCanJoinWaitlist(details?.canJoinWaitlist ?? false)
  }, [initialError])

  const resetWaitlistFeedback = () => {
    setWaitlistMessage(null)
    setCanJoinWaitlist(false)
  }

  const getErrorCallbackURL = () => {
    const params = new URLSearchParams()
    if (email.trim()) {
      params.set("email", email.trim())
    }

    const query = params.toString()
    return query ? `/login?${query}` : "/login"
  }

  const handleJoinWaitlist = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrors({ email: "Email is required", password: undefined })
      return
    }

    setIsJoiningWaitlist(true)
    try {
      const response = await fetch("/api/waitlist/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      })

      if (!response.ok) {
        throw new Error("Unable to join the waitlist.")
      }

      const payload = (await response.json()) as {
        status?: "pending" | "approved" | "registered"
      }

      const nextMessage =
        payload.status === "approved" || payload.status === "registered"
          ? "This email already has access."
          : "You're on the waitlist now. We’ll email you when access opens."

      setWaitlistMessage(nextMessage)
      setCanJoinWaitlist(false)
      toast("You're on the waitlist", {
        description: `We saved ${trimmedEmail} for access.`,
      })
    } catch (error) {
      toast.error("Oops! Something went wrong", {
        description: error instanceof Error ? error.message : "Unable to join the waitlist.",
      })
    } finally {
      setIsJoiningWaitlist(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrors(undefined)
    resetWaitlistFeedback()

    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      const formattedErrors = result.error.format()
      setErrors({
        email: formattedErrors.email?._errors.join(", "),
        password: formattedErrors.password?._errors.join(", "),
      })
      setIsLoading(false)
      return
    }

    const { error } = await signIn.email({
      email,
      password,
      callbackURL: "/workspace",
    })

    if (error) {
      const errorMessage = getErrorMessage(error.code || "", error.message)
      if (errorMessage.source === "email") {
        setErrors({ email: errorMessage.userMessage, password: undefined })
      }

      const details =
        getWaitlistErrorDetails(error.code?.toLowerCase()) ??
        getWaitlistErrorDetails(error.message?.toLowerCase())
      if (details) {
        setWaitlistMessage(details.message)
        setCanJoinWaitlist(details.canJoinWaitlist)
      }

      toast.error("Oops! Something went wrong", {
        description: errorMessage.userMessage,
      })
      setIsLoading(false)
      return
    }

    setIsLoading(false)
  }

  return (
    <form className="p-5 md:p-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-5">
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
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-balance text-muted-foreground">Login to your Avenire account</p>
        </div>

        <div className="space-y-4">
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
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (waitlistMessage || canJoinWaitlist) {
                    resetWaitlistFeedback()
                  }
                }}
                autoComplete="email webauthn"
              />
              {errors?.email ? <p className="text-red-500 text-xs mt-1">{errors.email}</p> : null}
            </div>
            {waitlistMessage ? (
              <p className="text-xs text-muted-foreground">{waitlistMessage}</p>
            ) : null}
            {canJoinWaitlist ? (
              <Button
                className="w-full sm:w-auto"
                disabled={isJoiningWaitlist}
                onClick={() => {
                  void handleJoinWaitlist()
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {isJoiningWaitlist ? "Joining waitlist..." : "Join waitlist"}
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Button
                variant="link"
                type="button"
                onClick={async () => {
                  if (!email) {
                    setErrors({ email: "Email is required", password: undefined })
                    return
                  }

                  const { error } = await requestPasswordReset({
                    email,
                    redirectTo: "/change-password",
                  })

                  if (error) {
                    const errorMessage = getErrorMessage(error.code || "", error.message)
                    if (errorMessage.source === "email") {
                      setErrors({ email: errorMessage.userMessage, password: undefined })
                    }
                    toast.error("Oops! Something went wrong", {
                      description: errorMessage.userMessage,
                    })
                    return
                  }

                  toast("Check your mail!", {
                    description: `We have just sent an email to ${email}. Proceed from the link in the mail`,
                  })
                }}
                className="text-sm text-primary hover:text-primary/80 transition-all"
              >
                Forgot password?
              </Button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                required
                className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password webauthn"
              />
              {errors?.password ? <p className="text-red-500 text-xs mt-1">{errors.password}</p> : null}
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full group transition-all" disabled={isLoading}>
          {isLoading ? (
            <div className="flex items-center justify-center">
              <LoadingIcon />
              Logging in...
            </div>
          ) : (
            <div className="flex items-center justify-center">
              Login
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          )}
        </Button>

        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Button
            variant={lastLoginMethod === "google" ? "default" : "outline"}
            className="w-full justify-center transition-all"
            type="button"
            onClick={() => {
              signIn.social({
                provider: "google",
                callbackURL: "/workspace",
                errorCallbackURL: getErrorCallbackURL(),
              })
            }}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">
              <GoogleIcon />
            </span>
            {lastLoginMethod === "google" ? <span className="sr-only">Last used</span> : null}
            <span className="sr-only">Login with Google</span>
          </Button>
          <Button
            variant={lastLoginMethod === "github" ? "default" : "outline"}
            className="w-full justify-center transition-all"
            type="button"
            onClick={() => {
              signIn.social({
                provider: "github",
                callbackURL: "/workspace",
                errorCallbackURL: getErrorCallbackURL(),
              })
            }}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">
              <GithubIcon />
            </span>
            {lastLoginMethod === "github" ? <span className="sr-only">Last used</span> : null}
            <span className="sr-only">Login with Github</span>
          </Button>
          <Button
            variant={lastLoginMethod === "passkey" ? "default" : "outline"}
            className="w-full justify-center transition-all"
            type="button"
            onClick={async () => {
              resetWaitlistFeedback()
              const data = await signIn.passkey()
              if (data?.error) {
                const errorCode =
                  typeof (data.error as { code?: unknown }).code === "string"
                    ? (data.error as { code: string }).code
                    : ""
                const errorMessage = getErrorMessage(errorCode, data.error.message)
                const details =
                  getWaitlistErrorDetails(errorCode.toLowerCase()) ??
                  getWaitlistErrorDetails(data.error.message?.toLowerCase())

                if (details) {
                  setWaitlistMessage(details.message)
                  setCanJoinWaitlist(details.canJoinWaitlist)
                }

                toast.error("Oops! Something went wrong", {
                  description: errorMessage.userMessage,
                })
              }
            }}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">
              <PasskeyIcon />
            </span>
            {lastLoginMethod === "passkey" ? <span className="sr-only">Last used</span> : null}
            <span className="sr-only">Login with Passkey</span>
          </Button>
        </div>
      </div>
    </form>
  )
}
