export enum InterviewState {
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  ANALYZING = 'ANALYZING',
  FINISHED = 'FINISHED',
}

export interface TranscriptEntry {
  speaker: 'user' | 'ai';
  text?: string;
  imageUrl?: string;
  codeSnippet?: {
    code: string;
    language: string;
    stdin?: string;
    output?: string;
    error?: string;
  };
}

export interface FeedbackPoint {
  point: string;
  explanation: string;
  quote?: string; // Verbatim quote from transcript
}

export interface FeedbackSection {
  score: number; // Score from 1-10
  positive: FeedbackPoint[];
  improvement: FeedbackPoint[];
}

export interface InterviewReport {
  overallScore: number; // Overall score from 1-10
  hireability: 'High' | 'Medium' | 'Low'; // Likelihood to be hired
  keyStrengths: string[]; // Bulleted list of key strengths
  keyImprovements: string[]; // Bulleted list of key areas for improvement
  
  // Redesigned Skill Breakdown
  communication?: FeedbackSection;
  reasoning?: FeedbackSection;
  roleKnowledge?: FeedbackSection;
  confidence?: FeedbackSection;
  collaboration?: FeedbackSection;

  overallImpression: string;
  actionableAdvice: string[];
}
