import React, { useState, useMemo } from 'react';
import { EXPERIENCE_LEVELS, ExperienceLevel, InterviewReport, FeedbackSection, TranscriptEntry, FeedbackPoint } from '../types';
import { toast } from './Toaster';

interface ReportScreenProps {
  report: InterviewReport;
  onRestart: () => void;
  jobRole: string;
  experienceLevel: ExperienceLevel;
  jobDescription?: string;
  transcript: TranscriptEntry[];
}

// --- Reusable Sub-components ---

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm sm:text-base font-semibold rounded-lg transition-colors ${
      active
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-gray-600 hover:bg-gray-200'
    }`}
  >
    {children}
  </button>
);

const CircularProgress: React.FC<{ score: number; hireability: 'High' | 'Medium' | 'Low' }> = ({ score, hireability }) => {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 10) * circumference;

    const hireabilityMap = { High: 'Strong', Medium: 'Solid', Low: 'Basic' };
    const colorMap = { High: 'text-green-500', Medium: 'text-yellow-500', Low: 'text-red-500' };

    return (
        <div className="relative flex-shrink-0 flex items-center justify-center h-32 w-32">
            <svg className="absolute top-0 left-0" width="100%" height="100%" viewBox="0 0 120 120">
                <circle className="text-gray-200" strokeWidth="8" stroke="currentColor" fill="transparent" r={radius} cx="60" cy="60" />
                <circle
                    className={colorMap[hireability]}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="60"
                    cy="60"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s ease-out' }}
                />
            </svg>
            <div className="flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${colorMap[hireability]}`}>{score}</span>
                <span className="text-xs font-semibold text-gray-500">{hireabilityMap[hireability]}</span>
            </div>
        </div>
    );
};

