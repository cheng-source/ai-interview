<template>
  <div class="flex min-h-screen bg-gray-50">
    <aside class="w-52 bg-gray-800 p-5 flex flex-col gap-4">
      <h3 class="text-base text-blue-400 font-semibold">AI 面试管理</h3>
      <nav class="flex flex-col gap-2">
        <router-link to="/admin" class="px-3 py-2 rounded-md text-gray-300 text-sm no-underline hover:bg-gray-700 hover:text-white transition-colors" active-class="bg-gray-700 !text-white">概览</router-link>
        <router-link to="/admin/positions" class="px-3 py-2 rounded-md text-gray-300 text-sm no-underline hover:bg-gray-700 hover:text-white transition-colors" active-class="bg-gray-700 !text-white">岗位管理</router-link>
        <router-link to="/admin/candidates" class="px-3 py-2 rounded-md text-gray-300 text-sm no-underline hover:bg-gray-700 hover:text-white transition-colors" active-class="bg-gray-700 !text-white">候选人管理</router-link>
        <router-link to="/admin/docs" class="px-3 py-2 rounded-md text-gray-300 text-sm no-underline hover:bg-gray-700 hover:text-white transition-colors" active-class="bg-gray-700 !text-white">公司文档</router-link>
      </nav>
    </aside>
    <main class="flex-1 p-6">
      <slot />
    </main>
  </div>
</template>
