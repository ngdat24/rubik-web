import {createServer} from 'node:http';
import {readFileSync, writeFileSync, renameSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {Cube, scrambleAt, ENGINE_VERSION} from '../../packages/engine/dist/index.js';
import {validateHistoryBackup} from '../../packages/timer/dist/index.js';

export function createLanServer({dataDir=resolve('lan-data'), webDir=resolve('apps/web/dist')}={}) {
  mkdirSync(dataDir,{recursive:true});
  const file=resolve(dataDir,'room.json');
  const db=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:1,players:[],solves:[]};
  if(db.version!==1||!Array.isArray(db.players)||!Array.isArray(db.solves))throw new Error('Dữ liệu phòng không hợp lệ.');
  const commit=(next)=>{writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file);Object.assign(db,next);};
  const authorized=(req)=>db.players.find(p=>{
    const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
    return token.length===p.token.length&&timingSafeEqual(Buffer.from(token),Buffer.from(p.token));
  });
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Sai nguồn truy cập.'});
        let body={};
        if(req.method==='POST'){
          let length=0;const chunks=[];
          for await(const chunk of req){length+=chunk.length;if(length>300000)return json(res,413,{error:'Dữ liệu quá lớn.'});chunks.push(chunk);}
          body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Dữ liệu không hợp lệ.');
        }
        if(url.pathname==='/api/player'&&req.method==='POST'){
          const name=typeof body.name==='string'?body.name.trim().normalize('NFC'):'';
          if(!name||name.length>30||/[\p{Cc}\p{Cf}]/u.test(name))throw new Error('Tên cần từ 1 đến 30 ký tự, không chứa ký tự điều khiển.');
          const current=authorized(req);
          if(req.headers.authorization&&!current)return json(res,401,{error:'Hồ sơ không còn hợp lệ.'});
          if(db.players.some(p=>p.id!==current?.id&&p.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')))throw new Error('Tên đã có người dùng.');
          if(!current&&db.players.length>=1000)throw new Error('Phòng đã đủ người.');
          const player=current?{...current,name}:{id:randomUUID(),token:randomUUID(),name};
          commit({...db,players:[...db.players.filter(p=>p.id!==player.id),player]});
          return json(res,200,player);
        }
        if(url.pathname==='/api/player'&&req.method==='GET'){
          const player=authorized(req);return json(res,player?200:401,player??{error:'Cần đặt tên.'});
        }
        if(url.pathname==='/api/solves'&&req.method==='POST'){
          const player=authorized(req);if(!player)return json(res,401,{error:'Cần đặt tên.'});
          const solve=validateHistoryBackup({version:1,entries:[{solve:body.solve,penaltyOverride:null}]}).entries[0].solve;
          if(![2,3].includes(solve.size)||solve.engineVersion!==ENGINE_VERSION)throw new Error('Chỉ nhận 2×2 và 3×3 phiên bản hiện tại.');
          const existing=db.solves.find(s=>s.solve.id===solve.id);
          if(existing){if(existing.playerId!==player.id||JSON.stringify(existing.solve)!==JSON.stringify(solve))throw new Error('ID kết quả bị trùng.');return json(res,200,{ok:true});}
          if(db.solves.length>=100000)throw new Error('Bộ nhớ phòng đã đầy.');
          const expected=solve.inspectionMs>17000?'DNF':solve.inspectionMs>15000?'+2':'none';
          if(solve.penalty!==expected)throw new Error('Phạt inspection không khớp.');
          if(solve.penalty!=='DNF'){
            const cube=new Cube(solve.size).applyMoves(scrambleAt(solve.seed,solve.size,solve.scrambleIndex));
            cube.applyMoves(solve.preEvents.map(e=>e.m));
            for(let i=0;i<solve.events.length;i++){cube.applyMove(solve.events[i].m);if(cube.isSolved()&&i!==solve.events.length-1)throw new Error('Chuỗi tiếp tục sau khi đã giải xong.');}
            if(!cube.isSolved())throw new Error('Chuỗi nước chưa giải xong scramble.');
          }
          commit({...db,solves:[...db.solves,{playerId:player.id,solve}]});
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/leaderboard'&&req.method==='GET'){
          const size=Number(url.searchParams.get('size'));if(![2,3].includes(size))throw new Error('Kích thước không hợp lệ.');
          const rows=db.solves.filter(({solve})=>solve.size===size&&solve.penalty!=='DNF').map(({playerId,solve})=>({id:solve.id,name:db.players.find(p=>p.id===playerId)?.name??'Người chơi',timeMs:solve.timeMs+(solve.penalty==='+2'?2000:0)})).sort((a,b)=>a.timeMs-b.timeMs||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,10);
          return json(res,200,{rows});
        }
        return json(res,404,{error:'Không có API này.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
      const root=resolve(webDir),target=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!target.startsWith(root+sep)){res.writeHead(403);return res.end();}
      let content;try{content=readFileSync(target);}catch{res.writeHead(404);return res.end();}
      if(extname(target)==='.html')content=Buffer.from(content.toString('utf8').replace('</head>','<meta name="rubik-lan" content="1" /></head>'));
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
      res.writeHead(200,{'Content-Type':mime[extname(target)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){json(res,400,{error:error instanceof Error?error.message:'Không xử lý được yêu cầu.'});}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??5173);
  const server=createLanServer();server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(port,'0.0.0.0',()=>{console.log(`Rubik LAN: http://localhost:${port}`);for(const group of Object.values(networkInterfaces()))for(const ip of group??[])if(ip.family==='IPv4'&&!ip.internal)console.log(`Cùng mạng: http://${ip.address}:${port}`);});
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
}
