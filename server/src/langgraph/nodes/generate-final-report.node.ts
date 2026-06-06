import { HumanMessage } from '@langchain/core/messages';
import { pushEvent } from '../llm';
import { executePersona } from '../personas/persona-executor';
import { reportGeneratorPersona } from '../personas/report-generator.persona';

export async function generateFinalReportNode(state: any): Promise<any> {
  const { candidate, position, answerHistory } = state;

  const historySummary = (answerHistory || []).map((h: any) => ({
    stage: h.stage,
    topic: h.question?.topic || '',
    question: h.question?.text?.substring(0, 100) || '',
    score: h.evaluation?.score || 0,
    summary: h.evaluation?.summary || '',
  }));

  const { response: report } = await executePersona(reportGeneratorPersona, new HumanMessage(
    `候选人: ${candidate?.name || 'N/A'}
岗位: ${position?.title || 'N/A'}
技能: ${(candidate?.skills || []).flatMap((s: any) => s.items || [s]).join(', ')}
面试历史: ${JSON.stringify(historySummary)}`,
  ));

  const summaryMessage = `面试结束，以下是你本次面试的评估报告：

**技术评分:** ${report.techScore}/10
**行为能力评分:** ${report.behavScore}/10
**综合评分:** ${report.overallScore}/10

**优势:**
${(report.strengths || []).map((s: string) => `- ${s}`).join('\n')}

**待提升:**
${(report.weaknesses || []).map((w: string) => `- ${w}`).join('\n')}

**综合评价:** ${report.summary}

**录用建议:** ${report.recommendation}`;

  pushEvent({ type: 'message', content: summaryMessage, stage: 'done' });
  pushEvent({ type: 'stage', stage: 'done' });
  pushEvent({ type: 'done', report });

  return {
    reportText: summaryMessage,
    currentStage: 'done',
    scores: {
      technical: report.techScore,
      behavioral: report.behavScore,
      overall: report.overallScore,
    },
    finalReport: report,
  };
}
