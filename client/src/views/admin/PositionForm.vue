<template>
  <AdminLayout>
    <h2 class="text-xl font-semibold text-gray-800 mb-4">{{ isNew ? '新建岗位' : '编辑岗位' }}</h2>
    <el-form :model="form" label-position="top" class="max-w-lg" @submit.prevent="handleSave">
      <el-form-item label="岗位名称" required><el-input v-model="form.title" /></el-form-item>
      <el-form-item label="部门" required><el-input v-model="form.department" /></el-form-item>
      <el-form-item label="JD 描述" required><el-input v-model="form.jdText" type="textarea" :rows="6" /></el-form-item>
      <el-form-item label="技术栈 (逗号分隔)"><el-input v-model="techStackStr" placeholder="React, TypeScript, Node.js" /></el-form-item>
      <el-form-item label="级别">
        <el-select v-model="form.level">
          <el-option label="初级" value="初级" /><el-option label="中级" value="中级" />
          <el-option label="高级" value="高级" /><el-option label="专家" value="专家" />
        </el-select>
      </el-form-item>
      <el-form-item><el-button type="primary" @click="handleSave">保存</el-button></el-form-item>
    </el-form>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { positionApi } from '../../api';
import AdminLayout from '@/layouts/AdminLayout.vue';

const route = useRoute(); const router = useRouter();
const isNew = computed(() => !route.params.id || route.params.id === 'new');
const form = ref({ title: '', department: '', jdText: '', techStack: [] as string[], level: '中级' });
const techStackStr = ref('');
onMounted(async () => {
  if (!isNew.value) {
    const res = await positionApi.get(route.params.id as string);
    const data = res.data;
    form.value = { title: data.title, department: data.department, jdText: data.jdText, techStack: data.techStack || [], level: data.level };
    techStackStr.value = (data.techStack || []).join(', ');
  }
});
async function handleSave() {
  const payload = { ...form.value, techStack: techStackStr.value.split(',').map((s) => s.trim()).filter(Boolean) };
  if (isNew.value) await positionApi.create(payload);
  else await positionApi.update(route.params.id as string, payload);
  router.push('/admin/positions');
}
</script>
