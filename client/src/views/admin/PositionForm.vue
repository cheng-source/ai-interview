<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <h3>AI 面试管理</h3>
      <nav>
        <router-link to="/admin">概览</router-link>
        <router-link to="/admin/positions">岗位管理</router-link>
        <router-link to="/admin/candidates">候选人管理</router-link>
        <router-link to="/admin/docs">公司文档</router-link>
      </nav>
    </aside>
    <main class="content">
      <h2>{{ isNew ? '新建岗位' : '编辑岗位' }}</h2>
      <form @submit.prevent="handleSave" class="form">
        <div class="field"><label>岗位名称</label><input v-model="form.title" required /></div>
        <div class="field"><label>部门</label><input v-model="form.department" required /></div>
        <div class="field"><label>JD 描述</label><textarea v-model="form.jdText" rows="6" required /></div>
        <div class="field"><label>技术栈 (逗号分隔)</label><input v-model="techStackStr" placeholder="React, TypeScript, Node.js" /></div>
        <div class="field"><label>级别</label>
          <select v-model="form.level">
            <option value="初级">初级</option><option value="中级">中级</option>
            <option value="高级">高级</option><option value="专家">专家</option>
          </select>
        </div>
        <button type="submit" class="btn-save">保存</button>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { positionsApi } from '../../api/client';

const route = useRoute();
const router = useRouter();
const isNew = computed(() => !route.params.id || route.params.id === 'new');

const form = ref({ title: '', department: '', jdText: '', techStack: [] as string[], level: '中级' });
const techStackStr = ref('');

onMounted(async () => {
  if (!isNew.value) {
    const res = await positionsApi.get(route.params.id as string);
    const data = res.data;
    form.value = { title: data.title, department: data.department, jdText: data.jdText, techStack: data.techStack || [], level: data.level };
    techStackStr.value = (data.techStack || []).join(', ');
  }
});

async function handleSave() {
  const payload = { ...form.value, techStack: techStackStr.value.split(',').map((s) => s.trim()).filter(Boolean) };
  if (isNew.value) {
    await positionsApi.create(payload);
  } else {
    await positionsApi.update(route.params.id as string, payload);
  }
  router.push('/admin/positions');
}
</script>

<style scoped>
.admin-layout { display: flex; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
.sidebar { width: 200px; background: #1e293b; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.sidebar h3 { font-size: 16px; color: #3b82f6; }
.sidebar nav { display: flex; flex-direction: column; gap: 8px; }
.sidebar nav a { padding: 8px 12px; border-radius: 6px; color: #94a3b8; text-decoration: none; font-size: 14px; }
.sidebar nav a:hover, .sidebar nav a.router-link-active { background: #334155; color: white; }
.content { flex: 1; padding: 24px; }
.form { max-width: 600px; display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 13px; color: #94a3b8; }
.field input, .field select, .field textarea {
  padding: 8px 12px; border-radius: 6px; border: 1px solid #334155;
  background: #1e293b; color: #e2e8f0; font-size: 14px;
}
.btn-save { padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; width: fit-content; }
</style>
