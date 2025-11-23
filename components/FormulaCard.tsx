
import React, { useState } from 'react';
import { MatchResult } from '../types';
import HerbTooltip from './HerbTooltip';

interface FormulaCardProps {
  result: MatchResult;
  rank: number;
  onAnalyze: (result: MatchResult) => void;
  isAnalyzing: boolean;
  onToggleSave: () => void;
  isSaved: boolean;
}

const VisualComparison: React.FC<{ result: MatchResult }> = ({ result }) => {
    const { formula, inputHerbs } = result;
    const inputNames = new Set(inputHerbs.map(h => h.name));
    const formulaNames = new Set(formula.composition);

    return (
        <div className="mt-6 relative group">
            {/* Background Layer (Clipped) */}
            <div className="absolute inset-0 bg-slate-50/30 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner overflow-hidden pointer-events-none">
                 {/* Decoration Blob */}
                 <div className="absolute top-0 right-0 w-32 h-32 bg-teal-100/40 rounded-full blur-3xl -mr-10 -mt-10"></div>
            </div>

            {/* Content Layer (Overflow Visible for Tooltips) */}
            <div className="relative z-10 p-5">
                {/* Standard Formula Row */}
                <div className="mb-6">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider flex flex-wrap items-center gap-y-2">
                        <span className="bg-white/60 px-2 py-0.5 rounded-md text-slate-500 shadow-sm border border-white/50 backdrop-blur-sm whitespace-nowrap">标准方组成</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <div className="flex items-center whitespace-nowrap">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
                            <span className="ml-1.5 text-[10px] text-slate-400 font-medium mr-3">重合药物</span>
                        </div>
                        <div className="flex items-center whitespace-nowrap">
                            <span className="w-2 h-2 bg-rose-400 rounded-full opacity-60"></span>
                            <span className="ml-1.5 text-[10px] text-slate-400 font-medium">缺味/去除</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        {formula.composition.map((herb, idx) => {
                            const isMatch = inputNames.has(herb);
                            return (
                                <HerbTooltip key={`std-${idx}`} herbName={herb}>
                                    <span 
                                        className={`cursor-help px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 inline-flex items-center shadow-sm border ${
                                            isMatch 
                                            ? 'bg-gradient-to-b from-emerald-50/80 to-emerald-100/40 text-emerald-700 border-emerald-200/60 hover:shadow-md hover:scale-105' 
                                            : 'bg-slate-50/50 text-slate-400 border-transparent decoration-rose-300 line-through opacity-70 grayscale-[20%]'
                                        }`}
                                    >
                                        {herb}
                                    </span>
                                </HerbTooltip>
                            );
                        })}
                    </div>
                </div>

                {/* Input Formula Row */}
                <div className="pt-5 border-t border-slate-200/40 border-dashed">
                    <div className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider flex flex-wrap items-center gap-y-2">
                        <span className="bg-white/60 px-2 py-0.5 rounded-md text-slate-500 shadow-sm border border-white/50 backdrop-blur-sm whitespace-nowrap">您的输入</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <div className="flex items-center whitespace-nowrap">
                            <span className="w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.6)]"></span>
                            <span className="ml-1.5 text-[10px] text-slate-400 font-medium">新增/加味</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        {inputHerbs.map((herb, idx) => {
                            const isMatch = formulaNames.has(herb.name);
                            return (
                                <HerbTooltip key={`in-${idx}`} herbName={herb.name}>
                                    <span 
                                        className={`cursor-help px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 inline-flex items-center border ${
                                            isMatch 
                                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20 hover:scale-105' 
                                            : 'bg-white/40 text-indigo-600 border-indigo-200/60 border-indigo-200/60 border-dashed hover:bg-white/80 hover:border-indigo-300 hover:shadow-sm'
                                        }`}
                                    >
                                        {herb.name}
                                        {herb.dosage > 0 && <span className="ml-1.5 text-[10px] opacity-90 font-normal bg-black/10 px-1.5 rounded text-white shadow-inner">{herb.dosage}{herb.unit}</span>}
                                    </span>
                                </HerbTooltip>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const FormulaCard: React.FC<FormulaCardProps> = ({ 
    result, 
    rank, 
    onAnalyze, 
    isAnalyzing,
    onToggleSave,
    isSaved
}) => {
  const { formula, score, matchType, dosageAnalysis, isCombined, combinedWith } = result;
  const [showStandardAnalysis, setShowStandardAnalysis] = useState(false);

  // Liquid Glass Score Badge Colors
  const scorePercent = Math.round(score * 100);
  let scoreColor = 'text-emerald-600';
  let badgeClasses = 'bg-white/40 backdrop-blur-md border-white/60 shadow-sm';
  
  if (score < 0.8) {
      scoreColor = 'text-amber-500';
      badgeClasses = 'bg-white/40 backdrop-blur-md border-white/60 shadow-sm';
  }
  if (score < 0.6) {
      scoreColor = 'text-slate-400';
  }

  const isCloudSource = formula.isAiGenerated;

  return (
    <div className="relative mb-6 group transition-all duration-500 hover:scale-[1.01] hover:z-20 animate-fade-in-up" style={{ animationDelay: `${rank * 0.1}s` }}>
        
        {/* Background Layer (Clipped) */}
        <div className="glass-edge absolute inset-0 bg-white/25 backdrop-blur-2xl rounded-3xl border border-white/40 overflow-hidden group-hover:shadow-[0_12px_40px_0_rgba(31,38,135,0.08)] group-hover:bg-white/30 transition-all duration-300 pointer-events-none">
             {/* AI Source Badge - Positioned to flush left-top to avoid text overlap */}
            {isCloudSource && (
                <div className="absolute top-0 left-0 bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[10px] px-3 py-1.5 rounded-br-xl shadow-lg z-20 font-bold tracking-wider">
                    ☁️ 全网检索
                </div>
            )}
             {/* Hover Shine Effect */}
             <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-shine transition-none"></div>
        </div>

      {/* Increased top padding if Cloud Source to prevent overlap with badge */}
      <div className={`relative z-10 p-7 ${isCloudSource ? 'pt-12' : ''}`}>
        {/* Header Section */}
        <div className="flex justify-between items-start mb-4">
          {/* Left: Title & Source */}
          <div className="pr-4 flex-1">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 serif flex items-center leading-tight flex-wrap">
              <span className="text-slate-400/50 text-xl mr-3 font-sans font-light italic">#{rank}</span>
              {formula.name}
            </h3>
            <div className="flex flex-wrap items-center mt-3 gap-2">
                 <span className="text-xs text-slate-500 flex items-center bg-white/40 px-2.5 py-1 rounded-lg border border-white/50 shadow-sm backdrop-blur-sm">
                    <svg className="w-3.5 h-3.5 mr-1.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    {formula.source}
                </span>
                {isCombined && (
                    <span className="bg-indigo-50/60 text-indigo-600 px-2.5 py-1 rounded-lg text-xs border border-indigo-100/50 font-medium flex items-center shadow-sm backdrop-blur-sm">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        疑似合方：{combinedWith}
                    </span>
                )}
            </div>
          </div>
          
          {/* Right: Score Capsule (Liquid Glass Pill) */}
          <div className={`flex items-center pl-4 rounded-2xl border ${badgeClasses} p-2 transition-colors duration-300 shrink-0`}>
            {/* Score Text */}
            <div className="text-right px-2">
                <div className={`text-2xl font-black ${scoreColor} leading-none font-mono tracking-tight drop-shadow-sm`}>{scorePercent}<span className="text-xs font-sans opacity-60 font-normal ml-0.5">%</span></div>
                <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400 mt-0.5 text-center">匹配度</div>
            </div>
            
            {/* Divider */}
            <div className="w-px h-8 bg-slate-400/30 mx-2"></div>

            {/* Save Button (Star) */}
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSave();
                }}
                className={`p-1.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
                    isSaved 
                    ? 'text-yellow-400 hover:text-yellow-500 scale-110 drop-shadow-md' 
                    : 'text-slate-300 hover:text-yellow-400 hover:bg-white/50'
                }`}
                title={isSaved ? "取消收藏" : "收藏此方"}
            >
                <svg className="w-8 h-8 transition-transform active:scale-90 filter drop-shadow-sm" fill={isSaved ? "url(#star-gradient)" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                    <defs>
                        <linearGradient id="star-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#facc15" />
                            <stop offset="100%" stopColor="#eab308" />
                        </linearGradient>
                    </defs>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isSaved ? "0" : "1.5"} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                </svg>
            </button>
          </div>
        </div>

        {/* Dosage Warning */}
        {matchType === 'ratio-mismatch' && (
          <div className="mt-2 inline-flex items-center text-xs bg-orange-50/60 text-orange-700 px-3 py-1.5 rounded-lg border border-orange-100/50 backdrop-blur-sm shadow-sm max-w-full">
            <svg className="w-4 h-4 mr-2 shrink-0 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span><strong>比例警示</strong>：{dosageAnalysis?.details}</span>
          </div>
        )}

        {/* Visual Comparison Component */}
        <VisualComparison result={result} />

        {/* Action Footer */}
        <div className="mt-7 pt-5 border-t border-slate-200/40 grid grid-cols-2 gap-4">
             <button 
                onClick={() => setShowStandardAnalysis(!showStandardAnalysis)}
                className={`group flex justify-center items-center space-x-2 px-4 py-3 rounded-xl transition-all font-medium text-sm border ${
                    showStandardAnalysis 
                    ? 'bg-slate-100/40 text-slate-800 border-slate-300/40 shadow-inner' 
                    : 'bg-white/30 text-slate-600 border-white/50 hover:bg-white/60 hover:shadow-sm'
                }`}
             >
                <svg className={`w-4 h-4 transition-transform duration-300 ${showStandardAnalysis ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                <span>{showStandardAnalysis ? '收起方解' : '查看标准方解'}</span>
             </button>

             <button
                onClick={() => onAnalyze(result)}
                disabled={isAnalyzing}
                className="group relative overflow-hidden flex justify-center items-center space-x-2 bg-gradient-to-br from-teal-500/90 to-teal-600/90 hover:from-teal-400 hover:to-teal-500 text-white px-4 py-3 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed font-medium text-sm border-t border-white/20 active:scale-[0.98] backdrop-blur-sm"
             >
                {/* Shine effect handled by global css but can keep local if needed */}
                <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-shine transition-none"></div>

                {isAnalyzing ? (
                    <>
                        <svg className="animate-spin h-4 w-4 text-teal-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>AI 深度分析中...</span>
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                        <span>AI 溯源分析</span>
                    </>
                )}
             </button>
        </div>
        
        {/* Expanded Standard Analysis */}
        {showStandardAnalysis && (
            <div className="mt-5 p-6 bg-white/30 rounded-2xl border border-white/40 animate-fade-in text-sm text-slate-700 leading-relaxed shadow-inner">
                <div className="flex items-center mb-3 text-teal-700 font-bold serif text-base">
                    <span className="w-1 h-4 bg-teal-500 rounded-full mr-2 shadow-[0_0_8px_currentColor]"></span>
                    教科书方解
                </div>
                <p className="text-justify mb-5 opacity-90">{formula.analysis}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-200/40 text-xs">
                    <div className="bg-white/50 p-3 rounded-xl border border-white/50 shadow-sm backdrop-blur-sm">
                        <span className="text-slate-400 block mb-1 font-bold tracking-wide">用法</span>
                        <span className="font-medium text-slate-700">{formula.usage}</span>
                    </div>
                    <div className="bg-white/50 p-3 rounded-xl border border-white/50 shadow-sm backdrop-blur-sm">
                        <span className="text-slate-400 block mb-1 font-bold tracking-wide">功效</span>
                        <span className="font-medium text-slate-700">{formula.effect}</span>
                    </div>
                    <div className="bg-white/50 p-3 rounded-xl border border-white/50 shadow-sm backdrop-blur-sm">
                        <span className="text-slate-400 block mb-1 font-bold tracking-wide">主治</span>
                        <span className="font-medium text-slate-700">{formula.indications}</span>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default FormulaCard;
