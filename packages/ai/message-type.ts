import type { UIMessage as DefaultUIMessage } from "ai";
import type { ChatUITools } from "./tools";

type DataPartsMap<T extends Record<string, unknown>> = T;

export type AgentActivityAction = {
  kind: "edit" | "list" | "read" | "search";
  pending: boolean;
  value?: string;
  path?: string;
  preview?: {
    content?: string;
    matches?: string[];
    path?: string;
    query?: string;
  };
};

export type AgentActivityData = {
  actions: AgentActivityAction[];
  id: string;
  status: "done" | "running";
};

type ChatUIData = DataPartsMap<{
  agent_activity: AgentActivityData;
  chatCreated: {
    fromId: string;
    id: string;
    title: string;
  };
  chatName: {
    id: string;
    name: string;
  };
  plan: {
    id: string;
    task: {
      id: string;
      status: boolean;
    };
  };
}>;

export type UIMessage = DefaultUIMessage<unknown, ChatUIData, ChatUITools>;
