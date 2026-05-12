import {readFileSync} from 'node:fs';
import {ConversationSchema, type Conversation} from '../types';

const ConversationFileSchema = ConversationSchema.array();

export type ConversationRepository = {
  loadAll(): Conversation[];
};

export function createFileConversationRepository(filePath: string): ConversationRepository {
  return {
    loadAll(): Conversation[] {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return ConversationFileSchema.assert(parsed);
    },
  };
}
