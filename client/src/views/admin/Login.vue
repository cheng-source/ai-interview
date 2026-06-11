<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <form class="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-6 shadow-sm" @submit.prevent="login">
      <h1 class="text-xl font-semibold text-gray-900 mb-5">后台登录</h1>
      <label class="block text-sm text-gray-600 mb-1">用户名</label>
      <input v-model="username" class="w-full border border-gray-300 rounded-md px-3 py-2 mb-4 outline-none focus:border-blue-500" autocomplete="username" />
      <label class="block text-sm text-gray-600 mb-1">密码</label>
      <input v-model="password" type="password" class="w-full border border-gray-300 rounded-md px-3 py-2 mb-5 outline-none focus:border-blue-500" autocomplete="current-password" />
      <el-button type="primary" native-type="submit" class="w-full" :loading="loading" :disabled="!username || !password">
        登录
      </el-button>
      <p v-if="error" class="text-red-500 text-sm mt-3">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authApi } from "../../api/client";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function login() {
  loading.value = true;
  error.value = "";
  try {
    const res = await authApi.login({ username: username.value, password: password.value });
    localStorage.setItem("adminToken", res.data.accessToken);
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/admin";
    router.replace(redirect);
  } catch {
    error.value = "用户名或密码错误";
  } finally {
    loading.value = false;
  }
}
</script>
