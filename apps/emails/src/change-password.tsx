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

export const PasswordReset = ({ name = 'there', resetLink = '/reset-password' }) => {
  return (
    <Html>
      <Head />
      <Preview>Reset your Avenire password</Preview>
      <Tailwind>
        <Body className="bg-[#101010] font-sans py-[40px]">
          <Container className="bg-[#101010] rounded-[16px] p-[32px] mx-auto max-w-[600px] shadow-sm border border-gray-800">
            {/* Header */}
            <Heading className="text-[32px] font-bold text-[#F9F8FC] mt-0 mb-[8px]">
              Hey {name}
            </Heading>

            <Text className="text-[18px] text-[#F9F8FC] mb-[24px]">
              Reset your Avenire password
            </Text>

            {/* Main content */}
            <Section className="mb-[24px]">
              <Text className="text-[16px] text-[#F9F8FC] mb-[16px]">
                We received a request to reset your password for your Avenire account. Click the button below to create a new password:
              </Text>

              <Section className="text-center mb-[24px]">
                <Button
                  className="bg-[#FFC799] text-[#000000] font-bold py-[14px] px-[32px] rounded-[8px] no-underline text-center box-border shadow-sm"
                  href={resetLink}
                >
                  Reset Password
                </Button>
              </Section>
            </Section>

            <Section className="mb-[24px] bg-[#161616] p-[24px] rounded-[12px] border-l-[4px] border-[#99FFE4]">
              <Text className="text-[16px] text-[#FCFCFD] mb-[0px]">
                This link will expire in 1 hour for security reasons. If you didn't request a password reset, you can safely ignore this email.
              </Text>
            </Section>

            <Text className="text-[16px] text-[#F9F8FC] mb-[24px]">
              If you're having trouble with the button above, you can copy and paste the following URL into your browser:
            </Text>

            <Text className="text-[14px] text-[#99FFE4] bg-[#161616] p-[12px] rounded-[4px] break-all mb-[24px]">
              {resetLink}
            </Text>

            <Text className="text-[16px] text-[#F9F8FC] mb-[8px]">
              Need help? Contact our support team.
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

PasswordReset.PreviewProps = {
  name: 'Alex',
  resetLink: '/reset-password?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
};

export default PasswordReset;