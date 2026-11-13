import {verifySolve} from './verify-solve.mjs';
import {handleRace} from './race.mjs';

class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function createCloudHandler({env=process.env,fetcher=fetch}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
    try{
      const origin=req.headers.origin;
      if(origin&&new URL(origin).host!==req.headers.host)throw new HttpError(403,'Sai nguồn truy cập.');
      const base=env.SUPABASE_URL,key=env.SUPABASE_ANON_KEY,secret=env.SUPABASE_SECRET_KEY??env.SUPABASE_SERVICE_ROLE_KEY;
      if(!base||!key||!secret)throw new HttpError(503,'Chưa cấu hình server Supabase.');
      const request=async(path,{method='GET',body,auth=secret}={})=>{
        const response=await fetcher(base+path,{method,headers:{apikey:auth===secret?secret:key,...(auth.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+auth}),'Content-Type':'application/json',Prefer:path.startsWith('/rest/v1/profiles?')?'resolution=merge-duplicates,return=representation':'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
        const value=response.status===204?null:await response.json();
        if(!response.ok){
          if(response.status===401||response.status===403)throw new HttpError(auth===secret?503:401,auth===secret?'Khóa server Supabase chưa được cấu hình đúng.':'Phiên hồ sơ hết hạn; hãy tải lại trang.');
          if(value?.code==='23505')throw new HttpError(409,path.startsWith('/rest/v1/profiles?')?'Tên này đã có người dùng. Hãy chọn tên khác.':'ID đã được sử dụng.');
          if(value?.code==='40001')throw new HttpError(409,'Dữ liệu đã thay đổi trên thiết bị khác. Hãy tải bản server trước khi sửa tiếp.');
          if(value?.code==='54000')throw new HttpError(413,'Đã đạt giới hạn 10.000 bản ghi mỗi tài khoản.');
          if(value?.code==='P0001'&&path==='/rest/v1/rpc/race_action')throw new HttpError(409,
            value.message==='Set your player name first'?'Hãy đặt tên ở trang luyện tập trước khi vào phòng.':
            value.message==='Room limit: 3 per hour'?'Bạn đã tạo 3 phòng trong giờ qua. Hãy dùng phòng đã có hoặc đợi thêm.':
            value.message==='Room not found or expired'?'Phòng không tồn tại hoặc đã hết hạn 1 giờ.':
            'Phòng đã đầy/đóng, bạn không thuộc phòng, hoặc kết quả sai thứ tự/quá hạn.');
          throw new HttpError(502,'Không truy cập được cơ sở dữ liệu.');
        }
        return value;
      };
      const url=new URL(req.url,'https://'+req.headers.host),route=url.pathname.split('/').at(-1);
      if(route==='leaderboard'&&req.method==='GET'){
        const size=Number(url.searchParams.get('size'));if(![2,3].includes(size))throw new HttpError(400,'Chỉ có bảng 2×2 và 3×3.');
        const rows=await request('/rest/v1/rpc/leaderboard',{method:'POST',body:{p_size:size}});
        res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=15');return send(200,{rows});
      }
      if(!['player','solves','account','race'].includes(route)||!['GET','POST','DELETE'].includes(req.method))throw new HttpError(404,'Không có API này.');
      const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1];if(!token||token.length>8192)throw new HttpError(401,'Cần phiên hồ sơ hợp lệ.');
      const user=await request('/auth/v1/user',{auth:token});if(!user?.id||(!user.email_confirmed_at&&user.is_anonymous!==true))throw new HttpError(401,'Phiên hồ sơ không hợp lệ. Hãy tải lại trang.');
      const allowed=await request('/rest/v1/rpc/consume_quota',{method:'POST',body:{p_user:user.id,p_kind:req.method==='GET'?'read':'write'}});
      if(!allowed)throw new HttpError(429,'Thao tác quá nhanh, thử lại sau một phút.');
      let body={};
      if(req.method==='POST'){
        if(req.body!==undefined){if(typeof req.body==='string'&&Buffer.byteLength(req.body)>300000)throw new HttpError(413,'Dữ liệu quá lớn.');body=typeof req.body==='string'?JSON.parse(req.body):req.body;}
        else{let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>300000)throw new HttpError(413,'Dữ liệu quá lớn.');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
        if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Dữ liệu không hợp lệ.');
        if(Buffer.byteLength(JSON.stringify(body))>300000)throw new HttpError(413,'Dữ liệu quá lớn.');
      }
      if(route==='race'){
        if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Phương thức không hợp lệ.');
        try{return send(200,await handleRace({request,user,method:req.method,body,url}));}
        catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,error.message??'Không xử lý được trận đấu.');}
      }
      if(route==='account'&&req.method==='DELETE'){
        // Room snapshots include participant names and input records. Remove
        // shared rooms containing this account as part of data deletion too.
        await request('/rest/v1/race_rooms?players=cs.'+encodeURIComponent(JSON.stringify([{id:user.id}])) ,{method:'DELETE'});
        await request('/auth/v1/admin/users/'+encodeURIComponent(user.id),{method:'DELETE'});return send(200,{ok:true});
      }
      if(route==='player'){
        if(req.method==='POST'){
          const name=typeof body.name==='string'?body.name.trim().normalize('NFC'):'';
          if(!name||name.length>30||/[\p{Cc}\p{Cf}]/u.test(name))throw new HttpError(400,'Tên cần 1–30 ký tự, không chứa ký tự điều khiển.');
          // Scoped conflict target: request bodies never choose the owning account.
          await request('/rest/v1/profiles?on_conflict=id',{method:'POST',body:{id:user.id,name}});
        }else if(req.method!=='GET')throw new HttpError(405,'Phương thức không hợp lệ.');
        const profiles=await request('/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,name');
        return send(200,profiles[0]??{id:user.id,name:null});
      }
      if(route==='solves'&&req.method==='GET'){
        if(url.searchParams.has('since')){
          const since=Number(url.searchParams.get('since'));
          if(!Number.isSafeInteger(since)||since<0)throw new HttpError(400,'Mốc đồng bộ không hợp lệ.');
          const rows=await request('/rest/v1/solves?user_id=eq.'+encodeURIComponent(user.id)+'&select=id,solve,penalty_override,deleted,revision,sync_version&sync_version=gt.'+since+'&order=sync_version.asc&limit=500');
          const cursor=rows.at(-1)?.sync_version??since;
          return send(200,{rows,cursor,hasMore:rows.length===500});
        }
        // Old deployed clients retain the full-history endpoint during rollout.
        const offset=Number(url.searchParams.get('offset')??0);if(!Number.isInteger(offset)||offset<0||offset>10000)throw new HttpError(400,'Trang không hợp lệ.');
        const rows=await request('/rest/v1/solves?user_id=eq.'+encodeURIComponent(user.id)+'&select=id,solve,penalty_override,deleted,revision&order=id.asc&limit=500&offset='+offset);
        return send(200,{rows});
      }
      if(route==='solves'&&req.method==='POST'){
        let solve;try{solve=verifySolve(body.solve);}catch(error){throw new HttpError(400,error.message);}
        if(body.penaltyOverride!==null&&!['none','+2','DNF'].includes(body.penaltyOverride))throw new HttpError(400,'Phạt chỉnh không hợp lệ.');
        if(typeof body.deleted!=='boolean'||typeof body.ranked!=='boolean'||(body.revision!==null&&(!Number.isSafeInteger(body.revision)||body.revision<1)))throw new HttpError(400,'Metadata không hợp lệ.');
        const rows=await request('/rest/v1/rpc/save_solve',{method:'POST',body:{p_user:user.id,p_solve:solve,p_override:body.penaltyOverride,p_deleted:body.deleted,p_ranked:body.ranked&&[2,3].includes(solve.size),p_expected:body.revision}});
        return send(200,{row:rows[0]});
      }
      throw new HttpError(405,'Phương thức không hợp lệ.');
    }catch(error){send(error instanceof HttpError?error.status:400,{error:error instanceof HttpError?error.message:'Yêu cầu không hợp lệ hoặc dịch vụ chưa sẵn sàng.'});}
  };
}
