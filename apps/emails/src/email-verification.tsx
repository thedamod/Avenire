import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
  Hr,
} from '@react-email/components';

export const EmailConfirmation = ({ name = 'there', confirmationLink = '/confirm-email' }) => {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email address for Avenire</Preview>
      <Tailwind>
        <Body className="bg-[#101010] font-sans py-[40px]">
          <Container className="bg-[#101010] rounded-[16px] p-[32px] mx-auto max-w-[600px] shadow-sm border border-gray-800">
            {/* Header */}
            <Heading className="text-[32px] font-bold text-[#F9F8FC] mt-0 mb-[8px]">
              Hey {name}! 👋
            </Heading>

            <Text className="text-[18px] text-[#F9F8FC] mb-[24px]">
              Welcome to Avenire! Please confirm your email address.
            </Text>

            {/* Main content */}
            <Section className="mb-[24px]">
              <Text className="text-[16px] text-[#F9F8FC] mb-[16px]">
                To get started with your AI-powered learning journey, please verify your email address by clicking the button below:
              </Text>

              <Section className="text-center mb-[24px]">
                <Button
                  className="bg-[#99FFE4] text-[#000000] font-bold py-[14px] px-[32px] rounded-[8px] no-underline text-center box-border shadow-sm"
                  href={confirmationLink}
                >
                  Confirm My Email
                </Button>
              </Section>
            </Section>

            <Text className="text-[16px] text-[#F9F8FC] mb-[24px]">
              This link will expire in 24 hours. If you didn't create an account with Avenire, you can safely ignore this email.
            </Text>

            <Text className="text-[16px] text-[#F9F8FC] mb-[8px]">
              We're excited to have you join us!
            </Text>

            <Text className="text-[16px] font-bold text-[#F9F8FC] mb-[24px]">
              The Avenire Team
            </Text>

            {/* Footer */}
            <Hr className="border-t border-gray-800 my-[24px]" />

            <Text className="text-[12px] text-[#F9F8FC] opacity-70 m-0">
              Avenire Inc.
            </Text>
            <Text className="text-[12px] text-[#F9F8FC] opacity-70 m-0">
              © {new Date().getFullYear()} Avenire. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

EmailConfirmation.PreviewProps = {
  name: 'Alex',
  confirmationLink: '/confirm-email?token=example123',
};

export default EmailConfirmation;
