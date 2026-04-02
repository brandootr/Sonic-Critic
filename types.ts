export interface TimestampedFeedback {
  time: string;
  issue: string;
  suggestion: string;
  studioOneTip: string;
}

export interface LibraryPluginSuggestion {
  pluginName: string;
  application: string;
}

export interface PluginInsert {
  name: string;
  settings: string[];
}

export interface SessionTrack {
  name: string;
  type: 'audio' | 'fx' | 'bus';
  inserts: PluginInsert[];
  sends?: { target: string; level: number }[];
  sidechain?: { source: string; target: string };
}

export interface SessionBlueprint {
  tracks: SessionTrack[];
  masterBus: {
    inserts: PluginInsert[];
  };
}

export interface CritiqueResult {
  overallScore: number;
  summary: string;
  tonalBalance: string;
  dynamics: string;
  stereoImage: string;
  timestampedFeedback: TimestampedFeedback[];
  generalSuggestions: string[];
  libraryPluginSuggestions: LibraryPluginSuggestion[];
  sessionBlueprint: SessionBlueprint;
  comparisonSummary?: string;
  scoreChange?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  images?: string[]; 
}

export interface SessionPrediction {
  predictedTracks: SessionTrack[];
  masterBus: {
    inserts: PluginInsert[];
  };
  confidence: number;
  reasoning: string;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastModified: number;
  critiques: CritiqueResult[];
  latestFileName: string | null;
  chatHistory?: ChatMessage[];
  songXmlContent?: string;
  prediction?: SessionPrediction;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  GENERATING_VISUALS = 'GENERATING_VISUALS',
  ANALYZING_AI = 'ANALYZING_AI',
  COMPARING = 'COMPARING',
  PREDICTING = 'PREDICTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}