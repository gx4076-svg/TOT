import React, { useState, useEffect } from 'react';
import { parseFormulaInput, findMatches, compareFormulaWithInput, formatHerbsToLines } from './utils';
import { Herb, MatchResult, StandardFormula } from './types';
import { HERB_INFO, CLASSIC_FORMULAS } from './constants';
import { generateTCMAnalysis, identifyFormula } from './services/geminiService';
import FormulaCard from './components/FormulaCard';
import CosmicLoader from './components/CosmicLoader';
import AdminPanel from './components/AdminPanel';
import ReactMarkdown from 'react-markdown';

// Simple type for saved items
interface SavedItem {
    id: string;
    name: string;
    herbs: string[];
    type: 'user' | 'standard';
    date: string;
}

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [parsedHerbs, setParsedHerbs] = useState<Herb[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingFormulaName, setAnalyzingFormulaName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Favorites State
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // --- Admin / Dynamic Data State ---
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  // Initialize with static data, but allow adding new ones via Admin Panel
  const [dynamicFormulas, setDynamicFormulas] = useState<StandardFormula[]>(CLASSIC_FORMULAS);
  const [dynamicHerbInfo, setDynamicHerbInfo] = useState<Record<string, { effect: string; paozhi: string }>>(HERB_INFO);

  // --- UI State for Low Confidence Results ---
  const [showLowConfidence, setShowLowConfidence] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Simulate progress when searching
  useEffect(() => {
      let interval: any;
      if (isSearchingCloud) {
          setProgress(5); // Start
          interval = setInterval(() => {
              setProgress(prev => {
                  if (prev >= 90) return prev; // Hold at 90
                  // Random increments
                  const increment = Math.random() * 15;
                  return Math.min(prev + increment, 90);
              });
          }, 300);
      } else {
          if (progress > 0) {
              setProgress(100); // Finish
              setTimeout(() => setProgress(0), 500); // Reset
          }
      }
      return () => clearInterval(interval);
  }, [isSearchingCloud]);

  const handleSearch = async () => {
    if (!input.trim()) return;
    
    // 1. Parse
    const herbs = parseFormulaInput(input);
    setParsedHerbs(herbs);
    setAiAnalysis(null);
    setMatches([]); // Clear previous
    setShowLowConfidence(false); // Reset visibility toggle

    // 2. Local Match (Instant) - PASS DYNAMIC DB
    const localResults = findMatches(herbs, dynamicFormulas);
    setMatches(localResults);

    // 3. Hybrid Search Logic
    const hasPerfectMatch = localResults.some(r => r.matchType === 'exact' && r.score === 1);
    
    if (!hasPerfectMatch) {
        setIsSearchingCloud(true);
        try {
            const aiFormula = await identifyFormula(herbs);
            
            if (aiFormula) {
                const aiMatchResult = compareFormulaWithInput(herbs, aiFormula);
                if (aiMatchResult) {
                    setMatches(prev => {
                        const exists = prev.some(p => p.formula.name === aiFormula.name);
                        if (exists) return prev;
                        const newMatches = [...prev, aiMatchResult];
                        return newMatches.sort((a, b) => b.score - a.score);
                    });
                }
            }
        } catch (e) {
            console.error("Cloud search failed", e);
        } finally {
            setIsSearchingCloud(false);
        }
    }
  };

  const handleAIAnalyze = async (matchResult: MatchResult) => {
    setIsAnalyzing(true);
    setAnalyzingFormulaName(matchResult.formula.name);
    setAiAnalysis(null);
    
    setTimeout(() => {
        document.getElementById('ai-analysis-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    const analysisText = await generateTCMAnalysis(parsedHerbs, matchResult);
    setAiAnalysis(analysisText);
    setIsAnalyzing(false);
  };

  // --- Collection Logic ---

  const saveUserFormula = () => {
      if (parsedHerbs.length === 0) return;
      const newItem: SavedItem = {
          id: `user-${Date.now()}`,
          name: '自拟方 / 输入方',
          herbs: parsedHerbs.map(h => h.name),
          type: 'user',
          date: new Date().toLocaleDateString()
      };
      setSavedItems(prev => [newItem, ...prev]);
      setIsDrawerOpen(true);
  };

  const toggleSaveStandardFormula = (formula: StandardFormula) => {
      const isAlreadySaved = savedItems.some(i => i.name === formula.name && i.type === 'standard');
      
      if (isAlreadySaved) {
          // Remove
          setSavedItems(prev => prev.filter(i => !(i.name === formula.name && i.type === 'standard')));
      } else {
          // Add
          const newItem: SavedItem = {
              id: `std-${formula.name}-${Date.now()}`,
              name: formula.name,
              herbs: formula.composition,
              type: 'standard',
              date: new Date().toLocaleDateString()
          };
          setSavedItems(prev => [newItem, ...prev]);
          setIsDrawerOpen(true); // Feedback
      }
  };

  const deleteSavedItem = (id: string) => {
      setSavedItems(prev => prev.filter(i => i.id !== id));
  };

  // --- Admin Logic ---
  const handleAddFormula = (newFormula: StandardFormula) => {
      setDynamicFormulas(prev => [newFormula, ...prev]);
  };

  const handleUpdateFormula = (updated: StandardFormula) => {
      setDynamicFormulas(prev => {
          const idx = prev.findIndex(f => f.id === updated.id);
          if (idx >= 0) {
              const newArr = [...prev];
              newArr[idx] = updated;
              return newArr;
          }
          return [updated, ...prev];
      });
  };

  const handleAddHerbInfo = (name: string, data: { effect: string; paozhi: string }) => {
      setDynamicHerbInfo(prev => ({ ...prev, [name]: data }));
  };

  const handleUpdateHerbInfo = (name: string, data: { effect: string; paozhi: string }) => {
      setDynamicHerbInfo(prev => ({ ...prev, [name]: data }));
  };

  // --- Filter Logic ---
  const highConfidenceMatches = matches.filter(m => m.score >= 0.5);
  const lowConfidenceMatches = matches.filter(m => m.score < 0.5);

  return (
    <div className="min-h-screen pb-20 relative text-slate-800">
      
      {/* Liquid Glass Header */}
      <header className="sticky top-4 z-30 px-4 animate-fade-in-up">
        <div className="max-w-3xl mx-auto bg-white/30 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] rounded-2xl py-4 px-6 flex justify-between items-center transition-all duration-300">
          <div className="flex items-center">
            {/* HIDDEN ADMIN TRIGGER: Double Click the Emoji */}
            <span 
                className="text-2xl mr-2 cursor-default select-none transition-transform active:scale-95" 
                onDoubleClick={() => setIsAdminOpen(true)}
                title=""
            >
                🌿
            </span>
            <h1 className="text-2xl font-bold serif tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-teal-700 to-blue-600">
              中医方剂溯源
            </h1>
          </div>
          <button 
            onClick={() => setIsDrawerOpen(true)}
            className="group flex items-center space-x-2 bg-white/40 hover:bg-white/60 border border-white/40 px-4 py-2 rounded-full transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5 text-yellow-500 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"></path></svg>
            <span className="text-sm font-medium text-slate-600">收藏夹 ({savedItems.length})</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 mt-8">
        {/* Input Card - Liquid Glass Style */}
        <div className="bg-white/30 backdrop-blur-xl rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] border border-white/50 p-6 mb-10 transition-all hover:shadow-[0_12px_48px_0_rgba(31,38,135,0.1)] relative overflow-hidden group">
            
            {/* Decorative Gradients */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-100/30 to-blue-100/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="relative z-10">
                <label className="block text-slate-600 font-bold mb-3 tracking-wide text-sm uppercase">输入您的方剂组成</label>
                <div className="relative">
                    <textarea
                        className="w-full h-32 p-5 rounded-2xl border border-white/60 bg-white/40 backdrop-blur-sm focus:ring-4 focus:ring-teal-100/50 focus:border-teal-300/50 outline-none transition-all resize-none shadow-inner text-lg text-slate-700 placeholder-slate-400 font-medium"
                        placeholder=""
                        value={input}
                        onChange={handleInputChange}
                    />
                    {input && (
                        <button 
                            onClick={() => setInput('')}
                            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 bg-white/50 rounded-full p-1 hover:bg-white/80 transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    )}
                </div>

                <div className="mt-5 flex justify-between items-center">
                    <div className="text-xs text-slate-400 font-medium px-2">
                        已识别: <span className="text-teal-600 font-bold">{parsedHerbs.length}</span> 味药
                    </div>
                    <div className="flex space-x-3">
                         {parsedHerbs.length > 0 && (
                             <button
                                onClick={saveUserFormula}
                                className="px-4 py-2.5 rounded-xl text-slate-500 font-bold text-sm hover:bg-white/50 transition border border-transparent hover:border-white/40"
                             >
                                 保存自拟方
                             </button>
                         )}
                        <button
                            onClick={handleSearch}
                            disabled={!input.trim() || isSearchingCloud}
                            className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-teal-500/30 hover:shadow-teal-500/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
                        >
                            {isSearchingCloud ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    全网检索中...
                                </span>
                            ) : (
                                "智能溯源"
                            )}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Progress Bar for Cloud Search */}
            {isSearchingCloud && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-100/30">
                    <div 
                        className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            )}
        </div>

        {/* AI Analysis Section */}
        {aiAnalysis && (
            <div id="ai-analysis-section" className="mb-10 animate-fade-in-up">
                <div className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 p-1 shadow-lg">
                    <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 rounded-[22px] p-6 md:p-8">
                         <div className="flex items-center mb-6 pb-4 border-b border-indigo-100/50">
                            <div className="bg-indigo-100 p-2 rounded-lg mr-4 text-2xl">🤖</div>
                            <div>
                                <h3 className="text-xl font-bold text-indigo-900">AI 深度辨证分析</h3>
                                <p className="text-xs text-indigo-400 font-medium mt-1">针对 {analyzingFormulaName} 的个性化解读</p>
                            </div>
                         </div>
                         <div className="prose prose-sm md:prose-base prose-indigo max-w-none text-slate-700 leading-relaxed bg-white/40 p-5 rounded-2xl border border-white/50 shadow-inner">
                            <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                         </div>
                    </div>
                </div>
            </div>
        )}

        {/* Loading State */}
        {isSearchingCloud && matches.length === 0 && (
             <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                 <CosmicLoader />
                 <p className="mt-8 text-slate-500 font-medium tracking-wide animate-pulse">正在解析古籍与全网数据...</p>
             </div>
        )}

        {/* Results List */}
        <div className="space-y-6">
            {/* High Confidence Matches */}
            {highConfidenceMatches.map((result, index) => (
                <FormulaCard 
                    key={`${result.formula.id}-${index}`} 
                    result={result} 
                    rank={index + 1}
                    onAnalyze={handleAIAnalyze}
                    isAnalyzing={isAnalyzing && analyzingFormulaName === result.formula.name}
                    onToggleSave={() => toggleSaveStandardFormula(result.formula)}
                    isSaved={savedItems.some(i => i.name === result.formula.name && i.type === 'standard')}
                />
            ))}

            {/* View More / Low Confidence Section */}
            {lowConfidenceMatches.length > 0 && (
                <div className="mt-8">
                    {!showLowConfidence ? (
                        <div className="flex flex-col items-center">
                            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-300/50 to-transparent mb-4"></div>
                            <button 
                                onClick={() => setShowLowConfidence(true)}
                                className="group flex items-center space-x-2 bg-white/40 hover:bg-white/60 text-slate-500 hover:text-slate-700 px-6 py-2 rounded-full border border-white/50 shadow-sm backdrop-blur-sm transition-all text-sm font-medium"
                            >
                                <span>查看另外 {lowConfidenceMatches.length} 个相似度较低的结果</span>
                                <svg className="w-4 h-4 transform group-hover:translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="animate-fade-in space-y-6">
                            <div className="flex items-center justify-center py-4">
                                <span className="text-xs font-bold text-slate-400 bg-slate-100/50 px-3 py-1 rounded-full uppercase tracking-wider">以下结果匹配度较低</span>
                            </div>
                            {lowConfidenceMatches.map((result, index) => (
                                <FormulaCard 
                                    key={`${result.formula.id}-low-${index}`} 
                                    result={result} 
                                    rank={highConfidenceMatches.length + index + 1}
                                    onAnalyze={handleAIAnalyze}
                                    isAnalyzing={isAnalyzing && analyzingFormulaName === result.formula.name}
                                    onToggleSave={() => toggleSaveStandardFormula(result.formula)}
                                    isSaved={savedItems.some(i => i.name === result.formula.name && i.type === 'standard')}
                                />
                            ))}
                            <div className="flex justify-center pt-4">
                                <button 
                                    onClick={() => setShowLowConfidence(false)}
                                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                                >
                                    收起低匹配结果
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No Results */}
            {!isSearchingCloud && parsedHerbs.length > 0 && matches.length === 0 && (
                <div className="text-center py-16 bg-white/30 rounded-3xl border border-white/50 backdrop-blur-sm">
                    <div className="text-5xl mb-4 opacity-50">🍃</div>
                    <h3 className="text-xl font-bold text-slate-600 mb-2">未找到相似经典方剂</h3>
                    <p className="text-slate-500 max-w-md mx-auto">尝试减少一些非核心药物，或者该方可能为近代经验方。</p>
                </div>
            )}
        </div>

      </main>

      {/* Collection Drawer */}
      <div 
        className={`fixed inset-y-0 right-0 w-80 md:w-96 bg-white/90 backdrop-blur-2xl shadow-2xl transform transition-transform duration-500 z-40 border-l border-white/50 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
          <div className="flex flex-col h-full">
              <div className="p-6 border-b border-slate-200/60 bg-white/50">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold text-slate-800 serif">我的收藏</h2>
                      <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-slate-200/50 rounded-full transition">
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {savedItems.length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                          <p>暂无收藏方剂</p>
                      </div>
                  ) : (
                      savedItems.map(item => (
                          <div key={item.id} className="bg-white/60 p-4 rounded-xl border border-white/60 shadow-sm hover:shadow-md transition group relative overflow-hidden">
                              <div className="flex justify-between items-start mb-2 relative z-10">
                                  <h3 className="font-bold text-slate-800">{item.name}</h3>
                                  <button onClick={() => deleteSavedItem(item.id)} className="text-slate-300 hover:text-red-400 transition">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                  </button>
                              </div>
                              <div className="text-xs text-slate-500 space-y-1 relative z-10">
                                  {formatHerbsToLines(item.herbs).map((line, i) => (
                                      <div key={i} className="flex gap-2">
                                          {line.map(herb => (
                                              <span key={herb} className="bg-slate-100/80 px-1.5 py-0.5 rounded">{herb}</span>
                                          ))}
                                      </div>
                                  ))}
                              </div>
                              <div className="mt-3 text-[10px] text-slate-400 flex justify-between items-center relative z-10">
                                  <span>{item.date}</span>
                                  <span className={`px-2 py-0.5 rounded-full ${item.type === 'user' ? 'bg-indigo-50 text-indigo-500' : 'bg-teal-50 text-teal-500'}`}>
                                      {item.type === 'user' ? '自拟' : '经典'}
                                  </span>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      </div>

      {/* Admin Panel Overlay */}
      <AdminPanel 
          isOpen={isAdminOpen} 
          onClose={() => setIsAdminOpen(false)}
          formulas={dynamicFormulas}
          herbInfo={dynamicHerbInfo}
          onAddFormula={handleAddFormula}
          onUpdateFormula={handleUpdateFormula}
          onAddHerbInfo={handleAddHerbInfo}
          onUpdateHerbInfo={handleUpdateHerbInfo}
      />
    </div>
  );
};

export default App;