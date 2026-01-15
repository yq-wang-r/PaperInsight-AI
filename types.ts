export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface AnalysisResult {
  markdown: string;
  groundingChunks?: GroundingChunk[];
}

export interface PaperSection {
  title: string;
  icon: string;
  content: string;
  color: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  title: string;
  timestamp: number;
  analysis: AnalysisResult;
  chatMessages: ChatMessage[];
}

export enum LoadingState {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface TimelinessReport {
  isOutdated: boolean;
  status: string; // e.g., "Legacy", "Current", "Obsolete"
  summary: string;
  recommendations?: Array<{
    title: string;
    year: string;
    reason: string;
    link?: string;
  }>;
}

export interface IntegrityReport {
  hasIssues: boolean; // True if red flags found
  summary: string;
  sources?: string[];
}