import { createRouter, createWebHistory } from 'vue-router';

export interface AdminMenuItem {
  path: string;
  title: string;
  icon: string;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/admin',
    },
    {
      path: '/interview/:interviewId',
      name: 'interview',
      component: () => import('../views/candidate/InterviewSession.vue'),
    },
    {
      path: '/admin/login',
      name: 'admin-login',
      component: () => import('../views/admin/Login.vue'),
    },
    {
      path: '/admin',
      name: 'dashboard',
      component: () => import('../views/admin/Dashboard.vue'),
      meta: { title: '概览', icon: 'DataAnalysis' },
    },
    {
      path: '/admin/positions',
      name: 'positions',
      component: () => import('../views/admin/PositionList.vue'),
      meta: { title: '岗位管理', icon: 'Briefcase' },
    },
    {
      path: '/admin/positions/new',
      name: 'position-create',
      component: () => import('../views/admin/PositionForm.vue'),
      meta: { parent: 'positions' },
    },
    {
      path: '/admin/positions/:id',
      name: 'position-edit',
      component: () => import('../views/admin/PositionForm.vue'),
      meta: { parent: 'positions' },
    },
    {
      path: '/admin/candidates',
      name: 'candidates',
      component: () => import('../views/admin/CandidateList.vue'),
      meta: { title: '候选人管理', icon: 'User' },
    },
    {
      path: '/admin/docs',
      name: 'docs',
      component: () => import('../views/admin/CompanyDocs.vue'),
      meta: { title: '公司文档', icon: 'Document' },
    },
    {
      path: '/admin/llm-providers',
      name: 'llm-providers',
      component: () => import('../views/admin/LlmProviders.vue'),
      meta: { title: '模型配置', icon: 'Setting' },
    },
  ],
});

/** 从路由配置中提取管理后台菜单项（仅含 meta.title 的路由） */
export function getAdminMenu(): AdminMenuItem[] {
  return router
    .getRoutes()
    .filter((r) => r.meta.title && r.path.startsWith('/admin'))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((r) => ({
      path: r.path,
      title: r.meta.title as string,
      icon: r.meta.icon as string,
    }));
}

router.beforeEach((to) => {
  if (to.path.startsWith('/admin') && to.path !== '/admin/login' && !localStorage.getItem('adminToken')) {
    return { path: '/admin/login', query: { redirect: to.fullPath } };
  }
});

export default router;
