import type { UIMessage as DefaultUIMessage } from "ai";

export type UIMessage = DefaultUIMessage<
  never,
  {
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
  }
>;
