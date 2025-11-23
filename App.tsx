
import React, { useState, useEffect } from 'react';
import { parseFormulaInput, findMatches, compareFormulaWithInput, formatHerbsToLines } from './utils';
import { Herb, MatchResult, StandardFormula, HerbDetail, SavedItem, User } from './types';
import { HERB_INFO, CLASSIC_FORMULAS } from './constants';
import { generateTCMAnalysis, identifyFormula } from './services/geminiService';
import { authService } from './services/authService';
import FormulaCard from './components/FormulaCard';
import CosmicLoader from './components/CosmicLoader';
import AdminPanel from './components/AdminPanel';
import AuthModal from './components/AuthModal';
import ReactMarkdown from 'react-markdown';

// Predefined color themes for cards
const CARD_THEMES = [
    { id: 'default', name: '素雅白', class: 'bg-white/60 border-white/60', display: 'bg-slate-100' },
    { id: 'warm', name: '暖阳橙', class: 'bg-orange-50/80 border-orange-200/60', display: 'bg-orange-100' },
    { id: 'cool', name: '清透蓝', class: 'bg-blue-50/80 border-blue-200/60', display: 'bg-blue-100' },
    { id: 'nature', name: '草木绿', class: 'bg-emerald-50/80 border-emerald-200/60', display: 'bg-emerald-100' },
    { id: 'mystic', name: '紫韵梦', class: 'bg-purple-50/80 border-purple-200/60', display: 'bg-purple-100' },
    { id: 'rose', name: '蔷薇红', class: 'bg-rose-50/80 border-rose-200/60', display: 'bg-rose-100' },
];

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [parsedHerbs, setParsedHerbs] = useState<Herb[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingFormulaName, setAnalyzingFormulaName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Favorites State (Synced with User if logged in)
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Edit State for Favorites
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; note: string; colorTheme: string }>({
      name: '', note: '', colorTheme: 'default'
  });

  // --- Admin / Dynamic Data State with Persistence ---
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  // Load from LocalStorage or use Constants
  const [dynamicFormulas, setDynamicFormulas] = useState<StandardFormula[]>(() => {
      try {
          const saved = localStorage.getItem('tcm_formulas');
          return saved ? JSON.parse(saved) : CLASSIC_FORMULAS;
      } catch (e) {
          return CLASSIC_FORMULAS;
      }
  });

  const [dynamicHerbInfo, setDynamicHerbInfo] = useState<Record<string, HerbDetail>>(() => {
      try {
          const saved = localStorage.getItem('tcm_herb_info');
          if (saved) return JSON.parse(saved);
          return HERB_INFO as unknown as Record<string, HerbDetail>;
      } catch (e) {
          return HERB_INFO as unknown as Record<string, HerbDetail>;
      }
  });

  // --- Initial Load ---
  useEffect(() => {
      // 1. Load User
      const user = authService.getCurrentUser();
      if (user) {
          setCurrentUser(user);
          setSavedItems(user.savedItems || []);
      } else {
          // Load local guest items if no user
          try {
              const localSaved = localStorage.getItem('tcm_saved_items_guest');
              if (localSaved) setSavedItems(JSON.parse(localSaved));
          } catch (e) {}
      }
  }, []);

  // Save to LocalStorage whenever data changes
  useEffect(() => {
      localStorage.setItem('tcm_formulas', JSON.stringify(dynamicFormulas));
  }, [dynamicFormulas]);

  useEffect(() => {
      localStorage.setItem('tcm_herb_info', JSON.stringify(dynamicHerbInfo));
  }, [dynamicHerbInfo]);

  // Sync saved items to persistence
  useEffect(() => {
      if (currentUser) {
          // If logged in, update user object
          const updatedUser = { ...currentUser, savedItems };
          authService.updateUserData(updatedUser);
          // We don't set CurrentUser state here to avoid infinite loop, 
          // but we rely on internal savedItems state for UI
      } else {
          // Guest mode
          localStorage.setItem('tcm_saved_items_guest', JSON.stringify(savedItems));
      }
  }, [savedItems, currentUser?.id]); // Only trigger when items change or user ID changes

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
    const hasPerfectMatch = localResults.some(r => r.matchType === 'exact' && r.score > 0.95);
    
    if (!hasPerfectMatch && herbs.length > 0) {
        setIsSearchingCloud(true);
        // If no perfect match locally, ask AI to identify "What is this formula?"
        const identifiedFormula = await identifyFormula(herbs);
        setIsSearchingCloud(false);

        if (identifiedFormula) {
            // Compare the AI identified formula against user input to create a MatchResult
            const aiMatchResult = compareFormulaWithInput(herbs, identifiedFormula);
            if (aiMatchResult) {
                // Prepend AI result to matches
                setMatches(prev => [aiMatchResult, ...prev]);
            }
        }
    }
  };

  const handleAnalyze = async (matchResult: MatchResult) => {
    setIsAnalyzing(true);
    setAnalyzingFormulaName(matchResult.formula.name);
    setAiAnalysis(null);
    
    // Smooth scroll to analysis area
    setTimeout(() => {
        document.getElementById('analysis-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    const analysisText = await generateTCMAnalysis(matchResult.inputHerbs, matchResult);
    setAiAnalysis(analysisText);
    setIsAnalyzing(false);
  };

  const toggleSave = (item: Partial<SavedItem>) => {
      const existingIndex = savedItems.findIndex(i => i.name === item.name && JSON.stringify(i.herbs) === JSON.stringify(item.herbs));
      if (existingIndex >= 0) {
          // Remove
          const newItems = [...savedItems];
          newItems.splice(existingIndex, 1);
          setSavedItems(newItems);
      } else {
          // Add
          const newItem: SavedItem = {
              id: Date.now().toString(),
              name: item.name || '未命名方剂',
              herbs: item.herbs || [],
              type: item.type || 'user',
              date: new Date().toLocaleDateString(),
              note: '',
              colorTheme: 'default'
          };
          setSavedItems([newItem, ...savedItems]);
          // Auto-open drawer to show it was added
          setIsDrawerOpen(true);
      }
  };
  
  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSavedItems(prev => prev.filter(item => item.id !== id));
      if (editingItemId === id) {
          setEditingItemId(null);
      }
  };

  // --- Editing Favorites Logic ---
  const handleEditItem = (item: SavedItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (editingItemId === item.id) {
          // Toggle off
          setEditingItemId(null);
      } else {
          setEditingItemId(item.id);
          setEditForm({
              name: item.name,
              note: item.note || '',
              colorTheme: item.colorTheme || 'default'
          });
      }
  };

  const handleSaveEdit = (id: string) => {
      setSavedItems(prev => prev.map(item => {
          if (item.id === id) {
              return {
                  ...item,
                  name: editForm.name,
                  note: editForm.note,
                  colorTheme: editForm.colorTheme
              };
          }
          return item;
      }));
      setEditingItemId(null);
  };

  // --- Admin Logic ---
  const handleAddFormula = (newFormula: StandardFormula) => {
      setDynamicFormulas(prev => [newFormula, ...prev]);
  };
  
  const handleUpdateFormula = (updatedFormula: StandardFormula) => {
      setDynamicFormulas(prev => prev.map(f => f.id === updatedFormula.id ? updatedFormula : f));
  };

  const handleAddHerbInfo = (name: string, data: HerbDetail) => {
      setDynamicHerbInfo(prev => ({ ...prev, [name]: data }));
  };

  const handleUpdateHerbInfo = (name: string, data: HerbDetail) => {
      setDynamicHerbInfo(prev => ({ ...prev, [name]: data }));
  };

  const isSaved = (name: string, herbs: Herb[]) => {
      const herbNames = herbs.map(h => h.name);
      return savedItems.some(item => item.name === name && JSON.stringify(item.herbs) === JSON.stringify(herbNames));
  };

  // --- Auth Handlers ---
  const handleLoginSuccess = (user: User) => {
      setCurrentUser(user);
      setSavedItems(user.savedItems || []);
  };

  const handleLogout = () => {
      authService.logout();
      setCurrentUser(null);
      setShowProfileMenu(false);
      setSavedItems([]); // Or reset to guest items
  };

  // --- Visuals ---
  const showMatches = matches.length > 0;
  const highConfidenceMatches = matches.filter(m => m.score >= 0.5);
  const lowConfidenceMatches = matches.filter(m => m.score < 0.5);
  const displayMatches = showLowConfidence ? matches : highConfidenceMatches;

  return (
    <div className="min-h-screen text-slate-700 pb-20 relative overflow-x-hidden selection:bg-teal-100 selection:text-teal-900">
      
      {/* Decorative Background Blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-200/30 rounded-full blur-[100px] pointer-events-none mix-blend-multiply animate-float"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-200/30 rounded-full blur-[100px] pointer-events-none mix-blend-multiply animate-float" style={{ animationDelay: '2s' }}></div>
      <div className="fixed top-[20%] right-[10%] w-[20%] h-[30%] bg-blue-200/30 rounded-full blur-[80px] pointer-events-none mix-blend-multiply animate-float" style={{ animationDelay: '4s' }}></div>

      {/* Progress Bar (Top) */}
      {progress > 0 && (
          <div className="fixed top-0 left-0 w-full h-1 z-50">
              <div 
                  className="h-full bg-gradient-to-r from-teal-400 via-blue-500 to-purple-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
              ></div>
          </div>
      )}

      {/* Header & Auth */}
      <header className="relative pt-6 pb-6 px-6 z-20 flex flex-col md:flex-row justify-between items-center max-w-6xl mx-auto">
        <div className="hidden md:block w-32"></div> {/* Spacer */}
        
        {/* Logo Center */}
        <div className="flex flex-col items-center cursor-pointer group mb-4 md:mb-0" onDoubleClick={() => setIsAdminOpen(true)} title="双击打开管理后台">
             <div className="flex items-center">
                 <div className="bg-white/80 p-2 rounded-2xl shadow-lg shadow-teal-500/10 backdrop-blur-sm mr-3 border border-white/50 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-3xl filter drop-shadow-sm">🌿</span>
                 </div>
                 <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 via-slate-800 to-slate-600 serif tracking-tight">
                    方剂<span className="text-teal-600">溯源</span>系统
                 </h1>
             </div>
             <p className="text-slate-500 text-xs mt-1 font-light tracking-wide">
                智能解析 · 经典名方 · 个人知识库
             </p>
        </div>

        {/* Auth / Profile Top Right */}
        <div className="w-full md:w-32 flex justify-end relative">
            {currentUser ? (
                <div className="relative">
                    <button 
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className={`flex items-center space-x-2 bg-white/60 hover:bg-white/90 backdrop-blur-sm pl-1 pr-3 py-1 rounded-full border border-white/60 shadow-sm transition-all ${showProfileMenu ? 'ring-2 ring-indigo-200' : ''}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${currentUser.avatarColor}`}>
                            {currentUser.avatar}
                        </div>
                        <span className="text-sm font-bold text-slate-700 max-w-[80px] truncate">{currentUser.nickname}</span>
                    </button>
                    
                    {showProfileMenu && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/50 overflow-hidden animate-pop z-50">
                            <div className="p-3 border-b border-slate-100">
                                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">已登录账号</p>
                                <p className="font-bold text-slate-800 truncate">{currentUser.nickname}</p>
                            </div>
                            <button 
                                onClick={() => setIsDrawerOpen(true)}
                                className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 flex items-center"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                                我的收藏
                            </button>
                            {/* In a real app, Edit Profile would go here */}
                            <button 
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 border-t border-slate-100 flex items-center"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                退出登录
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center space-x-2 bg-white/60 hover:bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/60 shadow-sm text-sm font-bold text-indigo-600 transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                    <span>登录 / 注册</span>
                </button>
            )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 relative z-10">
        
        {/* Input Section */}
        <div className="glass-edge relative bg-white/40 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-2 border border-white/60 mb-10 transition-all hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] hover:bg-white/50">
            <div className="relative">
                <textarea
                    value={input}
                    onChange={handleInputChange}
                    placeholder=""
                    className="w-full h-40 p-6 rounded-[1.5rem] bg-transparent border-none outline-none text-lg text-slate-700 placeholder:text-slate-400/70 resize-none font-medium leading-relaxed"
                />
                
                {/* Decorative corner lines */}
                <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-300/50 rounded-tl-lg pointer-events-none"></div>
                <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-300/50 rounded-tr-lg pointer-events-none"></div>
                <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-300/50 rounded-bl-lg pointer-events-none"></div>
                <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-300/50 rounded-br-lg pointer-events-none"></div>
            </div>

            <div className="flex justify-between items-center px-4 pb-3 pt-1 border-t border-slate-200/30">
                <div className="text-xs text-slate-400 font-medium pl-2">
                    {input.length > 0 ? `${input.length} 字` : '请输入方剂组成...'}
                </div>
                <div className="flex space-x-3">
                    <button 
                        onClick={() => {setInput(''); setMatches([]); setAiAnalysis(null);}}
                        className="px-4 py-2 rounded-xl text-slate-500 hover:bg-white/50 transition text-sm font-medium"
                    >
                        清空
                    </button>
                    <button 
                        onClick={handleSearch}
                        disabled={!input.trim() || isSearchingCloud}
                        className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine"></div>
                        <span className="relative flex items-center">
                            {isSearchingCloud ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    全网检索中...
                                </>
                            ) : '智能溯源'}
                        </span>
                    </button>
                </div>
            </div>
        </div>

        {/* Results Section */}
        {matches.length > 0 ? (
          <div className="animate-fade-in-up">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-lg font-bold text-slate-600 flex items-center">
                    <span className="w-2 h-2 bg-teal-500 rounded-full mr-2 shadow-[0_0_10px_rgba(20,184,166,0.6)]"></span>
                    识别结果 
                    <span className="ml-2 text-xs font-normal text-slate-400 bg-white/50 px-2 py-0.5 rounded-full border border-white/60">共 {matches.length} 个匹配</span>
                </h2>
                {lowConfidenceMatches.length > 0 && (
                     <button 
                        onClick={() => setShowLowConfidence(!showLowConfidence)}
                        className="text-xs text-slate-500 underline hover:text-indigo-600 transition"
                     >
                         {showLowConfidence ? '隐藏低匹配度结果' : `显示 ${lowConfidenceMatches.length} 个低匹配度结果`}
                     </button>
                )}
            </div>
            
            <div className="space-y-6">
              {displayMatches.map((match, index) => (
                <FormulaCard 
                    key={`${match.formula.id}-${index}`} 
                    result={match} 
                    rank={index + 1}
                    onAnalyze={handleAnalyze}
                    isAnalyzing={isAnalyzing && analyzingFormulaName === match.formula.name}
                    onToggleSave={() => toggleSave({ 
                        name: match.formula.name, 
                        herbs: parsedHerbs.map(h => h.name), 
                        type: 'standard' 
                    })}
                    isSaved={isSaved(match.formula.name, parsedHerbs)}
                />
              ))}
            </div>
            
            {showLowConfidence && displayMatches.length === 0 && (
                <div className="text-center py-10 text-slate-400 bg-white/20 rounded-2xl border border-white/30 border-dashed">
                    没有找到更多结果。
                </div>
            )}
          </div>
        ) : input.trim() && !isSearchingCloud && (
             <div className="text-center py-12 opacity-60 animate-fade-in">
                 <div className="text-6xl mb-4">🔍</div>
                 <p className="text-slate-500">未找到完全匹配的方剂，<br/>尝试输入如“麻黄 桂枝 杏仁 甘草”</p>
             </div>
        )}

        {/* AI Analysis Section */}
        {aiAnalysis && (
          <div id="analysis-section" className="glass-edge mt-12 mb-20 bg-white/60 backdrop-blur-xl rounded-[2rem] p-8 border border-white/60 shadow-[0_20px_60px_-15px_rgba(50,50,93,0.1)] relative overflow-hidden animate-fade-in-up">
             {/* Decorative header bg */}
             <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-teal-50/80 to-transparent pointer-events-none"></div>
             
             <h2 className="text-2xl font-bold text-teal-800 mb-6 flex items-center relative z-10 serif">
               <span className="text-3xl mr-3">🤖</span> AI 深度临床分析
             </h2>
             
             <div className="prose prose-slate prose-sm md:prose-base max-w-none relative z-10 prose-headings:font-serif prose-headings:text-teal-700 prose-strong:text-teal-600">
               <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
             </div>

             {/* Footer Decoration */}
             <div className="absolute bottom-4 right-6 text-[10px] text-slate-300 font-mono tracking-widest uppercase">
                 AI Generated Content • {new Date().toLocaleDateString()}
             </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 text-center py-6 text-slate-400 text-xs font-light">
          <p className="mb-1">
              数据来源：
              <a href="http://www.zysj.com.cn" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors border-b border-slate-300 border-dashed pb-0.5">
                  中医世家 (zysj.com.cn)
              </a>
              <span className="mx-2 opacity-50">|</span>
              <span>历代中医典籍</span>
          </p>
          <p className="opacity-60 transform scale-95">
              本系统仅供中医学习研究参考，不可替代专业医师诊断
          </p>
      </footer>

      {/* Floating Action Button (Collection) */}
      <button 
        onClick={() => setIsDrawerOpen(true)}
        className="fixed bottom-8 right-8 bg-slate-800 text-white p-4 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:scale-110 active:scale-95 transition-all duration-300 z-40 group"
      >
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-100 shadow-sm scale-0 group-hover:scale-100 transition-transform">{savedItems.length}</span>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
      </button>

      {/* Collection Drawer */}
      {isDrawerOpen && (
        <>
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 transition-opacity" onClick={() => setIsDrawerOpen(false)}></div>
            <div className="glass-edge fixed top-0 right-0 h-full w-full max-w-md bg-white/90 backdrop-blur-2xl shadow-2xl z-50 p-6 overflow-y-auto animate-slide-in-right border-l border-white/50">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 serif">我的收藏</h2>
                        {currentUser && <p className="text-xs text-slate-500 mt-1">所属账号: {currentUser.nickname}</p>}
                    </div>
                    <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition">
                        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {!currentUser && savedItems.length > 0 && (
                    <div className="mb-6 bg-indigo-50 p-3 rounded-lg flex items-center justify-between text-xs text-indigo-700">
                        <span>登录后可永久保存并同步您的收藏。</span>
                        <button onClick={() => { setIsDrawerOpen(false); setIsAuthModalOpen(true); }} className="font-bold underline">去登录</button>
                    </div>
                )}

                {savedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        <p>暂无收藏方剂</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {savedItems.map(item => {
                            const isEditing = editingItemId === item.id;
                            const theme = CARD_THEMES.find(t => t.id === item.colorTheme) || CARD_THEMES[0];
                            
                            return (
                                <div key={item.id} className={`glass-edge p-5 rounded-2xl border transition-all duration-300 group ${theme.class} shadow-sm hover:shadow-md`}>
                                    <div className="flex justify-between items-start mb-2">
                                        {isEditing ? (
                                            <input 
                                                value={editForm.name}
                                                onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                className="font-bold text-lg bg-white/50 border border-slate-300 rounded px-2 py-1 w-full mr-2 focus:ring-2 ring-indigo-200 outline-none"
                                                autoFocus
                                            />
                                        ) : (
                                            <h3 className="font-bold text-lg text-slate-800">{item.name}</h3>
                                        )}
                                        
                                        <div className="flex space-x-1 shrink-0">
                                            {isEditing ? (
                                                <button onClick={() => handleSaveEdit(item.id)} className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 shadow-sm" title="保存">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                </button>
                                            ) : (
                                                <button onClick={(e) => handleEditItem(item, e)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white/50 rounded-lg transition" title="编辑">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                </button>
                                            )}
                                            <button onClick={(e) => handleDeleteItem(item.id, e)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-white/50 rounded-lg transition" title="删除">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Composition (4 per line) */}
                                    <div className="text-sm text-slate-600 mb-3 leading-relaxed font-mono opacity-80 bg-white/30 p-2 rounded-lg border border-white/20">
                                        {formatHerbsToLines(item.herbs).map((line, i) => (
                                            <div key={i} className="flex space-x-2 mb-1 last:mb-0">
                                                {line.map((h, j) => (
                                                    <span key={j} className="bg-white/50 px-1.5 rounded text-slate-700">{h}</span>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Edit Mode: Color Theme & Note */}
                                    {isEditing ? (
                                        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-3">
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 block mb-1.5">卡片主题色</label>
                                                <div className="flex space-x-2">
                                                    {CARD_THEMES.map(t => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => setEditForm({...editForm, colorTheme: t.id})}
                                                            className={`w-6 h-6 rounded-full border border-slate-200 shadow-sm transition-transform ${t.display} ${editForm.colorTheme === t.id ? 'scale-125 ring-2 ring-slate-400 ring-offset-2' : 'hover:scale-110'}`}
                                                            title={t.name}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 block mb-1.5">备注</label>
                                                <textarea 
                                                    value={editForm.note}
                                                    onChange={e => setEditForm({...editForm, note: e.target.value})}
                                                    placeholder="添加备注..."
                                                    className="w-full text-sm bg-white/50 border border-slate-300 rounded-lg p-2 focus:ring-2 ring-indigo-200 outline-none h-20 resize-none"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {item.note && (
                                                <div className="mt-3 text-xs text-slate-500 italic bg-black/5 p-2 rounded border border-black/5">
                                                    {item.note}
                                                </div>
                                            )}
                                            <div className="mt-3 flex justify-between items-center">
                                                <span className="text-[10px] text-slate-400">{item.date}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.type === 'standard' ? 'bg-teal-100 text-teal-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {item.type === 'standard' ? '经典' : '自拟'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
      )}

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

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
      
    </div>
  );
};

export default App;
