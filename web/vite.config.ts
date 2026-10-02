import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),build:{outDir:'../dist',emptyOutDir:true},server:{proxy:{'/api':'http://127.0.0.1:8788'}}});
