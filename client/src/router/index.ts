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
      path: '/admin/candidates',
      name: 'candidates',
      component: () => import('../views/admin/CandidateList.vue'),
    },
    {
      path: '/admin/docs',
      name: 'docs',
      component: () => import('../views/admin/CompanyDocs.vue'),
    },
  ],
});

export default router;
