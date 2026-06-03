<template>
  <AdminLayout>
    <h2 class="text-xl font-semibold text-gray-800 mb-4">公司文档 (RAG 知识库)</h2>
    <div class="max-w-lg mb-6">
      <el-radio-group v-model="uploadMode" class="mb-4">
        <el-radio-button value="text">粘贴文本</el-radio-button>
        <el-radio-button value="file">上传文件</el-radio-button>
      </el-radio-group>

      <!-- 粘贴文本模式 -->
      <el-form v-if="uploadMode === 'text'" :model="doc" label-position="top" @submit.prevent="handleUpload">
        <el-form-item label="文档标题" required><el-input v-model="doc.title" /></el-form-item>
        <el-form-item label="分类 (福利/技术/文化)" required><el-input v-model="doc.category" /></el-form-item>
        <el-form-item label="文档内容" required><el-input v-model="doc.content" type="textarea" :rows="10" /></el-form-item>
        <el-form-item><el-button type="primary" @click="handleUpload" :loading="uploading">上传文档</el-button></el-form-item>
      </el-form>

      <!-- 上传文件模式 -->
      <el-form v-else :model="fileDoc" label-position="top">
        <el-form-item label="文档标题" required><el-input v-model="fileDoc.title" /></el-form-item>
        <el-form-item label="分类 (福利/技术/文化)" required><el-input v-model="fileDoc.category" /></el-form-item>
        <el-form-item label="选择文件" required>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :on-exceed="handleExceed"
            :before-upload="beforeUpload"
            accept=".pdf,.docx,.doc,.txt,.md"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 PDF / DOCX / DOC / TXT / MD，文件大小不超过 5MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleFileUpload" :loading="uploading" :disabled="!fileDoc.file">
            上传文件
          </el-button>
        </el-form-item>
      </el-form>
    </div>
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
import { ElMessage, type UploadFile, type UploadInstance } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { knowledgeApi } from '../../api/client';
import AdminLayout from '../../components/AdminLayout.vue';

const loading = ref(true);
const uploading = ref(false);
const docs = ref<any[]>([]);
const doc = ref({ title: '', content: '', category: '' });
const fileDoc = ref<{ title: string; category: string; file: File | null }>({ title: '', category: '', file: null });
const uploadMode = ref<'text' | 'file'>('text');
const uploadRef = ref<UploadInstance>();
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
  if (!doc.value.title.trim()) {
    ElMessage.warning('请输入文档标题');
    return;
  }
  if (!doc.value.category.trim()) {
    ElMessage.warning('请输入分类');
    return;
  }
  if (!doc.value.content.trim()) {
    ElMessage.warning('请输入文档内容');
    return;
  }
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

function handleFileChange(uploadFile: UploadFile) {
  if (uploadFile.raw) {
    fileDoc.value.file = uploadFile.raw;
  }
}

function handleExceed() {
  ElMessage.warning('只能上传一个文件，请先移除已选文件');
}

function beforeUpload(file: File) {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
  ];
  if (!allowedTypes.includes(file.type) && !/\.(pdf|docx?|txt|md)$/i.test(file.name)) {
    ElMessage.error('不支持的文件格式');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 5MB');
    return false;
  }
  return true;
}

async function handleFileUpload() {
  if (!fileDoc.value.file) {
    ElMessage.warning('请先选择文件');
    return;
  }
  if (!fileDoc.value.title.trim()) {
    ElMessage.warning('请输入文档标题');
    return;
  }
  if (!fileDoc.value.category.trim()) {
    ElMessage.warning('请输入分类');
    return;
  }
  uploading.value = true;
  try {
    await knowledgeApi.uploadFile(fileDoc.value.title, fileDoc.value.category, fileDoc.value.file);
    fileDoc.value = { title: '', category: '', file: null };
    uploadRef.value?.clearFiles();
    const res = await knowledgeApi.list();
    docs.value = res.data;
    ElMessage.success('文件上传成功');
  } catch {
    ElMessage.error('文件上传失败');
  } finally {
    uploading.value = false;
  }
}
</script>
