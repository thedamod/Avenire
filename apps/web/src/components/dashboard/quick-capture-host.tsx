"use client";

import { Button } from "@avenire/ui/components/button";
import { QuickCaptureDialog } from "@/components/dashboard/quick-capture-dialog";
import {
  quickCaptureActions,
  useQuickCaptureStore,
} from "@/stores/quickCaptureStore";

function HiddenTrigger() {
  return <Button className="sr-only" tabIndex={-1} type="button" />;
}

export function QuickCaptureHost() {
  const kind = useQuickCaptureStore((state) => state.kind);

  return (
    <>
      <QuickCaptureDialog
        initialKind="task"
        onOpenChange={(open) => {
          if (!open) {
            quickCaptureActions.close();
          }
        }}
        open={kind === "task"}
        trigger={<HiddenTrigger />}
      />
      <QuickCaptureDialog
        initialKind="note"
        onOpenChange={(open) => {
          if (!open) {
            quickCaptureActions.close();
          }
        }}
        open={kind === "note"}
        trigger={<HiddenTrigger />}
      />
      <QuickCaptureDialog
        initialKind="misconception"
        onOpenChange={(open) => {
          if (!open) {
            quickCaptureActions.close();
          }
        }}
        open={kind === "misconception"}
        trigger={<HiddenTrigger />}
      />
    </>
  );
}
