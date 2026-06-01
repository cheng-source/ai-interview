import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import type { InterviewState } from '../common/types';

export const InterviewStateAnnotation = Annotation.Root({
  candidate: Annotation<InterviewState['candidate']>({
    reducer: (_, next) => next,
    default: () => ({
      name: '', skills: [], experience: 0, projects: [], strengths: [], gaps: [],
    }),
  }),
  position: Annotation<InterviewState['position']>({
    reducer: (_, next) => next,
    default: () => ({ title: '', department: '', jdText: '', techStack: [], level: '' }),
  }),
  currentStage: Annotation<InterviewState['currentStage']>({
    reducer: (_, next) => next,
    default: () => 'icebreaker',
  }),
  techRound: Annotation<InterviewState['techRound']>({
    reducer: (_, next) => next,
    default: () => ({
      currentTopic: '', currentQuestion: null, questionsAsked: [],
      depth: 0, topics: [],
    }),
  }),
  behavioralRound: Annotation<InterviewState['behavioralRound']>({
    reducer: (_, next) => next,
    default: () => ({
      currentQuestion: null, questionsAsked: [], depth: 0,
      competencies: ['communication', 'problemSolving', 'teamwork', 'leadership'],
    }),
  }),
  answerHistory: Annotation<InterviewState['answerHistory']>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  scores: Annotation<InterviewState['scores']>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({ technical: 0, behavioral: 0, overall: 0 }),
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  qaCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  candidateAnswer: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  resumeText: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  candidateIntro: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  interviewType: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'technical',
  }),
});
