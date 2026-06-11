<template>
  <div class="flex flex-col h-screen bg-gray-50">
    <div
      v-if="pageLoading"
      class="max-w-[480px] mx-auto mt-40 text-center text-gray-400 text-sm"
    >
      加载中...
    </div>

    <div v-else-if="error" class="max-w-[480px] mx-auto mt-40 text-center">
      <div class="text-red-500 text-lg mb-4">{{ error }}</div>
      <p class="text-gray-400 text-sm">如有疑问，请联系 HR 获取有效面试链接</p>
    </div>

    <div v-else class="max-w-[480px] mx-auto mt-20 p-10 text-center">
      <h1 class="text-[28px] text-gray-800 mb-2">AI 智能面试</h1>
      <p class="text-gray-500 text-sm mb-8">请确认以下信息，准备开始面试</p>

      <div class="bg-white border border-gray-200 rounded-xl p-6 text-left shadow-sm">
        <div class="mb-4">
          <span class="text-xs text-gray-400">候选人</span>
          <p class="text-base text-gray-800 font-medium">{{ candidateName || "--" }}</p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">应聘岗位</span>
          <p class="text-base text-gray-800 font-medium">{{ positionTitle || "--" }}</p>
        </div>
        <div class="mb-4">
          <span class="text-xs text-gray-400">部门</span>
          <p class="text-base text-gray-800 font-medium">{{ positionDepartment || "--" }}</p>
        </div>
        <div>
          <span class="text-xs text-gray-400">简历状态</span>
          <p
            :class="[
              'text-sm font-medium',
              hasResume ? 'text-green-600' : 'text-orange-500',
            ]"
          >
            {{ hasResume ? "已就绪" : "未上传简历，请使用下方文本框粘贴" }}
          </p>
        </div>
      </div>

      <div v-if="!hasResume" class="mt-4">
        <textarea
          :value="manualResumeText"
          placeholder="请在此粘贴你的简历文本..."
          class="w-full p-3 rounded-lg border border-gray-300 bg-white text-gray-800 outline-none resize-y text-sm leading-relaxed min-h-[120px] box-border focus:border-blue-400"
          rows="6"
          @input="$emit('update:manualResumeText', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>

      <el-button
        type="primary"
        size="large"
        class="mt-6"
        :disabled="!canStart || loading"
        :loading="loading"
        @click="$emit('start')"
      >
        {{ loading ? "正在初始化面试..." : "开始面试" }}
      </el-button>

      <p v-if="!hasResume && !manualResumeText.trim()" class="text-gray-400 text-xs mt-2">
        请先粘贴简历内容再开始
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  pageLoading: boolean;
  error: string;
  loading: boolean;
  candidateName: string;
  positionTitle: string;
  positionDepartment: string;
  hasResume: boolean;
  canStart: boolean;
  manualResumeText: string;
}>();

defineEmits<{
  start: [];
  "update:manualResumeText": [value: string];
}>();
</script>
