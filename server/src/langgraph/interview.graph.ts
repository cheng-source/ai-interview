import { StateGraph, END, START } from "@langchain/langgraph";
import { InterviewStateAnnotation } from "./state";

import { parseResumeNode } from "./nodes/parse-resume.node";
import { icebreakerNode } from "./nodes/icebreaker.node";
import {
  techSelectNode,
  techEvaluateNode,
  techFollowUpNode,
  techNextTopicNode,
} from "./nodes/technical-round.node";
import {
  behavioralSelectNode,
  behavioralEvaluateNode,
  behavioralFollowUpNode,
  behavioralNextQuestionNode,
} from "./nodes/behavioral-round.node";
import { candidateQaNode } from "./nodes/candidate-qa.node";
import { generateReportNode } from "./nodes/generate-report.node";

import {
  routeAfterParse,
  routeInTechnical,
  routeInBehavioral,
  routeAfterCandidateQA,
} from "./routing";

export function createInterviewGraph() {
  const graph = new StateGraph(InterviewStateAnnotation)
    .addNode("parse_resume", parseResumeNode)
    .addNode("icebreaker", icebreakerNode)
    .addNode("tech_select", techSelectNode)
    .addNode("tech_evaluate", techEvaluateNode)
    .addNode("tech_follow_up", techFollowUpNode)
    .addNode("tech_next_topic", techNextTopicNode)
    .addNode("behavioral_select", behavioralSelectNode)
    .addNode("behavioral_evaluate", behavioralEvaluateNode)
    .addNode("behavioral_follow_up", behavioralFollowUpNode)
    .addNode("behavioral_next_question", behavioralNextQuestionNode)
    .addNode("candidate_qa", candidateQaNode)
    .addNode("generate_report", generateReportNode)
    .addEdge(START, "icebreaker")
    .addEdge("icebreaker", "parse_resume")
    .addConditionalEdges("parse_resume", routeAfterParse, {
      tech_select: "tech_select",
      behavioral_select: "behavioral_select",
    })
    .addEdge("tech_select", "tech_evaluate")
    .addConditionalEdges("tech_evaluate", routeInTechnical, {
      tech_follow_up: "tech_follow_up",
      tech_next_topic: "tech_next_topic",
      candidate_qa: "candidate_qa",
    })
    .addEdge("tech_follow_up", "tech_evaluate")
    .addEdge("tech_next_topic", "tech_select")

    .addEdge("behavioral_select", "behavioral_evaluate")
    .addConditionalEdges("behavioral_evaluate", routeInBehavioral, {
      behavioral_follow_up: "behavioral_follow_up",
      behavioral_next_question: "behavioral_next_question",
      candidate_qa: "candidate_qa",
    })
    .addEdge("behavioral_follow_up", "behavioral_evaluate")
    .addEdge("behavioral_next_question", "behavioral_select")

    .addConditionalEdges("candidate_qa", routeAfterCandidateQA, {
      generate_report: "generate_report",
      candidate_qa: "candidate_qa",
    })

    .addEdge("generate_report", END);

  return graph;
}
