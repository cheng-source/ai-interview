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
      <h2>公司文档 (RAG 知识库)</h2>
      <form @submit.prevent="handleUpload" class="form">
        <input v-model="doc.title" placeholder="文档标题" required />
        <input v-model="doc.category" placeholder="分类 (福利/技术/文化)" required />
        <textarea v-model="doc.content" placeholder="文档内容" rows="10" required />
        <button type="submit">上传文档</button>
      </form>
      <table class="table" style="margin-top:20px;">
        <thead><tr><th>标题</th><th>分类</th><th>上传时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id">
            <td>{{ d.title }}</td><td>{{ d.category }}</td>
            <td>{{ new Date(d.uploadedAt).toLocaleDateString('zh-CN') }}</td>
            <td><button @click="handleDelete(d.id)">删除</button></td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { knowledgeApi } from '../../api/client';

const docs = ref<any[]>([]);
const doc = ref({ title: '', content: '', category: '' });

onMounted(async () => {
  const res = await knowledgeApi.list();
  docs.value = res.data;
});

async function handleUpload() {
  await knowledgeApi.upload(doc.value);
  doc.value = { title: '', content: '', category: '' };
  const res = await knowledgeApi.list();
  docs.value = res.data;
}

async function handleDelete(id: string) {
  await knowledgeApi.delete(id);
  docs.value = docs.value.filter((d) => d.id !== id);
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
.form { display: flex; flex-direction: column; gap: 12px; max-width: 600px; }
.form input, .form textarea { padding: 8px 12px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 14px; }
.form button { padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; width: fit-content; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
.table th { color: #94a3b8; font-size: 12px; text-transform: uppercase; }
.table button { color: #f87171; background: none; border: none; cursor: pointer; font-size: 13px; }
</style>
