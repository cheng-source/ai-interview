import { END } from "@langchain/langgraph";

export function routeAfterParse(state: any): string {
  if (state.interviewType === "behavioral") return "ask_behavioral_question";
  return "ask_technical_question";
}

export function routeAfterIcebreaker(state: any): string {
  return "analyze_resume";
}

export function routeInTechnical(state: any): string {
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  const evaluation = lastRecord.evaluation || {};
  const depth = state.techRound?.depth || 0;
  const projects = state.candidate?.projects || [];
  const questionsAsked = state.techRound?.questionsAsked || [];
  const maxQuestions = projects.length + 2; // 所有项目 + 最多2道八股文

  if (evaluation.isSurfaceLevel && depth < 3) {
    return "ask_technical_follow_up";
  }

  if (questionsAsked.length < maxQuestions) {
    return "advance_technical_topic";
  }

  return "answer_candidate_questions";
}

export function routeAfterTechFollowUp(state: any): string {
  return "evaluate_technical_answer";
}

export function routeAfterTechNextTopic(state: any): string {
  return "ask_technical_question";
}

export function routeInBehavioral(state: any): string {
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  const evaluation = lastRecord.evaluation || {};
  const depth = state.behavioralRound?.depth || 0;
  const behavioralRound = state.behavioralRound || {};
  const competencies = behavioralRound.competencies || [];
  const questionsAsked = behavioralRound.questionsAsked || [];

  if (evaluation.isVague && depth < 2) {
    return "ask_behavioral_follow_up";
  }

  if (questionsAsked.length < competencies.length) {
    return "advance_behavioral_competency";
  }

  return "answer_candidate_questions";
}

export function routeAfterBehavioralFollowUp(state: any): string {
  return "evaluate_behavioral_answer";
}

export function routeAfterBehavioralNextQuestion(state: any): string {
  return "ask_behavioral_question";
}

export function routeAfterCandidateQA(state: any): string {
  if (state.qaDone || (state.qaCount || 0) >= 5) {
    return "generate_final_report";
  }
  return "answer_candidate_questions";
}

export function routeAfterReport(state: any): string {
  return END;
}
