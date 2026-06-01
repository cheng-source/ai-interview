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

export interface SkillCategory {
  category: string;
  items: string[];
}

export interface ProjectExperience {
  name: string;
  summary: string;
  highlights: string[];
}

export interface CandidateInfo {
  name: string;
  skills: SkillCategory[];
  experience: number;
  projects: ProjectExperience[];
  strengths: string[];
  gaps: string[];
}

export interface InterviewState {
  candidate: CandidateInfo;                                        // 候选人信息，由简历解析节点填充
  position: { title: string; department: string; jdText: string; techStack: string[]; level: string }; // 岗位信息，从数据库读取
  currentStage: 'icebreaker' | 'technical' | 'behavioral' | 'qa' | 'done'; // 当前面试阶段
  techRound: {
    currentTopic: string;                                          // 当前考察的技术主题（如 Vue、Node.js）
    currentQuestion: Question | null;                              // 当前正在提问的问题
    questionsAsked: Question[];                                    // 技术轮已问过的问题列表
    depth: number;                                                 // 当前题目追问深度（同一题的追问次数）
    topics: string[];                                              // 待考察的技术主题队列
  };
  behavioralRound: {
    currentQuestion: Question | null;                              // 当前行为问题
    questionsAsked: Question[];                                    // 行为轮已问过的问题列表
    depth: number;                                                 // 当前题目追问深度
    competencies: string[];                                        // 待考察的软技能队列（沟通、协作等5项）
  };
  answerHistory: Array<{                                           // 所有问答记录，用于最终报告生成
    stage: string;
    question: Question;
    answer: string;                                                // 候选人原始回答
    evaluation: Evaluation;                                        // LLM 对本次回答的评分
  }>;
  scores: { technical: number; behavioral: number; overall: number }; // 实时累计得分
  messages: BaseMessage[];                                         // LangChain 消息历史（LLM 对话上下文）
  qaCount: number;                                                 // 反问环节已提问数，上限5个
  candidateAnswer: string;                                         // 当前轮次候选人的输入
  resumeText?: string;                                             // 简历原文，仅在创建面试时传入
}
