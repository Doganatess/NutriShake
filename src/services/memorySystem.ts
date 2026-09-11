import { UserMemory, ShakeRating, Shake, UserPreference } from '../types';
import {
  getStoredUserMemories,
  saveUserMemory,
  deleteUserMemory,
  getStoredPreferences,
  saveStoredPreferences,
  addDislikedShake,
  toggleFavorite,
} from '../storage/storageAbstraction';

export class MemorySystem {
  /**
   * Retrieves all learned user memories.
   */
  static getMemories(): UserMemory[] {
    return getStoredUserMemories();
  }

  /**
   * Adds an explicit memory from user conversation, feedback, or shift schedule.
   */
  static addMemory(content: string, category: UserMemory['category'] = 'preference'): UserMemory {
    const memory: UserMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      content,
      category,
      createdAt: new Date().toISOString(),
    };
    saveUserMemory(memory);
    return memory;
  }

  /**
   * Deletes a specific memory.
   */
  static removeMemory(id: string): void {
    deleteUserMemory(id);
  }

  /**
   * Learns from shake rating feedback:
   * - If user rates a shake as 'disliked' (👎), records it to never suggest identical combinations.
   * - If user rates as 'liked' (👍), reinforces favorite tags.
   */
  static recordShakeFeedback(shake: Shake, rating: ShakeRating): void {
    if (rating === 'dislike') {
      addDislikedShake(shake.id);
      this.addMemory(`Kullanıcı "${shake.name}" tarifini beğenmedi. Bu içerik kombinasyonunu tekrar önerme.`, 'dislike');
    } else if (rating === 'like' || rating === 'love') {
      toggleFavorite(shake.id);
      this.addMemory(`Kullanıcı "${shake.name}" tarifini çok beğendi. Benzer lezzet profillerini önceliklendir.`, 'preference');
    }
  }

  /**
   * Formats learned memories into a clean prompt context for the AI prompt.
   */
  static getMemoryPromptContext(): string {
    const memories = this.getMemories();
    if (memories.length === 0) return 'Kayıtlı kullanıcı hafızası bulunmuyor.';

    return memories.map((m) => `- [${(m.category || 'GENEL').toUpperCase()}] ${m.content || m.text || ''}`).join('\n');
  }
}
