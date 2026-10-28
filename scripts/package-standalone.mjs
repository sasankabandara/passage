import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let html=await readFile(resolve(root,'dist/index.html'),'utf8');
const script=html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const style=html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if(!script||!style)throw new Error('Build the Vite application before packaging.');
const js=(await readFile(resolve(root,'dist',script[1].replace(/^\//,'')),'utf8')).replace(/\/\/# sourceMappingURL=.*$/m,'');
const css=(await readFile(resolve(root,'dist',style[1].replace(/^\//,'')),'utf8')).replace(/@import url\([^)]+\);?/,'');
html=html.replace(script[0],()=>`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`);
html=html.replace(style[0],()=>`<style>${css}</style>`);
await writeFile(resolve(root,'standalone.html'),html);
console.log('standalone.html — self-contained, offline browser demo');
