import React, { useState, useEffect } from 'react';
import { analyzePaperWithGemini } from './services/geminiService';
import { AnalysisResult, LoadingState, ChatMessage } from './types';
import AnalysisDisplay from './components/AnalysisDisplay';
import LoadingView from './components/LoadingView';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentPaperTitle, setCurrentPaperTitle] = useState<string | null>(null);

  // Centralized function to perform analysis and manage history
  const performAnalysis = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoadingState(LoadingState.ANALYZING);
    setError(null);
    setResult(null);
    setCopied(false);
    setChatMessages([]);
    setCurrentPaperTitle(null);

    try {
      const data = await analyzePaperWithGemini(searchQuery);
      setResult(data);

      // Extract title to use as a unique key for chat history
      // Matches "标题: Title" allowing for potential markdown bolding or slight variations
      const titleMatch = data.markdown.match(/^标题:\s*(.+)$/m) || data.markdown.match(/\*\*标题\*\*:\s*(.+)/);
      
      // Fallback to query if title extraction fails, but try to use the specific paper title found
      let title = titleMatch ? titleMatch[1].trim() : searchQuery;
      
      // Simple sanitization for storage key
      const storageKeySafeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s\-]/g, '').trim();
      const finalTitle = storageKeySafeTitle || "untitled_paper";
      
      setCurrentPaperTitle(finalTitle);

      // Load existing history for this specific paper
      const storageKey = `paper_insight_chat_${finalTitle}`;
      const savedHistory = localStorage.getItem(storageKey);
      
      if (savedHistory) {
         try {
            setChatMessages(JSON.parse(savedHistory));
         } catch(e) {
            console.error("Failed to parse chat history:", e);
            setChatMessages([]);
         }
      } else {
         setChatMessages([]);
      }

      setLoadingState(LoadingState.COMPLETED);
    } catch (err) {
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
    // Use timeout to ensure UI updates input value visually before triggering
    setTimeout(() => {
        performAnalysis(suggestion);
    }, 0);
  };

  const handleChatUpdate = (newMessages: ChatMessage[]) => {
    setChatMessages(newMessages);
    // Persist to local storage if we have identified the paper
    if (currentPaperTitle) {
       const storageKey = `paper_insight_chat_${currentPaperTitle}`;
       localStorage.setItem(storageKey, JSON.stringify(newMessages));
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

  // Function to handle printing/pdf export
  const handlePrint = () => {
     // Check if html2pdf is available globally
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <i className="fas fa-microscope"></i>
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">
              PaperInsight <span className="text-blue-600 font-medium">AI</span>
            </h1>
          </div>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600 transition-colors">
            <i className="fab fa-github text-xl"></i>
          </a>
        </div>
      </header>

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 py-8 relative">
        
        {/* Search Hero Section */}
        <section className={`transition-all duration-500 ease-in-out ${result || loadingState !== LoadingState.IDLE ? 'mb-8' : 'mt-24 mb-12 text-center'}`}>
          
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

          {/* Suggestions - Only show when idle */}
          {!result && loadingState === LoadingState.IDLE && (
            <div className="mt-8 flex flex-wrap justify-center gap-3 animate-fade-in-up">
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
          )}
        </section>

        {/* Content Area */}
        <div className="min-h-[400px]">
          {loadingState === LoadingState.ANALYZING && <LoadingView />}

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
                    
                    {/* Discussion History for PDF Export */}
                    {chatMessages.length > 0 && (
                      <div className="mt-12 border-t-2 border-slate-100 pt-8">
                         <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                               <i className="fas fa-comments"></i>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Discussion History</h3>
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
                          No specific web citations returned, but the analysis was generated based on internal knowledge and context.
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