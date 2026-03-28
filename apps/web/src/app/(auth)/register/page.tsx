import Link from "next/link"
import { RegisterForm } from "@avenire/auth/components/register"
import { Card, CardContent } from "@avenire/ui/components/card"
import { ShaderWave } from "@avenire/ui/components/shader"

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-sm md:max-w-3xl">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden rounded-3xl border-0 bg-card/50 shadow-lg backdrop-blur-sm">
            <CardContent className="grid p-0 md:grid-cols-2">
              <RegisterForm />
              <div className="relative hidden overflow-hidden bg-muted md:block">
                <div className="absolute inset-0 h-full w-full">
                  <ShaderWave />
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
            By clicking continue, you agree to our <Link href="/about">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </div>
        </div>
      </div>
    </div>
  )
}
