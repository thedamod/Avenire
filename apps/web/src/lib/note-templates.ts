export type NoteTemplate = {
  bannerUrl: string | null;
  content: string;
  id: string;
  name: string;
};

export const DEFAULT_NOTE_TEMPLATE: NoteTemplate = {
  bannerUrl: null,
  id: "study-note",
  name: "Study note",
  content: `---
topic:
date: "{{date}}"
course:
tags:
  - studies
---

# {{title}}

## Key Concepts


## Important Details


## Examples


## Questions
- 

## Summary


## Related Topics
- [[]]`,
};

export const NOTE_TEMPLATE_STORAGE_PREFIX = "note-templates:v1:";
export const NOTE_TEMPLATE_RECENTS_STORAGE_PREFIX = "note-templates:recent:v1:";

export function getNoteTemplateStorageKey(workspaceUuid: string) {
  return `${NOTE_TEMPLATE_STORAGE_PREFIX}${workspaceUuid}`;
}

export function getRecentNoteTemplateStorageKey(workspaceUuid: string) {
  return `${NOTE_TEMPLATE_RECENTS_STORAGE_PREFIX}${workspaceUuid}`;
}

export function getDefaultNoteTemplates() {
  return [DEFAULT_NOTE_TEMPLATE];
}
