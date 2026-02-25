import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

export interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Avenire</Preview>
      <Body style={{ backgroundColor: "#f6f7fb", fontFamily: "Arial, sans-serif", padding: "24px" }}>
        <Container style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "24px" }}>
          <Section>
            <Heading as="h1">Welcome, {name}</Heading>
            <Text>Your account is ready. Start from your dashboard.</Text>
            <Link href={dashboardUrl}>Open dashboard</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;
