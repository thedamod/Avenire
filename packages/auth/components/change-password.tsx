"use client";

import { Button } from "@avenire/ui/components/button";
import { Card, CardContent } from "@avenire/ui/components/card";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { cn } from "@avenire/ui/lib/utils";
import { ArrowRight, Lock, Sparkle as Sparkles } from "@phosphor-icons/react"
import { useSearchParams } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { resetPassword } from "../client";

export function ChangePasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Basic validation
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);

    const { error } = await resetPassword({
      newPassword,
      token: searchParams.get("token") || "",
    });
    if (error) {
      const errorCode = error.message;
      toast.error("Oops! Something went wrong", {
        description: errorCode,
      });
      return;
    }
    setIsLoading(false);
    toast("Password updated", {
      description:
        "Your password has been changed successfully. You may now close this tab",
    });

    // Reset form
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="fade-in overflow-hidden border-0 bg-card/50 shadow-lg backdrop-blur-sm">
        <CardContent className="p-0">
          <form className="p-5 md:p-6" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center space-y-2 text-center">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h1 className="font-bold text-2xl">Change Password</h1>
                <p className="text-balance text-muted-foreground">
                  Update your account password
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-medium text-sm" htmlFor="new-password">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute top-2.5 left-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                      id="new-password"
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      type="password"
                      value={newPassword}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    className="font-medium text-sm"
                    htmlFor="confirm-password"
                  >
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute top-2.5 left-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
                      id="confirm-password"
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      type="password"
                      value={confirmPassword}
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                    {error}
                  </div>
                )}
              </div>

              <Button
                className="group w-full transition-all"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="mr-3 -ml-1 h-5 w-5 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        fill="currentColor"
                      />
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
      <div className="text-balance text-center text-muted-foreground text-xs">
        Changing your password will log you out of all other devices.
      </div>
    </div>
  );
}
