<template>
  <AdminLayout>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold text-gray-800">候选人管理</h2>
      <el-button type="primary" @click="openCreate">+ 邀请候选人</el-button>
    </div>

    <div v-if="copiedId" class="fixed top-4 right-4 px-4 py-2.5 bg-green-500 text-white rounded-lg text-sm z-50 shadow-lg">
      链接已复制到剪贴板
    </div>

    <el-table :data="candidates" empty-text="暂无数据">
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column label="岗位">
        <template #default="{ row }">{{ row.position?.title || '-' }}</template>
      </el-table-column>
      <el-table-column label="面试链接" min-width="320">
        <template #default="{ row }">
          <template v-if="row.interviews?.length">
            <el-tag size="small" :type="row.interviews[0].interviewType === 'behavioral' ? 'warning' : ''" class="mr-1">
              {{ row.interviews[0].interviewType === 'behavioral' ? '行为面' : '技术面' }}
            </el-tag>
            <span class="text-xs text-gray-400 max-w-52 truncate inline-block align-middle mr-2">
              {{ `${BASE}/interview/${row.interviews[0].id}?token=******` }}
            </span>
            <el-button size="small" text @click="copyLink(row.interviews[0].id)">复制</el-button>
          </template>
          <el-button v-else size="small" type="primary" @click="createInterviewFor(row)">生成链接</el-button>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row)" size="small">{{ statusLabel(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" text @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该候选人？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button size="small" text type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑候选人' : '邀请候选人'" width="480px">
      <el-form :model="form" label-position="top">
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="邮箱" required><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="电话" required><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="岗位" required>
          <el-select v-model="form.positionId" class="w-full">
            <el-option v-for="p in positions" :key="p.id" :label="p.title" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="简历">
          <label class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs cursor-pointer border border-gray-300 hover:bg-gray-200 inline-block">
            {{ uploading ? '解析中...' : resumeFile ? resumeFile.name : (form.resumeText ? '已上传' : '上传简历 (PDF/Word)') }}
            <input type="file" accept=".pdf,.docx,.doc,.txt" class="hidden" @change="(e) => resumeFile = (e.target as HTMLInputElement).files?.[0] || null" />
          </label>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!form.name || !form.email || !form.phone || !form.positionId">保存</el-button>
      </template>
    </el-dialog>

    <!-- 面试类型选择对话框 -->
    <el-dialog v-model="interviewTypeDialogVisible" title="选择面试类型" width="360px">
      <el-radio-group v-model="selectedInterviewType" class="flex flex-col gap-3">
        <el-radio value="technical" size="large">技术面试</el-radio>
        <el-radio value="behavioral" size="large">行为面试</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="interviewTypeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmCreateInterview">确认生成</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { candidatesApi, positionsApi, interviewsApi } from '../../api/client';
import AdminLayout from '../../components/AdminLayout.vue';

const candidates = ref<any[]>([]);
const positions = ref<any[]>([]);
const copiedId = ref('');
const dialogVisible = ref(false);
const editingId = ref('');
const form = ref<Record<string, string>>({ name: '', email: '', phone: '', positionId: '' });
const resumeFile = ref<File | null>(null);
const uploading = ref(false);
const saving = ref(false);
const BASE = import.meta.env.VITE_APP_BASE || 'http://localhost:5173';
const ABANDON_MINUTES = 30;

const interviewTypeDialogVisible = ref(false);
const interviewTypeTarget = ref<any>(null);
const selectedInterviewType = ref('technical');

onMounted(async () => { await refresh(); });

async function refresh() {
  const [cRes, pRes] = await Promise.all([candidatesApi.list(), positionsApi.list()]);
  positions.value = pRes.data;
  candidates.value = Array.isArray(cRes.data) ? cRes.data : (cRes.data?.data || []);
}

function openCreate() {
  editingId.value = '';
  form.value = { name: '', email: '', phone: '', positionId: '' };
  resumeFile.value = null;
  dialogVisible.value = true;
}

function openEdit(row: any) {
  editingId.value = row.id;
  form.value = {
    name: row.name,
    email: row.email,
    phone: row.phone,
    positionId: row.positionId,
    resumeText: row.resumeText || '',
  };
  resumeFile.value = null;
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    const payload: any = { name: form.value.name, email: form.value.email, phone: form.value.phone, positionId: form.value.positionId };
    let candidateId = editingId.value;

    if (editingId.value) {
      await candidatesApi.update(editingId.value, payload);
    } else {
      const candidate = await candidatesApi.create(payload);
      candidateId = candidate.data.id;
    }

    if (resumeFile.value && candidateId) {
      uploading.value = true;
      try { await candidatesApi.uploadResume(candidateId, resumeFile.value); } catch (e) { ElMessage.error('简历上传失败，请重试'); throw e; }
      uploading.value = false;
    }

    dialogVisible.value = false;
    await refresh();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  await candidatesApi.delete(id);
  await refresh();
}

function createInterviewFor(c: any) {
  interviewTypeTarget.value = c;
  selectedInterviewType.value = 'technical';
  interviewTypeDialogVisible.value = true;
}

async function confirmCreateInterview() {
  if (!interviewTypeTarget.value) return;
  await interviewsApi.create({
    candidateId: interviewTypeTarget.value.id,
    positionId: interviewTypeTarget.value.positionId,
    interviewType: selectedInterviewType.value,
  });
  interviewTypeDialogVisible.value = false;
  interviewTypeTarget.value = null;
  await refresh();
}

async function copyLink(id: string) {
  const res = await interviewsApi.rotateAccessToken(id);
  await navigator.clipboard.writeText(`${BASE}/interview/${id}?token=${res.data.accessToken}`);
  copiedId.value = id;
  setTimeout(() => { copiedId.value = ''; }, 2000);
}

function isAbandoned(i: any) {
  if (i.status !== 'in_progress' || !i.lastActiveAt) return false;
  return (Date.now() - new Date(i.lastActiveAt).getTime()) > ABANDON_MINUTES * 60 * 1000;
}

function statusType(c: any) {
  const latest = c.interviews?.[0];
  if (!latest) return 'info';
  if (latest.status === 'completed') return 'success';
  if (latest.status === 'in_progress' && isAbandoned(latest)) return 'warning';
  if (latest.status === 'in_progress') return '';
  return 'info';
}

function statusLabel(c: any) {
  const latest = c.interviews?.[0];
  if (!latest) return '未创建';
  if (latest.status === 'completed') return '已完成';
  if (latest.status === 'in_progress' && isAbandoned(latest)) return '疑似放弃';
  if (latest.status === 'in_progress') return '进行中';
  return '待开始';
}
</script>
