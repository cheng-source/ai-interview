export interface ChatMessage {
  id: string;
  role: 'interviewer' | 'candidate' | 'system';
  content: string;
  codeBlock?: string;
  stage?: string;
  timestamp: number;
  streaming?: boolean;
}

export interface PositionInfo {
  id: string;
  title: string;
  department: string;
  techStack: string[];
}
