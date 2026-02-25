"use client"

import type React from "react"
import { useState } from "react"
import { cn } from "@avenire/ui/lib/utils"
import { Button } from "@avenire/ui/components/button"
import { Card, CardContent } from "@avenire/ui/components/button"
import { Input } from "@avenire/ui/components/input"
import { Label } from "@avenire/ui/components/label"
import { toast } from "sonner"
import { Sparkles, Lock, ArrowRight, ShieldCheck } from "lucide-react"
import { resetPassword } from "../client"
import { useSearchParams } from 'next/navigation'

export function ChangePasswordForm({ className, ...props }: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Basic validation
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match")
      return
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long")
      return
    }

    setIsLoading(true)

    const { error } = await resetPassword({
      newPassword,
      token: searchParams.get("token") || ""
    })
    if (error) {
      const errorCode = error.message;
      toast.error("Oops! Something went wrong", {
        description: errorCode,
      })
      return;
    }
    setIsLoading(false)
    toast("Password updated", {
      description: "Your password has been changed successfully. You may now close this tab"
    })

    // Reset form
    setNewPassword("")
    setConfirmPassword("")
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden shadow-lg fade-in border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <form className="p-5 md:p-6" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">Change Password</h1>
                <p className="text-balance text-muted-foreground">Update your account password</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      required
                      className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                      required
                      className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              </div>

              <Button type="submit" className="w-full group transition-all" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Updating...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    Update Password
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-xs text-muted-foreground">
        Changing your password will log you out of all other devices.
      </div>
    </div>
  )
}

