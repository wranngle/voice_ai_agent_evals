import {readFileSync} from 'node:fs';
import {ConversationSchema, type Conversation} from '../types';
import type {Settings} from '../config';

const ConversationFileSchema = ConversationSchema.array();

export type ConversationRepository = {
  loadAll(): Conversation[];
};

export function createFileConversationRepository(
  settings: Settings,
  filePath: string,
): ConversationRepository {
  return {
    loadAll(): Conversation[] {
      void settings; // Settings reserved for future use (e.g. fixtures dir)
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return ConversationFileSchema.assert(parsed);
    },
  };
}
