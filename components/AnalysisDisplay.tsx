import React, { useMemo, useState } from 'react';
import { PaperSection } from '../types';

interface AnalysisDisplayProps {
  content: string;
}

const SectionCard: React.FC<{ section: PaperSection }> = ({ section }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(section.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden border-${section.color}-500 transition-all hover:shadow-md group`}>
      <div className={`bg-${section.color}-50/50 p-4 border-b border-slate-100 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full bg-${section.color}-100 flex items-center justify-center text-${section.color}-600`}>
            <i className={`fas ${section.icon}`}></i>
          </div>
          <h3 className="text-lg font-bold text-slate-800">{section.title}</h3>
        </div>
        <button 
          onClick={handleCopy}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            copied 
              ? 'bg-green-100 text-green-600' 
              : 'text-slate-400 hover:bg-white hover:text-blue-600 opacity-0 group-hover:opacity-100'
          }`}
          title="Copy section content"
        >
          <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>
        </button>
      </div>
      <div className="p-6 text-slate-700 leading-7">
        {section.content.split('\n').map((line, i) => {
          // Clean text: remove markdown bold syntax (**)
          const cleanLine = line.replace(/\*\*/g, '');

          // Simple formatting for keys like "Title:", "Highlight:"
          const isKeyLine = cleanLine.match(/^.*?:/);
          if (isKeyLine) {
             const parts = cleanLine.split(':');
             const key = parts[0];
             const value = parts.slice(1).join(':');
             return (
               <div key={i} className="mb-2">
                 <span className="font-semibold text-slate-900">{key}:</span>
                 <span className="text-slate-600">{value}</span>
               </div>
             )
          }
          // Bullet points
          if (cleanLine.trim().startsWith('- ') || cleanLine.trim().match(/^\d+\./)) {
              return <div key={i} className="ml-4 mb-1 text-slate-700">{cleanLine}</div>;
          }
          // Empty lines
          if (!cleanLine.trim()) return <div key={i} className="h-2"></div>;
          
          return <p key={i} className="mb-2">{cleanLine}</p>;
        })}
      </div>
    </div>
  );
};

const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ content }) => {
  
  // Custom parser to split the specific markdown format into renderable sections
  const parsedSections = useMemo(() => {
    const sections: PaperSection[] = [];
    
    // Helper to extract content between markers
    const extractSection = (marker: string, nextMarker: string | null, icon: string, title: string, color: string) => {
      const startIndex = content.indexOf(marker);
      if (startIndex === -1) return;

      const contentStart = startIndex + marker.length;
      const contentEnd = nextMarker ? content.indexOf(nextMarker, contentStart) : content.length;
      
      if (contentEnd === -1) return; // Should not happen if structure is valid

      const sectionContent = content.substring(contentStart, contentEnd).trim();
      if (sectionContent) {
        sections.push({ title, icon, content: sectionContent, color });
      }
    };

    extractSection('📄 论文概览', '🔍 核心内容', 'fa-file-lines', '论文概览', 'blue');
    extractSection('🔍 核心内容', '💡 启发与思考', 'fa-microchip', '核心内容', 'indigo');
    extractSection('💡 启发与思考', null, 'fa-lightbulb', '启发与思考', 'amber');

    return sections;
  }, [content]);

  // Fallback if parsing fails (e.g. model didn't follow strict format)
  if (parsedSections.length === 0) {
    const cleanContent = content.replace(/\*\*/g, '');
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 whitespace-pre-wrap leading-relaxed text-slate-700 relative group">
        <button 
             onClick={() => navigator.clipboard.writeText(cleanContent)}
             className="absolute top-4 right-4 p-2 rounded-lg bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
        >
            <i className="fas fa-copy"></i>
        </button>
        {cleanContent}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {parsedSections.map((section, index) => (
        <SectionCard key={index} section={section} />
      ))}
    </div>
  );
};

export default AnalysisDisplay;