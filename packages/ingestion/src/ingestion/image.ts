import { config } from "../config";
import {
  detectImageMimeType,
  parseBase64ImageInput,
  resolveImageDataUrl,
} from "../utils/media";
import {
  assertMaxSize,
  assertSafeUrl,
  decodeBase64ToBytes,
} from "../utils/safety";
import type { CanonicalResource } from "./types";

const describeImageWithMistral = async (input: {
  imageDataUrl?: string;
  imageUrl?: string;
  title?: string;
  contextText?: string;
}): Promise<string | null> => {
  if (!config.imageEnrichmentEnabled || !config.mistralApiKey) {
    return null;
  }

  const imageUrl = input.imageUrl ?? input.imageDataUrl;
  if (!imageUrl) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => {
        controller.abort();
      },
      Math.max(1, config.mistralTimeoutMs)
    );

    try {
      const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.mistralImageDescriptionModel,
            temperature: 0.1,
            max_tokens: 180,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: [
                      "Describe this image for retrieval indexing.",
                      "Focus on concrete nouns, brand/place names, actions, colors, and notable text.",
                      "Keep it concise and factual.",
                      input.title ? `Title hint: ${input.title}` : null,
                      input.contextText
                        ? `Context hint: ${input.contextText}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: imageUrl,
                    },
                  },
                ],
              },
            ],
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }

      return text.slice(0, Math.max(80, config.imageDescriptionMaxChars));
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return null;
  }
};

export const ingestImage = async (input: {
  url?: string;
  base64?: string;
  title?: string;
  contextText?: string;
}): Promise<CanonicalResource> => {
  const source = input.url?.trim() || `image:inline:${crypto.randomUUID()}`;

  let imagePart:
    | { type: "image_url"; image_url: string }
    | { type: "image_base64"; image_base64: string; mime_type?: string };
  let imageDataUrl: string | undefined;

  if (input.url) {
    const imageUrl = (await assertSafeUrl(input.url)).toString();
    imagePart = {
      type: "image_url",
      image_url: imageUrl,
    };
  } else if (input.base64) {
    const parsedBase64 = parseBase64ImageInput(input.base64);
    const bytes = decodeBase64ToBytes(parsedBase64.base64);
    assertMaxSize(
      "image base64 payload",
      bytes.byteLength,
      config.maxInlineBytes
    );
    const imageBase64 = Buffer.from(bytes).toString("base64");
    const mimeType =
      parsedBase64.mimeType ?? detectImageMimeType(bytes) ?? "image/jpeg";
    imagePart = {
      type: "image_base64",
      image_base64: imageBase64,
      mime_type: mimeType,
    };
    imageDataUrl = resolveImageDataUrl(imageBase64, mimeType);
  } else {
    throw new Error("Image ingestion requires either `url` or `base64`.");
  }

  const imageDescription = await describeImageWithMistral({
    imageDataUrl: imagePart.type === "image_base64" ? imageDataUrl : undefined,
    imageUrl: imagePart.type === "image_url" ? imagePart.image_url : undefined,
    title: input.title,
    contextText: input.contextText,
  });

  const textContext =
    [input.title, input.contextText, imageDescription]
      .filter((v): v is string => Boolean(v && v.trim()))
      .join("\n\n") || "Image content";

  return {
    sourceType: "image",
    source,
    title: input.title,
    metadata: {
      embeddingModel: config.cohereEmbedModel,
      ingestionMode: "cohere-embed-v4-direct",
      imageDescriptionModel: imageDescription
        ? config.mistralImageDescriptionModel
        : null,
      imageEnrichmentApplied: Boolean(imageDescription),
    },
    chunks: [
      {
        chunkIndex: 0,
        content: textContext,
        kind: "visualization",
        embeddingInput: {
          type: "multimodal",
          content: [{ type: "text", text: textContext }, imagePart],
        },
        metadata: {
          sourceType: "image",
          source,
          modality: "mixed",
          extra: {
            route: "cohere-embed-v4",
          },
        },
      },
    ],
  };
};
