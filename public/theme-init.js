// Apply before React/CSS paints, including direct links to lazily loaded routes.
(function(){
 var saved=null;
 try{saved=localStorage.getItem('stayman.theme');}catch(_error){}
 var dark=saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
 var theme=dark?'dark':'light';
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
 var meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',dark?'#0d1422':'#ffffff');
})();
