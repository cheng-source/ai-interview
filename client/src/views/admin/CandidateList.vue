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
        <h2>候选人管理</h2>
        <button @click="showForm = !showForm" class="btn-add">+ 邀请候选人</button>
      </div>
      <form v-if="showForm" @submit.prevent="handleCreate" class="form">
        <input v-model="newCandidate.name" placeholder="姓名" required />
        <input v-model="newCandidate.email" placeholder="邮箱" required />
        <input v-model="newCandidate.phone" placeholder="电话" required />
        <select v-model="newCandidate.positionId" required>
          <option value="">选择岗位</option>
          <option v-for="p in positions" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
        <button type="submit">创建</button>
      </form>
      <div v-if="showTypeDialog" class="type-overlay" @click.self="showTypeDialog = false">
        <div class="type-dialog">
          <h4>选择面试类型</h4>
          <label class="type-option"><input type="radio" v-model="selectedType" value="technical" /> 技术面试</label>
          <label class="type-option"><input type="radio" v-model="selectedType" value="behavioral" /> 行为面试</label>
          <div class="type-actions">
            <button @click="showTypeDialog = false" class="btn-cancel">取消</button>
            <button @click="confirmType" class="btn-confirm">确认生成</button>
          </div>
        </div>
      </div>
      <table class="table">
        <thead><tr><th>姓名</th><th>邮箱</th><th>岗位</th><th>面试类型</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in candidates" :key="c.id">
            <td>{{ c.name }}</td><td>{{ c.email }}</td>
            <td>{{ c.position?.title || '-' }}</td>
            <td>
              <span v-if="c.interviews?.length" :class="c.interviews[0].interviewType === 'behavioral' ? 'tag-behavioral' : 'tag-technical'">
                {{ c.interviews[0].interviewType === 'behavioral' ? '行为面' : '技术面' }}
              </span>
              <span v-else class="text-gray-500">-</span>
            </td>
            <td>{{ c.status }}</td>
            <td>
              <button @click="startInterview(c)">开始面试</button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { candidatesApi, positionsApi, interviewsApi } from '../../api/client';

const candidates = ref<any[]>([]);
const positions = ref<any[]>([]);
const showForm = ref(false);
const newCandidate = ref({ name: '', email: '', phone: '', positionId: '' });
const showTypeDialog = ref(false);
const typeTarget = ref<any>(null);
const selectedType = ref('technical');

onMounted(async () => {
  const [cRes, pRes] = await Promise.all([candidatesApi.list(), positionsApi.list()]);
  candidates.value = cRes.data;
  positions.value = pRes.data;
});

async function handleCreate() {
  await candidatesApi.create(newCandidate.value);
  showForm.value = false;
  newCandidate.value = { name: '', email: '', phone: '', positionId: '' };
  const res = await candidatesApi.list();
  candidates.value = res.data;
}

async function startInterview(c: any) {
  typeTarget.value = c;
  selectedType.value = 'technical';
  showTypeDialog.value = true;
}

async function confirmType() {
  if (!typeTarget.value) return;
  const c = typeTarget.value;
  showTypeDialog.value = false;
  const interview = await interviewsApi.create({
    candidateId: c.id,
    positionId: c.positionId,
    interviewType: selectedType.value,
  });
  const link = `http://localhost:5173/interview/${interview.data.id}`;
  await navigator.clipboard.writeText(link);
  alert(`面试链接已复制: ${link}`);
  const res = await candidatesApi.list();
  candidates.value = res.data;
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
.btn-add { padding: 8px 16px; background: #3b82f6; color: white; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; }
.form { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; padding: 12px; background: #1e293b; border-radius: 8px; }
.form input, .form select { padding: 6px 10px; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 13px; }
.form button { padding: 6px 14px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
.table th { color: #94a3b8; font-size: 12px; text-transform: uppercase; }
.table button { color: #3b82f6; background: none; border: none; cursor: pointer; font-size: 13px; }
.tag-technical { padding: 2px 8px; border-radius: 4px; background: #1e40af; color: #93c5fd; font-size: 12px; }
.tag-behavioral { padding: 2px 8px; border-radius: 4px; background: #92400e; color: #fcd34d; font-size: 12px; }
.text-gray-500 { color: #6b7280; }
.type-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.type-dialog { background: #1e293b; border-radius: 12px; padding: 24px; min-width: 280px; }
.type-dialog h4 { margin: 0 0 16px; font-size: 16px; color: #e2e8f0; }
.type-option { display: block; padding: 8px 0; color: #cbd5e1; font-size: 14px; cursor: pointer; }
.type-option input { margin-right: 8px; }
.type-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
.btn-cancel { padding: 6px 14px; background: #334155; color: #94a3b8; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-confirm { padding: 6px 14px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
</style>
