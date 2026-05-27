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
      <h2>面试概览</h2>
      <div class="stats">
        <div class="stat-card">总面试数: 0</div>
        <div class="stat-card">进行中: 0</div>
        <div class="stat-card">已完成: 0</div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-layout { display: flex; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
.sidebar { width: 200px; background: #1e293b; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.sidebar h3 { font-size: 16px; color: #3b82f6; }
.sidebar nav { display: flex; flex-direction: column; gap: 8px; }
.sidebar nav a {
  padding: 8px 12px; border-radius: 6px; color: #94a3b8; text-decoration: none; font-size: 14px;
}
.sidebar nav a:hover, .sidebar nav a.router-link-active { background: #334155; color: white; }
.content { flex: 1; padding: 24px; }
.stats { display: flex; gap: 16px; margin-top: 16px; }
.stat-card { padding: 20px; background: #1e293b; border-radius: 10px; border: 1px solid #334155; flex: 1; text-align: center; }
</style>
