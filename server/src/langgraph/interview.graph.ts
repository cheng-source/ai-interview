import { StateGraph, END, START } from "@langchain/langgraph";
import { InterviewStateAnnotation } from "./state";

import { analyzeResumeNode } from "./nodes/analyze-resume.node";
import { collectSelfIntroductionNode } from "./nodes/collect-self-introduction.node";
import {
  askTechnicalQuestionNode,
  evaluateTechnicalAnswerNode,
  askTechnicalFollowUpNode,
  advanceTechnicalTopicNode,
} from "./nodes/technical-interview.node";
import {
  askBehavioralQuestionNode,
  evaluateBehavioralAnswerNode,
  askBehavioralFollowUpNode,
  advanceBehavioralCompetencyNode,
} from "./nodes/behavioral-interview.node";
import { answerCandidateQuestionsNode } from "./nodes/answer-candidate-questions.node";
import { generateFinalReportNode } from "./nodes/generate-final-report.node";

import {
  routeAfterParse,
  routeInTechnical,
  routeInBehavioral,
  routeAfterCandidateQA,
} from "./routing";

export function createInterviewGraph() {
  const graph = new StateGraph(InterviewStateAnnotation)
    .addNode("collect_self_introduction", collectSelfIntroductionNode)
    .addNode("analyze_resume", analyzeResumeNode)
    .addNode("ask_technical_question", askTechnicalQuestionNode)
    .addNode("evaluate_technical_answer", evaluateTechnicalAnswerNode)
    .addNode("ask_technical_follow_up", askTechnicalFollowUpNode)
    .addNode("advance_technical_topic", advanceTechnicalTopicNode)
    .addNode("ask_behavioral_question", askBehavioralQuestionNode)
    .addNode("evaluate_behavioral_answer", evaluateBehavioralAnswerNode)
    .addNode("ask_behavioral_follow_up", askBehavioralFollowUpNode)
    .addNode("advance_behavioral_competency", advanceBehavioralCompetencyNode)
    .addNode("answer_candidate_questions", answerCandidateQuestionsNode)
    .addNode("generate_final_report", generateFinalReportNode)
    .addEdge(START, "collect_self_introduction")
    .addEdge("collect_self_introduction", "analyze_resume")
    .addConditionalEdges("analyze_resume", routeAfterParse, {
      ask_technical_question: "ask_technical_question",
      ask_behavioral_question: "ask_behavioral_question",
    })
    .addEdge("ask_technical_question", "evaluate_technical_answer")
    .addConditionalEdges("evaluate_technical_answer", routeInTechnical, {
      ask_technical_follow_up: "ask_technical_follow_up",
      advance_technical_topic: "advance_technical_topic",
      answer_candidate_questions: "answer_candidate_questions",
    })
    .addEdge("ask_technical_follow_up", "evaluate_technical_answer")
    .addEdge("advance_technical_topic", "ask_technical_question")

    .addEdge("ask_behavioral_question", "evaluate_behavioral_answer")
    .addConditionalEdges("evaluate_behavioral_answer", routeInBehavioral, {
      ask_behavioral_follow_up: "ask_behavioral_follow_up",
      advance_behavioral_competency: "advance_behavioral_competency",
      answer_candidate_questions: "answer_candidate_questions",
    })
    .addEdge("ask_behavioral_follow_up", "evaluate_behavioral_answer")
    .addEdge("advance_behavioral_competency", "ask_behavioral_question")

    .addConditionalEdges("answer_candidate_questions", routeAfterCandidateQA, {
      generate_final_report: "generate_final_report",
      answer_candidate_questions: "answer_candidate_questions",
    })

    .addEdge("generate_final_report", END);

  return graph;
}
