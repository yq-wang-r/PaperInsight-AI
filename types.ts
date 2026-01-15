
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

export interface VenueReport {
  name: string;
  type: 'Conference' | 'Journal' | 'Unknown';
  quality: string; // e.g. "CCF A", "Q1", "Top Tier"
  summary: string;
}

export interface IntegrityReport {
  hasIssues: boolean; // True if red flags found
  summary: string;
  sources?: string[];
}

export interface HistoryItem {
  id: string;
  title: string;
  timestamp: number;
  analysis: AnalysisResult;
  chatMessages: ChatMessage[];
  timelinessReport?: TimelinessReport;
  venueReport?: VenueReport;
  integrityReport?: IntegrityReport;
}

export enum LoadingState {
  IDLE = 'IDLE',
  SEARCHING = 'SEARCHING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type ApiProvider = 'gemini' | 'zhipu' | 'openai' | 'siliconflow';

export interface UserSettings {
  provider: ApiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  enableSearch: boolean;
}
