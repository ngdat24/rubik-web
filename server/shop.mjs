const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const itemId = value => typeof value === 'string' && /^[a-z0-9_-]{1,80}$/i.test(value);

export const shopErrors = {
  profile_required: 'Hãy đặt tên hồ sơ để sử dụng cửa hàng.',
  insufficient_balance: 'Số dư không đủ.',
  invalid_action: 'Thao tác cửa hàng không hợp lệ.',
  catalog_unavailable: 'Hòm chưa có đủ skin để mở.',
  offer_unavailable: 'Món này hiện không có trong cửa hàng.',
  already_owned: 'Bạn đã sở hữu món này.',
  reroll_limit: 'Đã hết lượt làm mới hôm nay.',
  not_owned: 'Bạn chưa sở hữu skin này.',
  season_unavailable: 'Vòng quay mùa giải chưa mở.',
  season_complete: 'Bạn đã hoàn thành vòng quay mùa giải.'
};

export function parseShopAction(method, body) {
  if (method === 'GET') return {action:'get',data:{},reference:null};
  if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) return;
  let data;
  switch (body.action) {
    case 'reroll': data = {}; break;
    case 'buy_skin':
      if (typeof body.offerId === 'string' && uuid.test(body.offerId)) data = {offerId:body.offerId};
      break;
    case 'equip_skin':
      if (body.id === null || itemId(body.id)) data = {id:body.id};
      break;
    case 'equip_utility':
      if ((body.id === null || itemId(body.id)) && ['sound','trail'].includes(body.slot)) data = {id:body.id,slot:body.slot};
      break;
    case 'buy_utility':
      if (itemId(body.id) && ['CB','ZN'].includes(body.currency)) data = {id:body.id,currency:body.currency};
      break;
    case 'open_crate':
      if (['core','maglev','quantum'].includes(body.crate) && [1,body.crate === 'quantum' ? 5 : 10].includes(body.quantity)) {
        data = {crate:body.crate,quantity:body.quantity};
      }
      break;
    case 'spin':
      if (itemId(body.season) && [undefined,1,5,10].includes(body.quantity))
        data = {season:body.season,quantity:body.quantity ?? 1};
      break;
  }
  if (data) return {action:body.action,data,reference:body.requestId};
}
