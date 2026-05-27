import { BaseMessage } from '@langchain/core/messages';

export interface Question {
  text: string;
  type: 'technical' | 'behavioral';
  topic: string;
  difficulty: number;
}

export interface Evaluation {
  score: number;
  isCorrect: boolean;
  isSurfaceLevel: boolean;
  isVague: boolean;
  strengths: string[];
  gaps: string[];
  summary: string;
}

export interface CandidateInfo {
  name: string;
  skills: string[];
  experience: number;
  projects: string[];
  strengths: string[];
  gaps: string[];
}

export interface InterviewState {
  candidate: CandidateInfo;
  position: { title: string; department: string; jdText: string; techStack: string[] };
  currentStage: 'icebreaker' | 'technical' | 'behavioral' | 'qa' | 'done';
  techRound: {
    currentTopic: string;
    currentQuestion: Question | null;
    questionsAsked: Question[];
    depth: number;
    topics: string[];
  };
  behavioralRound: {
    currentQuestion: Question | null;
    questionsAsked: Question[];
    depth: number;
    competencies: string[];
  };
  answerHistory: Array<{
    stage: string;
    question: Question;
    answer: string;
    evaluation: Evaluation;
  }>;
  scores: { technical: number; behavioral: number; overall: number };
  messages: BaseMessage[];
  qaCount: number;
  candidateAnswer: string;
  resumeText?: string;
}
