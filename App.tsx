import React, { useState, useEffect, useRef, useMemo } from 'react';
import { analyzePaperWithGemini, analyzeTrendsWithGemini, checkPaperTimeliness, checkAuthorIntegrity, checkVenueQuality } from './services/geminiService';
import { AnalysisResult, LoadingState, ChatMessage, HistoryItem, TimelinessReport, IntegrityReport, VenueReport } from './types';
import AnalysisDisplay from './components/AnalysisDisplay';
import LoadingView from './components/LoadingView';
import ChatInterface from './components/ChatInterface';
import MarkdownRenderer from './components/MarkdownRenderer';

const HISTORY_KEY = 'paper_insight_history_v1';
const DELETED_HISTORY_KEY = 'paper_insight_deleted_history_v1';

// --- Components ---

// Progress Bar Component
const ProgressBar: React.FC<{ current: number; total: number; isProcessing: boolean }> = ({ current, total, isProcessing }) => {
    if (total === 0) return null;
    const percent = Math.min(100, Math.round((current / total) * 100));
    
    return (
        <div className="fixed top-0 left-0 w-full z-[100] bg-blue-50 border-b border-blue-100 shadow-sm print:hidden">
            <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-800 whitespace-nowrap">
                    {isProcessing ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                    <span>Batch Analysis: {current} / {total}</span>
                </div>
                <div className="flex-1 h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-blue-600 transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${percent}%` }}
                    ></div>
                </div>
                <span className="text-xs font-bold text-blue-700">{percent}%</span>
            </div>
        </div>
    );
};

// Toast Notification Component
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600'
  };

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };

  return (
    <div className={`${bgColors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in-up min-w-[300px] max-w-md pointer-events-auto print:hidden`}>
      <i className={`fas ${icons[type]}`}></i>
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white">
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

// Robust Markdown Renderer for Trend Report
const TrendReportDisplay: React.FC<{ content: string }> = ({ content }) => {
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
      listItems.push(<li key={index} className="pl-1 leading-relaxed"><MarkdownRenderer content={trimmed.slice(2)} /></li>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      isOrdered = true;
      listItems.push(<li key={index} className="pl-1 leading-relaxed"><MarkdownRenderer content={trimmed.replace(/^\d+\.\s/, '')} /></li>);
    } else {
      flushList();
      nodes.push(<div key={index} className="mb-4 text-slate-700 leading-relaxed"><MarkdownRenderer content={trimmed} /></div>);
    }
  });
  
  flushList();

  return <div className="p-2 animate-fade-in">{nodes}</div>;
};

// --- New Widgets ---

const LoadingSkeletonContent = () => (
    <div className="animate-pulse space-y-3 pt-2">
        <div className="h-2 bg-slate-100 rounded w-full"></div>
        <div className="h-2 bg-slate-100 rounded w-5/6"></div>
        <div className="h-2 bg-slate-100 rounded w-4/6"></div>
    </div>
);

