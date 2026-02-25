import roadmapData from "@/content/roadmap.json";

export type RoadmapStatus = "planned" | "in-progress" | "shipped";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  category?: string;
  link?: string;
}

export interface RoadmapGroup {
  label: string;
  status: RoadmapStatus;
  items: RoadmapItem[];
}

export function getRoadmapGroups(): RoadmapGroup[] {
  const items: RoadmapItem[] = roadmapData as RoadmapItem[];

  const groups: RoadmapGroup[] = [
    {
      label: "Planned",
      status: "planned",
      items: items.filter((i) => i.status === "planned"),
    },
    {
      label: "In Progress",
      status: "in-progress",
      items: items.filter((i) => i.status === "in-progress"),
    },
    {
      label: "Shipped",
      status: "shipped",
      items: items.filter((i) => i.status === "shipped"),
    },
  ];

  return groups;
}
