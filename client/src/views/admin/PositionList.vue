<template>
  <AdminLayout>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold text-gray-800">岗位管理</h2>
      <router-link to="/admin/positions/new">
        <el-button type="primary">+ 新建岗位</el-button>
      </router-link>
    </div>
    <el-table :data="positions" empty-text="暂无数据" v-loading="loading">
      <el-table-column prop="title" label="岗位名称" />
      <el-table-column prop="department" label="部门" />
      <el-table-column label="技术栈">
        <template #default="{ row }">
          <el-tag v-for="t in (row.techStack || [])" :key="t" size="small" class="mr-1">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="level" label="级别" width="80" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <router-link :to="`/admin/positions/${row.id}`">
            <el-button size="small" text>编辑</el-button>
          </router-link>
          <el-popconfirm title="确定删除该岗位？" @confirm="handleDelete(row.id)">
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
import { positionsApi } from '../../api/client';
import AdminLayout from '../../components/AdminLayout.vue';

const loading = ref(true);
const positions = ref<any[]>([]);
onMounted(async () => {
  try {
    const res = await positionsApi.list();
    positions.value = res.data;
  } catch {
    ElMessage.error('加载岗位列表失败');
  } finally {
    loading.value = false;
  }
});
async function handleDelete(id: string) {
  try {
    await positionsApi.delete(id);
    positions.value = positions.value.filter((p) => p.id !== id);
    ElMessage.success('删除成功');
  } catch {
    ElMessage.error('删除失败');
  }
}
</script>
