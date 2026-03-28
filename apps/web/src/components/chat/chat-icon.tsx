"use client";

import type { ComponentType, SVGProps } from "react";
import { BookOpenText as BookOpenCheck, BrainIcon, Clock as Clock3, FileCode as FileCode2, FileText, Folder, FolderOpen, Books as LibraryBig, ChatCenteredText as MessageSquareDashed, ChatText as MessageSquareText, Sparkle as Sparkles, Tag } from "@phosphor-icons/react";
import { type ChatIconName } from "@/lib/chat-icons";
import { cn } from "@/lib/utils";

const CHAT_ICON_COMPONENTS: Record<
  ChatIconName,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  MessageSquareText,
  BookOpenCheck,
  FileText,
  FileCode2,
  BrainIcon,
  Clock3,
  LibraryBig,
  Sparkles,
  MessageSquareDashed,
  Tag,
  Folder,
  FolderOpen,
};

export function ChatIcon({
  name,
  className,
}: {
  name: ChatIconName;
  className?: string;
}) {
  const Icon = CHAT_ICON_COMPONENTS[name];
  if (!Icon) {
    return null;
  }
  return <Icon className={cn("size-4", className)} />;
}
