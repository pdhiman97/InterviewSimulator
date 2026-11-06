import { GoogleGenAI } from '@google/genai';
import { generateWithGeminiFallback } from '../utils/geminiRetry';
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
  private ai: GoogleGenAI;
  private conversationHistory: ChatMessage[] = [];
  private systemInstruction: string;

  constructor(apiKey: string, systemInstruction: string) {
    this.ai = new GoogleGenAI({ apiKey });
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
      const response = await generateWithGeminiFallback(
        ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'],
        model => this.ai.models.generateContent({
          model,
          // Keep requests small as the interview history grows.
          contents: this.conversationHistory.slice(-12),
          config: {
            systemInstruction: this.systemInstruction,
            maxOutputTokens: 96
          }
        })
      );

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
