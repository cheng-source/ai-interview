<template>
  <InterviewConfirmPanel
    v-if="!session.started"
    v-model:manualResumeText="session.manualResumeText"
    :pageLoading="session.pageLoading"
    :error="session.pageError"
    :loading="session.loading"
    :candidateName="session.candidateName"
    :positionTitle="session.positionTitle"
    :positionDepartment="session.positionDepartment"
    :hasResume="session.hasResume"
    :canStart="session.canStart"
    @start="session.handleStart"
  />

  <InterviewChatPanel
    v-else
    :ref="session.registerChatPanel"
    :store="session.store"
    :sending="session.sending"
    @send="session.sendAnswer"
  />
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { proxyRefs } from "vue";
import InterviewChatPanel from "./components/InterviewChatPanel.vue";
import InterviewConfirmPanel from "./components/InterviewConfirmPanel.vue";
import { useInterviewSession } from "./useInterviewSession";

const route = useRoute();
const interviewId = route.params.interviewId as string;
const session = proxyRefs(useInterviewSession(interviewId));
</script>
