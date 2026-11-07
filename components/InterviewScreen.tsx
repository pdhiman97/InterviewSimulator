import { transcribeAudio } from "../utils/geminiStt";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EXPERIENCE_LEVELS, ExperienceLevel, TranscriptEntry } from '../types';
import Avatar from './Avatar';
import { toast } from './Toaster';
import { GeminiChatService } from '../services/geminiChatService';
import CodeEditor from './CodeEditor';
import { SupportedLanguage } from '../services/judge0Service';

interface InterviewScreenProps {
  jobRole: string;
  experienceLevel: ExperienceLevel;
  jobDescription?: string;
  onFinish: (transcript: TranscriptEntry[]) => void;
}

type SessionState = 'idle' | 'starting' | 'active' | 'error';

const prepareImagePreview = async (file: File): Promise<string> => {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 960 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the uploaded image.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let preview = canvas.toDataURL('image/jpeg', 0.75);
    if (preview.length > 600_000) {
      canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      preview = canvas.toDataURL('image/jpeg', 0.65);
    }
    if (preview.length > 600_000) {
      throw new Error('Image is too large to share. Please upload a smaller image.');
    }
    return preview;
  } finally {
    image.close();
  }
};

const getOpeningMessage = () =>
  "Hi, thanks for joining. I'm Alex, and I'll be speaking with you today. Please take your time; to start, could you introduce yourself and tell me a little about your background?";

