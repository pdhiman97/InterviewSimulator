import { GoogleGenAI, Type } from '@google/genai';
import { InterviewReport } from '../types';
import { generateWithGeminiFallback } from '../utils/geminiRetry';

export const getInterviewAnalysis = async (transcript: string, jobRole: string, jobDescription?: string): Promise<InterviewReport> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;
  
  const jobDescriptionContext = jobDescription
    ? `The interview was for a role with this description:
---
${jobDescription}
---
Evaluate the candidate's answers against the requirements in this description.`
    : "No job description was provided. Evaluate based on general expectations for the role.";

  const analysisPrompt = `
    As an expert hiring manager and career coach, you must provide a highly discerning, truthful, and insightful analysis of the following interview transcript for a "${jobRole}" position. Your feedback must be specific, constructive, and avoid generic statements. Your tone should be that of a helpful mentor.

    ${jobDescriptionContext}

    Transcript:
    ---
    ${transcript}
    ---

    A marker like "[USER UPLOADED AN IMAGE]" indicates the candidate provided a visual solution. Your analysis, especially for "Reasoning," must consider their verbal explanation surrounding this upload.

    **Structure your analysis in the JSON format defined by the schema, covering these 5 CORE SKILLS:**
    1.  **Communication:** Assesses clarity of expression, storytelling, active listening, and how structured their answers are.
    2.  **Reasoning:** Evaluates how the candidate structures their thoughts, analyzes problems, and explains their solutions.
    3.  **Role Knowledge:** Gauges the depth of technical skills or domain expertise relevant to the job role.
    4.  **Confidence:** Assesses professional presence, tone, and composure.
    5.  **Collaboration:** Looks for evidence of teamwork, handling conflict, and working effectively with others.

    **CRITICAL SCORING & FEEDBACK INSTRUCTIONS - BE EXTREMELY STRICT:**
    1.  **Adopt a REALISTIC, COMPETITIVE Evaluation Standard:** Your scoring must reflect ACTUAL real-world hiring standards at top companies. This is NOT a participation trophy. Be HARSH but fair. Most candidates will score 1-4. Only exceptional candidates score 5-7. Only outstanding candidates score 8-10.
    
    2.  **Scoring Scale - Use This Strictly:**
        - **1-2 (Poor/Inadequate):** Minimal effort, very short answers (1-2 sentences), no depth, no examples, no structure. A candidate who gives a one-sentence answer like "I'm a designer with 5 years experience" should get 1-2, NOT 5. This is the score for candidates who barely engage or give superficial responses.
        - **3-4 (Below Average):** Some effort but still minimal. Short answers with little detail, no examples, poor structure. Missing key information. This is for candidates who answer but don't demonstrate competence.
        - **5-6 (Average/Acceptable):** Adequate answers with some structure, basic examples, reasonable depth. This is for candidates who meet minimum expectations - they answer questions properly but don't stand out. This is NOT the default score - most candidates should score lower.
        - **7-8 (Good/Strong):** Well-structured answers with good examples, clear reasoning, demonstrates competence. This is for candidates who clearly know their stuff and communicate well.
        - **9-10 (Exceptional/Outstanding):** Exceptional answers with deep insights, excellent examples, outstanding communication, demonstrates expertise. Reserved for truly impressive candidates.
    
    3.  **Key Scoring Rules:**
        - A short, minimal answer (1-2 sentences) = 1-2 score, NOT 5
        - No examples provided = maximum 3-4 score
        - No structure or organization = maximum 3-4 score
        - Generic, vague answers = 2-3 score
        - If the candidate only gives basic facts without elaboration = 1-3 score
        - If the interview is very short with minimal responses = overall score should be 1-3
        - Only give 5+ if the candidate provides structured, detailed answers with examples
        - Only give 7+ if the candidate demonstrates clear expertise and excellent communication
    
    4.  **Be Truthful, Not Generic:** Do not invent feedback. If an answer is genuinely good, focus on *why* it was effective. If an answer is poor, be direct about it. It's acceptable for "positive" to be minimal or empty if the candidate didn't perform well.
    
    5.  **Quantitative Scoring:** You MUST provide a score from 1 to 10 for each of the 5 core skills and an overall score. Remember: 1-2 is for poor/minimal answers, 3-4 is below average, 5-6 is average (not default), 7-8 is good, 9-10 is exceptional.
    
    6.  **Hireability Rating:** Provide a "High", "Medium", or "Low" hireability rating based on realistic standards. Most candidates with minimal responses should be "Low".
    
    7.  **Specific & Quoted:** For every single point of feedback (positive and improvement), you MUST provide the exact, verbatim quote from the transcript that your feedback is about. This is mandatory.
    
    8.  **Actionable Advice:** The "actionableAdvice" must be a list of concrete, step-by-step actions. Be direct and specific.
    
    9.  **Overall Impression:** This should be honest and realistic. If the candidate gave minimal responses, say so directly but constructively. Don't sugarcoat poor performance.
  `;
  
  const feedbackItemSchema = {
    type: Type.OBJECT,
    properties: {
      point: { type: Type.STRING, description: "A concise point of feedback." },
      explanation: { type: Type.STRING, description: "Detailed explanation for the feedback point." },
      quote: { type: Type.STRING, description: "The exact, verbatim quote from the candidate's speech that this feedback point refers to." }
    },
    required: ['point', 'explanation', 'quote']
  };

  const feedbackSectionSchema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.NUMBER, description: "Score for this section, from 1 to 10." },
      positive: { type: Type.ARRAY, items: feedbackItemSchema },
      improvement: { type: Type.ARRAY, items: feedbackItemSchema }
    },
    required: ['score', 'positive', 'improvement']
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      overallScore: { type: Type.NUMBER, description: "A single overall score for the interview, from 1 to 10." },
      hireability: { type: Type.STRING, description: "Candidate's hireability, must be one of: 'High', 'Medium', or 'Low'." },
      keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 2-4 key strengths." },
      keyImprovements: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 2-4 key areas for improvement." },
      communication: feedbackSectionSchema,
      reasoning: feedbackSectionSchema,
      roleKnowledge: feedbackSectionSchema,
      confidence: feedbackSectionSchema,
      collaboration: feedbackSectionSchema,
      overallImpression: { type: Type.STRING, description: "A final, mentor-like summary of how the candidate came across." },
      actionableAdvice: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of concrete, actionable improvement steps." }
    },
    required: ['overallScore', 'hireability', 'keyStrengths', 'keyImprovements', 'communication', 'reasoning', 'roleKnowledge', 'confidence', 'collaboration', 'overallImpression', 'actionableAdvice']
  };

  try {
    const response = await generateWithGeminiFallback(models, model =>
      ai.models.generateContent({
          model,
          contents: analysisPrompt,
          config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
          }
      })
    );
    
    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as InterviewReport;

  } catch (error) {
    console.error("Error analyzing interview:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate interview feedback.");
  }
};