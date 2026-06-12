<template>
  <div class="flex min-h-screen bg-gray-50">
    <aside class="w-52 bg-gray-800 p-5 flex flex-col gap-4">
      <h3 class="text-base text-blue-400 font-semibold">AI 面试管理</h3>
      <nav class="flex flex-col gap-2">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="px-3 py-2 rounded-md text-gray-300 text-sm no-underline hover:bg-gray-700 hover:text-white transition-colors"
          :class="{ 'bg-gray-700 !text-white': isActive(item) }"
        >
          {{ item.title }}
        </router-link>
      </nav>
    </aside>
    <main class="flex-1 p-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { getAdminMenu, type AdminMenuItem } from '@/router';

const route = useRoute();
const menuItems: AdminMenuItem[] = getAdminMenu();

function isActive(item: AdminMenuItem): boolean {
  if (route.path === item.path) return true;
  // 高亮父菜单（如 /admin/positions/new 时高亮 /admin/positions）
  const currentRoute = route.matched[0];
  return currentRoute?.meta?.parent === item.path.split('/').pop();
}
</script>
