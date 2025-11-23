
import React, { useState, useEffect } from 'react';
import { StandardFormula, HerbDetail, User } from '../types';
import { parseDosageString, formatDosageToString, normalizeBookName } from '../utils';
import { parseRawFormulaText, agenticCrawlFormula, agenticCrawlHerb } from '../services/geminiService';
import { authService } from '../services/authService';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  formulas: StandardFormula[];
  herbInfo: Record<string, HerbDetail>;
  onAddFormula: (formula: StandardFormula) => void;
  onUpdateFormula: (formula: StandardFormula) => void;
  onAddHerbInfo: (name: string, data: HerbDetail) => void;
  onUpdateHerbInfo: (name: string, data: HerbDetail) => void;
}

type Tab = 'formula' | 'herb' | 'crawler' | 'books' | 'users';

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  isOpen, 
  onClose, 
  formulas, 
  herbInfo, 
  onAddFormula, 
  onUpdateFormula,
  onAddHerbInfo,
  onUpdateHerbInfo
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('formula');
  const [searchTerm, setSearchTerm] = useState('');

  // User Management State
  const [userList, setUserList] = useState<User[]>([]);

  // Editing State
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [editingHerbName, setEditingHerbName] = useState<string | null>(null);

  // Smart Import State
  const [rawImportText, setRawImportText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Crawler State
  const [crawlInput, setCrawlInput] = useState('');
  const [crawlLog, setCrawlLog] = useState<string[]>([]);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlType, setCrawlType] = useState<'formula' | 'herb'>('formula');

  // Form State for Formula
  const [formulaForm, setFormulaForm] = useState<Partial<StandardFormula>>({
    name: '', source: '', composition: [], standardDosage: {}, usage: '', effect: '', indications: '', analysis: '', pinyin: '', category: ''
  });
  const [standardDosageStr, setStandardDosageStr] = useState('');
  const [compositionStr, setCompositionStr] = useState('');

  // Form State for Herb Info
  const [herbForm, setHerbForm] = useState<Partial<HerbDetail> & { name: string }>({
    name: '', effect: '', paozhi: '', pinyin: '', category: '', origin: '', taste: '', meridians: '', actions: '', usage_dosage: '', contraindications: ''
  });

  // Reset forms when tab changes
  useEffect(() => {
    if (isAuthenticated) {
        resetForms();
        if (activeTab === 'users') {
            refreshUserList();
        }
    }
  }, [activeTab, isAuthenticated]);

  const refreshUserList = () => {
      setUserList(authService.getAllUsers());
  };

  const resetForms = () => {
    setEditingFormulaId(null);
    setEditingHerbName(null);
    setFormulaForm({ name: '', source: '', composition: [], standardDosage: {}, usage: '', effect: '', indications: '', analysis: '', pinyin: '', category: '' });
    setStandardDosageStr('');
    setCompositionStr('');
    setHerbForm({ name: '', effect: '', paozhi: '', pinyin: '', category: '', origin: '', taste: '', meridians: '', actions: '', usage_dosage: '', contraindications: '' });
    setShowImport(false);
    setRawImportText('');
  };

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (password === '107868') {
          setIsAuthenticated(true);
      } else {
          alert('密码错误');
      }
  };

  const handleDeleteUser = (userId: string) => {
      if (window.confirm('确定要删除该用户吗？所有收藏数据将丢失。')) {
          authService.deleteUser(userId);
          refreshUserList();
      }
  };

  if (!isOpen) return null;

  // --- Login Screen ---
  if (!isAuthenticated) {
      return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
              <div className="relative bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm animate-pop">
                  <div className="text-center mb-6">
                      <div className="text-4xl mb-2">🔒</div>
                      <h2 className="text-xl font-bold text-slate-800">管理员登录</h2>
                      <p className="text-sm text-slate-500">请输入访问密码以进入后台</p>
                  </div>
                  <form onSubmit={handleLogin}>
                      <input 
                          type="password" 
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="w-full p-3 rounded-xl border border-slate-300 mb-4 focus:ring-2 ring-indigo-500 outline-none text-center tracking-widest text-lg"
                          placeholder="••••••"
                          autoFocus
                      />
                      <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">
                          验证
                      </button>
                      <button type="button" onClick={onClose} className="w-full mt-3 text-slate-400 text-sm hover:text-slate-600">
                          返回
                      </button>
                  </form>
              </div>
          </div>
      );
  }

  // Helpers
  const uniqueBooks = Array.from(new Set(formulas.map(f => f.source))).sort();
  const filteredFormulas = formulas.filter(f => f.name.includes(searchTerm) || f.composition.includes(searchTerm));
  const filteredHerbs = (Object.entries(herbInfo) as [string, HerbDetail][]).filter(([name, data]) => 
    name.includes(searchTerm) || data.effect.includes(searchTerm)
  );

  // --- Crawler Handlers ---
  const handleStartCrawl = async () => {
      const items = crawlInput.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
      if (items.length === 0) return;

      setIsCrawling(true);
      setCrawlLog(prev => [...prev, `🚀 开始连接 zysj.com.cn 爬取 ${items.length} 个${crawlType === 'formula' ? '方剂' : '中药'}...`]);

      for (const item of items) {
          setCrawlLog(prev => [...prev, `🔍 正在检索: ${item}`]);
          
          if (crawlType === 'formula') {
             const existing = formulas.find(f => f.name === item);
             if (existing) {
                 setCrawlLog(prev => [...prev, `⚠️ 已存在，跳过: ${item}`]);
                 continue;
             }
             
             const data = await agenticCrawlFormula(item);
             if (data) {
                 // Double normalize locally just in case
                 if (data.source) data.source = normalizeBookName(data.source);
                 
                 onAddFormula(data);
                 setCrawlLog(prev => [...prev, `✅ [中医世家] 成功抓取并入库: ${item}`]);
             } else {
                 setCrawlLog(prev => [...prev, `❌ 抓取失败: ${item}`]);
             }
          } else {
             // Herb Crawl
             if (herbInfo[item]) {
                  setCrawlLog(prev => [...prev, `⚠️ 已存在，跳过: ${item}`]);
                  continue;
             }
             const data = await agenticCrawlHerb(item);
             if (data) {
                 onAddHerbInfo(item, data);
                 setCrawlLog(prev => [...prev, `✅ [中医世家] 成功抓取并入库: ${item}`]);
             } else {
                 setCrawlLog(prev => [...prev, `❌ 抓取失败: ${item}`]);
             }
          }
          
          // Random delay to simulate courteous crawler
          await new Promise(r => setTimeout(r, 1000));
      }

      setIsCrawling(false);
      setCrawlLog(prev => [...prev, `🎉 所有任务完成！数据已同步至本地数据库。`]);
  };


  // --- Formula Handlers ---

  const handleSmartImport = async () => {
      if (!rawImportText.trim()) return;
      setIsParsing(true);
      try {
          const result = await parseRawFormulaText(rawImportText);
          if (result) {
              setFormulaForm({
                  ...result,
                  source: normalizeBookName(result.source),
                  composition: result.composition || [],
                  standardDosage: {}
              });
              setCompositionStr(Array.isArray(result.composition) ? result.composition.join(' ') : (result.composition || ''));
              setStandardDosageStr(result.standardDosage || '');
              setShowImport(false); 
              setRawImportText(''); 
          }
      } catch (e) {
          alert('识别失败，请重试或手动输入。');
      } finally {
          setIsParsing(false);
      }
  };

  const handleEditFormula = (formula: StandardFormula) => {
    setEditingFormulaId(formula.id);
    setFormulaForm(formula);
    setCompositionStr(formula.composition.join(' '));
    setStandardDosageStr(formatDosageToString(formula.standardDosage));
    // Scroll to top of form
    document.getElementById('formula-form-top')?.scrollIntoView({ behavior: 'smooth' });
    setShowImport(false);
  };

  const handleSaveFormula = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulaForm.name || !compositionStr) return;
    
    const standardDosageObj = parseDosageString(standardDosageStr);
    const compositionArr = compositionStr.replace(/[，、]/g, ' ').split(/\s+/).filter(Boolean);

    const formulaObj: StandardFormula = {
      id: editingFormulaId || `custom-${Date.now()}`,
      name: formulaForm.name || '',
      source: normalizeBookName(formulaForm.source || '自定义'),
      composition: compositionArr,
      standardDosage: standardDosageObj,
      usage: formulaForm.usage || '',
      effect: formulaForm.effect || '',
      indications: formulaForm.indications || '',
      analysis: formulaForm.analysis || '',
      pinyin: formulaForm.pinyin,
      category: formulaForm.category
    };

    if (editingFormulaId) {
        onUpdateFormula(formulaObj);
        alert('方剂已更新');
    } else {
        onAddFormula(formulaObj);
        alert('方剂已添加');
    }
    
    resetForms();
  };

  // --- Herb Handlers ---

  const handleEditHerb = (name: string, data: HerbDetail) => {
      setEditingHerbName(name);
      setHerbForm({ ...data, name });
      document.getElementById('herb-form-top')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSaveHerb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!herbForm.name) return;
    
    const { name, ...data } = herbForm;
    // ensure required fields have strings
    const safeData: HerbDetail = {
        effect: data.effect || '',
        paozhi: data.paozhi || '',
        ...data
    };

    if (editingHerbName) {
        onUpdateHerbInfo(name, safeData);
        alert('药效信息已更新');
    } else {
        onAddHerbInfo(name, safeData);
        alert('药效信息已添加');
    }
    
    resetForms();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Main Glass Panel */}
      <div className="relative w-full max-w-5xl h-full md:h-[90vh] bg-white/90 backdrop-blur-2xl md:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/50 flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* Header */}
        <div className="flex justify-between items-center px-4 md:px-6 py-4 border-b border-slate-200/50 bg-white/50 shrink-0">
          <div className="flex items-center space-x-3">
             <div className="bg-gradient-to-br from-indigo-500 to-purple-600 w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shadow-lg text-white shrink-0">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
             </div>
             <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-bold text-slate-800 serif truncate">后台管理系统</h2>
                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 block w-fit mt-0.5">管理员模式</span>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200/50 rounded-full transition text-slate-500 shrink-0 ml-2">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Content Area - Responsive Layout (Vertical on mobile, Sidebar on desktop) */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
           
           {/* Navigation Tabs */}
           <div className="w-full md:w-48 bg-slate-50/80 border-b md:border-b-0 md:border-r border-slate-200/50 p-2 md:p-4 flex md:flex-col gap-2 overflow-x-auto shrink-0 z-10">
              <button 
                onClick={() => setActiveTab('formula')}
                className={`flex-shrink-0 px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center justify-center md:justify-start ${activeTab === 'formula' ? 'bg-white shadow-md text-indigo-600 ring-1 ring-indigo-100' : 'text-slate-500 hover:bg-white/60'}`}
              >
                 <span className="mr-2">📜</span> <span className="md:inline">方剂管理</span>
              </button>
              <button 
                onClick={() => setActiveTab('herb')}
                className={`flex-shrink-0 px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center justify-center md:justify-start ${activeTab === 'herb' ? 'bg-white shadow-md text-emerald-600 ring-1 ring-emerald-100' : 'text-slate-500 hover:bg-white/60'}`}
              >
                 <span className="mr-2">🌿</span> <span className="md:inline">本草炮制</span>
              </button>
              <button 
                onClick={() => setActiveTab('crawler')}
                className={`flex-shrink-0 px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center justify-center md:justify-start ${activeTab === 'crawler' ? 'bg-white shadow-md text-rose-600 ring-1 ring-rose-100' : 'text-slate-500 hover:bg-white/60'}`}
              >
                 <span className="mr-2">🕷️</span> <span className="md:inline">AI 爬虫</span>
              </button>
              <button 
                onClick={() => setActiveTab('books')}
                className={`flex-shrink-0 px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center justify-center md:justify-start ${activeTab === 'books' ? 'bg-white shadow-md text-amber-600 ring-1 ring-amber-100' : 'text-slate-500 hover:bg-white/60'}`}
              >
                 <span className="mr-2">📚</span> <span className="md:inline">典籍统计</span>
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`flex-shrink-0 px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center justify-center md:justify-start ${activeTab === 'users' ? 'bg-white shadow-md text-blue-600 ring-1 ring-blue-100' : 'text-slate-500 hover:bg-white/60'}`}
              >
                 <span className="mr-2">👥</span> <span className="md:inline">用户管理</span>
              </button>
           </div>

           {/* Main View */}
           <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-white/30 relative">
              
              {/* === FORMULA TAB === */}
              {activeTab === 'formula' && (
                  <div className="space-y-8 pb-10">
                      
                      {/* Smart Import Section (Collapsed by default unless active) */}
                      {!editingFormulaId && (
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-4 shadow-sm">
                            <button 
                                onClick={() => setShowImport(!showImport)}
                                className="flex items-center text-sm font-bold text-indigo-700 w-full hover:opacity-80 transition"
                            >
                                <span className="mr-2 text-lg">✨</span>
                                智能文本识别导入
                                <span className="ml-auto transform transition-transform duration-200" style={{ transform: showImport ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                            </button>
                            
                            {showImport && (
                                <div className="mt-4 animate-fade-in">
                                    <textarea 
                                        value={rawImportText}
                                        onChange={e => setRawImportText(e.target.value)}
                                        placeholder="请在此粘贴方剂文本（例如：麻黄汤，出自《伤寒论》。由麻黄9g、桂枝6g...组成。主治...）。系统将自动识别提取信息填充到下方表单。"
                                        className="w-full h-32 p-3 rounded-xl border border-indigo-200 bg-white/60 text-sm focus:ring-2 ring-indigo-200 outline-none resize-none mb-3"
                                    />
                                    <button 
                                        onClick={handleSmartImport}
                                        disabled={isParsing || !rawImportText.trim()}
                                        className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                    >
                                        {isParsing ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                正在AI分析中...
                                            </>
                                        ) : '一键识别填充'}
                                    </button>
                                </div>
                            )}
                        </div>
                      )}

                      {/* Editor Section */}
                      <div id="formula-form-top" className="bg-white/70 p-4 md:p-6 rounded-2xl border border-white shadow-sm backdrop-blur-sm transition-all duration-300">
                          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                              <span className="flex items-center">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 text-sm ${editingFormulaId ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                      {editingFormulaId ? '✎' : '＋'}
                                  </span>
                                  {editingFormulaId ? '编辑方剂' : '添加新方剂 (或通过上方智能导入)'}
                              </span>
                              {editingFormulaId && (
                                  <button onClick={resetForms} className="text-xs text-slate-500 hover:text-slate-700 underline">
                                      取消编辑
                                  </button>
                              )}
                          </h3>
                          <form onSubmit={handleSaveFormula} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">方名</label>
                                <input value={formulaForm.name} onChange={e => setFormulaForm({...formulaForm, name: e.target.value})} placeholder="方剂名称 *" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" required />
                              </div>
                              <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">出处</label>
                                <input value={formulaForm.source} onChange={e => setFormulaForm({...formulaForm, source: e.target.value})} placeholder="出处 (如: 《伤寒论》)" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" />
                              </div>
                              {/* New Fields */}
                               <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">类别 (可选)</label>
                                <input value={formulaForm.category} onChange={e => setFormulaForm({...formulaForm, category: e.target.value})} placeholder="如: 解表剂" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" />
                              </div>
                              <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">拼音 (可选)</label>
                                <input value={formulaForm.pinyin} onChange={e => setFormulaForm({...formulaForm, pinyin: e.target.value})} placeholder="如: Ma Huang Tang" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" />
                              </div>

                              <div className="md:col-span-2 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">组成药物</label>
                                <input value={compositionStr} onChange={e => setCompositionStr(e.target.value)} placeholder="组成 (用空格分隔, 如: 麻黄 桂枝)" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" required />
                              </div>
                              <div className="md:col-span-2 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">标准剂量参考</label>
                                <input value={standardDosageStr} onChange={e => setStandardDosageStr(e.target.value)} placeholder="标准剂量 (选填, 格式: 麻黄:9 桂枝:6)" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all font-mono text-sm" />
                              </div>
                              <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">用法</label>
                                <input value={formulaForm.usage} onChange={e => setFormulaForm({...formulaForm, usage: e.target.value})} placeholder="用法" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" />
                              </div>
                              <div className="md:col-span-1 min-w-0">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">功效</label>
                                <input value={formulaForm.effect} onChange={e => setFormulaForm({...formulaForm, effect: e.target.value})} placeholder="功效" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none transition-all" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">主治病证</label>
                                <textarea value={formulaForm.indications} onChange={e => setFormulaForm({...formulaForm, indications: e.target.value})} placeholder="主治" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none h-20 transition-all resize-none" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">方解分析</label>
                                <textarea value={formulaForm.analysis} onChange={e => setFormulaForm({...formulaForm, analysis: e.target.value})} placeholder="方解/分析" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-200 outline-none h-20 transition-all resize-none" />
                              </div>
                              
                              <button type="submit" className={`md:col-span-2 py-3 rounded-xl font-bold shadow-lg transition w-full text-white ${editingFormulaId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                  {editingFormulaId ? '更新方剂数据' : '添加到数据库'}
                              </button>
                          </form>
                      </div>

                      {/* List Section */}
                      <div>
                          <div className="sticky top-0 bg-white/80 backdrop-blur-md z-20 py-2 mb-4 -mx-2 px-2 rounded-xl border border-white/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                              <h3 className="text-lg font-bold text-slate-700 pl-2">现有方剂 ({formulas.length})</h3>
                              <input 
                                type="text" 
                                placeholder="搜索方剂名称或组成..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="p-2 px-4 rounded-full bg-white border border-slate-200 text-sm w-full md:w-64 focus:w-80 transition-all outline-none"
                              />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {filteredFormulas.map(f => (
                                  <div key={f.id} className="bg-white/60 p-4 rounded-xl border border-white/60 shadow-sm hover:shadow-md transition flex flex-col group">
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="font-bold text-slate-800 truncate pr-2 flex-1">{f.name}</h4>
                                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">{f.source}</span>
                                      </div>
                                      <p className="text-xs text-slate-500 mb-2 line-clamp-2 h-8">{f.composition.join(' ')}</p>
                                      <div className="mt-auto pt-2 flex justify-between items-center border-t border-slate-200/50">
                                          <span className="text-[10px] text-slate-400 truncate max-w-[60%]">{f.effect}</span>
                                          <button 
                                            onClick={() => handleEditFormula(f)}
                                            className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 transition"
                                          >
                                            编辑
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              {/* === HERB TAB === */}
              {activeTab === 'herb' && (
                  <div className="space-y-8 pb-10">
                      {/* Editor Section */}
                      <div id="herb-form-top" className="bg-white/70 p-4 md:p-6 rounded-2xl border border-white shadow-sm backdrop-blur-sm">
                          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                              <span className="flex items-center">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 text-sm ${editingHerbName ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                      {editingHerbName ? '✎' : '＋'}
                                  </span>
                                  {editingHerbName ? '编辑药物信息' : '添加药物/炮制信息'}
                              </span>
                              {editingHerbName && (
                                  <button onClick={resetForms} className="text-xs text-slate-500 hover:text-slate-700 underline">
                                      取消编辑
                                  </button>
                              )}
                          </h3>
                          <form onSubmit={handleSaveHerb} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">药物名称</label>
                                <input value={herbForm.name} onChange={e => setHerbForm({...herbForm, name: e.target.value})} placeholder="如: 人参" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none transition-all" required disabled={!!editingHerbName} />
                              </div>
                               <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">拼音</label>
                                <input value={herbForm.pinyin} onChange={e => setHerbForm({...herbForm, pinyin: e.target.value})} placeholder="如: Ren Shen" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none transition-all" />
                              </div>
                              
                              <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">性味</label>
                                <input value={herbForm.taste} onChange={e => setHerbForm({...herbForm, taste: e.target.value})} placeholder="如: 甘、微苦，微温" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none transition-all" />
                              </div>
                              <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">归经</label>
                                <input value={herbForm.meridians} onChange={e => setHerbForm({...herbForm, meridians: e.target.value})} placeholder="如: 脾、肺、心、肾经" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none transition-all" />
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">功效 (必填)</label>
                                <input value={herbForm.effect} onChange={e => setHerbForm({...herbForm, effect: e.target.value})} placeholder="功效 (如: 大补元气...)" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none transition-all" required/>
                              </div>
                              
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">炮制方法 (必填)</label>
                                <textarea value={herbForm.paozhi} onChange={e => setHerbForm({...herbForm, paozhi: e.target.value})} placeholder="炮制方法 (如: 【蜜炙】...)" className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none h-20 transition-all resize-none" required/>
                              </div>
                              
                               <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1 ml-1">主治</label>
                                <textarea value={herbForm.actions} onChange={e => setHerbForm({...herbForm, actions: e.target.value})} placeholder="主治病证..." className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-emerald-200 outline-none h-16 transition-all resize-none" />
                              </div>

                              <button type="submit" className={`md:col-span-2 py-3 rounded-xl font-bold shadow-lg transition w-full text-white ${editingHerbName ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                  {editingHerbName ? '更新药物信息' : '保存药物信息'}
                              </button>
                          </form>
                      </div>

                      {/* List Herbs */}
                      <div>
                          <div className="sticky top-0 bg-white/80 backdrop-blur-md z-20 py-2 mb-4 -mx-2 px-2 rounded-xl border border-white/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                              <h3 className="text-lg font-bold text-slate-700 pl-2">药物知识库 ({Object.keys(herbInfo).length})</h3>
                              <input 
                                type="text" 
                                placeholder="搜索药物..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="p-2 px-4 rounded-full bg-white border border-slate-200 text-sm w-full md:w-64 focus:w-80 transition-all outline-none"
                              />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {filteredHerbs.map(([name, data]) => (
                                  <div key={name} className="bg-white/60 p-4 rounded-xl border border-white/60 shadow-sm flex flex-col">
                                      <div className="flex justify-between items-start mb-2">
                                          <div className="font-bold text-emerald-800 text-lg">{name}</div>
                                          <button 
                                            onClick={() => handleEditHerb(name, data)}
                                            className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded hover:bg-emerald-100 transition"
                                          >
                                            编辑
                                          </button>
                                      </div>
                                      <div className="text-xs text-slate-600 mb-2 line-clamp-2"><span className="font-bold text-slate-400">功效：</span>{data.effect}</div>
                                      {data.meridians && <div className="text-xs text-slate-500 mb-1"><span className="font-bold text-slate-400">归经：</span>{data.meridians}</div>}
                                      <div className="text-xs text-slate-500 bg-slate-50/50 p-2 rounded mt-auto line-clamp-2"><span className="font-bold text-slate-400">炮制：</span>{data.paozhi}</div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}

              {/* === CRAWLER TAB === */}
              {activeTab === 'crawler' && (
                  <div className="space-y-6 pb-10">
                      <div className="bg-gradient-to-br from-rose-50 to-orange-50 p-6 rounded-2xl border border-rose-100 shadow-sm">
                          <h3 className="text-xl font-bold text-rose-800 mb-2 flex items-center">
                              🕷️ 中医世家 AI 爬虫 (ZYSJ Crawler)
                          </h3>
                          <p className="text-sm text-rose-600/80 mb-4 leading-relaxed">
                              本功能模拟 Python 爬虫逻辑，利用 AI 的 Agent 能力直接检索 <strong>zysj.com.cn (中医世家)</strong> 等权威数据源。
                              <br/>支持自动标准化药名（如：薏米→薏苡仁）、书名（如：医学衷中参西录→衷中参西），并将数据自动清洗入库。
                          </p>

                          <div className="flex space-x-4 mb-4">
                              <label className="flex items-center cursor-pointer">
                                  <input type="radio" name="crawlType" checked={crawlType === 'formula'} onChange={() => setCrawlType('formula')} className="mr-2 accent-rose-600" />
                                  <span className="text-sm font-bold text-slate-700">抓取方剂</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                  <input type="radio" name="crawlType" checked={crawlType === 'herb'} onChange={() => setCrawlType('herb')} className="mr-2 accent-rose-600" />
                                  <span className="text-sm font-bold text-slate-700">抓取中药</span>
                              </label>
                          </div>

                          <textarea 
                              value={crawlInput}
                              onChange={e => setCrawlInput(e.target.value)}
                              placeholder={`请输入要从 zysj.com.cn 抓取的${crawlType === 'formula' ? '方剂' : '中药'}名称，每行一个。\n例如：\n桂枝汤\n麻黄汤\n小青龙汤`}
                              className="w-full h-40 p-4 rounded-xl border border-rose-200 bg-white/60 focus:ring-2 ring-rose-200 outline-none resize-none font-mono text-sm mb-4"
                          />

                          <button 
                            onClick={handleStartCrawl}
                            disabled={isCrawling || !crawlInput.trim()}
                            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          >
                             {isCrawling ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    AI 正在定向检索 ZYSJ 数据...
                                </>
                             ) : '开始智能爬取并入库'}
                          </button>
                      </div>

                      {/* Crawler Logs */}
                      <div className="bg-slate-900 rounded-2xl p-4 font-mono text-xs h-64 overflow-y-auto custom-scrollbar border border-slate-700 shadow-inner">
                          <div className="text-slate-400 mb-2 border-b border-slate-700 pb-1 flex justify-between">
                              <span>系统日志终端</span>
                              <span>STATUS: {isCrawling ? 'ACTIVE' : 'IDLE'}</span>
                          </div>
                          {crawlLog.length === 0 ? (
                              <div className="text-slate-600 italic opacity-50 pt-2">等待任务指令...</div>
                          ) : (
                              crawlLog.map((log, i) => (
                                  <div key={i} className="mb-1 text-emerald-400 border-l-2 border-emerald-900 pl-2">
                                      <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                      {log}
                                  </div>
                              ))
                          )}
                          {isCrawling && <div className="animate-pulse text-rose-400 mt-2">_ 正在解析页面结构...</div>}
                      </div>
                  </div>
              )}

              {/* === USERS TAB === */}
              {activeTab === 'users' && (
                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 mb-6 font-serif">用户管理</h3>
                      <div className="bg-white/60 rounded-2xl border border-white/60 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-100/50 text-slate-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-4">用户</th>
                                    <th className="px-6 py-4">注册时间</th>
                                    <th className="px-6 py-4">最后登录</th>
                                    <th className="px-6 py-4">收藏数量</th>
                                    <th className="px-6 py-4 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {userList.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                                            暂无注册用户
                                        </td>
                                    </tr>
                                ) : (
                                    userList.map(user => (
                                        <tr key={user.id} className="hover:bg-white/50 transition">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${user.avatarColor}`}>
                                                        {user.avatar}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800">{user.nickname}</div>
                                                        <div className="text-[10px] text-slate-400">ID: {user.id.slice(-6)}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">{user.createdAt}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">{user.lastLogin}</td>
                                            <td className="px-6 py-4">
                                                <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-xs font-bold">
                                                    {user.savedItems?.length || 0}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleDeleteUser(user.id)}
                                                    className="text-rose-500 hover:text-rose-700 font-medium text-xs bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100"
                                                >
                                                    删除用户
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                      </div>
                  </div>
              )}

              {/* === BOOKS TAB === */}
              {activeTab === 'books' && (
                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 mb-6 font-serif">典籍收录来源统计</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {uniqueBooks.map(book => {
                              const count = formulas.filter(f => f.source === book).length;
                              return (
                                  <div key={book} className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/60 shadow-sm hover:scale-105 transition duration-300 flex flex-col items-center justify-center text-center group">
                                      <div className="text-3xl mb-2 group-hover:scale-110 transition">📚</div>
                                      <div className="font-bold text-slate-700 mb-1">{book}</div>
                                      <div className="text-xs text-amber-600 font-bold bg-amber-100/50 px-2 py-1 rounded-full">{count} 首方剂</div>
                                  </div>
                              )
                          })}
                      </div>
                  </div>
              )}

           </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
