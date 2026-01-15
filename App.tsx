import React, { useState, useEffect, useRef } from 'react';
import { analyzePaperWithGemini, analyzeTrendsWithGemini, checkPaperTimeliness, checkAuthorIntegrity } from './services/geminiService';
import { AnalysisResult, LoadingState, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport } from './types';
import AnalysisDisplay from './components/AnalysisDisplay';
import LoadingView from './components/LoadingView';
import ChatInterface from './components/ChatInterface';

const HISTORY_KEY = 'paper_insight_history_v1';
const DELETED_HISTORY_KEY = 'paper_insight_deleted_history_v1';

// Robust Markdown Renderer for Trend Report
const TrendReportDisplay: React.FC<{ content: string }> = ({ content }) => {
  const parseInline = (text: string) => {
    // Regex splits: Links [label](url), Bold **text**
    const parts = text.split(/(\[.*?\]\(.*?\))|(\*\*.*?\*\*)/g).filter(p => p !== undefined && p !== "");
    
    return parts.map((part, i) => {
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium break-all">
            {linkMatch[1]}
          </a>
        );
      }
      const boldMatch = part.match(/^\*\*(.*?)\*\*$/);
      if (boldMatch) {
        return <strong key={i} className="font-bold text-slate-900">{boldMatch[1]}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let isOrdered = false;

  const flushList = () => {
    if (listItems.length > 0) {
      const Wrapper = isOrdered ? 'ol' : 'ul';
      const styleClass = isOrdered ? 'list-decimal' : 'list-disc';
      nodes.push(
        <Wrapper key={`list-${nodes.length}`} className={`${styleClass} pl-6 mb-4 text-slate-700 space-y-2 marker:text-blue-500`}>
          {listItems}
        </Wrapper>
      );
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      nodes.push(<h1 key={index} className="text-3xl font-extrabold text-slate-900 mt-8 mb-6 pb-2 border-b border-slate-200">{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      nodes.push(<h2 key={index} className="text-2xl font-bold text-slate-800 mt-8 mb-4">{trimmed.slice(3)}</h2>);
    } else if (trimmed.startsWith('### ')) {
      flushList();
      nodes.push(<h3 key={index} className="text-lg font-bold text-slate-700 mt-6 mb-3">{trimmed.slice(4)}</h3>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      isOrdered = false;
      listItems.push(<li key={index} className="pl-1 leading-relaxed">{parseInline(trimmed.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      isOrdered = true;
      listItems.push(<li key={index} className="pl-1 leading-relaxed">{parseInline(trimmed.replace(/^\d+\.\s/, ''))}</li>);
    } else {
      flushList();
      nodes.push(<p key={index} className="mb-4 text-slate-700 leading-relaxed">{parseInline(trimmed)}</p>);
    }
  });
  
  flushList();

  return <div className="p-2 animate-fade-in">{nodes}</div>;
};

// --- New Widgets ---

const TimelinessWidget: React.FC<{ report: TimelinessReport }> = ({ report }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-8">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${report.isOutdated ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                        <i className={`fas ${report.isOutdated ? 'fa-clock-rotate-left' : 'fa-check-circle'}`}></i>
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm">Timeliness Check</h3>
                        <p className="text-xs text-slate-500">Status: {report.status}</p>
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            
            {isOpen && (
                <div className="p-5 border-t border-slate-100 bg-white animate-fade-in">
                    <p className="text-slate-700 text-sm mb-4 leading-relaxed">{report.summary}</p>
                    
                    {report.recommendations && report.recommendations.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Recommended Updates</h4>
                            {report.recommendations.map((rec, i) => (
                                <div key={i} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                    <div className="flex justify-between items-start mb-1">
                                        <a href={rec.link} target="_blank" rel="noopener" className="font-medium text-blue-700 text-sm hover:underline flex-1">
                                            {rec.title}
                                        </a>
                                        <span className="text-xs bg-white px-2 py-0.5 rounded border border-blue-100 text-slate-500">{rec.year}</span>
                                    </div>
                                    <p className="text-xs text-slate-600">{rec.reason}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const IntegrityWidget: React.FC<{ report: IntegrityReport }> = ({ report }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
             <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${report.hasIssues ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                        <i className={`fas ${report.hasIssues ? 'fa-triangle-exclamation' : 'fa-shield-halved'}`}></i>
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm">Author & Institution Integrity</h3>
                        <p className="text-xs text-slate-500">{report.hasIssues ? "Potential issues detected" : "No flagged records"}</p>
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            
            {isOpen && (
                <div className="p-5 border-t border-slate-100 bg-white animate-fade-in">
                    <p className="text-slate-700 text-sm leading-relaxed">
                        {report.summary}
                    </p>
                    <div className="mt-3 text-[10px] text-slate-400 italic">
                        * Automated check based on public search records. Verify independently.
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Main App ---

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // History Management State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deletedHistory, setDeletedHistory] = useState<HistoryItem[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [currentPaperTitle, setCurrentPaperTitle] = useState<string | null>(null);
  
  // Delete Modal & Recycle Bin State
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'all', id?: string } | null>(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  // Trend Analysis State
  const [isTrendModalOpen, setIsTrendModalOpen] = useState(false);
  const [trendReport, setTrendReport] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Secondary Analysis States
  const [timelinessReport, setTimelinessReport] = useState<TimelinessReport | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  
  // Abort Controller Ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
      const savedDeleted = localStorage.getItem(DELETED_HISTORY_KEY);
      if (savedDeleted) {
        setDeletedHistory(JSON.parse(savedDeleted));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const saveHistoryState = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  const saveDeletedHistoryState = (newDeletedHistory: HistoryItem[]) => {
    setDeletedHistory(newDeletedHistory);
    localStorage.setItem(DELETED_HISTORY_KEY, JSON.stringify(newDeletedHistory));
  };

  // ... (Previous Delete/Recycle Bin functions remain same) ...
  const requestDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({ type: 'single', id });
  };
  
  const requestClearAllHistory = (e?: React.MouseEvent) => {
      if (e) {
          e.stopPropagation();
          e.preventDefault();
      }
      setDeleteTarget({ type: 'all' });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'all') {
        const timestamp = Date.now();
        const itemsToRecycle = history.map(h => ({ ...h, deletedAt: timestamp })); 
        const newDeleted = [...itemsToRecycle, ...deletedHistory];
        saveDeletedHistoryState(newDeleted);

        saveHistoryState([]);
        setResult(null);
        setChatMessages([]);
        setCurrentPaperTitle(null);
        setCurrentHistoryId(null);
        setTimelinessReport(null);
        setIntegrityReport(null);
        setLoadingState(LoadingState.IDLE);
    } else if (deleteTarget.type === 'single' && deleteTarget.id) {
        const id = deleteTarget.id;
        const itemToDelete = history.find(item => item.id === id);
        
        if (itemToDelete) {
             const newDeleted = [itemToDelete, ...deletedHistory];
             saveDeletedHistoryState(newDeleted);
             const newHistory = history.filter((item: HistoryItem) => String(item.id) !== String(id));
             saveHistoryState(newHistory);
        }

        if (currentHistoryId === id) {
          setResult(null);
          setChatMessages([]);
          setCurrentPaperTitle(null);
          setCurrentHistoryId(null);
          setTimelinessReport(null);
          setIntegrityReport(null);
          setLoadingState(LoadingState.IDLE);
        }
    }

    setDeleteTarget(null);
  };

  // Recycle Bin Actions
  const handleRestoreItem = (id: string) => {
      const itemToRestore = deletedHistory.find(item => item.id === id);
      if (!itemToRestore) return;

      const newHistory = [itemToRestore, ...history];
      saveHistoryState(newHistory);

      const newDeleted = deletedHistory.filter(item => item.id !== id);
      saveDeletedHistoryState(newDeleted);
  };

  const handlePermanentDelete = (id: string) => {
      if (!window.confirm("Permanently delete this item? This cannot be undone.")) return;
      const newDeleted = deletedHistory.filter(item => item.id !== id);
      saveDeletedHistoryState(newDeleted);
  };

  const handleEmptyRecycleBin = () => {
      if (!window.confirm("Permanently delete all items in Recycle Bin?")) return;
      saveDeletedHistoryState([]);
  };

  const clearCurrentChat = () => {
    if (!window.confirm("Are you sure you want to clear the discussion history for this paper?")) return;
    
    setChatMessages([]);
    
    if (currentHistoryId) {
      const newHistory = history.map(item => {
        if (item.id === currentHistoryId) {
          return { ...item, chatMessages: [] };
        }
        return item;
      });
      saveHistoryState(newHistory);
    }
  };

  const restoreHistoryItem = (item: HistoryItem) => {
    setLoadingState(LoadingState.COMPLETED);
    setResult(item.analysis);
    setChatMessages(item.chatMessages);
    setCurrentPaperTitle(item.title);
    setCurrentHistoryId(item.id);
    setTimelinessReport(null); // Simple restore doesn't re-run checks
    setIntegrityReport(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Main Logic Update ---

  const abortAnalysis = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setLoadingState(LoadingState.IDLE);
    }
  };

  const runSecondaryChecks = async (markdown: string) => {
      // Extract metadata via regex
      const titleMatch = markdown.match(/^标题:\s*(.+)$/m) || markdown.match(/\*\*标题\*\*:\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : "Unknown Paper";
      
      const authorMatch = markdown.match(/^作者:\s*(.+)$/m) || markdown.match(/\*\*作者\*\*:\s*(.+)/);
      const authors = authorMatch ? authorMatch[1].trim() : "";
      
      const yearMatch = markdown.match(/^发表年份.*:\s*(.+)$/m);
      const year = yearMatch ? yearMatch[1].trim() : "";

      // Run parallel checks
      const [tReport, iReport] = await Promise.all([
         checkPaperTimeliness(title, `${authors} ${year}`),
         checkAuthorIntegrity(authors)
      ]);

      setTimelinessReport(tReport);
      setIntegrityReport(iReport);
  };

  const performAnalysis = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Abort previous if any
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingState(LoadingState.ANALYZING);
    setError(null);
    setResult(null);
    setTimelinessReport(null);
    setIntegrityReport(null);
    setCopied(false);
    setChatMessages([]);
    setCurrentPaperTitle(null);
    setCurrentHistoryId(null);

    try {
      const data = await analyzePaperWithGemini(searchQuery, controller.signal);
      
      const titleMatch = data.markdown.match(/^标题:\s*(.+)$/m) || data.markdown.match(/\*\*标题\*\*:\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : searchQuery;
      const cleanTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s\-:(),.]/g, '').trim();
      const finalTitle = cleanTitle || "Untitled Analysis";

      const newId = Date.now().toString();
      const newItem: HistoryItem = {
        id: newId,
        title: finalTitle,
        timestamp: Date.now(),
        analysis: data,
        chatMessages: []
      };

      const newHistory = [newItem, ...history.filter(h => h.title !== finalTitle)];
      saveHistoryState(newHistory);

      setResult(data);
      setCurrentPaperTitle(finalTitle);
      setCurrentHistoryId(newId);
      setLoadingState(LoadingState.COMPLETED);
      
      // Run sub-agents after main success
      runSecondaryChecks(data.markdown);

    } catch (err: any) {
      if (err.message?.includes("Aborted") || err.message?.includes("stopped by the user")) {
          // Handled by abort action usually, but ensure state is correct
          setLoadingState(LoadingState.IDLE);
          return;
      }
      console.error(err);
      setError("Failed to analyze the paper. Please try a different query or check your API key.");
      setLoadingState(LoadingState.ERROR);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performAnalysis(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setTimeout(() => {
        performAnalysis(suggestion);
    }, 0);
  };

  const handleChatUpdate = (newMessages: ChatMessage[]) => {
    setChatMessages(newMessages);
    if (currentHistoryId) {
      const newHistory = history.map(item => {
        if (item.id === currentHistoryId) {
          return { ...item, chatMessages: newMessages };
        }
        return item;
      });
      saveHistoryState(newHistory);
    }
  };

  const handleCopy = () => {
    if (result?.markdown) {
      navigator.clipboard.writeText(result.markdown).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };
  
  const handleCopyReport = () => {
    if (trendReport) {
      navigator.clipboard.writeText(trendReport).then(() => {
        setReportCopied(true);
        setTimeout(() => setReportCopied(false), 2000);
      });
    }
  };

  const handlePrint = () => {
     const element = document.getElementById('analysis-content');
     const opt = {
       margin:       0.5,
       filename:     `PaperInsight_Analysis_${currentPaperTitle || 'Report'}.pdf`,
       image:        { type: 'jpeg', quality: 0.98 },
       html2canvas:  { scale: 2 },
       jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
       pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
     };

     if ((window as any).html2pdf && element) {
         (window as any).html2pdf().set(opt).from(element).save();
     } else {
         window.print();
     }
  };

  const handleTrendAnalysis = async () => {
    if (history.length === 0) return;
    
    setIsTrendModalOpen(true);
    setTrendLoading(true);
    setTrendReport(null);

    try {
      const report = await analyzeTrendsWithGemini(history);
      setTrendReport(report);
    } catch (e) {
      setTrendReport("Failed to generate trend report. Please try again.");
    } finally {
      setTrendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
            setLoadingState(LoadingState.IDLE);
            setResult(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <i className="fas fa-microscope"></i>
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">
              PaperInsight <span className="text-blue-600 font-medium">AI</span>
            </h1>
          </div>
          <a href="https://github.com/YourUsername/PaperInsight-AI" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600 transition-colors">
            <i className="fab fa-github text-xl"></i>
          </a>
        </div>
      </header>

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-8 relative">
        
        {/* Search Hero Section */}
        <section className={`transition-all duration-500 ease-in-out ${result || loadingState !== LoadingState.IDLE ? 'mb-8' : 'mt-16 mb-12 text-center'}`}>
          
          {!result && loadingState === LoadingState.IDLE && (
            <div className="mb-8 space-y-4 animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Deep Research, <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Simplified.
                </span>
              </h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                Enter a paper title, topic, or arXiv link. Our AI will retrieve the full context, analyze the methodology, and critique the findings.
              </p>
            </div>
          )}

          <form onSubmit={handleSearch} className={`relative max-w-2xl mx-auto w-full transition-all duration-300 ${loadingState === LoadingState.ANALYZING ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-search text-slate-400 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., Attention Is All You Need, or 'Gemini 1.5 Pro technical report'"
                className="w-full pl-11 pr-14 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md focus:shadow-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-lg"
              />
              <button 
                type="submit"
                className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl transition-colors font-medium flex items-center justify-center disabled:opacity-50"
                disabled={!query.trim()}
              >
                Analyze
              </button>
            </div>
          </form>

          {/* Recent History / Suggestions Logic ... (Kept same as before) */}
          {!result && loadingState === LoadingState.IDLE && history.length > 0 && (
             <div className="mt-12 max-w-2xl mx-auto animate-fade-in-up">
               <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Research</h3>
                  <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsRecycleBinOpen(true)}
                        className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                    >
                        <i className="fas fa-trash-restore"></i> Recycle Bin
                    </button>
                    <button 
                        onClick={handleTrendAnalysis}
                        className="text-sm text-blue-600 font-medium hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                        <i className="fas fa-chart-line"></i> Analyze Trends
                    </button>
                  </div>
               </div>
               <div className="space-y-3">
                 {history.slice(0, 3).map(item => (
                   <div 
                      key={item.id}
                      onClick={() => restoreHistoryItem(item)}
                      className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer text-left"
                   >
                     <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex-shrink-0 flex items-center justify-center">
                          <i className="fas fa-file-alt"></i>
                        </div>
                        <div className="min-w-0">
                           <h4 className="font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">{item.title}</h4>
                           <p className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-2 pl-4 flex-none">
                        <button
                          type="button"
                          onClick={(e) => requestDeleteHistoryItem(e, item.id)}
                          className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100 relative z-20"
                        >
                           <i className="fas fa-trash-alt"></i>
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {!result && loadingState === LoadingState.IDLE && history.length === 0 && (
            <div className="mt-8 animate-fade-in-up">
              <div className="flex flex-wrap justify-center gap-3">
                <span className="text-sm text-slate-400 py-1">Try asking:</span>
                {[
                  "Attention Is All You Need",
                  "Deep Residual Learning for Image Recognition",
                  "LoRA: Low-Rank Adaptation of LLMs"
                ].map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                  <button 
                      onClick={() => setIsRecycleBinOpen(true)}
                      className={`text-slate-400 hover:text-slate-600 text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors ${deletedHistory.length === 0 ? 'opacity-60' : ''}`}
                  >
                      <i className="fas fa-trash-restore"></i>
                      <span>Recycle Bin ({deletedHistory.length})</span>
                  </button>
              </div>
            </div>
          )}
        </section>

        {/* Content Area */}
        <div className="min-h-[400px]">
          {loadingState === LoadingState.ANALYZING && <LoadingView onCancel={abortAnalysis} />}

          {loadingState === LoadingState.ERROR && (
             <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 max-w-2xl mx-auto animate-fade-in">
                <i className="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p>{error}</p>
                <button onClick={() => setLoadingState(LoadingState.IDLE)} className="mt-4 text-sm underline hover:text-red-900">Try again</button>
             </div>
          )}

          {result && loadingState === LoadingState.COMPLETED && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in pb-24">
                
                {/* Main Analysis Column */}
                <div className="lg:col-span-8 space-y-8">
                  <div id="analysis-content">
                    <AnalysisDisplay content={result.markdown} />
                    
                    {/* NEW: Secondary Analysis Widgets */}
                    <div className="print:hidden">
                        {timelinessReport && <TimelinessWidget report={timelinessReport} />}
                        {integrityReport && <IntegrityWidget report={integrityReport} />}
                    </div>

                    {/* Discussion History */}
                    {chatMessages.length > 0 && (
                      <div className="mt-12 border-t-2 border-slate-100 pt-8">
                         <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                   <i className="fas fa-comments"></i>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Discussion History</h3>
                            </div>
                            <button 
                                onClick={clearCurrentChat}
                                className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-2 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                            >
                                <i className="fas fa-trash-alt"></i> Clear Discussion
                            </button>
                         </div>
                         <div className="space-y-6">
                            {chatMessages.map((msg, i) => (
                               <div key={i} className={`p-5 rounded-xl ${msg.role === 'user' ? 'bg-blue-50/50 border border-blue-100' : 'bg-white border border-slate-200'}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                     <span className={`text-xs font-bold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-600' : 'text-slate-500'}`}>
                                       {msg.role === 'user' ? 'Question' : 'Answer'}
                                     </span>
                                     <span className="text-xs text-slate-300">•</span>
                                     <span className="text-xs text-slate-400">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                     {msg.content.replace(/\*\*/g, '')}
                                  </div>
                               </div>
                            ))}
                         </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sidebar / Metadata Column */}
                <div className="lg:col-span-4 space-y-6">
                  {/* ... (Keep Sidebar widgets as is) ... */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 max-h-[500px] overflow-y-auto relative">
                    <div className="sticky top-0 bg-white z-10 pb-2 border-b border-slate-100 mb-3 space-y-2">
                       <div className="flex items-center justify-between">
                         <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                           <i className="fas fa-history"></i> Research History
                         </h3>
                         <div className="flex items-center gap-2">
                            <button 
                                type="button" 
                                onClick={() => setIsRecycleBinOpen(true)}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                title="Open Recycle Bin"
                            >
                                <i className="fas fa-trash-restore"></i>
                            </button>
                            {history.length > 0 && (
                                <button 
                                    type="button"
                                    onClick={(e) => requestClearAllHistory(e)}
                                    className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-slate-100 cursor-pointer"
                                    title="Clear all history"
                                >
                                    <i className="fas fa-trash"></i> Clear All
                                </button>
                            )}
                         </div>
                       </div>
                       
                       <button 
                         onClick={handleTrendAnalysis}
                         disabled={history.length === 0}
                         className={`w-full text-xs py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                           history.length > 0 
                             ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' 
                             : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                         }`}
                       >
                         <i className="fas fa-chart-line"></i> Synthesize Trends
                       </button>
                    </div>

                    <div className="space-y-2">
                       {history.length === 0 ? (
                          <p className="text-sm text-slate-400 italic py-4 text-center">No history yet.</p>
                       ) : (
                          history.map(item => (
                             <div 
                               key={item.id} 
                               className={`group flex items-center justify-between rounded-lg border transition-all overflow-hidden ${currentHistoryId === item.id ? 'bg-blue-50 border-blue-200 shadow-inner' : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50'}`}
                             >
                                <div 
                                    onClick={() => restoreHistoryItem(item)}
                                    className="flex-1 min-w-0 p-3 cursor-pointer"
                                >
                                   <div className={`text-sm font-medium truncate ${currentHistoryId === item.id ? 'text-blue-800' : 'text-slate-700'}`}>
                                      {item.title}
                                   </div>
                                   <div className="text-xs text-slate-400 mt-1">
                                      {new Date(item.timestamp).toLocaleDateString()} • {item.chatMessages.length} msgs
                                   </div>
                                </div>
                                <div className="flex-none pr-2">
                                    <button 
                                      type="button"
                                      onClick={(e) => requestDeleteHistoryItem(e, item.id)}
                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-100 rounded-lg transition-all"
                                    >
                                       <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                             </div>
                          ))
                       )}
                    </div>
                  </div>

                  {/* Sources Widget */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sticky top-24">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                      <i className="fas fa-globe"></i> Grounded Sources
                    </h3>
                    
                    {result.groundingChunks && result.groundingChunks.length > 0 ? (
                      <ul className="space-y-3">
                        {result.groundingChunks.map((chunk, idx) => chunk.web && (
                          <li key={idx}>
                            <a 
                              href={chunk.web.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="group block p-3 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all"
                            >
                              <div className="text-sm font-medium text-slate-800 group-hover:text-blue-700 line-clamp-2">
                                {chunk.web.title}
                              </div>
                              <div className="text-xs text-slate-400 mt-1 truncate group-hover:text-blue-400">
                                {new URL(chunk.web.uri).hostname}
                              </div>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                       <div className="text-sm text-slate-500 italic">
                          No specific web citations returned.
                       </div>
                    )}
                    
                    <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                      <button 
                        onClick={handleCopy}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          copied 
                            ? 'bg-green-50 border-green-200 text-green-700' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200'
                        }`}
                      >
                        <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                        {copied ? 'Copied to Clipboard' : 'Copy Analysis'}
                      </button>
                      <button 
                        onClick={handlePrint}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <i className="fas fa-download"></i> Export PDF
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Floating Chat Interface */}
              <ChatInterface 
                originalAnalysis={result.markdown} 
                messages={chatMessages}
                onMessagesChange={handleChatUpdate}
              />
            </>
          )}
        </div>
      </main>

      {/* Delete Modal & Recycle Bin Modal (Kept same as before) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                    <i className="fas fa-exclamation-triangle text-xl"></i>
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-900">Confirm Deletion</h3>
                    <p className="text-sm text-slate-500">Items will be moved to Recycle Bin.</p>
                 </div>
              </div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                 {deleteTarget.type === 'all' 
                    ? "Are you sure you want to delete ALL research history?" 
                    : "Are you sure you want to delete this analysis?"}
              </p>
              <div className="flex items-center justify-end gap-3">
                 <button 
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                 >
                    Delete
                 </button>
              </div>
           </div>
        </div>
      )}

      {isRecycleBinOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
               <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                        <i className="fas fa-trash-restore text-lg"></i>
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-slate-800">Recycle Bin</h2>
                        <p className="text-xs text-slate-500">{deletedHistory.length} items</p>
                     </div>
                  </div>
                  <button 
                    onClick={() => setIsRecycleBinOpen(false)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <i className="fas fa-times text-lg"></i>
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                  {deletedHistory.length === 0 ? (
                      <div className="h-48 flex flex-col items-center justify-center text-slate-400">
                          <i className="fas fa-trash-alt text-4xl mb-3 opacity-50"></i>
                          <p>Recycle Bin is empty</p>
                      </div>
                  ) : (
                      <div className="space-y-3">
                          {deletedHistory.map(item => (
                             <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4 shadow-sm">
                                <div className="min-w-0">
                                   <h4 className="font-medium text-slate-800 truncate">{item.title}</h4>
                                   <p className="text-xs text-slate-400">Original Date: {new Date(item.timestamp).toLocaleDateString()}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                   <button 
                                      onClick={() => handleRestoreItem(item.id)}
                                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium border border-transparent hover:border-green-200"
                                   >
                                      <i className="fas fa-trash-arrow-up"></i> Restore
                                   </button>
                                   <button 
                                      onClick={() => handlePermanentDelete(item.id)}
                                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium border border-transparent hover:border-red-200"
                                   >
                                      <i className="fas fa-times"></i> Delete
                                   </button>
                                </div>
                             </div>
                          ))}
                      </div>
                  )}
               </div>
               <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center">
                  <button 
                     onClick={handleEmptyRecycleBin}
                     disabled={deletedHistory.length === 0}
                     className="px-4 py-2 text-red-600 text-sm font-medium hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     Empty Recycle Bin
                  </button>
                  <button 
                     onClick={() => setIsRecycleBinOpen(false)}
                     className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                  >
                     Close
                  </button>
               </div>
           </div>
        </div>
      )}

      {/* Trend Report Modal (Kept same as before) */}
      {isTrendModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                   <i className="fas fa-chart-line text-lg"></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Field Evolution & Trend Report</h2>
                  <p className="text-xs text-slate-500">Synthesized from {history.length} researched papers</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyReport}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    reportCopied
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600'
                  }`}
                >
                  <i className={`fas ${reportCopied ? 'fa-check' : 'fa-code'} mr-1`}></i>
                  {reportCopied ? 'Copied' : 'Copy MD'}
                </button>
                <button 
                  onClick={() => setIsTrendModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
               {trendLoading ? (
                 <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-medium animate-pulse">Synthesizing insights across time...</p>
                 </div>
               ) : trendReport ? (
                 <div className="prose prose-slate max-w-none">
                    <TrendReportDisplay content={trendReport} />
                 </div>
               ) : (
                 <div className="text-center text-slate-500 py-12">Failed to load report.</div>
               )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
               <button 
                 onClick={() => {
                    const blob = new Blob([trendReport || ""], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Trend_Analysis_Report_${new Date().toISOString().split('T')[0]}.md`;
                    a.click();
                 }}
                 disabled={!trendReport}
                 className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors mr-2 disabled:opacity-50"
               >
                 <i className="fas fa-download mr-2"></i> Download MD
               </button>
               <button 
                 onClick={() => setIsTrendModalOpen(false)}
                 className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center">
            <p className="text-slate-400 text-sm">
              Powered by Google Gemini 2.0 Flash & Search Grounding
            </p>
        </div>
      </footer>
    </div>
  );
};

export default App;