import './prometheus-season-banner.css';

export function prometheusSeasonBanner(locale:string='vi'):HTMLElement{
  const en=locale==='en',banner=document.createElement('section');banner.className='prometheus-season-banner';
  banner.setAttribute('aria-label',en?'Season 1 — Divine Flame Prometheus':'Mùa 1 — Lửa thiêng Prometheus');
  const art=document.createElement('img');art.className='prometheus-season-banner__art';art.src='/assets/season/prometheus/zeus-prometheus-background.png';
  art.alt=en?'Zeus with lightning and Prometheus carrying sacred fire':'Zeus cùng sấm chớp và Prometheus mang ngọn lửa thiêng';art.width=1984;art.height=794;
  const title=document.createElement('h3');title.className='prometheus-season-banner__title';
  const lead=document.createElement('span');lead.textContent=en?'Divine Flame':'Lửa thiêng';
  const name=document.createElement('strong');name.textContent='Prometheus';title.append(lead,name);
  const badge=document.createElement('p');badge.className='prometheus-season-banner__badge';badge.textContent=en?'SEASON 01 · EXCLUSIVE':'MÙA 01 · ĐỘC QUYỀN';
  const cube=document.createElement('img');cube.className='prometheus-season-banner__cube';cube.src='/assets/skins/s1_red_prometheus_flame/preview-current.png';cube.alt=en?'Prometheus gemstone cube':'Rubik đá quý Prometheus';cube.width=cube.height=640;
  const sparks=document.createElement('div');sparks.className='prometheus-season-banner__sparks';sparks.setAttribute('aria-hidden','true');
  for(let i=0;i<14;i++){const spark=document.createElement('i');spark.style.setProperty('--x',`${12+i*5.7}%`);spark.style.setProperty('--delay',`${-i*.43}s`);spark.style.setProperty('--drift',`${(i%3-1)*22}px`);sparks.append(spark);}
  banner.append(art,badge,title,cube,sparks);return banner;
}
