<template>
  <AdminLayout>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold text-gray-800">模型配置</h2>
        <p class="text-sm text-gray-500 mt-1">管理 OpenAI 兼容 Provider，切换默认聊天和向量模型。</p>
      </div>
      <div class="flex gap-2">
        <el-button @click="loadProviders" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增 Provider</el-button>
      </div>
    </div>

    <el-table :data="providers" v-loading="loading" empty-text="暂无 Provider">
      <el-table-column prop="id" label="Provider" width="140">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ row.id }}</span>
            <el-tag v-if="row.builtin" size="small">内置</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="model" label="聊天模型" min-width="170" />
      <el-table-column prop="baseUrl" label="Base URL" min-width="220" show-overflow-tooltip />
      <el-table-column label="API Key" width="120">
        <template #default="{ row }">{{ row.maskedApiKey }}</template>
      </el-table-column>
      <el-table-column label="默认" width="170">
        <template #default="{ row }">
          <div class="flex flex-col gap-1">
            <el-tag v-if="row.defaultChatProvider" type="success" size="small">默认聊天</el-tag>
            <el-tag v-if="row.defaultEmbeddingProvider" type="warning" size="small">默认向量</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="Embedding" width="170">
        <template #default="{ row }">
          <span v-if="row.supportsEmbedding">{{ row.embeddingModel || '-' }}</span>
          <span v-else class="text-gray-400">不支持</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="330" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text @click="setDefault(row)" :disabled="row.defaultChatProvider">设为默认</el-button>
          <el-button
            size="small"
            text
            @click="setDefaultEmbedding(row)"
            :disabled="!row.supportsEmbedding || row.defaultEmbeddingProvider"
          >
            默认向量
          </el-button>
          <el-button size="small" text @click="testProvider(row)" :loading="testingId === row.id">测试</el-button>
          <el-popconfirm title="确定删除该 Provider？" @confirm="deleteProvider(row)">
            <template #reference>
              <el-button size="small" text type="danger" :disabled="row.defaultChatProvider || row.defaultEmbeddingProvider">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑 Provider' : '新增 Provider'" width="560px">
      <el-form label-position="top" :model="form">
        <el-form-item label="Provider ID" required>
          <el-input v-model="form.id" :disabled="!!editingId" placeholder="deepseek" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </el-form-item>
        <el-form-item label="API Key" :required="!editingId">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="留空表示不修改" />
        </el-form-item>
        <el-form-item label="聊天模型" required>
          <el-input v-model="form.model" placeholder="deepseek-v4-pro" />
        </el-form-item>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="Temperature">
            <el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </div>
        <el-divider content-position="left">Embedding</el-divider>
        <el-form-item>
          <el-checkbox v-model="form.supportsEmbedding">支持向量模型</el-checkbox>
        </el-form-item>
        <div class="grid grid-cols-2 gap-3">
          <el-form-item label="Embedding 模型">
            <el-input v-model="form.embeddingModel" placeholder="text-embedding-v3" :disabled="!form.supportsEmbedding" />
          </el-form-item>
          <el-form-item label="向量维度">
            <el-input-number v-model="form.embeddingDimensions" :min="1" class="w-full" :disabled="!form.supportsEmbedding" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProvider" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { llmProvidersApi } from '../../api/client';
import AdminLayout from '../../components/AdminLayout.vue';

const loading = ref(false);
const saving = ref(false);
const testingId = ref('');
const providers = ref<any[]>([]);
const dialogVisible = ref(false);
const editingId = ref('');

const form = reactive({
  id: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  embeddingModel: '',
  embeddingDimensions: 1024,
  supportsEmbedding: false,
  temperature: 0.5 as number | null,
  enabled: true,
});

onMounted(loadProviders);

async function loadProviders() {
  loading.value = true;
  try {
    const res = await llmProvidersApi.list();
    providers.value = res.data;
  } catch {
    ElMessage.error('加载 Provider 失败');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    id: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    embeddingModel: '',
    embeddingDimensions: 1024,
    supportsEmbedding: false,
    temperature: 0.5,
    enabled: true,
  });
}

function openCreate() {
  editingId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: any) {
  editingId.value = row.id;
  Object.assign(form, {
    id: row.id,
    baseUrl: row.baseUrl,
    apiKey: '',
    model: row.model,
    embeddingModel: row.embeddingModel || '',
    embeddingDimensions: row.embeddingDimensions || 1024,
    supportsEmbedding: row.supportsEmbedding,
    temperature: row.temperature ?? 0.5,
    enabled: row.enabled,
  });
  dialogVisible.value = true;
}

async function saveProvider() {
  if (!form.id.trim() || !form.baseUrl.trim() || !form.model.trim()) {
    ElMessage.warning('请填写 Provider ID、Base URL 和模型名');
    return;
  }
  if (!editingId.value && !form.apiKey.trim()) {
    ElMessage.warning('新增 Provider 需要填写 API Key');
    return;
  }

  saving.value = true;
  const payload = {
    ...form,
    embeddingModel: form.supportsEmbedding ? form.embeddingModel : null,
    embeddingDimensions: form.supportsEmbedding ? form.embeddingDimensions : null,
    temperature: form.temperature ?? null,
  };
  try {
    if (editingId.value) {
      await llmProvidersApi.update(editingId.value, payload);
    } else {
      await llmProvidersApi.create(payload);
    }
    dialogVisible.value = false;
    ElMessage.success('保存成功');
    await loadProviders();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function setDefault(row: any) {
  try {
    await llmProvidersApi.updateDefault(row.id);
    ElMessage.success(`已切换默认聊天模型：${row.model}`);
    await loadProviders();
  } catch {
    ElMessage.error('切换默认模型失败');
  }
}

async function setDefaultEmbedding(row: any) {
  try {
    await llmProvidersApi.updateDefaultEmbedding(row.id);
    ElMessage.success(`已切换默认向量模型：${row.embeddingModel}`);
    await loadProviders();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '切换默认向量模型失败');
  }
}

async function testProvider(row: any) {
  testingId.value = row.id;
  try {
    const res = await llmProvidersApi.test(row.id);
    if (res.data.success) {
      ElMessage.success(res.data.message || '连接成功');
    } else {
      ElMessage.error(res.data.message || '连接失败');
    }
  } catch {
    ElMessage.error('测试失败');
  } finally {
    testingId.value = '';
  }
}

async function deleteProvider(row: any) {
  try {
    await llmProvidersApi.delete(row.id);
    ElMessage.success('删除成功');
    await loadProviders();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '删除失败');
  }
}
</script>
