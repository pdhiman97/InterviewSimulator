export enum InterviewState {
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  ANALYZING = 'ANALYZING',
  FINISHED = 'FINISHED',
}

export const EXPERIENCE_LEVELS = {
  fresher: { label: 'Fresher / Student', range: '0-1 year' },
  earlyCareer: { label: 'Early career', range: '1-3 years' },
  midLevel: { label: 'Mid-level', range: '3-6 years' },
  seniorLead: { label: 'Senior / Lead', range: '6+ years' },
} as const;

export type ExperienceLevel = keyof typeof EXPERIENCE_LEVELS;

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
