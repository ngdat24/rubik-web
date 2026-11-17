export const championErrors={
  invalid_champion:'Lựa chọn Champion không hợp lệ.',
  champion_not_granted:'Hồ sơ này chưa được chủ web cấp quyền nhận Champion.',
  champion_already_claimed:'Bạn đã chốt kiểu viền Champion; đổi tên cần dùng chức năng 500 CB.',
  champion_same_name:'Tên mới phải khác tên hiện tại.',
  insufficient_balance:'Cần đủ 500 CB để đổi tên Champion.',
  receipt_mismatch:'Mã giao dịch đã được dùng cho một lựa chọn khác.',
  profile_required:'Hãy đặt tên hồ sơ trước khi dùng Champion.'
};
export function parseChampionClaim(body){
  if(!['claim','rename'].includes(body.action)||![2,3].includes(body.size)
    ||(body.action==='claim'&&!['classic','borderless'].includes(body.variant))
    ||typeof body.name!=='string')return;
  const name=body.name.trim().normalize('NFC');
  if(!name||Array.from(name).length>32||/[\p{Cc}\p{Cf}]/u.test(name))return;
  if(body.action==='rename'){
    if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId))return;
    return {p_size:body.size,p_name:name,p_reference:body.requestId};
  }
  return {p_size:body.size,p_variant:body.variant,p_name:name};
}
