import React, { useState } from 'react';
import { CritiqueResult, TimestampedFeedback, LibraryPluginSuggestion, ChatMessage, SessionTrack, PluginInsert, SessionPrediction } from '../types';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { createStudioOneSession } from '../services/studioOneService';

interface CritiqueSectionProps {
  critique: CritiqueResult;
  fileName: string | null;
  onCompare: () => void;
  isComparison: boolean;
  chatHistory?: ChatMessage[];
  audioBlob?: Blob; 
  prediction?: SessionPrediction;
  onPredict?: () => void;
  isPredicting?: boolean;
}

const FeedbackCard: React.FC<{ item: TimestampedFeedback }> = ({ item }) => (
  <div className="bg-slate-800/40 p-5 rounded-xl border-l-4 border-indigo-500 hover:bg-slate-800/60 transition-all">
    <div className="flex items-start justify-between mb-2">
      <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded">
        {item.time}
      </span>
      <div className="flex items-center space-x-2">
        <span className="text-xs text-slate-400 italic">Studio One Expert Tip</span>
      </div>
    </div>
    <h4 className="font-semibold text-slate-100 mb-1">{item.issue}</h4>
    <p className="text-slate-300 text-sm mb-4 leading-relaxed">{item.suggestion}</p>
    <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-900/50 text-indigo-200 text-xs">
      <strong>Pro Tip:</strong> {item.studioOneTip}
    </div>
  </div>
);

