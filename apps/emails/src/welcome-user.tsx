import * as React from "react";
import { Heading, Hr, Text } from "@react-email/components";
import { EmailShell, emailColors } from "./email-shell";

interface WelcomeUserProps {
  name?: string;
}

export const WelcomeUserMessage = ({ name }: WelcomeUserProps) => (
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
      Hey {name}, welcome
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
      You’re in. Avenire is built to keep learning material, methods, and manage items organized in one place.
    </Text>

    <div
      style={{
        backgroundColor: emailColors.cardAlt,
        border: `1px solid ${emailColors.border}`,
        borderRadius: 22,
        marginBottom: 22,
        padding: 24,
      }}
    >
      <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: 0 }}>
        Create a workspace, upload a file, or start a method to see the full flow.
      </Text>
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
      <Heading
        as="h2"
        style={{
          color: emailColors.ink,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: "28px",
          margin: "0 0 14px",
        }}
      >
        What to try first
      </Heading>

      <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: "0 0 8px" }}>
        • Create a workspace for your projects.
      </Text>
      <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: "0 0 8px" }}>
        • Upload items and open them directly in the viewer.
      </Text>
      <Text style={{ color: emailColors.ink, fontSize: 15, lineHeight: "24px", margin: 0 }}>
        • Use method to ask questions over your workspace content.
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
      Reply to this email any time if you need help getting started.
    </Text>

    <Hr style={{ borderColor: emailColors.border, margin: "26px 0" }} />
    <Text style={{ color: emailColors.muted, fontSize: 13, lineHeight: "20px", margin: 0, textAlign: "center" }}>
      The Avenire Team
    </Text>
  </EmailShell>
);

WelcomeUserMessage.PreviewProps = {
  name: "Alex",
};

export default WelcomeUserMessage;
