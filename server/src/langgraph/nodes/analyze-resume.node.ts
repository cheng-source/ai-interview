import { HumanMessage } from "@langchain/core/messages";
import { executePersona } from "../personas/persona-executor";
import { resumeParserPersona } from "../personas/resume-parser.persona";
import { getOrStartResumeParse } from "../llm";
import { securePromptData } from "../prompt-security";

export async function doParseResume(
  resumeText: string,
  jdText: string,
  candidateIntro?: string,
  options?: { silent?: boolean },
) {
  const introHint = candidateIntro
    ? `\n候选人自我介绍：\n${securePromptData("candidate_intro", candidateIntro)}\n请结合自我介绍交叉验证简历信息。`
    : "";

  const { response: result } = await executePersona(
    resumeParserPersona,
    new HumanMessage(
      `简历内容：
${securePromptData("resume", resumeText)}

岗位JD：
${securePromptData("jd", jdText)}${introHint}`,
    ),
    options,
  );

  const skills = result.skillCategories || [];
  const projects = result.projects || [];
  const projectTopics = projects.map((p: any) => p.name);
  const conceptTopics = skills.slice(0, 2).map((s: any) => s.category);
  const allTopics = [...projectTopics, ...conceptTopics];
  console.log("🚀 ~ doParseResume ~ allTopics:", allTopics);

  return {
    candidate: {
      name: result.name || "",
      skills,
      experience: result.experience || 0,
      projects,
      strengths: result.strengths || [],
      gaps: result.gaps || [],
    },
    topics: allTopics,
  };
}

export async function analyzeResumeNode(state: any): Promise<any> {
  if (
    state.candidate?.skills?.length > 0 ||
    state.candidate?.projects?.length > 0
  ) {
    return {};
  }

  const resumeText = (state as any).resumeText || "";
  const jdText = state.position?.jdText || "";
  const candidateIntro = (state as any).candidateIntro || "";
  const threadId = (state as any).threadId || "";

  // 等待后台解析完成（共享 Promise，不会重复调 LLM）
  const result = await getOrStartResumeParse(threadId, () =>
    doParseResume(resumeText, jdText, candidateIntro),
  );

  if (result) {
    return {
      candidate: result.candidate,
      techRound: {
        currentTopic: "",
        currentQuestion: null,
        questionsAsked: [],
        depth: 0,
        topics: result.topics,
      },
    };
  }

  return {};
}
