
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { AnalysisStatus, CritiqueResult, Session, ChatMessage, SessionPrediction, StemComparisonResult, StemComparison } from './types';
import { analyzeAudio, createChatSession, predictSessionConfiguration, compareStems, setVstLibrary, getVstLibrary } from './services/geminiService';
import Spectrogram from './components/Spectrogram';
import CritiqueSection from './components/CritiqueSection';
import ChatInterface from './components/ChatInterface';
import StemComparisonSection from './components/StemComparisonSection';

const STORAGE_KEY = 'sonic_critique_sessions';
const CURRENT_ID_KEY = 'sonic_critique_current_id';

declare global {
  /**
   * AIStudio interface for managing API keys in the host environment.
   */
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  /**
   * Declaring aistudio as a global var instead of augmenting interface Window
   * helps avoid "All declarations of 'aistudio' must have identical modifiers" errors
   * when colliding with environment-injected type definitions.
   */
  var aistudio: AIStudio;
}

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

const App: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error("Failed to load sessions", e); }
    }
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    return localStorage.getItem(CURRENT_ID_KEY);
  });

  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [pendingXmlContent, setPendingXmlContent] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);
  const [currentAudioBase64, setCurrentAudioBase64] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRevisionPromptOpen, setIsRevisionPromptOpen] = useState(false);
  const [revisionPromptText, setRevisionPromptText] = useState("");
  const [isVstHelpOpen, setIsVstHelpOpen] = useState(false);
  const [vstLibraryPreview, setVstLibraryPreview] = useState("");

  // Sync with geminiService's getVstLibrary when modal opens
  useEffect(() => {
    if (isVstHelpOpen) {
      setVstLibraryPreview(getVstLibrary());
    }
  }, [isVstHelpOpen]);
  
  const [appMode, setAppMode] = useState<'full_mix' | 'stem_compare'>('full_mix');
  const [stemAContent, setStemAContent] = useState<{file: File, base64: string} | null>(null);
  const [stemBContent, setStemBContent] = useState<{file: File, base64: string} | null>(null);

  const stemAInputRef = useRef<HTMLInputElement>(null);
  const stemBInputRef = useRef<HTMLInputElement>(null);
  const vstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log("App component mounted");
    return () => console.log("App component unmounted");
  }, []);

  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const songXmlInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const checkKeyStatus = useCallback(async () => {
    try {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasCustomKey(hasKey);
    } catch (e) {
      console.error("Failed to check API key status", e);
    }
  }, []);

  useEffect(() => {
    checkKeyStatus();
    window.addEventListener('focus', checkKeyStatus);
    
    // Check if API key is missing
    if (!process.env.API_KEY) {
      console.warn("API_KEY environment variable is not set. AI features may fail unless a personal key is selected.");
    }

    return () => window.removeEventListener('focus', checkKeyStatus);
  }, [checkKeyStatus]);

  const isPruningRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isPruningRef.current) {
        isPruningRef.current = false;
        return;
      }

      try {
        const sessionsJson = JSON.stringify(sessions);
        localStorage.setItem(STORAGE_KEY, sessionsJson);
      } catch (e) {
        console.error("Failed to save sessions to localStorage.", e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          isPruningRef.current = true;
          setSessions(prev => {
            if (prev.length <= 1) return prev;
            // Try to clear oldest session's XML and chat history
            const newSessions = [...prev];
            for (let i = newSessions.length - 1; i >= 0; i--) {
              if (newSessions[i].chatHistory.length > 0 || newSessions[i].songXmlContent) {
                newSessions[i] = { ...newSessions[i], chatHistory: [], songXmlContent: undefined };
                console.log("Pruned session to save space:", newSessions[i].name);
                break;
              }
            }
            return newSessions;
          });
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [sessions]);

  useEffect(() => {
    try {
      if (currentSessionId) localStorage.setItem(CURRENT_ID_KEY, currentSessionId);
      else localStorage.removeItem(CURRENT_ID_KEY);
    } catch (e) {
      console.error("Failed to save current session ID", e);
    }
  }, [currentSessionId]);

  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId) || null
  , [sessions, currentSessionId]);

  useEffect(() => {
    if (currentSession && currentSession.critiques.length > 0 && status === AnalysisStatus.IDLE) {
      setStatus(AnalysisStatus.SUCCESS);
    }
  }, [currentSession, status]);

  const latestCritique = currentSession?.critiques[currentSession.critiques.length - 1] || null;

  const chatSession = useMemo(() => {
    if (!latestCritique) return null;
    try {
      return createChatSession(latestCritique, currentSession?.chatHistory);
    } catch (e) {
      console.error("Failed to create chat session:", e);
      return null;
    }
  }, [latestCritique, currentSession?.id]);

  const handleOpenKeySelector = async () => {
    await window.aistudio.openSelectKey();
    setHasCustomKey(true);
    checkKeyStatus();
  };

  const updateChatHistory = useCallback((messages: ChatMessage[]) => {
    if (!currentSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, chatHistory: messages, lastModified: Date.now() };
      }
      return s;
    }));
  }, [currentSessionId]);

  const createNewSession = (initialName: string): Session => {
    const newSession: Session = {
      id: generateId(),
      name: initialName,
      createdAt: Date.now(),
      lastModified: Date.now(),
      critiques: [],
      latestFileName: initialName,
      chatHistory: [],
      songXmlContent: pendingXmlContent || undefined
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setPendingXmlContent(null);
    return newSession;
  };

  const handleOpenRevisionPrompt = () => {
    setIsRevisionPromptOpen(true);
    setRevisionPromptText("");
  };

  const handleStemUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve((reader.result as string).split(',')[1]);
      };
      reader.readAsDataURL(new Blob([arrayBuffer]));
    });

    if (side === 'A') {
      setStemAContent({ file, base64: base64Audio });
    } else {
      setStemBContent({ file, base64: base64Audio });
    }
  };

  const processBothStems = async () => {
    if (!stemAContent || !stemBContent) return;
    try {
      setIsQuotaError(false);
      setStatus(AnalysisStatus.COMPARING);

      const result = await compareStems(
        stemAContent.base64, stemAContent.file.type, stemAContent.file.name,
        stemBContent.base64, stemBContent.file.type, stemBContent.file.name
      );

      const stemAName = stemAContent.file.name;
      const stemBName = stemBContent.file.name;

      const newSession: Session = {
        id: generateId(),
        name: `Stems: ${stemAName} vs ${stemBName}`,
        createdAt: Date.now(),
        lastModified: Date.now(),
        sessionType: 'stem_comparison',
        critiques: [], // Not used for stems
        latestFileName: null,
        stemComparison: {
          stemAName,
          stemBName,
          result
        }
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setStatus(AnalysisStatus.SUCCESS);
      setStemAContent(null);
      setStemBContent(null);
    } catch (err: any) {
      console.error("Stem Comparison Error:", err);
      if (err.message?.includes("Requested entity was not found.")) {
        setHasCustomKey(false);
        window.aistudio.openSelectKey().then(() => setHasCustomKey(true));
      }
      setIsQuotaError(err.message?.includes('429') || err.message?.toLowerCase().includes('quota'));
      setError(err.message || "An error occurred during comparison.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleStartRevision = () => {
    setIsRevisionPromptOpen(false);
    triggerUpload();
  };

  const processAudioFile = useCallback(async (file: File, sessionId: string, prevCritique: CritiqueResult | null, songXml?: string, focusPrompt?: string) => {
    try {
      console.log("Starting audio processing for file:", file.name);
      setIsQuotaError(false);
      const isComparing = !!prevCritique;
      setStatus(isComparing ? AnalysisStatus.COMPARING : AnalysisStatus.UPLOADING);
      
      setCurrentAudioBlob(file);

      // Get arrayBuffer once for both base64 and decoding
      const arrayBuffer = await file.arrayBuffer();
      console.log("ArrayBuffer loaded, size:", arrayBuffer.byteLength);

      // Convert to base64 more efficiently
      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(new Blob([arrayBuffer]));
      });
      console.log("Base64 conversion complete");

      // Decode for spectrogram
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0)); // slice to avoid detaching if needed
        setAudioBuffer(decodedBuffer);
        console.log("Audio decoding complete");
      } catch (decodeErr) {
        console.warn("Failed to decode audio for spectrogram, continuing with analysis:", decodeErr);
      }

      setStatus(isComparing ? AnalysisStatus.COMPARING : AnalysisStatus.ANALYZING_AI);
      console.log("Calling Gemini API...");
      
      const result = await analyzeAudio(base64Audio, file.type, prevCritique || undefined, songXml, focusPrompt);
      console.log("Gemini analysis complete");
      
      setCurrentAudioBase64(base64Audio);
      
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            lastModified: Date.now(),
            latestFileName: file.name,
            critiques: [...s.critiques, result],
            songXmlContent: songXml || s.songXmlContent
          };
        }
        return s;
      }));

      setStatus(AnalysisStatus.SUCCESS);
    } catch (err: any) {
      console.error("ProcessAudioFile Error:", err);
      if (err.message?.includes("Requested entity was not found.")) {
        setHasCustomKey(false);
        window.aistudio.openSelectKey().then(() => setHasCustomKey(true));
      }
      const isQuota = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
      setIsQuotaError(isQuota);
      setError(err.message || "An error occurred during analysis.");
      setStatus(AnalysisStatus.ERROR);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (status === AnalysisStatus.UPLOADING || status === AnalysisStatus.ANALYZING_AI) return;
    
    const file = e.target.files?.[0];
    if (file) {
      let targetId = currentSessionId;
      let prevCritique = latestCritique;
      let existingXml = currentSession?.songXmlContent || pendingXmlContent || undefined;
      let currentFocusPrompt = revisionPromptText;

      if (!targetId) {
        const newSess = createNewSession(file.name);
        targetId = newSess.id;
        prevCritique = null;
        currentFocusPrompt = "";
      }
      processAudioFile(file, targetId, prevCritique, existingXml, currentFocusPrompt);
      setRevisionPromptText(""); // Clear after using
      e.target.value = '';
    }
  };

  const handleXmlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      if (currentSessionId) {
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return { ...s, songXmlContent: text, lastModified: Date.now() };
          }
          return s;
        }));
      } else {
        setPendingXmlContent(text);
      }
      e.target.value = '';
    }
  };

  const triggerUpload = () => globalFileInputRef.current?.click();
  const triggerXmlUpload = () => songXmlInputRef.current?.click();

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); e.preventDefault();
    if (window.confirm("Delete this mix project? This cannot be undone.")) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setStatus(AnalysisStatus.IDLE);
        setAudioBuffer(null);
        setCurrentAudioBlob(null);
      }
    }
  };

  const renameSession = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation(); e.preventDefault();
    const newName = window.prompt("Rename Mix Project:", name);
    if (newName && newName.trim()) {
      setSessions(prev => prev.map(s => {
        if (s.id === id) {
          return { ...s, name: newName.trim(), lastModified: Date.now() };
        }
        return s;
      }));
    }
  };

  const exportSession = (e: React.MouseEvent, s: Session) => {
    e.stopPropagation(); e.preventDefault();
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(s, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const safeName = s.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadAnchor.setAttribute("download", `sonic-critique-${safeName}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.removeChild(downloadAnchor);
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export critique project file.");
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.id || !parsed.name || !Array.isArray(parsed.critiques)) {
        throw new Error("Invalid critique file format. Must be a valid SonicCritique AI project JSON.");
      }

      const exists = sessions.some(s => s.id === parsed.id);
      let sessionToLoad = { ...parsed };
      
      if (exists) {
        if (window.confirm("A project with this ID is already loaded. Would you like to import it as a new copy?")) {
          sessionToLoad.id = generateId();
          sessionToLoad.name = `${parsed.name} (Copy)`;
        } else {
          // Overwrite existing in the list
          setSessions(prev => prev.map(s => s.id === parsed.id ? sessionToLoad : s));
          setCurrentSessionId(parsed.id);
          setStatus((sessionToLoad.critiques && sessionToLoad.critiques.length > 0) || sessionToLoad.stemComparison ? AnalysisStatus.SUCCESS : AnalysisStatus.IDLE);
          e.target.value = '';
          return;
        }
      }

      setSessions(prev => [sessionToLoad, ...prev]);
      setCurrentSessionId(sessionToLoad.id);
      setStatus((sessionToLoad.critiques && sessionToLoad.critiques.length > 0) || sessionToLoad.stemComparison ? AnalysisStatus.SUCCESS : AnalysisStatus.IDLE);
    } catch (err: any) {
      console.error("Import failed", err);
      alert(`Failed to load critique file: ${err.message || "Invalid JSON format."}`);
    } finally {
      e.target.value = '';
    }
  };

  const triggerImportClick = () => importFileInputRef.current?.click();

  const handleVstUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        setVstLibrary(text);
        setVstLibraryPreview(text);
        setIsVstHelpOpen(false);
        alert("VST Library updated successfully!");
      } catch (err) {
        console.error("VST Import Failed", err);
        alert("Failed to read VST library text file.");
      }
      e.target.value = '';
    }
  };

  const startNewProject = () => {
    setCurrentSessionId(null);
    setStatus(AnalysisStatus.IDLE);
    setAudioBuffer(null);
    setCurrentAudioBlob(null);
  };

  const handlePredict = useCallback(async () => {
    if (!currentSessionId || !latestCritique) return;
    
    try {
      setStatus(AnalysisStatus.PREDICTING);
      setError(null);

      let base64Audio = currentAudioBase64;
      let mimeType = currentAudioBlob?.type || 'audio/mpeg';

      if (!base64Audio) {
        if (!currentAudioBlob) {
          throw new Error("Audio file not found in memory. Please re-upload the audio track to enable session prediction.");
        }
        
        // Fallback to reading the blob if base64 is missing
        const arrayBuffer = await currentAudioBlob.arrayBuffer();
        base64Audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => reject(new Error("Failed to read audio file. It may have been moved or deleted."));
          reader.readAsDataURL(new Blob([arrayBuffer]));
        });
        setCurrentAudioBase64(base64Audio);
      }

      const prediction = await predictSessionConfiguration(base64Audio, mimeType, latestCritique);
      
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, prediction, lastModified: Date.now() };
        }
        return s;
      }));
      
      setStatus(AnalysisStatus.SUCCESS);
    } catch (err: any) {
      console.error("Prediction Error:", err);
      setError(err.message || "Failed to generate session prediction.");
      setStatus(AnalysisStatus.SUCCESS); // Revert to success to show the critique again
    }
  }, [currentSessionId, currentAudioBlob, currentAudioBase64, latestCritique]);

  return (
    <div className={`min-h-screen ${hasCustomKey ? 'bg-emerald-950' : 'bg-slate-950'} text-slate-50 flex relative transition-colors duration-700`}>
      <aside className={`bg-slate-900/80 backdrop-blur-xl border-r border-slate-800 transition-all duration-300 flex flex-col z-40 ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between whitespace-nowrap">
          <h2 className="font-bold text-slate-400 text-xs tracking-widest uppercase">Mix Projects</h2>
          <div className="flex items-center space-x-1">
            <button type="button" onClick={triggerImportClick} className="p-2 hover:bg-slate-800 rounded-lg text-emerald-400 transition-colors animate-pulse" title="Load Project from File">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <button type="button" onClick={startNewProject} className="p-2 hover:bg-slate-800 rounded-lg text-indigo-400 transition-colors" title="New Project">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          {sessions.map(s => (
            <div 
              key={s.id}
              onClick={() => {
                setCurrentSessionId(s.id);
                setStatus((s.critiques && s.critiques.length > 0) || s.stemComparison ? AnalysisStatus.SUCCESS : AnalysisStatus.IDLE);
                setAudioBuffer(null);
              }}
              className={`px-6 py-4 cursor-pointer border-l-4 transition-all hover:bg-slate-800/50 group flex items-center justify-between ${currentSessionId === s.id ? 'bg-indigo-600/10 border-indigo-500' : 'border-transparent'}`}
            >
              <div className="flex-1 truncate mr-2">
                <div className="font-bold text-sm truncate">{s.name}</div>
                <div className="text-[10px] text-slate-500 flex items-center mt-1">
                  <span>{new Date(s.lastModified).toLocaleDateString()}</span>
                  <span className="mx-2">•</span>
                  <span>{s.critiques?.length || 0} revs</span>
                </div>
              </div>
              <div className="flex items-center space-x-1 whitespace-nowrap">
                <button 
                  type="button"
                  onClick={(e) => renameSession(e, s.id, s.name)}
                  className="opacity-0 group-hover:opacity-40 hover:!opacity-100 p-1 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                  title="Rename Project"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button 
                  type="button"
                  onClick={(e) => exportSession(e, s)}
                  className="opacity-0 group-hover:opacity-40 hover:!opacity-100 p-1 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"
                  title="Save/Export Project File"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button 
                  type="button"
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-40 hover:!opacity-100 p-1.5 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  title="Delete Project"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-3">
           <button 
            type="button"
            onClick={() => setIsVstHelpOpen(true)}
            className="w-full flex items-center justify-between px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all"
           >
              <span>VST LIBRARY CONFIG</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
           </button>
           <button 
            type="button"
            onClick={handleOpenKeySelector}
            className={`w-full flex items-center justify-between px-4 py-2 rounded-xl border text-xs font-bold transition-all ${hasCustomKey ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
           >
              <span>{hasCustomKey ? 'API KEY ACTIVE' : 'SELECT API KEY'}</span>
              <div className={`w-2 h-2 rounded-full ${hasCustomKey ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
           </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="text-lg font-bold tracking-tight">Sonic<span className="text-indigo-500">Critique</span> AI</h1>
            </div>
            <div className="flex items-center space-x-4">
              {currentSession && (
                <button 
                  type="button"
                  onClick={triggerXmlUpload}
                  className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${currentSession.songXmlContent ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{currentSession.songXmlContent ? 'SONG.XML ATTACHED' : 'ATTACH SONG.XML'}</span>
                </button>
              )}
              {latestCritique && (
                <button 
                  type="button"
                  onClick={() => setIsChatOpen(prev => !prev)}
                  className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${isChatOpen ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /></svg>
                  <span>CHAT WITH ENGINEER</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full">
          {status === AnalysisStatus.IDLE && (
            <div className="max-w-4xl mx-auto text-center space-y-12 py-12">

              {/* Mode Switcher */}
              <div className="flex justify-center space-x-4 mb-8">
                <button 
                  onClick={() => setAppMode('full_mix')}
                  className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${appMode === 'full_mix' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  Full Mix Critique
                </button>
                <button 
                  onClick={() => setAppMode('stem_compare')}
                  className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${appMode === 'stem_compare' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  Stem Comparison
                </button>
              </div>

              {appMode === 'full_mix' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div 
                    onClick={triggerXmlUpload} 
                    className={`group cursor-pointer p-10 rounded-3xl border-2 border-dashed transition-all duration-300 ${pendingXmlContent ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 hover:border-indigo-500/50'}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${pendingXmlContent ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold mb-1">{pendingXmlContent ? 'XML Loaded' : 'Attach song.xml'}</h3>
                      <p className="text-slate-500 text-sm">Optional: Provide project context first</p>
                    </div>
                  </div>

                  <div onClick={triggerUpload} className="group cursor-pointer p-10 rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 hover:border-indigo-500/50 transition-all duration-300">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors text-indigo-400 group-hover:text-white">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      </div>
                      <h3 className="text-lg font-bold mb-1">Upload Audio</h3>
                      <p className="text-slate-500 text-sm">Analyze and generate session</p>
                    </div>
                  </div>

                  <div onClick={triggerImportClick} className="group cursor-pointer p-10 rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/30 hover:bg-slate-900/50 hover:border-emerald-500/50 transition-all duration-300">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-600 transition-colors text-emerald-400 group-hover:text-white">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold mb-1">Load Critique</h3>
                      <p className="text-slate-500 text-sm">Restore previous analysis & chat</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div onClick={() => stemAInputRef.current?.click()} className={`group cursor-pointer p-8 rounded-3xl border-2 border-dashed ${stemAContent ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50'} transition-all duration-300`}>
                      <h3 className="text-lg font-bold mb-1">Stem A</h3>
                      {stemAContent ? <p className="text-emerald-400 text-sm">{stemAContent.file.name}</p> : <p className="text-slate-500 text-sm">Upload first version</p>}
                    </div>
                    <div onClick={() => stemBInputRef.current?.click()} className={`group cursor-pointer p-8 rounded-3xl border-2 border-dashed ${stemBContent ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-800 bg-slate-900/30 hover:bg-slate-900/50'} transition-all duration-300`}>
                      <h3 className="text-lg font-bold mb-1">Stem B</h3>
                      {stemBContent ? <p className="text-emerald-400 text-sm">{stemBContent.file.name}</p> : <p className="text-slate-500 text-sm">Upload second version</p>}
                    </div>
                  </div>
                  <button 
                    onClick={processBothStems}
                    disabled={!stemAContent || !stemBContent}
                    className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-xl shadow-lg font-bold disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                  >
                    Compare Stems
                  </button>
                </div>
              )}

              <div className="pt-8">
                <p className="text-slate-500 italic text-sm">
                  {appMode === 'full_mix' ? '"The AI Engineer analyzes your mix and provides a Studio One blueprint"' : '"Deep thinking comparison for individual instrument changes"'}
                </p>
              </div>
            </div>
          )}

          {(status === AnalysisStatus.UPLOADING || status === AnalysisStatus.ANALYZING_AI || status === AnalysisStatus.COMPARING) && (
            <div className="max-w-md mx-auto text-center space-y-6 py-24">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <h3 className="text-xl font-bold text-white">
                {status === AnalysisStatus.UPLOADING && "Uploading Audio..."}
                {status === AnalysisStatus.ANALYZING_AI && "AI Engineer is Listening..."}
                {status === AnalysisStatus.COMPARING && "Comparing Mix Revisions..."}
              </h3>
            </div>
          )}

          {status === AnalysisStatus.SUCCESS && currentSession && currentSession.sessionType === 'stem_comparison' && currentSession.stemComparison?.result && (
            <StemComparisonSection 
              comparison={currentSession.stemComparison.result} 
              stemAName={currentSession.stemComparison.stemAName}
              stemBName={currentSession.stemComparison.stemBName}
            />
          )}

          {status === AnalysisStatus.SUCCESS && latestCritique && currentSession?.sessionType !== 'stem_comparison' && (
            <div id="analysis-report-container" className="space-y-12 animate-in fade-in duration-700">
              <CritiqueSection 
                critique={latestCritique} 
                fileName={currentSession?.latestFileName || 'Track'} 
                onCompare={handleOpenRevisionPrompt} 
                isComparison={currentSession!.critiques.length > 1} 
                chatHistory={currentSession?.chatHistory}
                audioBlob={currentAudioBlob || undefined}
                prediction={currentSession?.prediction}
                onPredict={handlePredict}
                isPredicting={status === AnalysisStatus.PREDICTING}
              />
              {audioBuffer && <Spectrogram audioBuffer={audioBuffer} />}
            </div>
          )}

              {status === AnalysisStatus.ERROR && (
                <div className="max-w-lg mx-auto bg-red-950/20 border border-red-500/30 p-8 rounded-3xl text-center space-y-6">
                  <h2 className="text-xl font-bold text-red-400">Analysis Failed</h2>
                  <p className="text-slate-400">{error || "Something went wrong during processing."}</p>
                  <button type="button" onClick={() => setStatus(AnalysisStatus.IDLE)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors">
                    Try Again
                  </button>
                </div>
              )}
        </main>
      </div>

      {latestCritique && chatSession && (
        <ChatInterface 
          session={chatSession}
          critique={latestCritique}
          messages={currentSession?.chatHistory || []}
          onMessagesChange={updateChatHistory}
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)} 
        />
      )}

      {/* Revision Prompt Modal */}
      {isRevisionPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsRevisionPromptOpen(false)} />
          <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-100 mb-2">Revision Focus</h3>
            <p className="text-slate-400 text-sm mb-4">What should the AI specifically check in this new version? (e.g., "Are the guitars sounding better?", "Is the vocal loud enough?")</p>
            <textarea
              value={revisionPromptText}
              onChange={(e) => setRevisionPromptText(e.target.value)}
              placeholder="Enter your focus prompt (optional)"
              className="w-full bg-slate-800 border-slate-700/50 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6 resize-none h-24"
            />
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsRevisionPromptOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleStartRevision}
                className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
              >
                SELECT AUDIO FILE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VST Help Modal */}
      {isVstHelpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsVstHelpOpen(false)} />
          <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-100 mb-2">Configure VST Library</h3>
            <p className="text-slate-400 text-sm mb-4">
              To get better mixing recommendations, you can provide the AI with a list of your installed VST plugins.
            </p>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
              <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">How to generate a list (Windows):</p>
              <p className="text-sm text-slate-300 mb-2">Open Command Prompt and run:</p>
              <code className="block bg-slate-900 text-emerald-400 p-3 rounded-lg text-xs font-mono mb-4 break-all selection:bg-emerald-900">
                dir /o /b "C:\Program Files\Common Files\VST3" &gt; %userprofile%\desktop\vsts.txt
              </code>
              <p className="text-xs text-slate-500">This will create a <span className="text-slate-300">vsts.txt</span> file on your Desktop. Upload it here.</p>
            </div>
            
            <div className="mb-6">
              <p className="text-xs text-slate-400 mb-2 font-bold uppercase tracking-wider flex items-center justify-between">
                <span>Currently Loaded Plugins</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Saved in Browser</span>
              </p>
              <textarea 
                readOnly 
                value={vstLibraryPreview} 
                className="w-full h-32 bg-slate-950 text-slate-300 text-xs p-3 rounded-xl border border-slate-800 outline-none resize-none focus:border-slate-700"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsVstHelpOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                CLOSE
              </button>
              <button
                type="button"
                onClick={() => vstInputRef.current?.click()}
                className="px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
              >
                UPLOAD VSTS.TXT
              </button>
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={globalFileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*" />
      <input type="file" ref={songXmlInputRef} onChange={handleXmlChange} className="hidden" accept=".xml" />
      <input type="file" ref={stemAInputRef} onChange={(e) => handleStemUpload(e, 'A')} className="hidden" accept="audio/*" />
      <input type="file" ref={stemBInputRef} onChange={(e) => handleStemUpload(e, 'B')} className="hidden" accept="audio/*" />
      <input type="file" ref={importFileInputRef} onChange={handleImportFile} className="hidden" accept=".json" />
      <input type="file" ref={vstInputRef} onChange={handleVstUpload} className="hidden" accept=".txt" />
    </div>
  );
};

export default App;
