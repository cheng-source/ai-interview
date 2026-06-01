<template>
  <AdminLayout>
    <h2 class="text-xl font-semibold text-gray-800 mb-4">公司文档 (RAG 知识库)</h2>
    <el-form :model="doc" label-position="top" class="max-w-lg mb-6" @submit.prevent="handleUpload">
      <el-form-item label="文档标题" required><el-input v-model="doc.title" /></el-form-item>
      <el-form-item label="分类 (福利/技术/文化)" required><el-input v-model="doc.category" /></el-form-item>
      <el-form-item label="文档内容" required><el-input v-model="doc.content" type="textarea" :rows="10" /></el-form-item>
      <el-form-item><el-button type="primary" @click="handleUpload" :loading="uploading">上传文档</el-button></el-form-item>
    </el-form>
    <el-table :data="docs" empty-text="暂无文档" v-loading="loading">
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="category" label="分类" />
      <el-table-column label="上传时间" width="160">
        <template #default="{ row }">{{ new Date(row.uploadedAt).toLocaleDateString('zh-CN') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="handleDownload(row)">下载</el-button>
          <el-popconfirm title="确定删除该文档？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button size="small" text type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { knowledgeApi } from '../../api/client';
import AdminLayout from '../../components/AdminLayout.vue';

const loading = ref(true);
const uploading = ref(false);
const docs = ref<any[]>([]);
const doc = ref({ title: '', content: '', category: '' });
onMounted(async () => {
  try {
    const res = await knowledgeApi.list();
    docs.value = res.data;
  } catch {
    ElMessage.error('加载文档列表失败');
  } finally {
    loading.value = false;
  }
});
async function handleUpload() {
  uploading.value = true;
  try {
    await knowledgeApi.upload(doc.value);
    doc.value = { title: '', content: '', category: '' };
    const res = await knowledgeApi.list();
    docs.value = res.data;
    ElMessage.success('上传成功');
  } catch {
    ElMessage.error('上传失败');
  } finally {
    uploading.value = false;
  }
}
function handleDownload(row: any) {
  const blob = new Blob([row.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${row.title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
async function handleDelete(id: string) {
  try {
    await knowledgeApi.delete(id);
    docs.value = docs.value.filter((d) => d.id !== id);
    ElMessage.success('删除成功');
  } catch {
    ElMessage.error('删除失败');
  }
}
</script>
