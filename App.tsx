import React, { useState } from 'react';
import { ExperienceLevel, InterviewState, InterviewReport, TranscriptEntry } from './types';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import ReportScreen from './components/ReportScreen';
import { Toaster, toast } from './components/Toaster';
import { getInterviewAnalysis } from './services/geminiService';

const App: React.FC = () => {
  const [interviewState, setInterviewState] = useState<InterviewState>(InterviewState.STARTING);
  const [jobRole, setJobRole] = useState<string>('');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('fresher');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [report, setReport] = useState<InterviewReport | null>(null);

  const handleStart = (role: string, level: ExperienceLevel, description?: string) => {
    if (role.trim()) {
      setJobRole(role);
      setExperienceLevel(level);
      setJobDescription(description || '');
      setInterviewState(InterviewState.IN_PROGRESS);
    }
  };

  const handleFinish = async (finalTranscript: TranscriptEntry[]) => {
    setTranscript(finalTranscript);
    setInterviewState(InterviewState.ANALYZING);

    const finalTranscriptText = finalTranscript.map(entry => {
      if (entry.speaker === 'user') {
        if (entry.imageUrl) {
          return `Candidate: [USER UPLOADED AN IMAGE]${entry.text ? ` with caption: ${entry.text.trim()}` : ''}`;
        }
        if (entry.codeSnippet) {
          return `Candidate: [CODE SUBMISSION - ${entry.codeSnippet.language.toUpperCase()}]\n${entry.codeSnippet.stdin ? `Standard input:\n${entry.codeSnippet.stdin}\n` : ''}\`\`\`${entry.codeSnippet.language}\n${entry.codeSnippet.code}\n\`\`\`${entry.codeSnippet.output ? `\n\nOutput:\n${entry.codeSnippet.output}` : ''}${entry.codeSnippet.error ? `\n\nExecution error:\n${entry.codeSnippet.error}` : ''}`;
        }
        return `Candidate: ${entry.text?.trim() || ''}`;
      }
      return `Interviewer: ${entry.text?.trim() || ''}`;
    }).join('\n');
    
    try {
        const generatedReport = await getInterviewAnalysis(finalTranscriptText, jobRole, experienceLevel, jobDescription);
        setReport(generatedReport);
        setInterviewState(InterviewState.FINISHED);
    } catch (error) {
        console.error("Error analyzing interview:", error);
        toast.error("Failed to generate your feedback report. Please try again.");
        handleRestart();
    }
  };

  const handleRestart = () => {
    setInterviewState(InterviewState.STARTING);
    setJobRole('');
    setJobDescription('');
    setTranscript([]);
    setReport(null);
  };

  const renderContent = () => {
    switch (interviewState) {
      case InterviewState.STARTING:
        return <SetupScreen onStart={handleStart} />;
      case InterviewState.IN_PROGRESS:
        return <InterviewScreen jobRole={jobRole} experienceLevel={experienceLevel} jobDescription={jobDescription} onFinish={handleFinish} />;
      case InterviewState.ANALYZING:
         return (
          <div className="flex flex-col items-center justify-center h-screen bg-white text-gray-900">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-xl text-gray-800">Alex is preparing your feedback...</p>
            <p className="text-gray-600">This might take a moment.</p>
          </div>
        );
      case InterviewState.FINISHED:
        return report && <ReportScreen report={report} onRestart={handleRestart} jobRole={jobRole} experienceLevel={experienceLevel} jobDescription={jobDescription} transcript={transcript} />;
      default:
        return <SetupScreen onStart={handleStart} />;
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <main>{renderContent()}</main>
      <Toaster />
    </div>
  );
};

export default App;
