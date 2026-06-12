// ========== 共享基础 ==========
export { api, getBaseURL, createSSERequest, readSSEStream } from './client';
export type { SSERequestOptions, SSERequestResult, SSEHandlers } from './client';

// ========== 业务 API 模块 ==========
export { authApi } from './auth';
export type { LoginInput, LoginResult } from './auth';

export { positionApi } from './position';
export type { PositionDto, PositionCreateInput, PositionUpdateInput } from './position';

export { candidateApi } from './candidate';
export type { CandidateDto, CandidateCreateInput, CandidateUpdateInput, ResumeParseResult } from './candidate';

export { interviewApi } from './interview';
export type { InterviewDto, InterviewCreateInput, AccessTokenResult, InterviewState } from './interview';

export { knowledgeApi } from './knowledge';
export type { CompanyDocDto, CompanyDocCreateInput } from './knowledge';

export { reportApi } from './report';
export type { ReportDto } from './report';

export { llmProviderApi } from './llm-provider';
export type { LlmProviderDto, LlmProviderCreateInput, LlmProviderUpdateInput } from './llm-provider';
