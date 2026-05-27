import { END } from '@langchain/langgraph';

export function routeAfterParse(state: any): string {
  return 'icebreaker';
}

export function routeAfterIcebreaker(state: any): string {
  return 'tech_select';
}

export function routeInTechnical(state: any): string {
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  if (!lastRecord || lastRecord.stage !== 'technical') {
    return 'tech_ask';
  }

  const evaluation = lastRecord.evaluation || {};
  const depth = state.techRound?.depth || 0;
  const techRound = state.techRound || {};
  const topics = techRound.topics || [];
  const questionsAsked = techRound.questionsAsked || [];

  if (evaluation.isSurfaceLevel && depth < 3) {
    return 'tech_follow_up';
  }

  if (questionsAsked.length < topics.length + 2) {
    return 'tech_next_topic';
  }

  return 'behavioral_select';
}

export function routeAfterTechFollowUp(state: any): string {
  return 'tech_evaluate';
}

export function routeAfterTechNextTopic(state: any): string {
  return 'tech_select';
}

export function routeInBehavioral(state: any): string {
  const answerHistory = state.answerHistory || [];
  const lastRecord = answerHistory[answerHistory.length - 1];

  if (!lastRecord || lastRecord.stage !== 'behavioral') {
    return 'behavioral_ask';
  }

  const evaluation = lastRecord.evaluation || {};
  const depth = state.behavioralRound?.depth || 0;
  const behavioralRound = state.behavioralRound || {};
  const competencies = behavioralRound.competencies || [];
  const questionsAsked = behavioralRound.questionsAsked || [];

  if (evaluation.isVague && depth < 2) {
    return 'behavioral_follow_up';
  }

  if (questionsAsked.length < competencies.length) {
    return 'behavioral_next_question';
  }

  return 'candidate_qa';
}

export function routeAfterBehavioralFollowUp(state: any): string {
  return 'behavioral_evaluate';
}

export function routeAfterBehavioralNextQuestion(state: any): string {
  return 'behavioral_select';
}

export function routeAfterCandidateQA(state: any): string {
  if ((state.qaCount || 0) >= 5) {
    return 'generate_report';
  }
  return '__end__';
}

export function routeAfterReport(state: any): string {
  return END;
}
