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
      <div class="header">
        <h2>岗位管理</h2>
        <router-link to="/admin/positions/new" class="btn-add">+ 新建岗位</router-link>
      </div>
      <table class="table">
        <thead><tr><th>岗位名称</th><th>部门</th><th>技术栈</th><th>级别</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="p in positions" :key="p.id">
            <td>{{ p.title }}</td><td>{{ p.department }}</td>
            <td>{{ (p.techStack || []).join(', ') }}</td><td>{{ p.level }}</td>
            <td>
              <router-link :to="`/admin/positions/${p.id}`">编辑</router-link>
              <button @click="handleDelete(p.id)">删除</button>
            </td>
          </tr>
          <tr v-if="positions.length === 0"><td colspan="5">暂无数据</td></tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { positionsApi } from '../../api/client';

const positions = ref<any[]>([]);

onMounted(async () => {
  const res = await positionsApi.list();
  positions.value = res.data;
});

async function handleDelete(id: string) {
  await positionsApi.delete(id);
  positions.value = positions.value.filter((p) => p.id !== id);
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
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.btn-add { padding: 8px 16px; background: #3b82f6; color: white; border-radius: 6px; text-decoration: none; font-size: 14px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
.table th { color: #94a3b8; font-size: 12px; text-transform: uppercase; }
.table button, .table a { color: #3b82f6; background: none; border: none; cursor: pointer; margin-right: 8px; font-size: 13px; }
</style>
