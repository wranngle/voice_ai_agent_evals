import { readFileSync } from "node:fs";
import { z } from "zod";
import { ConversationSchema, type Conversation } from "../types";
import type { Settings } from "../config";

const ConversationFileSchema = z.array(ConversationSchema);

export interface ConversationRepository {
  loadAll(): Conversation[];
}

export function createFileConversationRepository(
  settings: Settings,
  filePath: string,
): ConversationRepository {
  return {
    loadAll(): Conversation[] {
      void settings; // settings reserved for future use (e.g. fixtures dir)
      const raw = readFileSync(filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      return ConversationFileSchema.parse(parsed);
    },
  };
}
