// Keep old bookmarks working without allocating a second WebGL renderer.
const query=new URLSearchParams(location.search);
const target=new URL('/',location.origin);
target.searchParams.set('inventory',query.get('size')==='2'?'2':'3');
const lang=query.get('lang');
if(lang==='vi'||lang==='en')target.searchParams.set('lang',lang);
location.replace(target.href);
