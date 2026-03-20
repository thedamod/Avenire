export const CHAT_NAME_UPDATED_EVENT = "avenire:chat-name-updated";
export const CHAT_STREAM_FINISHED_EVENT = "avenire:chat-stream-finished";
export const CHAT_STREAM_STATUS_EVENT = "avenire:chat-stream-status";
export const CHAT_CREATED_EVENT = "avenire:chat-created";

export interface ChatNameUpdatedDetail {
  icon?: string | null;
  id: string;
  name: string;
}

export interface ChatStreamFinishedDetail {
  chatId: string;
}

export interface ChatStreamStatusDetail {
  chatId: string;
  status: string;
}

export interface ChatCreatedDetail {
  fromId: string;
  id: string;
  title: string;
}
