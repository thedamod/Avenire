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

export const DeleteAccountConfirmation = ({ name = 'there', confirmationLink = '/confirm-deletion' }) => {
  return (
    <Html>
      <Head />
      <Preview>Confirm your Avenire account deletion request</Preview>
      <Tailwind>
        <Body className="bg-[#101010] font-sans py-[40px]">
          <Container className="bg-[#101010] rounded-[16px] p-[32px] mx-auto max-w-[600px] shadow-sm border border-gray-800">
            {/* Header */}
            <Heading className="text-[32px] font-bold text-[#F9F8FC] mt-0 mb-[8px]">
              Hey {name}
            </Heading>

            <Text className="text-[18px] text-[#F9F8FC] mb-[24px]">
              We've received a request to delete your Avenire account.
            </Text>

            {/* Main content */}
            <Section className="mb-[32px]">
              <Text className="text-[16px] text-[#F9F8FC] mb-[16px]">
                We're sorry to see you go. Before we process your request, we need to verify that it's really you.
              </Text>

              <Text className="text-[16px] text-[#F9F8FC] mb-[24px]">
                Please click the button below to confirm your account deletion:
              </Text>

              <Section className="text-center mb-[32px]">
                <Button
                  className="bg-[#FFC799] text-[#000000] font-bold py-[14px] px-[32px] rounded-[8px] no-underline text-center box-border shadow-sm"
                  href={confirmationLink}
                >
                  Confirm Account Deletion
                </Button>
              </Section>

              <Text className="text-[16px] text-[#F9F8FC] mb-[16px]">
                If you didn't request to delete your account, please ignore this email or contact our support team immediately. Your account will remain active.
              </Text>
            </Section>

            {/* What you'll lose section */}
            <Section className="mb-[32px] bg-[#161616] p-[24px] rounded-[12px] border-l-[4px] border-[#FFC799]">
              <Heading className="text-[20px] font-bold text-[#FCFCFD] mt-0 mb-[16px]">
                What you'll lose if you delete your account:
              </Heading>

              <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
                🎓 <span className="font-semibold">Your learning progress</span> across all courses
              </Text>
              <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
                📊 <span className="font-semibold">Personalized learning paths</span> tailored to your style
              </Text>
              <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
                💬 <span className="font-semibold">Chat history</span> with our AI learning assistant
              </Text>
              <Text className="text-[16px] text-[#FCFCFD] mb-[0px]">
                🔒 <span className="font-semibold">Account settings</span> and preferences
              </Text>
            </Section>

            {/* Feedback section */}
            <Section className="mb-[32px] bg-[#161616] p-[24px] rounded-[12px] border-l-[4px] border-[#99FFE4]">
              <Text className="text-[16px] text-[#FCFCFD] mb-[16px]">
                We're constantly working to improve Avenire. If there's anything we could have done better, we'd love to hear your feedback before you go.
              </Text>
              <Text className="text-[16px] text-[#FCFCFD] mb-[0px]">
                Simply reply to this email with your thoughts, or click <a href="https://avenire.ai/feedback" className="text-[#99FFE4] underline">here</a> to fill out a quick survey.
              </Text>
            </Section>

            <Hr className="border-t border-gray-800 my-[32px]" />

            <Text className="text-[16px] text-[#F9F8FC] mb-[24px]">
              If you change your mind, you can always create a new account in the future. Some of your data may be retained as required by law, but your personal profile will be deleted.
            </Text>

            <Text className="text-[16px] text-[#F9F8FC] mb-[8px]">
              Thank you for your time with us,
            </Text>

            <Text className="text-[16px] font-bold text-[#F9F8FC] mb-[32px]">
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

DeleteAccountConfirmation.PreviewProps = {
  name: 'Alex',
  confirmationLink: '/confirm-deletion?token=example123',
};

export default DeleteAccountConfirmation;
