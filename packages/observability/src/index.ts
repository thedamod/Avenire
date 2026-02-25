import { Axiom } from "@axiomhq/js";

const token = process.env.AXIOM_TOKEN;
const dataset = process.env.AXIOM_DATASET;

const axiom = token ? new Axiom({ token }) : null;

export async function logEvent(eventName: string, payload: Record<string, unknown>) {
  if (!axiom || !dataset) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[axiom-disabled]", eventName, payload);
    }
    return;
  }

  await axiom.ingest(dataset, [{ eventName, ...payload }]);
}
