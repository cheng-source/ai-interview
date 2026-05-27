import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export async function parseResumeNode(state: any): Promise<any> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.3 });

  const resumeText = (state as any).resumeText || '';
  const jdText = state.position?.jdText || '';

  const response = await llm.invoke([
    new SystemMessage(`你是一个专业的简历解析器。从简历中提取以下信息，返回JSON格式：
{
  "name": "候选人姓名",
  "skills": ["技能1", "技能2"],
  "experience": 工作年限数字,
  "projects": ["项目名: 简述"],
  "strengths": ["优势描述"],
  "gaps": ["与JD相比的不足"]
}`),
    new HumanMessage(`简历内容：${resumeText}\n\n岗位JD：${jdText}`),
  ]);

  let parsed: any = {};
  try {
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {}

  return {
    candidate: {
      name: parsed.name || '',
      skills: parsed.skills || [],
      experience: parsed.experience || 0,
      projects: parsed.projects || [],
      strengths: parsed.strengths || [],
      gaps: parsed.gaps || [],
    },
    techRound: {
      ...state.techRound,
      topics: parsed.skills?.slice(0, 5) || [],
    },
    currentStage: 'icebreaker',
  };
}
