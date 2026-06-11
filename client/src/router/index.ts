import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
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
    },
    {
      path: '/admin/positions',
      name: 'positions',
      component: () => import('../views/admin/PositionList.vue'),
    },
    {
      path: '/admin/positions/new',
      name: 'position-create',
      component: () => import('../views/admin/PositionForm.vue'),
    },
    {
      path: '/admin/positions/:id',
      name: 'position-edit',
      component: () => import('../views/admin/PositionForm.vue'),
    },
    {
      path: '/admin/candidates',
      name: 'candidates',
      component: () => import('../views/admin/CandidateList.vue'),
    },
    {
      path: '/admin/docs',
      name: 'docs',
      component: () => import('../views/admin/CompanyDocs.vue'),
    },
    {
      path: '/admin/llm-providers',
      name: 'llm-providers',
      component: () => import('../views/admin/LlmProviders.vue'),
    },
  ],
});

router.beforeEach((to) => {
  if (to.path.startsWith('/admin') && to.path !== '/admin/login' && !localStorage.getItem('adminToken')) {
    return { path: '/admin/login', query: { redirect: to.fullPath } };
  }
});

export default router;
