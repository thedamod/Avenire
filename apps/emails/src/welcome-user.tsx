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

interface WelcomeUserProps {
  name?: string;
}

export const WelcomeUserMessage = ({
  name,
}: WelcomeUserProps) => (
  <Html>
    <Head />
    <Preview>Welcome to Avenire! Your AI-powered learning journey begins</Preview>
    <Tailwind>
      <Body className="bg-[#101010] font-sans py-[40px]">
        <Container className="bg-[#101010] rounded-[16px] p-[32px] mx-auto max-w-[600px] shadow-sm border border-gray-800">
          {/* Header */}
          <Heading className="text-[32px] font-bold text-[#F9F8FC] mt-0 mb-[8px]">
            Hey {name}! 👋
          </Heading>

          <Text className="text-[18px] text-[#F9F8FC] mb-[24px]">
            Welcome to the Avenire community!
          </Text>

          {/* Main content */}
          <Section className="mb-[32px]">
            <Text className="text-[16px] text-[#F9F8FC] mb-[16px]">
              We're stoked that you've joined us on this learning adventure. At Avenire, we're reimagining education by combining AI-scaffolded courses with intelligent chat to make learning faster, smarter, and way more fun.
            </Text>
          </Section>

          {/* Features highlight */}
          <Section className="mb-[32px] bg-[#161616] p-[24px] rounded-[12px] border-l-[4px] border-[#99FFE4]">
            <Heading className="text-[20px] font-bold text-[#FCFCFD] mt-0 mb-[16px]">
              What makes Avenire different:
            </Heading>

            <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
              🎬 <span className="font-semibold">AI-generated videos</span> that adapt to your learning style
            </Text>
            <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
              📊 <span className="font-semibold">Interactive graphs</span> that make complex concepts simple
            </Text>
            <Text className="text-[16px] text-[#FCFCFD] mb-[8px]">
              💬 <span className="font-semibold">Intelligent chat</span> that answers your questions in real-time
            </Text>
            <Text className="text-[16px] text-[#FCFCFD] mb-[0px]">
              🚀 <span className="font-semibold">Personalized learning paths</span> that evolve with you
            </Text>
          </Section>

          {/* Founder's message */}
          <Section className="mb-[32px] bg-[#161616] p-[24px] rounded-[12px] border-l-[4px] border-[#FFC799]">
            <Text className="text-[16px] italic text-[#FCFCFD] mb-[16px]">
              "We created Avenire because we believe learning should be engaging, personalized, and actually fun. Our AI doesn't replace teachers—it amplifies what's possible in education. We're thrilled to have you join us on this journey!"
            </Text>
            <Text className="text-[16px] font-semibold text-[#FCFCFD] mb-[0px]">
              — Abhiram D, <br /> Avenire Founder
            </Text>
          </Section>

          <Hr className="border-t border-gray-800 my-[32px]" />

          <Text className="text-[16px] text-[#F9F8FC] mb-[24px]">
            Got questions? Just reply to this email—a real human will get back to you (though we do love our AI, we know when humans do it better 😉).
          </Text>

          <Text className="text-[16px] text-[#F9F8FC] mb-[8px]">
            Happy learning!
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

WelcomeUserMessage.PreviewProps = {
  name: 'Alex',
};


export default WelcomeUserMessage;