const InterviewScreen: React.FC<InterviewScreenProps> = ({ jobRole, experienceLevel, jobDescription, onFinish }) => {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("Something went wrong. Please check permissions and try again.");
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [currentCode, setCurrentCode] = useState<string>('');
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>('javascript');
  const [codeInput, setCodeInput] = useState('');
  
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const chatServiceRef = useRef<GeminiChatService | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const stalemateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const startRecordingRef = useRef<(() => void) | null>(null);
  const greetingPlayedRef = useRef(false);
  const audioStreamCompleteRef = useRef(false);
  const endInterviewAfterSpeechRef = useRef(false);

  const appendTranscript = useCallback((entries: TranscriptEntry[]) => {
    transcriptRef.current = [...transcriptRef.current, ...entries];
    setTranscript(transcriptRef.current);
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (outputAudioContextRef.current) {
        audioSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) { /* Ignore */ }
        });
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }
    setIsSpeaking(false);
  }, []);

  const cleanup = useCallback(async () => {
    if (stalemateTimerRef.current) clearTimeout(stalemateTimerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    stopAudioPlayback();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping media recorder:", e);
      }
      mediaRecorderRef.current = null;
    }

    if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        await inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        await outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    recordedChunksRef.current = [];
    isRecordingRef.current = false;
  }, [stopAudioPlayback]);
  
  const handleEndInterview = useCallback(async () => {
    await cleanup();
    onFinish(transcriptRef.current);
  }, [cleanup, onFinish]);

  const handleEndInterviewRef = useRef(handleEndInterview);
  useEffect(() => {
      handleEndInterviewRef.current = handleEndInterview;
  }, [handleEndInterview]);
  
  const clearTimers = useCallback(() => {
    if (stalemateTimerRef.current) clearTimeout(stalemateTimerRef.current);
  }, []);

  const startInactivityTimer = useCallback(() => {
    clearTimers();
    stalemateTimerRef.current = setTimeout(() => {
      toast.info("Interview ended due to inactivity.");
      handleEndInterviewRef.current();
    }, 120000); // 2 minutes
  }, [clearTimers]);

  const getSystemInstruction = useCallback(() => {
    const role = jobRole.toLowerCase();
    const isDesigner = /product designer|ux|ui|user experience|interaction design/.test(role);
    const isProductManager = /product manager|product owner/.test(role);
    const isSoftwareEngineer = /software|developer|engineer|programmer|sde|frontend|back.?end|full.?stack/.test(role);
    const level = EXPERIENCE_LEVELS[experienceLevel];
    const jobContext = jobDescription?.trim()
      ? `Use this job description to prioritize relevant skills, but do not quote it back:\n${jobDescription}`
      : 'Use sensible expectations for the stated role.';

    const experiencePlan = experienceLevel === 'fresher'
      ? `FRESHER / STUDENT (${level.range}):
- Be patient and encouraging while keeping the discussion realistic. Spend more time on their education, interests, internships, academic projects, and what they personally built.
- Test fundamentals and potential, not deep industry experience. Look for clear thinking, curiosity, and honesty; do not expect polished answers, production-scale experience, or industry-wide impact.
- Ask them to explain projects simply and distinguish their own contribution. For software roles, use fundamental concepts and a simple coding problem.`
      : experienceLevel === 'earlyCareer'
        ? `EARLY CAREER (${level.range}):
- Ask about real work they have done: what they owned, what went wrong, what they learned, and how they worked with a team.
- Keep questions practical and grounded in their experience. Expect depth in their own area, but do not expect large-scale system design or organization-wide strategy.`
        : experienceLevel === 'midLevel'
          ? `MID-LEVEL (${level.range}):
- Probe ownership, judgment, and decision-making: trade-offs, ambiguity, cross-functional work, mentoring, and handling disagreements.
- Politely challenge vague answers with a specific follow-up. Ask why they chose an approach and what they would do differently. For software roles, discuss system design and scale as appropriate.`
          : `SENIOR / LEAD (${level.range}):
- Treat this as a peer conversation. Focus on impact, leadership, strategy, big-picture thinking, stakeholder influence, team building, and long-term outcomes.
- Ask about difficult decisions, how they raised team quality, and how they influenced outcomes. Avoid basic fundamentals questions; focus on scope and evidence rather than title.`;

    const roleSpecificPlan = isDesigner
      ? `DESIGNER INTERVIEW:
- Start with a portfolio or case study if they have one; otherwise use an academic, personal, or work project appropriate to their level. Ask about process, research, choices, constraints, and collaboration with developers and PMs.
- Give one design challenge grounded in Indian users, such as a low-end phone, a smaller city, or a user less comfortable with English. Invite a sketch or verbal walkthrough, then ask why they structured it that way and what they would change.
- Emphasize craft and thinking for junior candidates; emphasize strategy, influence, and raising team quality for senior candidates.
- Debrief the exercise with one focused question about validation or what they would improve.`
      : isSoftwareEngineer
        ? `SOFTWARE ENGINEER INTERVIEW:
 - Explore an appropriate project or piece of work, their implementation choices, testing, debugging, and collaboration.
- For freshers, cover relevant fundamentals and give one simple coding problem. For experienced candidates, use a practical problem tied to their level; at mid-level and above, also discuss system design and scale.
- State the coding task clearly with inputs, output, and an example. Invite them to explain their approach, use the coding workspace and submit when ready. Evaluate reasoning and edge cases, not just a perfect first attempt; afterward ask what they would improve.`
        : isProductManager
          ? `PRODUCT MANAGER INTERVIEW:
- Explore how they understand users and make product decisions. Use a relevant product-design or prioritization problem, investigate a dropped metric, or ask them to make a trade-off with limited resources.
- Use Indian context where useful, such as UPI, quick commerce, price-sensitive or vernacular users. Include a stakeholder or conflict scenario.
- Emphasize structured thinking and user empathy for junior candidates; emphasize strategy, business sense, and leadership for senior candidates.`
        : `ROLE-SPECIFIC INTERVIEW:
- Explore relevant work and the candidate's ownership, decisions, trade-offs, outcomes, and collaboration.
- Test the role's core skills through realistic scenarios and past work. Adjust depth to their level, let them reason aloud, and ask about success measures.`;

    return `You are Alex, a warm and skilled interviewer for a realistic PRACTICE interview for "${jobRole}".
The candidate selected the ${level.label} experience level (${level.range}). Tailor the depth, expectations, and tone of every question accordingly.
${jobContext}

This is coaching, not a hiring decision. Never screen the candidate out or end early because of their background, career change, a weak answer, or limited experience. Assess only demonstrated, role-relevant skills at the selected level. Be respectful and do not infer ability from identity, accent, or personal traits.

INTERVIEW SEQUENCE — follow in order and use the full conversation history to remember progress:
1. Introduction and background: the opening has greeted the candidate and asked them to introduce themselves. Listen for their education, current work or studies, what they are looking for, and why this role interests them. Ask a natural follow-up before moving on.
2. Resume and projects: explore relevant work, internships, academic projects, or portfolio pieces appropriate to their level. Understand their personal contribution before probing decisions or outcomes.
3. Role-specific round: ask a few distinct questions on the role's highest-priority skills. Build on their answers rather than reading a checklist.
4. Practical exercise: transition naturally and offer the role-appropriate exercise below. Keep its difficulty appropriate to their experience. Let them clarify and think aloud; stay with useful follow-ups.
5. Behavioural discussion: ask a relevant question about teamwork, a challenge, or disagreement, appropriate to their seniority.
6. Candidate questions and close: invite their questions, then thank them and say they will hear back soon. Append [END_INTERVIEW] only to that final reply.

${experiencePlan}
${roleSpecificPlan}

CONVERSATION RULES:
- Ask one focused question per turn, in one or two short, natural sentences. Let the candidate finish and follow up on what they actually said before changing topics.
- Acknowledge briefly when useful ("okay, got it"); do not praise every answer or tell them whether it was right or wrong during the interview.
- Be patient. If they struggle, give them a moment or one small nudge, then move on without supplying the answer.
- Make transitions gentle. Do not jump from the introduction into a technical test or from an exercise directly to the close.
- The candidate may speak, type, upload a sketch, or use the coding workspace. Accept equivalent ways to participate.
- Do not ask what role they want; it is "${jobRole}". Never invent details about their portfolio or uploaded image.
- Never ask about religion, caste, marital status, family plans, or other non-professional personal matters.
- Keep examples and scenarios realistic for the role and job description.`;
  }, [jobRole, experienceLevel, jobDescription]);

  const finishAudioStream = useCallback(() => {
    if (!audioStreamCompleteRef.current || audioSourcesRef.current.size > 0) return;

    if (endInterviewAfterSpeechRef.current) {
      endInterviewAfterSpeechRef.current = false;
      handleEndInterviewRef.current();
      return;
    }

    setIsSpeaking(false);
    startInactivityTimer();
    setTimeout(() => {
      if (sessionState === 'active' && !isProcessing && !isRecordingRef.current && startRecordingRef.current) {
        startRecordingRef.current();
      }
    }, 100);
  }, [startInactivityTimer, sessionState, isProcessing]);

  const playAudioChunk = useCallback((audioChunk: ArrayBuffer) => {
    const context = outputAudioContextRef.current;
    const analyser = analyserNodeRef.current;
    if (!context || !analyser || audioChunk.byteLength < 2) return;
    if (audioChunk.byteLength % 2 !== 0) {
      throw new Error('Gemini TTS returned an incomplete PCM audio sample.');
    }

    if (isRecordingRef.current && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsListening(false);
    }

    const sampleCount = audioChunk.byteLength / 2;
    const audioBuffer = context.createBuffer(1, sampleCount, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(audioChunk);
    for (let i = 0; i < sampleCount; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    setIsSpeaking(true);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, context.currentTime + 0.1);
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
    audioSourcesRef.current.add(source);
    source.onended = () => {
      audioSourcesRef.current.delete(source);
      finishAudioStream();
    };
  }, [finishAudioStream]);

  const processUserMessage = useCallback(async (
    text: string,
    imageData?: { data: string; mimeType: string },
    codeSnippet?: TranscriptEntry['codeSnippet']
  ) => {
    if (!chatServiceRef.current) return;

    let isPlannedInterviewEnd = false;
    try {
      setIsProcessing(true);
      clearTimers();
      isRecordingRef.current = false; // Stop recording while processing

      // Add user message to transcript
      const userEntry: TranscriptEntry = { speaker: 'user', text: text.trim(), codeSnippet };
      if (imageData) {
        userEntry.imageUrl = `data:${imageData.mimeType};base64,${imageData.data}`;
      }
      appendTranscript([userEntry]);

      // Get AI response
      setProcessingStage('Thinking of a response...');
      const messageForInterviewer = codeSnippet
        ? `The candidate submitted this ${codeSnippet.language} solution.\nStandard input:\n${codeSnippet.stdin || '(none)'}\nCode:\n\`\`\`${codeSnippet.language}\n${codeSnippet.code}\n\`\`\`\n${codeSnippet.output ? `Judge0 output:\n${codeSnippet.output}` : codeSnippet.error ? `Judge0 error:\n${codeSnippet.error}` : 'The candidate did not run the code.'}\nReview their approach and ask one focused follow-up.`
        : text;
      const { text: responseText, shouldEndInterview } = await chatServiceRef.current.sendMessage(messageForInterviewer, imageData);
      
      setProcessingStage('Preparing voice...');
      audioStreamCompleteRef.current = false;
      nextStartTimeRef.current = 0;
      isPlannedInterviewEnd = shouldEndInterview;
      endInterviewAfterSpeechRef.current = shouldEndInterview;
      let audioError: unknown;
      const audioPromise = chatServiceRef.current.generateAudio(responseText, playAudioChunk)
        .catch(error => {
          audioError = error;
        });

      await new Promise(resolve => setTimeout(resolve, 350));
      appendTranscript([{ speaker: 'ai', text: responseText }]);

      try {
        await audioPromise;
        if (audioError) throw audioError;
      } finally {
        audioStreamCompleteRef.current = true;
        finishAudioStream();
      }

    } catch (error: any) {
      console.error('Error processing message:', error);
      toast.error(error.message || "Failed to process your message. Please try again.");
      setIsProcessing(false);
      setProcessingStage('');
      // Restart recording after error (faster restart)
      if (!isPlannedInterviewEnd) {
        setTimeout(() => {
          if (sessionState === 'active' && !isProcessing && startRecordingRef.current) {
            startRecordingRef.current();
          }
        }, 300);
      }
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  }, [appendTranscript, clearTimers, finishAudioStream, playAudioChunk, sessionState]);

  const startSession = useCallback(async () => {
    setSessionState('starting');

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));

      // Initialize audio context for output
      const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await context.resume();
      outputAudioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyserNodeRef.current = analyser;
      analyser.connect(context.destination);

      // Initialize chat service
      chatServiceRef.current = new GeminiChatService(getSystemInstruction());

      greetingPlayedRef.current = false; // Reset flag for new session
      transcriptRef.current = [];
      setTranscript([]);
      setSessionState('active');
    } catch (error: any) {
      console.error('Initialization failed:', error);
      setErrorMessage(error.message || "Failed to connect to the interview service. Please check your connection and try again.");
      setSessionState('error');
    }
  }, [jobRole, getSystemInstruction]);

  const handleStartSessionClick = useCallback(async () => {
    if (sessionState === 'error') {
      await cleanup();
      transcriptRef.current = [];
      setTranscript([]);
    }
    startSession();
  }, [sessionState, cleanup, startSession]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const previewUrl = await prepareImagePreview(file);
        setImageFile(file);
        setImagePreview(previewUrl);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not load image preview.');
        console.error(error);
        e.target.value = '';
      }
    }
  };

  const handleSend = async () => {
    if (!textInput.trim() && !imageFile) return;

    let imageData: { data: string; mimeType: string } | undefined;
    if (imageFile && imagePreview) {
      const base64Data = imagePreview.split(',')[1];
      imageData = {
        data: base64Data,
        mimeType: imagePreview.split(';')[0].replace('data:', '')
      };
    }

    await processUserMessage(textInput.trim(), imageData);

    setTextInput('');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleCodeSubmit = useCallback((
    code: string,
    language: SupportedLanguage,
    output?: string,
    stdin?: string,
    executionError?: string
  ) => {
    setShowCodeEditor(false);
    processUserMessage(`Submitted my ${language} solution for review.`, undefined, {
      code,
      language,
      output,
      stdin,
      error: executionError
    });
  }, [processUserMessage]);

  const detectSilence = useCallback(() => {
    if (!inputAnalyserRef.current || !isRecordingRef.current || isProcessing) return;

    const analyser = inputAnalyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += Math.abs(normalized);
    }
    const average = sum / bufferLength;
    const threshold = 0.01; // Adjust this to be more/less sensitive

    if (average > threshold) {
      // Sound detected, reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // Leave room for natural pauses before ending a spoken answer.
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 1400);
    }

    // Continue monitoring
    if (isRecordingRef.current) {
      requestAnimationFrame(detectSilence);
    }
  }, [isProcessing]);

  const startContinuousRecording = useCallback(async () => {
    if (isProcessing || isRecordingRef.current || isSpeaking) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      microphoneStreamRef.current = stream;

      // Create audio context for silence detection
      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputContext;
      const source = inputContext.createMediaStreamSource(stream);
      const analyser = inputContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      inputAnalyserRef.current = analyser;
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;
        setIsListening(false);
        
        if (recordedChunksRef.current.length === 0) {
          // Restart recording if no audio was captured (immediate restart)
          setTimeout(() => startContinuousRecording(), 100);
          return;
        }

        try {
          setIsProcessing(true);
          setProcessingStage('Transcribing your answer...');
          const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm;codecs=opus' });
          
          // Validate minimum recording length (reduced threshold for faster processing)
          if (audioBlob.size < 500) {
            setIsProcessing(false);
            setProcessingStage('');
            recordedChunksRef.current = [];
            // Restart recording (immediate restart)
            setTimeout(() => startContinuousRecording(), 100);
            return;
          }
          
          // Transcribe audio
          const transcription = await transcribeAudio(audioBlob);
          
          if (transcription.trim()) {
            await processUserMessage(transcription);
          } else {
            setIsProcessing(false);
            setProcessingStage('');
            recordedChunksRef.current = [];
            // Restart recording (immediate restart)
            setTimeout(() => startContinuousRecording(), 100);
          }
        } catch (error: any) {
          console.error('Error transcribing audio:', error);
          toast.error(error.message || "Failed to transcribe audio. Please try again.");
          setIsProcessing(false);
          setProcessingStage('');
          recordedChunksRef.current = [];
          // Restart recording after error (faster restart)
          setTimeout(() => startContinuousRecording(), 300);
        }
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsListening(true);
      
      // Start silence detection
      detectSilence();
    } catch (error: any) {
      console.error('Error starting recording:', error);
      toast.error("Could not access microphone. Please grant permission.");
      setIsListening(false);
    }
  }, [isProcessing, isSpeaking, detectSilence, processUserMessage]);

  useEffect(() => {
    // Store the recording function reference
    startRecordingRef.current = startContinuousRecording;
  }, [startContinuousRecording]);

  useEffect(() => {
    if (sessionState === 'active' && chatServiceRef.current && !greetingPlayedRef.current) {
      greetingPlayedRef.current = true;
      audioStreamCompleteRef.current = false;
      nextStartTimeRef.current = 0;
      const greetingText = getOpeningMessage();
      appendTranscript([{ speaker: 'ai', text: greetingText }]);
      chatServiceRef.current.generateAudio(
        greetingText,
        playAudioChunk
      ).catch(error => {
        console.error('Error generating interview greeting:', error);
        toast.error(error.message || 'Could not generate the interview greeting.');
      }).finally(() => {
        audioStreamCompleteRef.current = true;
        finishAudioStream();
      });
    }
  }, [sessionState, appendTranscript, playAudioChunk, finishAudioStream]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);
  
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  if (sessionState !== 'active') {
    let buttonText = "Start Session";
    let message = "Click the button to begin your interview.";
    if (sessionState === 'starting') {
      buttonText = "Initializing...";
      message = "Please wait, Alex is getting ready.";
    }
    if (sessionState === 'error') {
      buttonText = "Retry";
      message = errorMessage;
    }
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-white p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-2xl text-center">
                <h2 className="text-2xl font-semibold mb-3">Practice interview: <span className="font-bold text-blue-600">{jobRole}</span></h2>
                <p className="text-gray-600 mb-6">{message}</p>
                {sessionState === 'idle' && (
                  <div className="mb-7 rounded-xl border border-gray-200 bg-gray-50 p-5 text-left">
                    <h3 className="font-semibold text-gray-900">Here’s the plan</h3>
                    <ol className="mt-3 space-y-2 text-sm text-gray-700">
                      <li><span className="font-medium">1. Experience:</span> discuss a project and your decisions.</li>
                      <li><span className="font-medium">2. Role skills:</span> explore a few focused questions.</li>
                      <li><span className="font-medium">3. Practical exercise:</span> sketch and upload an image, or use the coding workspace with Judge0.</li>
                      <li><span className="font-medium">4. Wrap-up:</span> reflect and ask your questions.</li>
                    </ol>
                    <p className="mt-4 text-sm text-gray-500">Speak or type your answers. You can take your time; this is practice, not a hiring decision.</p>
                  </div>
                )}
                <button
                    onClick={handleStartSessionClick}
                    disabled={sessionState === 'starting'}
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-wait text-white font-bold rounded-lg transition-colors text-xl"
                >
                    {buttonText}
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col">
      <div className="flex-shrink-0 flex justify-between items-center p-4 sm:p-6 lg:p-8 lg:pb-4">
          <div>
            <h2 className="text-xl font-semibold">Practice interview: <span className="font-bold text-blue-600">{jobRole}</span></h2>
            <p className="mt-1 text-sm text-gray-500">Experience → role skills → practical exercise → wrap-up</p>
          </div>
          <button
            onClick={handleEndInterview}
            className="px-4 py-2 bg-gray-200 hover:bg-red-500 hover:text-white text-gray-700 font-bold rounded-lg transition-colors"
          >
            End Interview
          </button>
        </div>
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
          <div className={`flex flex-col items-center justify-center bg-white rounded-lg p-6 border lg:w-1/3 transition-all duration-300 ${isSpeaking ? 'border-blue-500 shadow-xl shadow-blue-500/20' : 'border-gray-200'}`}>
            <Avatar isSpeaking={isSpeaking} analyserNode={analyserNodeRef.current} />
            <p className="mt-6 text-xl font-medium text-gray-900">Alex, The Interviewer</p>
            <div className={`mt-2 text-sm font-medium transition-colors ${isSpeaking ? 'text-blue-600' : isListening ? 'text-green-600' : isProcessing ? 'text-yellow-600' : 'text-gray-500'}`}>
              {isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : isProcessing ? processingStage || 'Processing...' : 'Ready'}
            </div>
          </div>
          <div className="flex-1 lg:w-2/3 bg-white rounded-lg border border-gray-200 flex flex-col min-h-0">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
                <h3 className="text-xl font-bold text-gray-900">Live Transcript</h3>
            </div>
            <div className="transcript-container flex-1 overflow-y-auto p-6 space-y-4">
              {transcript.map((entry, index) => (
                <div key={index} className={`flex flex-col animate-fade-in-up ${entry.speaker === 'user' ? 'items-end' : 'items-start'}`}>
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
                        {entry.codeSnippet.stdin && (
                          <div className="mt-3 border-t border-gray-700 pt-3">
                            <div className="mb-1 text-xs text-gray-400">Standard input:</div>
                            <pre className="whitespace-pre-wrap text-sm text-gray-300">{entry.codeSnippet.stdin}</pre>
                          </div>
                        )}
                        {entry.codeSnippet.error && (
                          <div className="mt-3 border-t border-gray-700 pt-3">
                            <div className="mb-1 text-xs text-red-400">Run error:</div>
                            <pre className="whitespace-pre-wrap text-sm text-red-300">{entry.codeSnippet.error}</pre>
                          </div>
                        )}
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
              ))}
              <div ref={transcriptEndRef} />
            </div>
            <div className="mt-auto p-6 border-t border-gray-200 flex-shrink-0">
                 <div className="flex justify-center items-center mb-4 h-12">
                    {isSpeaking ? (
                        <span className="text-gray-500 text-sm animate-fade-in">
                          Alex is speaking...
                        </span>
                    ) : isProcessing ? (
                        <span className="text-gray-500 text-sm animate-fade-in">
                          {processingStage || 'Processing your message...'}
                        </span>
                    ) : isListening ? (
                        <span className="text-green-600 text-sm animate-fade-in flex items-center gap-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                          </span>
                          Listening... (speak naturally)
                        </span>
                    ) : (
                        <span className="text-gray-500 text-sm">
                          Ready to listen...
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCodeEditor(!showCodeEditor)}
                      className="cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors"
                      title="Open coding workspace (Judge0)"
                    >
                      <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </button>
                    <label htmlFor="image-upload" title="Upload a design sketch or other image" className="cursor-pointer p-2 rounded-full hover:bg-gray-200 transition-colors">
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <input id="image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                    <div className="flex-1 relative">
                        {imagePreview && (
                            <div className="absolute bottom-12 left-0 p-1 bg-white border rounded-lg shadow-md">
                                <img src={imagePreview} alt="Preview" className="h-20 w-auto rounded" />
                                <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">&times;</button>
                            </div>
                        )}
                        <input
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Speak or type your answer..."
                            disabled={isProcessing}
                            className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-full text-base placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                    </div>
                    <button
                        onClick={handleSend}
                        disabled={(!textInput.trim() && !imageFile) || isProcessing}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all transform hover:scale-110 disabled:bg-gray-400 disabled:scale-100"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </button>
                </div>
            </div>
          </div>
      </div>
       <style>{`
            .transcript-container::-webkit-scrollbar {
                width: 8px;
            }
            .transcript-container::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 10px;
            }
            .transcript-container::-webkit-scrollbar-thumb {
                background: #ccc;
                border-radius: 10px;
            }
            .transcript-container::-webkit-scrollbar-thumb:hover {
                background: #aaa;
            }
            @keyframes fade-in-up {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
             @keyframes fade-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
      `}</style>
      {showCodeEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Coding workspace · Judge0</h3>
              <button
                onClick={() => setShowCodeEditor(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <CodeEditor
                language={currentLanguage}
                initialCode={currentCode}
                taskDescription={transcript.slice().reverse().find(entry => entry.speaker === 'ai')?.text || ''}
                initialStdin={codeInput}
                onCodeChange={setCurrentCode}
                onLanguageChange={setCurrentLanguage}
                onStdinChange={setCodeInput}
                onCodeSubmit={handleCodeSubmit}
                height="calc(90vh - 120px)"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewScreen;
