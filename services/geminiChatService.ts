import { invokeGemini } from './supabaseClient';
import { generateSpeechStream } from '../utils/geminiTts';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
}

export interface InterviewReply {
  text: string;
  shouldEndInterview: boolean;
}

export class GeminiChatService {
  private conversationHistory: ChatMessage[] = [];
  private systemInstruction: string;

  constructor(systemInstruction: string) {
    this.systemInstruction = systemInstruction;
  }

  async sendMessage(text: string, imageData?: { data: string; mimeType: string }): Promise<InterviewReply> {
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
    
    if (imageData) {
      parts.push({ inlineData: imageData });
    }
    if (text.trim()) {
      parts.push({ text: text.trim() });
    }

    this.conversationHistory.push({
      role: 'user',
      parts
    });

    try {
      const response = await invokeGemini<{ text: string }>({
        task: 'chat',
        systemInstruction: this.systemInstruction,
        contents: this.conversationHistory.slice(-12)
      });

      const rawResponse = response.text || '';
      const shouldEndInterview = /\[END_INTERVIEW\]\s*$/.test(rawResponse);
      const responseText = rawResponse.replace(/\s*\[END_INTERVIEW\]\s*$/, '').trim();
      
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return { text: responseText, shouldEndInterview };
    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      throw error;
    }
  }

  async generateAudio(text: string, onAudioChunk: (chunk: ArrayBuffer) => void): Promise<void> {
    return generateSpeechStream(text, onAudioChunk);
  }

  reset() {
    this.conversationHistory = [];
  }
}
