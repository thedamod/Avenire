import * as React from "react";
import { Button, Heading, Hr, Link, Text } from "@react-email/components";
import { EmailShell, emailColors } from "./email-shell";

export interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailShell preview="Welcome to Avenire">
      <Heading
        style={{
          color: emailColors.ink,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: "40px",
          margin: "0 0 12px",
          textAlign: "center",
        }}
      >
        Welcome aboard, {name}
      </Heading>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: 17,
          lineHeight: "28px",
          margin: "0 auto 24px",
          maxWidth: 520,
          textAlign: "center",
        }}
      >
        Your account is ready. Avenire keeps your manage items, notes, and collaboration in one calm workspace.
      </Text>

      <div
        style={{
          backgroundColor: emailColors.cardAlt,
          border: `1px solid ${emailColors.border}`,
          borderRadius: 22,
          marginBottom: 24,
          padding: 24,
        }}
      >
        <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: "0 0 18px" }}>
          Start with your dashboard, then create a workspace or invite teammates when you’re ready.
        </Text>
        <Button
          href={dashboardUrl}
          style={{
            backgroundColor: emailColors.accent,
            borderRadius: 14,
            color: "#ffffff",
            display: "inline-block",
            fontSize: 15,
            fontWeight: 700,
            padding: "14px 22px",
            textDecoration: "none",
          }}
        >
          Open dashboard
        </Button>
      </div>

      <div
        style={{
          backgroundColor: "#f1f6f2",
          border: `1px solid ${emailColors.border}`,
          borderLeft: `4px solid ${emailColors.accent}`,
          borderRadius: 20,
          marginBottom: 24,
          padding: 20,
        }}
      >
        <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: 0 }}>
          Use the sidebar to switch between manage items, folders, methods, and workspace settings.
        </Text>
      </div>

      <Text
        style={{
          color: emailColors.muted,
          fontSize: 13,
          lineHeight: "20px",
          margin: 0,
          textAlign: "center",
        }}
      >
        If you have any questions, reply to this email and we’ll get back to you.
      </Text>

      <Hr style={{ borderColor: emailColors.border, margin: "26px 0" }} />

      <Text style={{ color: emailColors.muted, fontSize: 13, lineHeight: "20px", margin: 0, textAlign: "center" }}>
        Avenire builds a clean workspace for focused work and shared projects.
      </Text>
      <Text style={{ color: emailColors.accentStrong, fontSize: 13, lineHeight: "20px", margin: "6px 0 0", textAlign: "center" }}>
        <Link href={dashboardUrl} style={{ color: emailColors.accent, textDecoration: "underline" }}>
          {dashboardUrl}
        </Link>
      </Text>
    </EmailShell>
  );
}

export default WelcomeEmail;
