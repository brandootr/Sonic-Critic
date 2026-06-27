import React from 'react';
import { StemComparisonResult } from '../types';

interface StemComparisonSectionProps {
  comparison: StemComparisonResult;
  stemAName: string;
  stemBName: string;
}

const StemComparisonSection: React.FC<StemComparisonSectionProps> = ({ comparison, stemAName, stemBName }) => {
  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="relative overflow-hidden bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="flex-1 space-y-4 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              Stem Comparison Report
            </h2>
            <p className="text-slate-300 text-lg italic leading-relaxed">"{comparison.comparisonSummary}"</p>
            <div className="inline-block px-4 py-2 mt-4 bg-indigo-600/20 border border-indigo-500/50 rounded-xl">
               <span className="font-bold text-indigo-400 uppercase tracking-widest text-sm">Verdict: {comparison.winner}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold font-mono text-indigo-300 truncate">{stemAName}</h3>
            <div className="text-4xl font-black text-slate-100">{comparison.stemAScore}</div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Analysis</div>
              <p className="text-sm text-slate-300 leading-relaxed">{comparison.stemAFeedback}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold font-mono text-emerald-300 truncate">{stemBName}</h3>
            <div className="text-4xl font-black text-slate-100">{comparison.stemBScore}</div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Analysis</div>
              <p className="text-sm text-slate-300 leading-relaxed">{comparison.stemBFeedback}</p>
            </div>
          </div>
        </div>
      </section>

      {comparison.improvementSuggestions.length > 0 && (
        <section className="bg-slate-900/60 p-8 rounded-3xl border border-slate-800">
          <h3 className="text-xl font-bold mb-6 flex items-center">
            <span className="bg-emerald-500 w-2 h-8 rounded-full mr-3" />
            Path to Perfection
          </h3>
          <ul className="space-y-4">
            {comparison.improvementSuggestions.map((sug, i) => (
              <li key={i} className="flex items-start space-x-3 text-slate-300">
                <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="leading-relaxed">{sug}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default StemComparisonSection;
