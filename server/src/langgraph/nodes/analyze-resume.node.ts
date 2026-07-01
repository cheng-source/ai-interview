import { HumanMessage } from "@langchain/core/messages";
import { executePersona } from "../personas/persona-executor";
import { resumeParserPersona } from "../personas/resume-parser.persona";
import { getOrStartResumeParse } from "../llm";
import { pushEvent } from "../llm";
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
  console.log("🚀 ~ doParseResume ~ result:", result);

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

export async function analyzeResumeNode(state: any, config?: any): Promise<any> {
  if (
    state.candidate?.skills?.length > 0 ||
    state.candidate?.projects?.length > 0
  ) {
    pushEvent({ type: "stage", stage: "parse_resume" });
    pushEvent({ type: "status", content: "简历已解析，正在准备面试题..." });
    return {};
  }

  const resumeText = (state as any).resumeText || "";
  const jdText = state.position?.jdText || "";
  const candidateIntro = (state as any).candidateIntro || "";
  // threadId 不在 InterviewStateAnnotation 里（state.threadId 恒为 undefined），
  // 必须从 config.configurable.thread_id 取，才能和 streamStart 里 prewarm 用的 key 对上，
  // 否则 prewarm 和节点会各发一次 LLM 调用（prewarm 的结果被浪费）。
  const threadId = config?.configurable?.thread_id || (state as any).threadId || "";

  // 等待后台解析完成（共享 Promise，不会重复调 LLM）
  pushEvent({ type: "stage", stage: "parse_resume" });
  pushEvent({ type: "status", content: "正在解析简历..." });
  const result = await getOrStartResumeParse(threadId, () =>
    doParseResume(resumeText, jdText, candidateIntro),
  );
  console.log("简历解析完成", result);
  if (result) {
    pushEvent({ type: "status", content: "简历解析完成，正在生成面试题..." });
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
