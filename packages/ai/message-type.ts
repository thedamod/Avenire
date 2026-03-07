import type { InferUITools, UIMessage as DefaultUIMessage } from "ai";

type ChatUIData = {
  plan: {
    id: string;
    task: {
      id: string;
      status: boolean;
    };
  };
  chatName: {
    id: string;
    name: string;
  };
  chatCreated: {
    fromId: string;
    id: string;
    title: string;
  };
  artifactCreated: {
    artifactId: string;
    chatId: string;
    kind: string;
    toolName: string;
  };
};

export type UIMessage = DefaultUIMessage<
  unknown,
  ChatUIData
>;
