import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { askFollowUp } from '../services/geminiService';

interface ChatInterfaceProps {
  originalAnalysis: string;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ originalAnalysis, messages, onMessagesChange }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    onMessagesChange(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const answer = await askFollowUp(userMessage.content, originalAnalysis, newMessages);
      
      const botMessage: ChatMessage = {
        role: 'model',
        content: answer,
        timestamp: Date.now(),
      };
      
      onMessagesChange([...newMessages, botMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'model',
        content: "Sorry, I encountered an error while thinking about your question. Please try again.",
        timestamp: Date.now(),
      };
      onMessagesChange([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Floating Action Button (Closed State)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group"
      >
        <div className="relative">
          <i className="fas fa-comments text-2xl"></i>
          {messages.length === 0 && (
             <span className="absolute -top-1 -right-1 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
             </span>
          )}
        </div>
        <span className="font-medium pr-2 hidden group-hover:block whitespace-nowrap animate-fade-in">
          Discuss this Paper
        </span>
      </button>
    );
  }

  // Floating Window (Open State)
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[450px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in-up transition-all">
      {/* Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
             <i className="fas fa-robot"></i>
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Research Assistant</h3>
            <span className="text-[10px] text-blue-600 font-medium uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded-full">
              Self-Reflective
            </span>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <i className="fas fa-chevron-down"></i>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                 <i className="fas fa-lightbulb text-2xl text-slate-300"></i>
            </div>
            <p className="font-medium text-slate-600">Have specific questions?</p>
            <p className="text-sm mt-1">Ask about the methodology, datasets, or future work.</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content.replace(/\*\*/g, '')}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-3 shadow-sm flex items-center gap-2">
              <div className="flex space-x-1 px-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-xs text-slate-400">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={handleSubmit} className="relative flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up..."
            disabled={isLoading}
            className="flex-1 pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all disabled:opacity-50 text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;