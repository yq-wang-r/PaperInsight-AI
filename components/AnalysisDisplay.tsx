import React, { useMemo, useState } from 'react';
import { PaperSection } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

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
          // Detect key-value pair pattern: "Key: Value" or "**Key**: Value"
          // We assume keys are short (< 50 chars) to avoid false positives on long sentences with colons.
          const firstColonIndex = line.indexOf(':');
          
          if (firstColonIndex > -1 && firstColonIndex < 50) {
             const key = line.slice(0, firstColonIndex).replace(/\*\*/g, ''); // Clean key (remove bold markers if any)
             const value = line.slice(firstColonIndex + 1);
             return (
               <div key={i} className="mb-2">
                 <span className="font-semibold text-slate-900">{key}:</span>
                 <span className="text-slate-600 ml-2"><MarkdownRenderer content={value} /></span>
               </div>
             )
          }

          // Bullet points
          if (line.trim().startsWith('- ') || line.trim().match(/^\d+\./)) {
              return <div key={i} className="ml-4 mb-1 text-slate-700"><MarkdownRenderer content={line} /></div>;
          }
          // Empty lines
          if (!line.trim()) return <div key={i} className="h-2"></div>;
          
          // Regular paragraphs
          return <div key={i} className="mb-2"><MarkdownRenderer content={line} /></div>;
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
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 whitespace-pre-wrap leading-relaxed text-slate-700 relative group">
        <button 
             onClick={() => navigator.clipboard.writeText(content)}
             className="absolute top-4 right-4 p-2 rounded-lg bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
        >
            <i className="fas fa-copy"></i>
        </button>
        <MarkdownRenderer content={content} />
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