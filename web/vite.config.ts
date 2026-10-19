import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const webRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({root:webRoot,build:{outDir:'../dist',emptyOutDir:true,rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),'line-inbox-demo':fileURLToPath(new URL('./line-inbox-demo.html',import.meta.url))}}},server:{proxy:{'/api':'http://127.0.0.1:8788'}}});
