import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const server=await createServer({configFile:false,root:resolve('.'),publicDir:resolve('apps/web/public'),
  server:{host:'127.0.0.1',port:4183,strictPort:true},plugins:[{name:'champion-performance-demo',configureServer(vite){
    vite.middlewares.use((req,res,next)=>{
      if(req.url?.split('?')[0]!=='/')return next();
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(readFileSync(new URL('./champion-performance-demo.html',import.meta.url)));
    });
  }}]});
await server.listen();console.log('Champion performance demo: http://127.0.0.1:4183');
