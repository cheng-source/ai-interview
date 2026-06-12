<template>
  <AdminLayout>
    <h2 class="text-xl font-semibold text-gray-800 mb-4">面试概览</h2>
    <div v-if="loading" class="text-center py-10 text-gray-400">加载中...</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-6 bg-white rounded-xl border border-gray-200 shadow-sm text-center flex flex-col gap-2">
        <span class="text-3xl font-bold text-gray-800">{{ stats.total }}</span>
        <span class="text-sm text-gray-500">总面试数</span>
      </div>
      <div class="p-6 bg-white rounded-xl border border-green-300 shadow-sm text-center flex flex-col gap-2">
        <span class="text-3xl font-bold text-gray-800">{{ stats.inProgress }}</span>
        <span class="text-sm text-gray-500">进行中</span>
      </div>
      <div class="p-6 bg-white rounded-xl border border-blue-300 shadow-sm text-center flex flex-col gap-2">
        <span class="text-3xl font-bold text-gray-800">{{ stats.completed }}</span>
        <span class="text-sm text-gray-500">已完成</span>
      </div>
      <div class="p-6 bg-white rounded-xl border border-amber-300 shadow-sm text-center flex flex-col gap-2">
        <span class="text-3xl font-bold text-gray-800">{{ stats.abandoned }}</span>
        <span class="text-sm text-gray-500">疑似放弃</span>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { interviewApi } from '../../api';
import AdminLayout from '@/layouts/AdminLayout.vue';

const loading = ref(true);
const stats = ref({ total: 0, inProgress: 0, completed: 0, pending: 0, abandoned: 0 });
const ABANDON_MINUTES = 30;

onMounted(async () => {
  try {
    const res = await interviewApi.list();
    const list = res.data;
    const now = Date.now();
    stats.value.total = list.length;
    stats.value.inProgress = list.filter((i: any) => i.status === 'in_progress').length;
    stats.value.completed = list.filter((i: any) => i.status === 'completed').length;
    stats.value.pending = list.filter((i: any) => i.status === 'pending').length;
    stats.value.abandoned = list.filter((i: any) =>
      i.status === 'in_progress' && i.lastActiveAt &&
      (now - new Date(i.lastActiveAt).getTime()) > ABANDON_MINUTES * 60 * 1000
    ).length;
  } catch {
    ElMessage.error('加载面试数据失败');
  } finally {
    loading.value = false;
  }
});
</script>
