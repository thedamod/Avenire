import { RegisterForm } from "@avenire/auth/components/register"
import { Card, CardContent } from "@avenire/ui/components/card"
import { ShaderWave } from "@avenire/ui/components/shader"

export default function RegisterPage() {
  return (
    <div className="flex flex-1 min-h-screen items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <div className={"flex flex-col gap-6"}>
          <div className="overflow-hidden rounded-xl bg-muted">
            <Card className="shadow-lg fade-in border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="grid p-0 md:grid-cols-2">
                <RegisterForm />
                <div className="relative hidden bg-muted md:block">
                  <div className="absolute inset-0 w-full h-full">
                    <ShaderWave />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
            By clicking continue, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
          </div>
        </div>
      </div >
    </div>
  )
}