const ExpandableInsert: React.FC<{ plugin: PluginInsert }> = ({ plugin }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col space-y-1">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-3 text-xs text-slate-300 bg-slate-800/60 px-3 py-2.5 rounded-xl border border-slate-700/50 hover:bg-slate-700/80 transition-all cursor-pointer group"
      >
        <div className="flex flex-col space-y-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
          <div className="flex space-x-0.5">
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
          </div>
          <div className="flex space-x-0.5">
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
          </div>
          <div className="flex space-x-0.5">
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
             <div className="w-0.5 h-0.5 rounded-full bg-slate-400" />
          </div>
        </div>
        <span className="flex-1 font-medium truncate">{plugin.name}</span>
        <svg 
          className={`w-3 h-3 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {isExpanded && (
        <div className="mx-2 p-3 bg-indigo-950/20 rounded-b-xl border-x border-b border-indigo-500/20 animate-in slide-in-from-top-2 duration-200">
           <div className="text-[9px] uppercase font-bold text-indigo-400/70 mb-2 tracking-widest">Suggested Settings</div>
           <div className="grid grid-cols-1 gap-1.5">
              {plugin.settings.map((setting, sIdx) => (
                <div key={sIdx} className="flex items-center space-x-2 text-[11px] text-slate-300">
                   <div className="w-1 h-1 rounded-full bg-indigo-500/50" />
                   <span>{setting}</span>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

const TrackBlueprintCard: React.FC<{ track: SessionTrack }> = ({ track }) => (
  <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 flex flex-col space-y-5 shadow-lg hover:border-indigo-500/30 transition-all">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{track.type} Track</span>
      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]" />
    </div>
    <h4 className="font-bold text-white text-lg tracking-tight">{track.name}</h4>
    <div className="space-y-3">
      <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Inserts</div>
      <div className="space-y-2">
        {track.inserts.map((plugin, i) => (
          <ExpandableInsert key={i} plugin={plugin} />
        ))}
      </div>
    </div>
  </div>
);

const CritiqueSection: React.FC<CritiqueSectionProps> = ({ 
  critique, 
  fileName, 
  onCompare, 
  isComparison, 
  chatHistory, 
  audioBlob,
  prediction,
  onPredict,
  isPredicting
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingSession, setIsGeneratingSession] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleDownloadSession = async () => {
    if (!audioBlob || !fileName) return;
    setIsGeneratingSession(true);
    try {
      const songBlob = await createStudioOneSession(
        fileName.replace(/\.[^/.]+$/, ""), 
        critique.sessionBlueprint, 
        audioBlob,
        fileName
      );
      
      const url = URL.createObjectURL(songBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName.replace(/\.[^/.]+$/, "")}.song`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Session generation failed:", err);
      alert("Failed to create Studio One project. Please try again.");
    } finally {
      setIsGeneratingSession(false);
    }
  };

  const handleExportPdf = async () => {
    const reportElement = document.getElementById('analysis-report-container');
    if (!reportElement) return;

    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        backgroundColor: '#0f172a',
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`${fileName?.replace(/\.[^/.]+$/, "") || 'track'}-analysis.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* SCORE HERO SECTION */}
      <section className="relative overflow-hidden bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="absolute top-0 right-0 p-6 flex flex-wrap justify-end gap-3 print:hidden">
            <button 
              type="button"
              onClick={onCompare}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold rounded-lg transition-all border border-slate-700 shadow-lg active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>UPLOAD REVISION</span>
            </button>

            <button 
              type="button"
              onClick={handleDownloadSession}
              disabled={isGeneratingSession || !audioBlob}
              className={`flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold rounded-lg transition-all shadow-xl active:scale-95 disabled:opacity-50`}
            >
              <svg className={`w-4 h-4 ${isGeneratingSession ? 'animate-spin' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
              </svg>
              <span>{isGeneratingSession ? 'BUILDING...' : 'STUDIO ONE .SONG'}</span>
            </button>

            {!prediction && onPredict && (
              <button 
                type="button"
                onClick={onPredict}
                disabled={isPredicting || !audioBlob}
                title={!audioBlob ? "Please re-upload audio to enable session prediction" : "Predict current session configuration"}
                className={`flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all shadow-xl active:scale-95 disabled:opacity-50`}
              >
                <svg className={`w-4 h-4 ${isPredicting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>{isPredicting ? 'PREDICTING...' : 'PREDICT SESSION'}</span>
              </button>
            )}

            <button type="button" onClick={handleExportPdf} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all" title="Export PDF Report">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </button>
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mt-12 md:mt-0">
          <div className="relative group">
            <div className={`text-8xl md:text-9xl font-black tracking-tighter ${getScoreColor(critique.overallScore)}`}>
              {critique.overallScore}
            </div>
          </div>

          <div className="flex-1 space-y-4 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-white pr-0 md:pr-40 leading-tight">
              {isComparison ? "Version Comparison Report" : "Production Grade Summary"}
            </h2>
            <p className="text-slate-300 text-lg italic leading-relaxed">"{critique.summary}"</p>
          </div>
        </div>
      </section>

      {/* SESSION BLUEPRINT */}
      <section className="animate-in fade-in duration-1000">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-3xl font-bold flex items-center">
            <span className="bg-indigo-500 w-2.5 h-10 rounded-full mr-4" />
            Studio One Session Blueprint
          </h3>
          <div className="text-[11px] font-bold text-slate-400 bg-slate-800/80 px-4 py-1.5 rounded-full uppercase tracking-widest border border-slate-700/50">Production Map</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {critique.sessionBlueprint.tracks.map((track, idx) => (
            <TrackBlueprintCard key={idx} track={track} />
          ))}
          <div className="bg-emerald-950/10 p-6 rounded-3xl border border-emerald-500/30 flex flex-col space-y-5 shadow-lg">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Master Bus</span>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
             </div>
             <h4 className="font-bold text-white text-lg tracking-tight">Main Out</h4>
             <div className="space-y-3">
                <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Final Chain</div>
                <div className="space-y-2">
                  {critique.sessionBlueprint.masterBus.inserts.map((plugin, i) => (
                    <ExpandableInsert key={i} plugin={plugin} />
                  ))}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* SESSION PREDICTION */}
      {prediction && (
        <section className="animate-in slide-in-from-bottom-8 duration-1000">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-3xl font-bold flex items-center">
              <span className="bg-emerald-500 w-2.5 h-10 rounded-full mr-4" />
              AI Session Prediction
            </h3>
            <div className="flex items-center space-x-3">
              <div className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 px-4 py-1.5 rounded-full uppercase tracking-widest border border-emerald-500/30">
                Confidence: {Math.round(prediction.confidence * 100)}%
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 mb-8">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">AI Reasoning</h4>
            <p className="text-slate-300 italic leading-relaxed">"{prediction.reasoning}"</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {prediction.predictedTracks.map((track, idx) => (
              <TrackBlueprintCard key={idx} track={track} />
            ))}
            <div className="bg-emerald-950/10 p-6 rounded-3xl border border-emerald-500/30 flex flex-col space-y-5 shadow-lg">
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Predicted Master Bus</span>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
               </div>
               <h4 className="font-bold text-white text-lg tracking-tight">Main Out</h4>
               <div className="space-y-3">
                  <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Predicted Chain</div>
                  <div className="space-y-2">
                    {prediction.masterBus.inserts.map((plugin, i) => (
                      <ExpandableInsert key={i} plugin={plugin} />
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </section>
      )}

      {/* METRICS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 text-center">
           <div className="text-xs text-slate-500 mb-1 uppercase tracking-tighter font-bold">Tonal Balance</div>
           <div className="text-lg font-medium text-slate-100">{critique.tonalBalance}</div>
        </div>
        <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 text-center">
           <div className="text-xs text-slate-500 mb-1 uppercase tracking-tighter font-bold">Dynamics</div>
           <div className="text-lg font-medium text-slate-100">{critique.dynamics}</div>
        </div>
        <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 text-center">
           <div className="text-xs text-slate-500 mb-1 uppercase tracking-tighter font-bold">Stereo Image</div>
           <div className="text-lg font-medium text-slate-100">{critique.stereoImage}</div>
        </div>
      </section>

      {/* TIMELINE FEEDBACK */}
      <section>
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <span className="bg-indigo-500 w-2 h-8 rounded-full mr-3" />
          Timeline Critique
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {critique.timestampedFeedback.map((item, idx) => (
            <FeedbackCard key={idx} item={item} />
          ))}
        </div>
      </section>

      {/* CHAT LOG FOR REPORT */}
      {chatHistory && chatHistory.length > 0 && (
        <section className="border-t border-slate-800 pt-12">
          <h3 className="text-2xl font-bold mb-6 flex items-center">
            <span className="bg-indigo-400 w-2 h-8 rounded-full mr-3" />
            Consultation Chat History
          </h3>
          <div className="space-y-4 bg-slate-900/30 p-6 rounded-3xl border border-slate-800">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-100' : 'bg-slate-800/50 text-slate-300 border border-slate-700'}`}>
                  <div className="text-[10px] uppercase font-bold mb-1 opacity-50">{msg.role === 'user' ? 'Producer' : 'AI Engineer'}</div>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default CritiqueSection;