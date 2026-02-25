"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { cn } from "@avenire/ui/lib/utils"
import { Button } from "@avenire/ui/components/button"
import { Card, CardContent } from "@avenire/ui/components/card"
import { Input } from "@avenire/ui/components/input"
import { Label } from "@avenire/ui/components/label"
import { toast } from "sonner"
import { Sparkles, Mail, Lock, ArrowRight } from "lucide-react"
import { signIn, sendVerificationEmail, requestPasswordReset } from "../client"
import { GithubIcon, GoogleIcon, LoadingIcon, PasskeyIcon } from "./icons"
import { z } from "zod"
import { getErrorMessage } from "../error_codes"

const loginSchema = z.object({
  email: z.string().email("Invalid email address").nonempty("Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters long").nonempty("Password is required"),
})

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{
    email: string | undefined;
    password: string | undefined;
  } | undefined>(undefined)

  useEffect(() => {
    if (!PublicKeyCredential.isConditionalMediationAvailable ||
      !PublicKeyCredential.isConditionalMediationAvailable()) {
      return;
    }

    signIn.passkey({ autoFill: true })
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrors(undefined) // Reset errors
    const formData = {
      email,
      password,
    }

    const result = loginSchema.safeParse(formData)
    if (!result.success) {
      const formattedErrors = result.error.format();
      setErrors({
        email: formattedErrors.email?._errors.join(", "),
        password: formattedErrors.password?._errors.join(", "),
      });
      setIsLoading(false)
      return
    }

    const { data, error } = await signIn.email({
      email: email,
      password: password,
      callbackURL: "/dashboard"
    })
    if (error) {
      const errorMessage = getErrorMessage(error.code || "");
      if (errorMessage.source === "email") {
        setErrors({ email: errorMessage.userMessage, password: undefined });
      }
      toast.error("Oops! Something went wrong", {
        description: errorMessage.userMessage,
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
  }

  return (
    <form className="p-5 md:p-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
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
              <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email webauthn"
              />
              {errors?.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Button variant="link" type="button" onClick={async () => {
                if (!email) {
                  setErrors({ email: "Email is required", password: undefined })
                  return
                }
                const { error } = await requestPasswordReset({
                  email,
                  redirectTo: "/change-password"
                })
                if (error) {
                  const errorMessage = getErrorMessage(error.code || "");
                  if (errorMessage.source === "email") {
                    setErrors({ email: errorMessage.userMessage, password: undefined });
                  }
                  toast.error("Oops! Something went wrong", {
                    description: errorMessage.userMessage,
                  });
                  return
                }
                toast("Check your mail!", {
                  description: `We have just sent an email to ${email}. Proceed from the link in the mail`
                })
              }} className="text-sm text-primary hover:text-primary/80 transition-all">
                Forgot password?
              </Button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                required
                className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password webauthn"
              />
              {errors?.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
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
            variant="outline"
            className="w-full transition-all"
            type="button"
            onClick={() => {
              signIn.social({
                provider: "google",
                callbackURL: "/dashboard"
              })
            }}
          >
            <GoogleIcon />
            <span className="sr-only">Login with Google</span>
          </Button>
          <Button
            variant="outline"
            className="w-full transition-all"
            type="button"
            onClick={() => {
              signIn.social({
                provider: "github",
                callbackURL: "/dashboard"
              })
            }}
          >
            <GithubIcon />
            <span className="sr-only">Login with Github</span>
          </Button>
          <Button
            variant="outline"
            className="w-full transition-all"
            type="button"
            onClick={async () => {
              const data = await signIn.passkey()
              if (data && data.error) {
                const errorCode = data.error.message;
                toast.error("Oops! Something went wrong", {
                  description: errorCode,
                })
                return;
              }
            }}
          >
            <PasskeyIcon />
            <span className="sr-only">Login with Passkey</span>
          </Button>
        </div>

        <div className="text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:text-primary/80 transition-colors font-medium">
            Sign up
          </Link>
        </div>
      </div>
    </form>
  )
}
