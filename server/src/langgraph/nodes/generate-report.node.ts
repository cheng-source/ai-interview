import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function generateReportNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.3 });
  const { candidate, position, answerHistory, techRound, behavioralRound } = state;

  const historySummary = (answerHistory || []).map((h: any) => ({
    stage: h.stage,
    topic: h.question?.topic || '',
    question: h.question?.text?.substring(0, 100) || '',
    score: h.evaluation?.score || 0,
    summary: h.evaluation?.summary || '',
  }));

  const techCount = (techRound?.questionsAsked || []).length;
  const behavCount = (behavioralRound?.questionsAsked || []).length;
  const scores = state.scores || { technical: 0, behavioral: 0 };

  const techScore = techCount > 0 ? Math.round(scores.technical / techCount) : 0;
  const behavScore = behavCount > 0 ? Math.round(scores.behavioral / behavCount) : 0;
  const overallScore = Math.round((techScore + behavScore) / 2);

  const response = await llm.invoke([
    new SystemMessage(`你是一个面试评估专家。根据完整的面试记录生成综合评估报告。返回JSON:
{
  "techScore": ${techScore},
  "behavScore": ${behavScore},
  "overallScore": ${overallScore},
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "summary": "一段200字的综合评价",
  "recommendation": "推荐" | "保留" | "不推荐"
}`),
    new HumanMessage(`候选人: ${candidate?.name || 'N/A'}
岗位: ${position?.title || 'N/A'}
技能: ${(candidate?.skills || []).join(', ')}
面试历史: ${JSON.stringify(historySummary)}`),
  ]);

  let report: any = { techScore, behavScore, overallScore, strengths: [], weaknesses: [], summary: '', recommendation: '保留' };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    report = jsonMatch ? { ...report, ...JSON.parse(jsonMatch[0]) } : report;
  } catch {}

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

  return {
    messages: [new AIMessage(summaryMessage)],
    currentStage: 'done',
    scores: {
      technical: report.techScore,
      behavioral: report.behavScore,
      overall: report.overallScore,
    },
    finalReport: report,
  };
}
