// Behaviour for the refery.xyz landing page, verbatim from the approved
// mock-up. Plain JS on purpose: it drives the DOM directly and React never
// re-renders the page, so there is nothing to keep in sync.
//
// mountHome() runs once after mount and returns a cleanup that stops the
// tab and step carousels, which matters when the router navigates away.

export function mountHome() {
  var intervals = []
  function track(id) { intervals.push(id); return id }

  // links inside the product mock-ups go nowhere
  document.querySelectorAll('.lp .win a[href="#"], .lp .grp a[href="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault() })
  });

  (function(){
    var rvs=document.querySelectorAll('.rv');
    if(!('IntersectionObserver' in window)){rvs.forEach(function(e){e.classList.add('in')});}
    else{var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}})},{rootMargin:'0px 0px -6% 0px',threshold:.06});rvs.forEach(function(e){io.observe(e)});}
    var cs=document.querySelectorAll('[data-count]');
    function fmt(n,dec){return n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g,',')}
    function run(el){var to=parseFloat(el.getAttribute('data-count'));var pre=el.getAttribute('data-pre')||'';var suf=el.getAttribute('data-suf')||'';var dec=parseInt(el.getAttribute('data-dec')||'0',10);var t0=null;var dur=1100;
      function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/dur);var e=1-Math.pow(1-p,3);el.textContent=pre+fmt(to*e,dec)+suf;if(p<1)requestAnimationFrame(step)}
      requestAnimationFrame(step)}
    if('IntersectionObserver' in window){var io2=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){run(en.target);io2.unobserve(en.target)}})},{threshold:.4});cs.forEach(function(e){io2.observe(e)});}
    document.querySelectorAll('.faq-q').forEach(function(b){b.addEventListener('click',function(){var it=b.closest('.faq-item');var open=it.classList.contains('open');it.parentNode.querySelectorAll('.faq-item').forEach(function(x){x.classList.remove('open');x.querySelector('.faq-q').setAttribute('aria-expanded','false')});if(!open){it.classList.add('open');b.setAttribute('aria-expanded','true')}})});
  })();

  (function(){
    var pw=document.getElementById('pw');
    var tabs=pw.querySelectorAll('.pw-tab');var panels=pw.querySelectorAll('.pw-panel');var navs=pw.querySelectorAll('[data-nav]');var url=document.getElementById('pw-url');
    var order=['searches','pipeline','candidates'];var idx=0;var timer=null;var DUR=7000;
    var urls={searches:'refery.xyz/searches',pipeline:'refery.xyz/searches/pipeline',candidates:'refery.xyz/candidates'};
    function show(key){
      idx=order.indexOf(key);
      tabs.forEach(function(t){var on=t.getAttribute('data-p')===key;t.classList.toggle('on',on);t.setAttribute('aria-selected',on);var b=t.querySelector('.bar i');b.style.animation='none';void b.offsetWidth;b.style.animation=''});
      panels.forEach(function(p){p.classList.toggle('on',p.getAttribute('data-p')===key)});
      navs.forEach(function(n){n.classList.toggle('on',n.getAttribute('data-nav')===key)});
      url.textContent=urls[key];
      if(key==='pipeline')movePipeline();
    }
    function next(){show(order[(idx+1)%order.length])}
    function arm(){clearInterval(timer);timer=track(setInterval(next,DUR))}
    tabs.forEach(function(t){t.addEventListener('click',function(){show(t.getAttribute('data-p'));arm()})});
    navs.forEach(function(n){n.addEventListener('click',function(e){e.preventDefault();show(n.getAttribute('data-nav'));arm()})});
    pw.addEventListener('mouseenter',function(){pw.classList.add('paused');clearInterval(timer)});
    pw.addEventListener('mouseleave',function(){pw.classList.remove('paused');arm()});
    var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduce)arm();
    var moving=false;
    function movePipeline(){
      if(reduce||moving)return;moving=true;
      var a=document.getElementById('mover-a'),b=document.getElementById('mover-b');
      a.hidden=false;a.classList.remove('leaving');b.hidden=true;document.getElementById('c3n').textContent='2';document.getElementById('c4n').textContent='1';
      setTimeout(function(){a.classList.add('flash')},1400);
      setTimeout(function(){a.classList.remove('flash');a.classList.add('leaving')},2300);
      setTimeout(function(){a.hidden=true;b.hidden=false;b.classList.remove('mover');void b.offsetWidth;b.classList.add('mover');document.getElementById('c3n').textContent='1';document.getElementById('c4n').textContent='2';moving=false},2700);
    }
    // steps
    var stp=document.getElementById('stp');var sb=stp.querySelectorAll('button');var sv=document.querySelectorAll('.sv');var si=0;var st=null;
    function showStep(n){si=n-1;sb.forEach(function(b){b.classList.toggle('on',b.getAttribute('data-s')==String(n))});sv.forEach(function(v){v.classList.toggle('on',v.getAttribute('data-s')==String(n))});if(n===2)deskReact()}
    sb.forEach(function(b){b.addEventListener('click',function(){showStep(parseInt(b.getAttribute('data-s'),10));clearInterval(st);st=track(setInterval(function(){showStep((si+1)%3+1)},8000))})});
    var how=document.getElementById('how');
    if(!reduce&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){clearInterval(st);st=track(setInterval(function(){showStep((si+1)%3+1)},8000));io.unobserve(how)}})},{threshold:.3});io.observe(how)}
    function deskReact(){var r=document.getElementById('rx-fire'),t=document.getElementById('rx-thread');r.classList.remove('hit');t.classList.remove('in');if(reduce){r.classList.add('hit');t.classList.add('in');return}setTimeout(function(){r.classList.add('hit')},1600);setTimeout(function(){t.classList.add('in')},2400)}
  })();

  return function cleanup() {
    intervals.forEach(function (id) { clearInterval(id) })
  }
}
