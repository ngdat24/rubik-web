import {scrambleAt,invert,ENGINE_VERSION} from '../packages/engine/dist/index.js';
import {isDeepStrictEqual} from 'node:util';
export function fakeDatabase(){
  const profiles=new Map(),solves=new Map(),rooms=new Map(),calls=[];let denyQuota=false,version=0,raceOffset=0;
  const fetcher=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):undefined,headers=options.headers??{};
    calls.push({url,body,headers,method:options.method});
    const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    if(url.pathname==='/auth/v1/user'){
      const token=headers.Authorization;
      const id=['Bearer token-a','Bearer anonymous-a','Bearer unconfirmed-a'].includes(token)?'11111111-1111-4111-8111-111111111111':['Bearer token-b','Bearer anonymous-b'].includes(token)?'22222222-2222-4222-8222-222222222222':undefined;
      return response(id?{id,email_confirmed_at:token.startsWith('Bearer token-')?'2026-11-13T00:00:00Z':null,is_anonymous:token.startsWith('Bearer anonymous-')}:{error:'Invalid token'},id?200:401);
    }
    if(url.pathname.startsWith('/auth/v1/admin/users/'))return response({ok:true});
    if(url.pathname.endsWith('/consume_quota'))return response(!denyQuota);
    if(url.pathname==='/rest/v1/race_rooms'&&options.method==='DELETE'){
      const user=JSON.parse(url.searchParams.get('players').slice(3))[0].id;
      for(const [id,room] of rooms)if(room.players.some(p=>p.id===user))rooms.delete(id);
      return new Response(null,{status:204});
    }
    if(url.pathname.endsWith('/race_action')){
      const {p_id:id,p_user:user,p_action:action,p_payload:payload}=body,now=Date.now()+raceOffset;
      const fail=()=>response({code:'P0001'},400);
      if(action==='create'&&!rooms.has(id)){
        if(!profiles.has(user)||!['fullSolve','f2lRush'].includes(payload.mode))return fail();
        rooms.set(id,{id,owner_id:user,seed:payload.seed,mode:payload.mode,duration_ms:payload.mode==='fullSolve'?120000:45000,start_ms:null,forfeit:null,players:[{id:user,name:profiles.get(user).name,ready:false,runs:[]}]});
      }
      const room=rooms.get(id);if(!room)return fail();
      let player=room.players.find(p=>p.id===user);
      if(action==='join'&&!player){
        if(room.players.length===2||room.start_ms!==null||room.forfeit||!profiles.has(user))return fail();
        player={id:user,name:profiles.get(user).name,ready:false,runs:[]};room.players.push(player);
      }
      if(!player)return fail();
      if(action==='ready'&&room.start_ms===null&&!room.forfeit){player.ready=true;if(room.players.length===2&&room.players.every(p=>p.ready))room.start_ms=now;}
      if(action==='cube_done'){
        const run=payload.run,previous=player.runs[run.k];
        if(previous){if(!isDeepStrictEqual(previous,run))return fail();}
        else{
          if(run.k!==player.runs.length||room.forfeit||room.start_ms===null||now<room.start_ms+18000||now>=room.start_ms+21000+room.duration_ms)return fail();
          player.runs.push(run);
        }
      }
      if(action==='forfeit'&&!room.forfeit&&(room.start_ms===null||now<room.start_ms+21000+room.duration_ms))room.forfeit=user;
      return response({room,now_ms:now});
    }
    if(url.pathname==='/rest/v1/profiles'){
      if(options.method==='POST'){
        if([...profiles.values()].some(p=>p.id!==body.id&&p.name.toLowerCase()===body.name.toLowerCase()))return response({code:'23505'},409);
        profiles.set(body.id,body);return response([body]);
      }
      return response([...profiles.values()].filter(p=>'eq.'+p.id===url.searchParams.get('id')));
    }
    if(url.pathname.endsWith('/save_solve')){
      const previous=solves.get(body.p_solve.id);
      if(previous&&(previous.user_id!==body.p_user||JSON.stringify(previous.solve)!==JSON.stringify(body.p_solve)))return response({code:'23505'},409);
      if(previous&&(previous.penalty_override!==body.p_override||previous.deleted!==body.p_deleted)&&previous.revision!==body.p_expected)return response({code:'40001'},409);
      const changed=previous&&(previous.penalty_override!==body.p_override||previous.deleted!==body.p_deleted);
      const row={id:body.p_solve.id,user_id:body.p_user,solve:body.p_solve,penalty_override:body.p_override,deleted:body.p_deleted,ranked:previous?.ranked??body.p_ranked,revision:previous?previous.revision+Number(!!changed):1,sync_version:!previous||changed?++version:previous.sync_version};
      solves.set(row.id,row);return response([row]);
    }
    if(url.pathname==='/rest/v1/solves'){
      const rows=[...solves.values()].filter(s=>'eq.'+s.user_id===url.searchParams.get('user_id'));
      if(url.searchParams.has('sync_version'))return response(rows.filter(s=>s.sync_version>Number(url.searchParams.get('sync_version').slice(3))).sort((a,b)=>a.sync_version-b.sync_version).slice(0,500));
      return response(rows.sort((a,b)=>a.id.localeCompare(b.id)).slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+500));
    }
    if(url.pathname.endsWith('/leaderboard')){
      const rows=[...solves.values()].filter(row=>row.ranked&&!row.deleted&&row.solve.size===body.p_size&&row.solve.penalty!=='DNF'&&profiles.has(row.user_id)).map(row=>({id:row.user_id,name:profiles.get(row.user_id).name,timeMs:row.solve.timeMs+(row.solve.penalty==='+2'?2000:0),solveId:row.id})).sort((a,b)=>a.timeMs-b.timeMs||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,10);
      return response(rows);

    }
    throw new Error('Unexpected fake request: '+url.pathname);
  };
  return {fetcher,profiles,solves,rooms,calls,setQuota(value){denyQuota=value;},advanceRace(ms){raceOffset+=ms;}};
}

export function validSolve(id='first',size=3){
  const moves=invert(scrambleAt('cloud-test',size,0),size);
  return {schemaVersion:1,id,size,seed:'cloud-test',scrambleIndex:0,scrambleSource:'generated',genVersion:1,engineVersion:ENGINE_VERSION,preEvents:[],events:moves.map((m,i)=>({m,t:i*30})),inspectionMs:500,timeMs:(moves.length-1)*30,penalty:'none',startedAt:'2026-11-13T00:00:00Z'};
}