const TimelinessWidget: React.FC<{ report: TimelinessReport | null, onAnalyze: () => void }> = ({ report, onAnalyze }) => {
    const [isOpen, setIsOpen] = useState(false); // Default to false (collapsed)
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Stop analyzing state when report arrives
    useEffect(() => {
        if (report) setIsAnalyzing(false);
    }, [report]);

    const handleExpand = () => {
        // If opening and no report and not currently analyzing, trigger analysis
        if (!isOpen && !report && !isAnalyzing) {
            setIsAnalyzing(true);
            onAnalyze();
        }
        setIsOpen(!isOpen);
    };

    const isLoading = isAnalyzing && !report;
    const isOutdated = report?.isOutdated;
    
    // Status Logic
    let status = "Not Checked";
    if (isLoading) status = "Analyzing...";
    else if (report) status = report.status || "Analyzed";

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-8 animate-fade-in print:break-inside-avoid">
            <button 
                onClick={handleExpand}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors print:hidden"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isLoading ? 'bg-slate-200 text-slate-400' : (report ? (isOutdated ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600') : 'bg-slate-200 text-slate-400')}`}>
                         {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className={`fas ${report ? (isOutdated ? 'fa-clock-rotate-left' : 'fa-check-circle') : 'fa-clock'}`}></i>}
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm">Timeliness Check</h3>
                        <p className="text-xs text-slate-500">Status: {status}</p>
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            
            {/* Print Header replacement */}
             <div className="hidden print:block p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">Timeliness Check ({status})</h3>
            </div>
            
            {isOpen && (
                <div className="p-5 border-t border-slate-100 bg-white animate-fade-in">
                    {isLoading ? (
                        <LoadingSkeletonContent />
                    ) : !report ? (
                        <div className="text-center py-2 text-sm text-slate-500">
                            Waiting for analysis...
                        </div>
                    ) : (
                        <>
                            <p className="text-slate-700 text-sm mb-4 leading-relaxed">{report?.summary}</p>
                            
                            {report?.recommendations && report.recommendations.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Recommended Updates</h4>
                                    {report.recommendations.map((rec, i) => (
                                        <div key={i} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                            <div className="flex justify-between items-start mb-1">
                                                {rec.link ? (
                                                    <a href={rec.link} target="_blank" rel="noopener" className="font-medium text-blue-700 text-sm hover:underline flex-1">
                                                        {rec.title}
                                                    </a>
                                                ) : (
                                                    <span className="font-medium text-slate-800 text-sm flex-1">{rec.title}</span>
                                                )}
                                                <span className="text-xs bg-white px-2 py-0.5 rounded border border-blue-100 text-slate-500">{rec.year}</span>
                                            </div>
                                            <p className="text-xs text-slate-600">{rec.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const VenueWidget: React.FC<{ report: VenueReport | null; onAnalyze: () => void }> = ({ report, onAnalyze }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleExpand = () => {
        if (!isOpen && !report && !isAnalyzing) {
             // If user opens and no report exists, don't analyze automatically, 
             // just open the "Click to Analyze" view
        }
        setIsOpen(!isOpen);
    };

    const handleTriggerAnalysis = () => {
        setIsAnalyzing(true);
        onAnalyze();
    };

    // Reset local loading if report arrives
    useEffect(() => {
        if (report) setIsAnalyzing(false);
    }, [report]);

    const isLoading = isAnalyzing;
    const quality = report?.quality || (isLoading ? 'Analyzing...' : 'Not Analyzed');

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4 animate-fade-in print:break-inside-avoid">
             <button 
                onClick={handleExpand}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors print:hidden"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isLoading ? 'bg-slate-200 text-slate-400' : (report ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-400')}`}>
                        {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-landmark"></i>}
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm">Venue Reputation & Quality</h3>
                        <p className="text-xs text-slate-500">{quality}</p>
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {/* Print Header */}
             <div className="hidden print:block p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">Venue Quality ({quality})</h3>
            </div>
            
            {(isOpen || (report && typeof window !== 'undefined' && window.matchMedia('print').matches)) && (
                <div className="p-5 border-t border-slate-100 bg-white animate-fade-in">
                     {!report && !isLoading ? (
                         <div className="flex flex-col items-center justify-center py-4 space-y-3 print:hidden">
                             <p className="text-sm text-slate-500 text-center">Analyze the academic reputation and tier of the publication venue.</p>
                             <button 
                                onClick={handleTriggerAnalysis}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                             >
                                <i className="fas fa-wand-magic-sparkles"></i> Analyze Venue
                             </button>
                         </div>
                     ) : isLoading ? (
                         <LoadingSkeletonContent />
                     ) : (
                         <>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-slate-800">{report?.name}</span>
                                <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded border border-purple-100 uppercase tracking-wide">
                                    {report?.type}
                                </span>
                            </div>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                {report?.summary}
                            </p>
                         </>
                     )}
                </div>
            )}
        </div>
    );
};

const IntegrityWidget: React.FC<{ report: IntegrityReport | null; onAnalyze: () => void }> = ({ report, onAnalyze }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleExpand = () => {
        setIsOpen(!isOpen);
    };

    const handleTriggerAnalysis = () => {
        setIsAnalyzing(true);
        onAnalyze();
    };

    useEffect(() => {
        if (report) setIsAnalyzing(false);
    }, [report]);

    const isLoading = isAnalyzing;
    const hasIssues = report?.hasIssues;
    const statusText = isLoading ? "Checking..." : (report ? (hasIssues ? "Potential issues detected" : "No flagged records") : "Not Checked");

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4 animate-fade-in print:break-inside-avoid">
             <button 
                onClick={handleExpand}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors print:hidden"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isLoading ? 'bg-slate-200 text-slate-400' : (report ? (hasIssues ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600') : 'bg-slate-200 text-slate-400')}`}>
                        {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className={`fas ${hasIssues ? 'fa-triangle-exclamation' : 'fa-shield-halved'}`}></i>}
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-slate-800 text-sm">Author & Institution Integrity</h3>
                        <p className="text-xs text-slate-500">{statusText}</p>
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>
            
            {/* Print Header */}
             <div className="hidden print:block p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">Integrity Check ({statusText})</h3>
            </div>
            
            {(isOpen || (report && typeof window !== 'undefined' && window.matchMedia('print').matches)) && (
                <div className="p-5 border-t border-slate-100 bg-white animate-fade-in">
                    {!report && !isLoading ? (
                        <div className="flex flex-col items-center justify-center py-4 space-y-3 print:hidden">
                             <p className="text-sm text-slate-500 text-center">Perform a background check for retractions or academic misconduct.</p>
                             <button 
                                onClick={handleTriggerAnalysis}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                             >
                                <i className="fas fa-shield-alt"></i> Run Integrity Check
                             </button>
                         </div>
                    ) : isLoading ? (
                        <LoadingSkeletonContent />
                    ) : (
                        <>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                {report?.summary}
                            </p>
                            <div className="mt-3 text-[10px] text-slate-400 italic">
                                * Automated check based on public search records. Verify independently.
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Main App ---

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<'home' | 'trends'>('home');

  const [query, setQuery] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQueries, setBatchQueries] = useState<string[]>(['', '', '']);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // Search Grounding Toggle
  const [useSearchGrounding, setUseSearchGrounding] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Result and Error are now derived from the currently selected history item
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // History Management State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deletedHistory, setDeletedHistory] = useState<HistoryItem[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  
  // Queue Management
  const [executionQueue, setExecutionQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number}>({current: 0, total: 0});

  // Delete Modal & Recycle Bin State
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'all', id?: string, mode: 'soft' | 'hard' } | null>(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  
  // Import Modal State
  const [importPendingData, setImportPendingData] = useState<{ history: HistoryItem[], deletedHistory: HistoryItem[] } | null>(null);

  // Clear Chat Modal State
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  // Trend Analysis State
  const [trendReport, setTrendReport] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Abort Controllers for multiple tasks
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null); // New ref for PDF upload

  // Derived State for Current View
  const currentItem = useMemo(() => history.find(h => h.id === currentHistoryId), [history, currentHistoryId]);
  const result = currentItem?.analysis || null;
  const isCurrentItemAnalyzing = currentItem?.status === 'analyzing' || currentItem?.status === 'queued';
  const currentError = currentItem?.status === 'error' ? currentItem.error : null;

  // Sync secondary reports locally for display if they exist in history item
  const timelinessReport = currentItem?.timelinessReport || null;
  const venueReport = currentItem?.venueReport || null;
  const integrityReport = currentItem?.integrityReport || null;

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        // Migration: ensure items have status
        const parsed = JSON.parse(saved).map((item: any) => ({
            ...item,
            status: item.status || (item.analysis ? 'completed' : 'error')
        }));
        setHistory(parsed);
      }
      const savedDeleted = localStorage.getItem(DELETED_HISTORY_KEY);
      if (savedDeleted) {
        setDeletedHistory(JSON.parse(savedDeleted));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  // Update chat messages when switching history items
  useEffect(() => {
    if (currentItem) {
      setChatMessages(currentItem.chatMessages);
    } else {
      setChatMessages([]);
    }
  }, [currentItem]);

  // Queue Processing Effect
  useEffect(() => {
    const processNextInQueue = async () => {
        if (executionQueue.length > 0 && !isProcessingQueue) {
            setIsProcessingQueue(true);
            const nextId = executionQueue[0];
            const item = history.find(h => h.id === nextId);
            
            // Only process if valid
            if (item) {
                // Determine original query from placeholder title if possible, or use title
                const query = item.title.endsWith('...') ? item.title.slice(0, -3) : item.title;
                
                // Set visual status to analyzing
                setHistory(prev => prev.map(h => h.id === nextId ? { ...h, status: 'analyzing' } : h));
                
                if (!item.title.includes("(PDF Analysis)")) { 
                     await processPaperAnalysis(nextId, query, undefined, true);
                } else {
                    setHistory(prev => prev.map(h => h.id === nextId ? { ...h, status: 'error', error: 'Queue processing not supported for files on reload' } : h));
                }
                
                // Update Progress
                setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
            
            // Remove from queue and unlock for next iteration
            setExecutionQueue(prev => prev.slice(1));
            setIsProcessingQueue(false);
        } else if (executionQueue.length === 0 && batchProgress.total > 0 && batchProgress.current === batchProgress.total) {
            // Batch finished
             setTimeout(() => setBatchProgress({ current: 0, total: 0 }), 3000); // Clear after delay
        }
    };

    processNextInQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionQueue, isProcessingQueue]); // Only depend on queue state and processing flag

  const saveHistoryState = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  const saveDeletedHistoryState = (newDeletedHistory: HistoryItem[]) => {
    setDeletedHistory(newDeletedHistory);
    localStorage.setItem(DELETED_HISTORY_KEY, JSON.stringify(newDeletedHistory));
  };

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // --- Dynamic Suggestions Logic ---
  const suggestions = useMemo(() => {
    const gathered = new Set<string>();
    
    // 1. Prioritize recommendations from recent analysis history
    history.slice(0, 3).forEach(item => {
        if (item.timelinessReport?.recommendations) {
            item.timelinessReport.recommendations.forEach(rec => {
                if (rec.title && rec.title.length < 60) {
                    gathered.add(rec.title);
                }
            });
        }
    });

    // 2. Add defaults
    const defaults = [
        "Attention Is All You Need",
        "Deep Residual Learning for Image Recognition",
        "LoRA: Low-Rank Adaptation of LLMs"
    ];
    
    let combined = Array.from(gathered);
    if (combined.length < 3) {
        combined = [...combined, ...defaults];
    }
    
    return Array.from(new Set(combined)).slice(0, 5);
  }, [history]);

  // --- Import / Export Handlers ---
  const handleExportData = () => {
    const data = {
      version: '1.0',
      timestamp: Date.now(),
      history,
      deletedHistory
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PaperInsight_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
        console.log("Import: No file selected");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        // Basic validation
        if (!parsed.history || !Array.isArray(parsed.history)) {
          alert("Invalid backup file: Missing history data.");
          return;
        }

        setImportPendingData({ 
            history: parsed.history, 
            deletedHistory: parsed.deletedHistory || [] 
        });

      } catch (err) {
        console.error("Import: Error parsing JSON", err);
        alert("Failed to parse backup file.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!importPendingData) return;
    
    const { history: newHistoryRaw, deletedHistory: newDeletedRaw } = importPendingData;
    
    // Merge History (Deduplicate by ID)
    const existingIds = new Set(history.map(h => h.id));
    const newItems = newHistoryRaw.filter((h: HistoryItem) => !existingIds.has(h.id));
    const mergedHistory = [...newItems, ...history].sort((a, b) => b.timestamp - a.timestamp);

    // Merge Deleted (Deduplicate by ID)
    const existingDeletedIds = new Set(deletedHistory.map(h => h.id));
    const newDeletedItems = newDeletedRaw.filter((h: HistoryItem) => !existingDeletedIds.has(h.id));
    const mergedDeleted = [...newDeletedItems, ...deletedHistory].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    saveHistoryState(mergedHistory);
    saveDeletedHistoryState(mergedDeleted);
    
    setImportPendingData(null);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const requestDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({ type: 'single', id, mode: 'soft' });
  };
  
  const requestClearAllHistory = (e?: React.MouseEvent) => {
      if (e) {
          e.stopPropagation();
          e.preventDefault();
      }
      setDeleteTarget({ type: 'all', mode: 'soft' });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.mode === 'hard') {
        // Permanent Delete
        if (deleteTarget.type === 'all') {
            saveDeletedHistoryState([]);
        } else if (deleteTarget.type === 'single' && deleteTarget.id) {
             const newDeleted = deletedHistory.filter(item => item.id !== deleteTarget.id);
             saveDeletedHistoryState(newDeleted);
        }
    } else {
        // Soft Delete (Recycle)
        if (deleteTarget.type === 'all') {
            // Cancel any running analysis
            history.forEach(h => {
                if (h.status === 'analyzing' || h.status === 'queued') abortAnalysis(h.id);
            });
            // Clear queue
            setExecutionQueue([]);
            setBatchProgress({current: 0, total: 0});

            const timestamp = Date.now();
            const itemsToRecycle = history.map(h => ({ ...h, deletedAt: timestamp })); 
            const newDeleted = [...itemsToRecycle, ...deletedHistory];
            saveDeletedHistoryState(newDeleted);

            saveHistoryState([]);
            setCurrentHistoryId(null);
        } else if (deleteTarget.type === 'single' && deleteTarget.id) {
            const id = deleteTarget.id;
            
            // Abort if running
            abortAnalysis(id);
            // Remove from queue if present
            setExecutionQueue(prev => prev.filter(qid => qid !== id));
            
            const itemToDelete = history.find(item => item.id === id);
            
            if (itemToDelete) {
                 const newDeleted = [itemToDelete, ...deletedHistory];
                 saveDeletedHistoryState(newDeleted);
                 const newHistory = history.filter((item: HistoryItem) => String(item.id) !== String(id));
                 saveHistoryState(newHistory);
            }

            if (currentHistoryId === id) {
              setCurrentHistoryId(null);
            }
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

  const handlePermanentDelete = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeleteTarget({ type: 'single', id, mode: 'hard' });
  };

  const handleEmptyRecycleBin = (e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteTarget({ type: 'all', mode: 'hard' });
  };

  const handleClearChatRequest = () => {
    if (chatMessages.length > 0) {
        setIsClearChatModalOpen(true);
    }
  };

  const confirmClearChat = () => {
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
    setIsClearChatModalOpen(false);
  };

  const selectHistoryItem = (item: HistoryItem) => {
    setCurrentHistoryId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Main Logic Update ---

  const abortAnalysis = (id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
    }
    // Remove from execution queue if pending
    setExecutionQueue(prev => prev.filter(qid => qid !== id));

    // IMMEDIATE UI UPDATE: Set status to error/stopped so user sees feedback instantly
    setHistory(prev => prev.map(item => {
        if (item.id === id) { 
             return { ...item, status: 'error', error: 'Analysis stopped by user.' };
        }
        return item;
    }));
    addToast('Analysis stopped', 'info');
  };

  const handleManualTimelinessCheck = async () => {
    if (!result?.markdown || !currentHistoryId) return;
    
    // Extract metadata via regex
    const titleMatch = result.markdown.match(/^标题:\s*(.+)$/m) || result.markdown.match(/\*\*标题\*\*:\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown Paper";
    
    const authorMatch = result.markdown.match(/^作者:\s*(.+)$/m) || result.markdown.match(/\*\*作者\*\*:\s*(.+)/);
    const authors = authorMatch ? authorMatch[1].trim() : "";
    
    const yearMatch = result.markdown.match(/^发表年份.*:\s*(.+)$/m);
    const year = yearMatch ? yearMatch[1].trim() : "";

    const tReport = await checkPaperTimeliness(title, `${authors} ${year}`);
    
    setHistory(prevHistory => {
        const updated = prevHistory.map(item => {
            if (item.id === currentHistoryId) {
                return { ...item, timelinessReport: tReport };
            }
            return item;
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        return updated;
    });
  };

  const handleManualVenueCheck = async () => {
    if (!result?.markdown || !currentHistoryId) return;
    
    // Extract venue string
    const venueMatch = result.markdown.match(/^(?:发表年份\/会议\/期刊|发表年份|会议|期刊|Venue|Published).*?:\s*(.+)$/m);
    const venue = venueMatch ? venueMatch[1].trim() : "Unknown Venue";

    const vReport = await checkVenueQuality(venue);
    
    setHistory(prevHistory => {
      const updated = prevHistory.map(item => {
          if (item.id === currentHistoryId) {
              return { ...item, venueReport: vReport };
          }
          return item;
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleManualIntegrityCheck = async () => {
    if (!result?.markdown || !currentHistoryId) return;

    // Extract authors
    const authorMatch = result.markdown.match(/^作者:\s*(.+)$/m) || result.markdown.match(/\*\*作者\*\*:\s*(.+)/);
    const authors = authorMatch ? authorMatch[1].trim() : "";

    const iReport = await checkAuthorIntegrity(authors);

    setHistory(prevHistory => {
      const updated = prevHistory.map(item => {
          if (item.id === currentHistoryId) {
              return { ...item, integrityReport: iReport };
          }
          return item;
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Helper to convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              // remove the data URL prefix (e.g., "data:application/pdf;base64,")
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
          };
          reader.onerror = error => reject(error);
      });
  };

  // The actual async worker function
  const processPaperAnalysis = async (id: string, searchQuery: string, pdfData?: string, enableSearch: boolean = true) => {
    const controller = new AbortController();
    abortControllersRef.current.set(id, controller);

    try {
      const data = await analyzePaperWithGemini(searchQuery, controller.signal, pdfData, enableSearch);
      
      // Check if task is still valid (wasn't aborted externally)
      if (!abortControllersRef.current.has(id)) return;

      const titleMatch = data.markdown.match(/^标题:\s*(.+)$/m) || data.markdown.match(/\*\*标题\*\*:\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : searchQuery;
      const cleanTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s\-:(),.]/g, '').trim();
      const finalTitle = cleanTitle || "Untitled Analysis";

      // Update History with Success
      setHistory(prev => {
          const updated = prev.map(item => {
              if (item.id === id) {
                  return { 
                      ...item, 
                      title: finalTitle, 
                      analysis: data, 
                      status: 'completed' as const,
                      timestamp: Date.now() // Update timestamp to finish time
                  };
              }
              return item;
          });
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
          return updated;
      });

      addToast(`Analysis complete: ${finalTitle}`, 'success');

      // Cleanup controller
      abortControllersRef.current.delete(id);

      // Note: We no longer auto-run timeliness checks here. They are on-demand via the widget.

    } catch (err: any) {
      // If manually stopped, controller would be gone, so we skip error handling logic
      if (!abortControllersRef.current.has(id)) return;

      if (err.message?.includes("Aborted") || err.message?.includes("stopped by the user")) {
          return;
      }
      console.error(err);
      
      // Update History with Error
      setHistory(prev => {
          const updated = prev.map(item => {
              if (item.id === id) {
                  return { 
                      ...item, 
                      status: 'error' as const,
                      error: "Failed to analyze. Please retry."
                  };
              }
              return item;
          });
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
          return updated;
      });
      addToast(`Analysis failed: ${searchQuery}`, 'error');
      
      // Cleanup
      abortControllersRef.current.delete(id);
    }
  };

  const startAnalysis = async (queries: string[], isFileMode: boolean = false) => {
    if (isFileMode && selectedFile) {
        // Handle Single File Upload
        const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        let pdfBase64: string;
        try {
            pdfBase64 = await fileToBase64(selectedFile);
        } catch (e) {
            addToast("Failed to read file", 'error');
            return;
        }

        const displayTitle = selectedFile.name;
        const newItem: HistoryItem = {
            id: newId,
            title: displayTitle,
            timestamp: Date.now(),
            chatMessages: [],
            status: 'queued'
        };

        const updatedHistory = [newItem, ...history];
        saveHistoryState(updatedHistory);
        setCurrentHistoryId(newId);

        // Direct execution for file
        setHistory(prev => prev.map(h => h.id === newId ? { ...h, status: 'analyzing' } : h));
        await processPaperAnalysis(newId, queries[0] || "Paper Analysis", pdfBase64, false);
        
        // Cleanup
        setQuery('');
        setSelectedFile(null);
        if (pdfInputRef.current) pdfInputRef.current.value = '';
        return;
    }

    // Handle Batch Text Queries
    const newItems: HistoryItem[] = [];
    const newIds: string[] = [];

    queries.forEach((q) => {
        if (!q.trim()) return;
        const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newItem: HistoryItem = {
            id: newId,
            title: q.length > 50 ? q.substring(0, 50) + "..." : q,
            timestamp: Date.now(),
            chatMessages: [],
            status: 'queued'
        };
        newItems.push(newItem);
        newIds.push(newId);
    });

    if (newItems.length === 0) return;

    // Add to history
    const updatedHistory = [...newItems, ...history];
    saveHistoryState(updatedHistory);

    // Set view to the first new item
    setCurrentHistoryId(newIds[0]);

    // Update Queue
    setBatchProgress(prev => ({ 
        current: prev.current, 
        total: prev.total + newIds.length 
    }));
    setExecutionQueue(prev => [...prev, ...newIds]);

    // Cleanup Inputs
    setQuery('');
    setBatchQueries(['', '', '']);
    setIsBatchMode(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!useSearchGrounding) {
        // PDF Mode
        if (!selectedFile) {
            addToast("Please upload a PDF file", "error");
            return;
        }
        startAnalysis([query.trim()], true);
    } else {
        // Search Mode
        if (isBatchMode) {
            const lines = batchQueries.map(l => l.trim()).filter(l => l);
            if (lines.length > 0) startAnalysis(lines, false);
        } else {
            if (!query.trim()) return;
            startAnalysis([query.trim()], false);
        }
    }
  };

  const handleBatchQueryChange = (index: number, value: string) => {
    const newQueries = [...batchQueries];
    newQueries[index] = value;
    setBatchQueries(newQueries);
  };

  const addBatchInput = () => {
    setBatchQueries([...batchQueries, '']);
  };

  const removeBatchInput = (index: number) => {
    if (batchQueries.length === 1) {
        setBatchQueries(['']);
        return;
    }
    setBatchQueries(batchQueries.filter((_, i) => i !== index));
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Force switch to Search Mode if clicking a suggestion
    setUseSearchGrounding(true); 
    // Wait a tick for state update (or simply call startAnalysis with correct logic)
    // Here we assume simple flow:
    setQuery(suggestion);
    // User still needs to click analyze, or we trigger it?
    // Let's trigger it for UX
    // But we need to use 'startAnalysis' which isn't available here without async wrapper or duplicate code
    // Simplest: set query and focus
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

  // Replaced html2pdf with native window.print() for better quality and simplicity
  const handlePrint = () => {
     window.print();
  };

  const handleTrendAnalysis = async () => {
    const completedItems = history.filter(h => h.status !== 'analyzing' && h.status !== 'queued' && h.status !== 'error' && h.analysis);
    if (completedItems.length === 0) return;
    
    setViewMode('trends'); // Switch to full page view
    setTrendLoading(true);
    setTrendReport(null);

    try {
      const report = await analyzeTrendsWithGemini(completedItems);
      setTrendReport(report);
    } catch (e) {
      setTrendReport("Failed to generate trend report. Please try again.");
    } finally {
      setTrendLoading(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  // --- FULL PAGE TREND RENDER ---
  if (viewMode === 'trends') {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>

            <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm print:hidden">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setViewMode('home')}
                            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-xl font-bold text-slate-800">Trend & Evolution Report</h1>
                    </div>
                    <div className="flex items-center gap-3">
                         <button
                            onClick={handleCopyReport}
                            disabled={!trendReport}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                                reportCopied
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600'
                            }`}
                        >
                            <i className={`fas ${reportCopied ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                            {reportCopied ? 'Copied' : 'Copy'}
                        </button>
                         <button 
                            onClick={handlePrint}
                            disabled={!trendReport}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <i className="fas fa-print"></i> Print PDF
                        </button>
                    </div>
                </div>
            </header>
            
            <main className="flex-grow max-w-4xl mx-auto w-full p-6 md:p-12 print:p-0 print:max-w-none">
               {trendLoading ? (
                 <div className="flex flex-col items-center justify-center py-32 space-y-6">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                            <i className="fas fa-chart-pie text-indigo-600 text-xl"></i>
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-medium text-slate-800">Synthesizing Research Trends</h3>
                        <p className="text-slate-500 mt-2">Analyzing {history.length} papers to identify evolution, gaps, and future directions...</p>
                    </div>
                 </div>
               ) : trendReport ? (
                 <div className="bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200 min-h-[60vh] print:shadow-none print:border-none print:p-0">
                    <div className="prose prose-slate prose-lg max-w-none print:prose-base">
                        <TrendReportDisplay content={trendReport} />
                    </div>
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                    <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
                    <p>Report generation failed.</p>
                    <button onClick={handleTrendAnalysis} className="mt-4 text-indigo-600 font-medium hover:underline">Try Again</button>
                 </div>
               )}
            </main>
        </div>
      );
  }

  // --- HOME RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* Progress Bar */}
      <ProgressBar current={batchProgress.current} total={batchProgress.total} isProcessing={isProcessingQueue} />

      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none print:hidden">
        {toasts.map(toast => (
            <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Hidden File Input for Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportData} 
        accept=".json" 
        className="hidden" 
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 print:hidden">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
            setCurrentHistoryId(null);
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

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-8 relative print:p-0 print:max-w-none">
        
        {/* Search Hero Section - Visible when IDLE (no current item selected) */}
        <section className={`transition-all duration-500 ease-in-out print:hidden ${currentHistoryId ? 'mb-8 hidden md:block' : 'mt-16 mb-12 text-center'}`}>
          
          {!currentHistoryId && (
            <div className="mb-8 space-y-4 animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Deep Research, <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Simplified.
                </span>
              </h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                Enter a paper title, topic, or upload a PDF. Our AI will retrieve context or analyze your file to provide critical insights.
              </p>
            </div>
          )}

          <form onSubmit={handleSearch} className={`relative max-w-2xl mx-auto w-full transition-all duration-300 ${isBatchMode ? 'bg-white rounded-2xl border border-slate-200 shadow-sm p-2' : ''}`}>
             
             {/* Mode Toggle Tabs */}
             <div className={`flex justify-center mb-6 ${currentHistoryId ? 'hidden' : ''}`}>
                 <div className="bg-slate-100 p-1 rounded-xl flex gap-1 shadow-inner">
                     <button
                        type="button"
                        onClick={() => { setUseSearchGrounding(true); setQuery(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${useSearchGrounding ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                     >
                         <i className="fas fa-globe mr-2"></i> Web Search
                     </button>
                     <button
                        type="button"
                        onClick={() => { setUseSearchGrounding(false); setQuery(''); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!useSearchGrounding ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                     >
                         <i className="fas fa-file-pdf mr-2"></i> Local PDF
                     </button>
                 </div>
             </div>

             {/* Batch Mode Toggle (Only valid for Web Search) */}
             {useSearchGrounding && (
                <div className={`flex justify-end ${isBatchMode ? 'mb-2 px-2 pt-2' : 'mb-2 absolute right-0 -top-10'}`}>
                    <button 
                        type="button"
                        onClick={() => setIsBatchMode(!isBatchMode)}
                        className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${isBatchMode ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        <i className={`fas ${isBatchMode ? 'fa-list-check' : 'fa-layer-group'}`}></i>
                        {isBatchMode ? 'Single Search' : 'Batch Mode'}
                    </button>
                </div>
             )}

            {/* WEB SEARCH MODE */}
            {useSearchGrounding ? (
                !isBatchMode ? (
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fas fa-search text-slate-400 group-focus-within:text-blue-500 transition-colors"></i>
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g., Attention Is All You Need, or 'Gemini 1.5 Pro'"
                            className="w-full pl-11 pr-28 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md focus:shadow-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-lg"
                        />
                        <button 
                            type="submit"
                            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-xl transition-colors font-medium flex items-center justify-center disabled:opacity-50"
                            disabled={!query.trim()}
                        >
                            Analyze
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 p-2">
                        {batchQueries.map((q, idx) => (
                            <div key={idx} className="flex items-center gap-3 animate-fade-in">
                                <span className="flex-none w-6 text-center text-slate-400 text-sm font-mono">{idx + 1}</span>
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={q}
                                        onChange={(e) => handleBatchQueryChange(idx, e.target.value)}
                                        placeholder="Enter paper title or arXiv ID..."
                                        className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (idx === batchQueries.length - 1) addBatchInput();
                                            }
                                        }}
                                    />
                                    {q && (
                                        <button 
                                            type="button"
                                            onClick={() => handleBatchQueryChange(idx, '')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                                        >
                                            <i className="fas fa-times-circle"></i>
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => removeBatchInput(idx)}
                                    className={`p-2 rounded-lg transition-colors ${batchQueries.length > 1 ? 'text-slate-400 hover:bg-red-50 hover:text-red-500' : 'text-slate-200 cursor-not-allowed'}`}
                                    disabled={batchQueries.length <= 1}
                                >
                                    <i className="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        ))}
                        
                        <div className="flex items-center justify-between pt-2 pl-9">
                            <button 
                                type="button" 
                                onClick={addBatchInput}
                                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <i className="fas fa-plus"></i> Add Paper
                            </button>
                            
                            <button 
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
                                disabled={batchQueries.every(q => !q.trim())}
                            >
                                <i className="fas fa-layer-group"></i> Queue Batch ({batchQueries.filter(q => q.trim()).length})
                            </button>
                        </div>
                    </div>
                )
            ) : (
                /* PDF UPLOAD MODE */
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 transition-all hover:border-blue-400 group">
                    <input 
                        type="file" 
                        ref={pdfInputRef}
                        accept="application/pdf"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="hidden"
                    />
                    
                    {!selectedFile ? (
                        <div 
                            className="flex flex-col items-center justify-center cursor-pointer py-4"
                            onClick={() => pdfInputRef.current?.click()}
                        >
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                                <i className="fas fa-cloud-upload-alt text-2xl"></i>
                            </div>
                            <p className="text-slate-600 font-medium">Click to upload a PDF paper</p>
                            <p className="text-slate-400 text-sm mt-1">Maximum file size depends on browser memory</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <i className="fas fa-file-pdf text-red-500 text-xl"></i>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                                        <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => { setSelectedFile(null); if (pdfInputRef.current) pdfInputRef.current.value = ''; }}
                                    className="text-slate-400 hover:text-red-500 p-2"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            
                            <div className="relative">
                                <input 
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Optional: Enter context or specific question..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>

                            <button 
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-microchip"></i> Analyze PDF
                            </button>
                        </div>
                    )}
                </div>
            )}
          </form>

          {/* Suggestions - Visible only on Home */}
          {!currentHistoryId && useSearchGrounding && (
            <div className="mt-8 mb-8 animate-fade-in-up">
              <div className="flex flex-wrap justify-center gap-3">
                <span className="text-sm text-slate-400 py-1">Try asking:</span>
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                        handleSuggestionClick(suggestion);
                        // Manually trigger text change for suggestion
                        setQuery(suggestion);
                    }}
                    className="px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer truncate max-w-[300px]"
                    title={suggestion}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent History List - Visible only on Home */}
          {!currentHistoryId && history.length > 0 && (
             <div className="mt-8 max-w-2xl mx-auto animate-fade-in-up text-left">
               <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Research ({history.length})</h3>
                  <div className="flex items-center gap-4">
                    <button 
                        onClick={handleExportData}
                        className="text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                        title="Export Backup"
                    >
                        <i className="fas fa-file-export"></i>
                    </button>
                    <button 
                        onClick={triggerImport}
                        className="text-sm text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                        title="Import Backup"
                    >
                        <i className="fas fa-file-import"></i>
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button 
                        onClick={(e) => requestClearAllHistory(e)}
                        className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                        title="Clear All History"
                    >
                        <i className="fas fa-trash"></i> Clear All
                    </button>
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
               
               <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                 {history.map(item => (
                   <div 
                      key={item.id}
                      onClick={() => selectHistoryItem(item)}
                      className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer text-left"
                   >
                     <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                        <div className={`w-10 h-10 ${item.status === 'analyzing' ? 'bg-blue-100' : (item.status === 'queued' ? 'bg-slate-100' : 'bg-blue-50')} text-blue-600 rounded-lg flex-shrink-0 flex items-center justify-center`}>
                          {item.status === 'analyzing' ? <i className="fas fa-circle-notch fa-spin"></i> : (item.status === 'queued' ? <i className="fas fa-hourglass-start text-slate-400"></i> : <i className="fas fa-file-alt"></i>)}
                        </div>
                        <div className="min-w-0">
                           <h4 className="font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                             {item.title}
                             {item.status === 'analyzing' && <span className="ml-2 text-xs text-blue-500 italic">Analyzing...</span>}
                             {item.status === 'queued' && <span className="ml-2 text-xs text-slate-400 italic">Queued</span>}
                             {item.status === 'error' && <span className="ml-2 text-xs text-red-500 italic">Failed</span>}
                           </h4>
                           <p className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</p>
                           {/* Small badge if this item has recommendations */}
                           {item.timelinessReport?.recommendations && item.timelinessReport.recommendations.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600 border border-green-100 mt-1">
                                    <i className="fas fa-lightbulb"></i> {item.timelinessReport.recommendations.length} Recs
                                </span>
                           )}
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

          {/* Empty History State */}
          {!currentHistoryId && history.length === 0 && (
            <div className="mt-8 animate-fade-in-up">
              <div className="mt-6 flex justify-center gap-4">
                  <button 
                      onClick={triggerImport}
                      className="text-slate-400 hover:text-blue-600 text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                      <i className="fas fa-file-import"></i>
                      <span>Import Backup</span>
                  </button>
                  <div className="w-px h-6 bg-slate-200"></div>
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

        {/* Content Area - VISIBLE ONLY WHEN A ITEM IS SELECTED */}
        {currentHistoryId && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in pb-24 min-h-[500px] print:block">
                
                {/* Main Analysis Column */}
                <div className="lg:col-span-8 space-y-8 print:w-full">
                  
                  {isCurrentItemAnalyzing && (
                      <LoadingView onCancel={() => abortAnalysis(currentHistoryId)} />
                  )}

                  {currentError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 max-w-2xl mx-auto animate-fade-in print:hidden">
                        <i className="fas fa-exclamation-circle text-3xl mb-3"></i>
                        <p>{currentError}</p>
                        <button onClick={() => processPaperAnalysis(currentHistoryId, currentItem?.title || '')} className="mt-4 text-sm underline hover:text-red-900">Retry Analysis</button>
                    </div>
                  )}

                  {!isCurrentItemAnalyzing && !currentError && result && (
                    <div id="analysis-content">
                        {/* Print Header */}
                        <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
                            <h1 className="text-2xl font-bold text-slate-900">{currentItem.title}</h1>
                            <p className="text-sm text-slate-500 mt-1">Generated by PaperInsight AI on {new Date().toLocaleDateString()}</p>
                        </div>

                        <AnalysisDisplay content={result.markdown} />
                        
                        {/* Secondary Analysis Widgets */}
                        <div className="print:block print:mt-6">
                            <TimelinessWidget report={timelinessReport} onAnalyze={handleManualTimelinessCheck} />
                            <VenueWidget report={venueReport} onAnalyze={handleManualVenueCheck} />
                            <IntegrityWidget report={integrityReport} onAnalyze={handleManualIntegrityCheck} />
                        </div>

                        {/* Discussion History */}
                        {chatMessages.length > 0 && (
                        <div className="mt-12 border-t-2 border-slate-100 pt-8 print:hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                    <i className="fas fa-comments"></i>
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800">Discussion History</h3>
                                </div>
                                <button 
                                    onClick={handleClearChatRequest}
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
                                        <MarkdownRenderer content={msg.content} />
                                    </div>
                                </div>
                                ))}
                            </div>
                        </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Sidebar / Metadata Column */}
                <div className="lg:col-span-4 space-y-6 print:hidden">
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
                                onClick={handleExportData}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                title="Export Backup"
                            >
                                <i className="fas fa-file-export"></i>
                            </button>
                            <button 
                                type="button" 
                                onClick={triggerImport}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                title="Import Backup"
                            >
                                <i className="fas fa-file-import"></i>
                            </button>
                            <div className="w-px h-3 bg-slate-200 mx-1"></div>
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
                         disabled={history.filter(h => h.status === 'completed').length === 0}
                         className={`w-full text-xs py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                           history.filter(h => h.status === 'completed').length > 0
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
                               onClick={() => selectHistoryItem(item)}
                               className={`group flex items-center justify-between rounded-lg border transition-all overflow-hidden cursor-pointer ${currentHistoryId === item.id ? 'bg-blue-50 border-blue-200 shadow-inner' : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50'}`}
                             >
                                <div className="flex-1 min-w-0 p-3">
                                   <div className={`text-sm font-medium truncate flex items-center gap-2 ${currentHistoryId === item.id ? 'text-blue-800' : 'text-slate-700'}`}>
                                      {item.status === 'analyzing' && <i className="fas fa-circle-notch fa-spin text-xs text-blue-500"></i>}
                                      {item.status === 'queued' && <i className="fas fa-hourglass-start text-xs text-slate-400"></i>}
                                      {item.status === 'error' && <i className="fas fa-exclamation-circle text-xs text-red-500"></i>}
                                      <span className="truncate">{item.title}</span>
                                   </div>
                                   <div className="text-xs text-slate-400 mt-1">
                                      {new Date(item.timestamp).toLocaleDateString()}
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

                  {/* Sources Widget - Only Show if Result Exists */}
                  {result && !isCurrentItemAnalyzing && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sticky top-24 animate-fade-in print:hidden">
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
                            {useSearchGrounding ? "No specific web citations returned." : "Search disabled. Analysis based on uploaded file."}
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
                  )}

                </div>
            </div>
        )}

        {/* Floating Chat Interface - Only if result available and completed */}
        {currentHistoryId && result && !isCurrentItemAnalyzing && (
            <ChatInterface 
                originalAnalysis={result.markdown} 
                messages={chatMessages}
                onMessagesChange={handleChatUpdate}
            />
        )}

      </main>

      {/* Recycle Bin Modal - Moved BEFORE Delete Modal in JSX order */}
      {isRecycleBinOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in print:hidden">
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
                                      onClick={(e) => handlePermanentDelete(e, item.id)}
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
                     onClick={(e) => handleEmptyRecycleBin(e)}
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

      {/* Delete Confirmation Modal - Moved AFTER Recycle Bin to ensure higher stacking context */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in print:hidden">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                    <i className="fas fa-exclamation-triangle text-xl"></i>
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-900">
                        {deleteTarget.mode === 'hard' ? "Permanent Deletion" : "Confirm Deletion"}
                    </h3>
                    <p className="text-sm text-slate-500">
                        {deleteTarget.mode === 'hard' ? "This action cannot be undone." : "Items will be moved to Recycle Bin."}
                    </p>
                 </div>
              </div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                 {deleteTarget.type === 'all' 
                    ? (deleteTarget.mode === 'hard' ? "Permanently delete ALL items in Recycle Bin?" : "Are you sure you want to delete ALL research history?") 
                    : (deleteTarget.mode === 'hard' ? "Permanently delete this item?" : "Are you sure you want to delete this analysis?")}
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

       {/* Clear Chat Confirmation Modal */}
       {isClearChatModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in print:hidden">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
                    <i className="fas fa-comment-slash text-xl"></i>
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-900">Clear Discussion?</h3>
                    <p className="text-sm text-slate-500">Reset chat history.</p>
                 </div>
              </div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                 Are you sure you want to delete the entire discussion history for this paper? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                 <button 
                    onClick={() => setIsClearChatModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={confirmClearChat}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                 >
                    Clear History
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* NEW: Import Confirmation Modal (Using Z-Index 140 to be top-most if needed) */}
      {importPendingData && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in print:hidden">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <i className="fas fa-file-import text-xl"></i>
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-900">Confirm Import</h3>
                    <p className="text-sm text-slate-500">Merge backup data?</p>
                 </div>
              </div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                 Found <strong>{importPendingData.history.length}</strong> research items and <strong>{importPendingData.deletedHistory.length}</strong> recycled items.
                 <br/><br/>
                 This will merge with your current history. Existing items with the same ID will be skipped.
              </p>
              <div className="flex items-center justify-end gap-3">
                 <button 
                    onClick={() => setImportPendingData(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={confirmImport}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                 >
                    Import & Merge
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 bg-white mt-auto print:hidden">
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