const SkillCard: React.FC<{ title: string; section: FeedbackSection; tooltip: string }> = ({ title, section, tooltip }) => {
    const { score, positive, improvement } = section;
    const width = `${score * 10}%`;
    const scoreCategory = score >= 8 ? 'Strong' : score >= 5 ? 'Solid' : 'Basic';
    const colorClass = score >= 8 ? 'bg-green-500' : score >= 5 ? 'bg-yellow-500' : 'bg-red-500';
    const hasFeedback = (positive && positive.length > 0) || (improvement && improvement.length > 0);

    return (
        <div className="relative group bg-white p-4 rounded-lg border border-gray-200 transition-shadow hover:shadow-md">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-700">{title}</h4>
                <div className="relative group/info z-30">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <div className="absolute bottom-full mb-2 w-48 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover/info:opacity-100 transition-opacity duration-300 -translate-x-1/2 left-1/2">
                        {tooltip}
                    </div>
                </div>
            </div>
            <div className="h-2 bg-gray-200 rounded-full">
                <div className={`h-2 rounded-full ${colorClass}`} style={{ width, transition: 'width 0.8s ease-out' }}></div>
            </div>
            <p className="text-right text-xs text-gray-500 mt-1">{score}/10 {scoreCategory}</p>

            {hasFeedback && (
                <div className="absolute bottom-full mb-3 w-64 md:w-72 bg-gray-900 text-white text-sm rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 pointer-events-none -translate-x-1/2 left-1/2 transform shadow-lg">
                    {improvement.length > 0 && (
                        <div className="mb-2">
                            <h5 className="font-bold text-yellow-400 mb-1">Areas to Improve</h5>
                            <ul className="list-disc list-inside space-y-1 text-gray-300 text-xs">
                                {improvement.map((item, index) => <li key={`imp-${index}`}>{item.point}</li>)}
                            </ul>
                        </div>
                    )}
                    {positive.length > 0 && (
                         <div>
                            <h5 className={`font-bold text-green-400 mb-1`}>Strengths</h5>
                            <ul className="list-disc list-inside space-y-1 text-gray-300 text-xs">
                                {positive.map((item, index) => <li key={`pos-${index}`}>{item.point}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-900"></div>
                </div>
            )}
        </div>
    );
};


const HighlightCard: React.FC<{ text: string; type: 'strength' | 'improvement' }> = ({ text, type }) => {
    const isStrength = type === 'strength';
    const icon = isStrength ? (
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
    ) : (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
    );
    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">{icon}</div>
            <p className="text-gray-700">{text}</p>
        </div>
    );
};

// --- Main Views ---

const OverviewTab: React.FC<{ report: InterviewReport }> = ({ report }) => {
    const skillSections = [
        { key: 'communication', title: 'Communication', section: report.communication, tooltip: "Assesses clarity of expression, storytelling, and active listening." },
        { key: 'reasoning', title: 'Reasoning', section: report.reasoning, tooltip: "Evaluates how you structure thoughts, analyze problems, and explain solutions." },
        { key: 'roleKnowledge', title: 'Role Knowledge', section: report.roleKnowledge, tooltip: "Gauges depth of technical skills or domain expertise relevant to the job." },
        { key: 'confidence', title: 'Confidence', section: report.confidence, tooltip: "Assesses professional presence, tone, and composure." },
        { key: 'collaboration', title: 'Collaboration', section: report.collaboration, tooltip: "Looks for evidence of teamwork and working effectively with others." },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Overall Impression Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col md:flex-row items-center gap-6">
                <CircularProgress score={report.overallScore} hireability={report.hireability} />
                <div className="text-center md:text-left">
                    <h3 className="text-xl font-bold text-gray-800">Overall Impression</h3>
                    <p className="text-gray-600 mt-1 leading-relaxed">{report.overallImpression}</p>
                </div>
            </div>
            
            {/* Skill Breakdown */}
            <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Skill Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {skillSections.filter(s => s.section).map(s => <SkillCard key={s.key} title={s.title} section={s.section!} tooltip={s.tooltip} />)}
                </div>
            </div>

            {/* Highlights & Focus Areas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🌟 What you did well</h3>
                    <div className="space-y-3">
                        {report.keyStrengths.map((s, i) => <HighlightCard key={i} text={s} type="strength" />)}
                    </div>
                </div>
                 <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🔧 Where to improve next</h3>
                     <div className="space-y-3">
                        {report.keyImprovements.map((s, i) => <HighlightCard key={i} text={s} type="improvement" />)}
                    </div>
                </div>
            </div>

             {/* Next Steps */}
            <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">🎯 How to level up</h3>
                <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-3">
                    {report.actionableAdvice.map((advice, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">{i+1}</div>
                            <p className="text-gray-700">{advice}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const InlineFeedback: React.FC<{ feedback: FeedbackPoint[], type: 'positive' | 'improvement' }> = ({ feedback, type }) => {
    const isPositive = type === 'positive';
    const styles = {
        container: isPositive ? 'bg-green-50 border-l-4 border-green-400' : 'bg-yellow-50 border-l-4 border-yellow-400',
        icon: isPositive ? 'text-green-400' : 'text-yellow-400',
        title: isPositive ? 'text-green-800' : 'text-yellow-800',
        text: isPositive ? 'text-green-700' : 'text-yellow-700',
    };
    const icon = isPositive ? (
        <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
    ) : (
        <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
    );

    return (
        <div className="mt-2 mb-4 max-w-xl ml-auto mr-0 animate-fade-in">
            <div className={`${styles.container} p-4 rounded-r-lg`}>
                <div className="flex">
                    <div className="flex-shrink-0">{icon}</div>
                    <div className="ml-3">
                        <div className={`mt-1 text-sm ${styles.text} space-y-2`}>
                            {feedback.map((fb, i) => (<p key={i}>{fb.explanation}</p>))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ChatFeedbackTab: React.FC<{ transcript: TranscriptEntry[], report: InterviewReport }> = ({ transcript, report }) => {
  const { positivePoints, improvementPoints } = useMemo(() => {
    const positive: FeedbackPoint[] = [];
    const improvement: FeedbackPoint[] = [];
    if (!report) return { positivePoints: [], improvementPoints: [] };
    
    [report.communication, report.reasoning, report.roleKnowledge, report.confidence, report.collaboration].forEach(section => {
      if (section) {
        positive.push(...(section.positive || []));
        improvement.push(...(section.improvement || []));
      }
    });
    return { positivePoints: positive.filter(p => p.quote), improvementPoints: improvement.filter(p => p.quote) };
  }, [report]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 animate-fade-in">
        <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Chat Feedback</h3>
            <p className="text-sm text-gray-500 mt-1">Review your conversation and see feedback in context.</p>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {transcript.map((entry, index) => {
            const entryPositiveFeedback = (entry.speaker === 'user' && entry.text)
                ? positivePoints.filter(fb => entry.text!.includes(fb.quote!)) : [];
            const entryImprovementFeedback = (entry.speaker === 'user' && entry.text)
                ? improvementPoints.filter(fb => entry.text!.includes(fb.quote!)) : [];
            
            return (
              <div key={index}>
                <div className={`flex flex-col ${entry.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xl rounded-2xl ${entry.speaker === 'user' ? 'bg-blue-600 text-white rounded-br-lg' : 'bg-gray-100 text-gray-900 rounded-bl-lg'}`}>
                        {entry.text && <p className="text-base px-4 py-3 whitespace-pre-wrap">{entry.text}</p>}
                        {entry.imageUrl && <img src={entry.imageUrl} alt="User upload" className="max-w-xs rounded-lg p-2" />}
                        {entry.codeSnippet && (
                          <div className="px-4 py-3 bg-gray-900 rounded-lg m-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-gray-400 uppercase">{entry.codeSnippet.language}</span>
                              {entry.codeSnippet.output && (
                                <span className="text-xs text-green-400">✓ Executed</span>
                              )}
                            </div>
                            <pre className="text-sm text-gray-100 overflow-x-auto">
                              <code>{entry.codeSnippet.code}</code>
                            </pre>
                            {entry.codeSnippet.output && (
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <div className="text-xs text-gray-400 mb-1">Output:</div>
                                <pre className="text-sm text-green-400 whitespace-pre-wrap">{entry.codeSnippet.output}</pre>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                    <span className="text-xs text-gray-500 mt-1.5 px-1">{entry.speaker === 'user' ? 'You' : 'Alex'}</span>
                </div>
                {entryPositiveFeedback.length > 0 && <InlineFeedback feedback={entryPositiveFeedback} type="positive" />}
                {entryImprovementFeedback.length > 0 && <InlineFeedback feedback={entryImprovementFeedback} type="improvement" />}
              </div>
            );
          })}
        </div>
    </div>
  );
};

const ReportScreen: React.FC<ReportScreenProps> = ({ report, onRestart, jobRole, experienceLevel, transcript }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const selectedLevel = EXPERIENCE_LEVELS[experienceLevel];
  
  const handleDownloadSummary = () => {
    const summaryParts = [
      `# Interview Report for ${jobRole}`,
      `Experience level: ${selectedLevel.label} (${selectedLevel.range})`,
      `Date: ${today}\n`,
      `## Overall Performance`,
      `- Score: ${report.overallScore}/10`,
      `- Hireability: ${report.hireability}`,
      `- Impression: ${report.overallImpression}\n`,
      `## Key Strengths`,
      ...report.keyStrengths.map(s => `- ${s}`),
      `\n## Areas for Improvement`,
      ...report.keyImprovements.map(i => `- ${i}`),
      `\n## Next Steps`,
      ...report.actionableAdvice.map(a => `- ${a}`),
    ];
    const summary = summaryParts.join('\n');
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Interview-Report-${jobRole.replace(/\s/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Summary downloaded!");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900">Great job completing your interview!</h1>
              <p className="text-gray-600 mt-1">For the <span className="font-semibold text-blue-600">{jobRole}</span> role at the {selectedLevel.label} level on {today}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onRestart} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-all">Try Again</button>
              <button onClick={handleDownloadSummary} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-sm transition-colors">Download Summary</button>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-xl">
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
            <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>Chat Feedback</TabButton>
          </div>
        </div>

        {/* Content */}
        <main>
          {activeTab === 'overview' && <OverviewTab report={report} />}
          {activeTab === 'chat' && <ChatFeedbackTab transcript={transcript} report={report} />}
        </main>
      </div>
       <style>{`
            @keyframes fade-in {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default ReportScreen;