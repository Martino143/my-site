// Mobile-fast & Crazy-fun Hedgehog Breaker
const HEDGEHOG_SRC = "hedgehog.png";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");
const startBtn = document.getElementById("start");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

const BASE_W = 720, BASE_H = 480;
const MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let SPEED_MULT = MOBILE ? 1.8 : 1.0;      // <- tune this if you want even faster
let PADDLE_MULT = MOBILE ? 1.6 : 1.0;

let running=false, paused=false, chaos=false;
let score=0, lives=3, level=1;
let DPR=1, scaleX=1, scaleY=1, now=0, last=0, dt=0;

const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
function ping(freq=600, dur=0.05, vol=0.03){
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.frequency.value=freq; o.type="sine";
  g.gain.value=vol; o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime+dur);
}
function vibe(ms){ if(navigator.vibrate) navigator.vibrate(ms); }

const paddle = { w:0,h:0,x:0,y:0,speed:9, vx:0, sticky:false };
const balls = [];
const BRICK = { rows:5, cols:10, pad:0, w:0, h:0, top:0, left:0 };
let bricks=[];
const powerUps=[]; // {x,y,vx,vy,type,t}
const TYPES=["BIG","STICKY","MULTI","BOOST","SLOW","HEART"];

const img = new Image(); img.src=HEDGEHOG_SRC;
let imgReady=false; img.onload=()=>imgReady=true;

// --- helpers
function setCanvasForDPR(){
  const rect=canvas.getBoundingClientRect();
  DPR=window.devicePixelRatio||1;
  canvas.width=Math.round(rect.width*DPR);
  canvas.height=Math.round(rect.height*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  scaleX = canvas.width/DPR/BASE_W;
  scaleY = canvas.height/DPR/BASE_H;
}
function layout(){
  setCanvasForDPR();
  paddle.w=0.18*BASE_W*scaleX;
  paddle.h=0.035*BASE_H*scaleY;
  paddle.x=(BASE_W*scaleX)/2 - paddle.w/2;
  paddle.y=(BASE_H*scaleY)-paddle.h-16;

  BRICK.pad=6*scaleX; BRICK.left=24*scaleX; BRICK.top=50*scaleY;
  const totalPad=(BRICK.cols-1)*BRICK.pad;
  BRICK.w=((BASE_W*scaleX)-BRICK.left*2-totalPad)/BRICK.cols;
  BRICK.h=18*scaleY;

  balls.length=0; spawnBall(true);
  makeBricks(); powerUps.length=0;
  draw();
}
function makeBricks(){
  bricks=[];
  for(let r=0;r<BRICK.rows;r++){
    for(let c=0;c<BRICK.cols;c++){
      bricks.push({x:BRICK.left+c*(BRICK.w+BRICK.pad),
                   y:BRICK.top+r*(BRICK.h+BRICK.pad),
                   alive:true, hp:1+Math.floor((level-1)/2)});
    }
  }
}
function spawnBall(keepSpeed=false, atX=paddle.x+paddle.w/2){
  const r = Math.max(10*Math.min(scaleX,scaleY),8);
  const base = (4.6 + (level-1)*0.4)*SPEED_MULT;
  const sp = keepSpeed ? (balls[0]?Math.hypot(balls[0].vx,balls[0].vy):base) : base;
  const ang = (Math.random()*0.7+0.6)*Math.PI;
  balls.push({
    r, x: atX, y: paddle.y- r - 2,
    vx: Math.cos(ang)*sp*scaleX, vy: Math.sin(ang)*sp*scaleY*-1,
    trail:[], stuck:false, spin:(Math.random()*0.6-0.3)
  });
}
function reset(levelUp=false){
  if(levelUp) level++;
  updateHUD();
  layout();
}
function updateHUD(){
  scoreEl.textContent=`Score: ${score}`;
  livesEl.textContent=`Lives: ${lives}`;
  levelEl.textContent=`Level: ${level}${chaos?" • CHAOS":""}`;
}

// --- input
const keys=new Set();
document.addEventListener("keydown",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a") keys.add("left");
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d") keys.add("right");
  if(e.key.toLowerCase()==="p") paused=!paused;
  if(e.key.toLowerCase()==="r"){ lives=3; level=1; score=0; chaos=false; reset(); }
  if(e.key.toLowerCase()==="c" && level>=3){ chaos=!chaos; updateHUD(); }
});
document.addEventListener("keyup",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a") keys.delete("left");
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d") keys.delete("right");
});
function pointX(evt){
  const rect=canvas.getBoundingClientRect();
  return (evt.touches?evt.touches[0].clientX:evt.clientX)-rect.left;
}
function onPointerMove(evt){
  const mx=pointX(evt);
  paddle.x=Math.min(Math.max(mx-paddle.w/2,0), canvas.width/DPR-paddle.w);
  if(evt.cancelable) evt.preventDefault();
  // flick to release sticky
  for(const b of balls){ if(b.stuck){ b.stuck=false; b.vy = -Math.abs(Math.max(3.5, Math.hypot(b.vx,b.vy))*0.9); } }
}
canvas.addEventListener("mousemove",onPointerMove);
canvas.addEventListener("touchstart",onPointerMove,{passive:false});
canvas.addEventListener("touchmove",onPointerMove,{passive:false});

// --- game systems
let shakeT=0, shakeMag=0;
function shake(ms=120, mag=3){ shakeT=ms; shakeMag=mag; vibe(20); }

function dropPower(x,y){
  if(Math.random()<0.12){
    const type=TYPES[(Math.random()*TYPES.length)|0];
    powerUps.push({x,y,vx:(Math.random()*0.6-0.3),vy:1.6*scaleY,type,t:0});
  }
}
function applyPower(type){
  ping(420);
  switch(type){
    case "BIG": paddle.w*=1.35; paddle.w=Math.min(paddle.w, canvas.width/DPR*0.5); break;
    case "STICKY": paddle.sticky=true; break;
    case "MULTI": {
      const newBalls = Math.min(2, 5 - balls.length);
      for(let i=0;i<newBalls;i++){ spawnBall(false, balls[0].x + (i*16-8)); }
      break;
    }
    case "BOOST": for(const b of balls){ b.vx*=1.2; b.vy*=1.2; } break;
    case "SLOW":  for(const b of balls){ b.vx*=0.75; b.vy*=0.75; } break;
    case "HEART": lives++; updateHUD(); break;
  }
}

let reverseCtlT=0, tinyT=0, rainT=0;
function chaosTick(){
  if(!chaos) return;
  if(Math.random()<0.005){ // random event sometimes
    const pick=(Math.random()*3)|0;
    if(pick===0) { reverseCtlT=5000; ping(240); }
    if(pick===1) { tinyT=5000; paddle.w*=0.4; ping(200); }
    if(pick===2) { rainT=2000; ping(700); }
  }
}

// --- loop
function update(ts){
  if(!running||paused) return;
  now=ts||performance.now(); dt=(now-last)||16; last=now;
  const W=canvas.width/DPR, H=canvas.height/DPR;

  // keyboard move (with possible reverse in chaos)
  paddle.vx = 0;
  const left = reverseCtlT>0 ? keys.has("right") : keys.has("left");
  const right = reverseCtlT>0 ? keys.has("left") : keys.has("right");
  if(left)  paddle.vx = -paddle.speed * PADDLE_MULT * Math.max(scaleX,scaleY);
  if(right) paddle.vx =  paddle.speed * PADDLE_MULT * Math.max(scaleX,scaleY);
  paddle.x = Math.min(Math.max(paddle.x + paddle.vx,0), W-paddle.w);

  // power-up rain in chaos
  if(rainT>0 && Math.random()<0.2){
    dropPower(Math.random()*W, -10);
  }

  // balls
  for(const b of balls){
    if(b.stuck) { b.x = Math.max(paddle.x + b.r, Math.min(paddle.x+paddle.w-b.r, b.x)); b.y = paddle.y - b.r - 1; continue; }
    b.x += b.vx * (dt/16);
    b.y += b.vy * (dt/16);
    // walls
    if(b.x-b.r<0){ b.x=b.r; b.vx*=-1; ping(500,0.03); }
    if(b.x+b.r>W){ b.x=W-b.r; b.vx*=-1; ping(500,0.03); }
    if(b.y-b.r<0){ b.y=b.r; b.vy*=-1; ping(450,0.03); }
    // bottom
    if(b.y-b.r>H){ balls.splice(balls.indexOf(b),1); continue; }

    // paddle
    if(
      b.x>paddle.x && b.x<paddle.x+paddle.w &&
      b.y+b.r>paddle.y && b.y-b.r<paddle.y+paddle.h
    ){
      b.y = paddle.y - b.r;
      const hit=(b.x-(paddle.x+paddle.w/2))/(paddle.w/2);
      const sp=Math.min(12*SPEED_MULT, Math.hypot(b.vx,b.vy)*1.03 + 0.1);
      const ang=(-Math.PI/3)*hit;
      b.vx = sp*Math.sin(ang);
      b.vy = -Math.abs(sp*Math.cos(ang));
      ping(700,0.04,0.05);
      if(paddle.sticky){ b.stuck=true; }
      // particle
      particles(b.x, b.y, 6);
    }

    // trail
    b.trail.push({x:b.x,y:b.y,life:1});
    if(b.trail.length>14) b.trail.shift();
  }

  // lose life if all balls gone
  if(balls.length===0){
    lives--; updateHUD();
    if(lives<=0){ running=false; ui.style.display="grid"; startBtn.textContent="Play again"; return; }
    spawnBall(true);
  }

  // bricks
  for(const b of balls){
    for(const br of bricks){
      if(!br.alive) continue;
      if(b.x+b.r>br.x && b.x-b.r<br.x+BRICK.w && b.y+b.r>br.y && b.y-b.r<br.y+BRICK.h){
        const ox=Math.min(b.x+b.r-br.x, (br.x+BRICK.w)-(b.x-b.r));
        const oy=Math.min(b.y+b.r-br.y, (br.y+BRICK.h)-(b.y-b.r));
        if(ox<oy) b.vx*=-1; else b.vy*=-1;
        br.hp--;
        if(br.hp<=0){ br.alive=false; score+=10; updateHUD(); dropPower(br.x+BRICK.w/2, br.y+BRICK.h/2); shake(120,3); }
        ping(320,0.03);
        particles(b.x,b.y,8);
        break;
      }
    }
  }

  // power-ups falling
  for(const p of powerUps){
    p.x += p.vx; p.y += p.vy;
    // collect
    if(p.x>paddle.x && p.x<paddle.x+paddle.w && p.y>paddle.y && p.y<paddle.y+paddle.h){
      applyPower(p.type); powerUps.splice(powerUps.indexOf(p),1);
    }
    // clean
    if(p.y>H+30) powerUps.splice(powerUps.indexOf(p),1);
  }

  // next level
  if(bricks.every(b=>!b.alive)){ level++; if(level>=3) showChaosHint(); reset(); }

  // timers
  if(reverseCtlT>0){ reverseCtlT -= dt; if(reverseCtlT<=0) ping(420); }
  if(tinyT>0){ tinyT -= dt; if(tinyT<=0){ paddle.w*=2.5; ping(420); } }
  if(rainT>0){ rainT -= dt; }
  chaosTick();

  draw();
  requestAnimationFrame(update);
}

// --- visuals
const burst=[];
function particles(x,y,n){
  for(let i=0;i<n;i++){
    burst.push({x,y, vx:(Math.random()*2-1)*2, vy:(Math.random()*2-1)*2, life:1});
  }
}
function draw(){
  // screen shake
  if(shakeT>0){
    shakeT -= dt;
    const dx=(Math.random()*2-1)*shakeMag, dy=(Math.random()*2-1)*shakeMag;
    ctx.save(); ctx.translate(dx,dy);
  } else { ctx.save(); }

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // bricks
  for(const br of bricks){
    if(!br.alive) continue;
    ctx.fillStyle=`hsl(${(br.y/2+level*40)%360} 65% 55%)`;
    ctx.fillRect(br.x, br.y, BRICK.w, BRICK.h);
    if(br.hp>1){
      ctx.fillStyle="#0008"; ctx.fillRect(br.x, br.y+BRICK.h-4, BRICK.w, 4);
      ctx.fillStyle="#fff"; ctx.fillRect(br.x, br.y+BRICK.h-4, (BRICK.w/br.hp)*(br.hp-1), 4);
    }
  }

  // paddle
  const grd=ctx.createLinearGradient(paddle.x,paddle.y,paddle.x,paddle.y+paddle.h);
  grd.addColorStop(0,"#93c5fd"); grd.addColorStop(1,"#60a5fa");
  ctx.fillStyle=grd; ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);
  ctx.fillStyle="#0004"; ctx.fillRect(paddle.x,paddle.y+paddle.h-3,paddle.w,3);

  // power-ups
  for(const p of powerUps){
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,.85)";
    ctx.beginPath(); ctx.arc(p.x,p.y,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
    ctx.font="bold 10px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(p.type[0], p.x, p.y);
    ctx.restore();
  }

  // balls (with trails + hedgehog)
  for(const b of balls){
    // trail
    for(const t of b.trail){
      t.life-=0.08; if(t.life<=0) continue;
      ctx.globalAlpha=Math.max(0,t.life*0.5);
      ctx.beginPath(); ctx.arc(t.x,t.y,b.r*(0.6*t.life),0,Math.PI*2); ctx.fillStyle="#fff"; ctx.fill();
      ctx.globalAlpha=1;
    }
    if(imgReady){
      const size=b.r*2;
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.clip();
      ctx.drawImage(img, b.x-b.r, b.y-b.r, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle="#ffd166"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    }
  }

  // particles
  for(const p of burst){
    p.x+=p.vx; p.y+=p.vy; p.life-=0.03;
    if(p.life<=0){ burst.splice(burst.indexOf(p),1); continue; }
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle="#fff"; ctx.fillRect(p.x,p.y,2,2);
    ctx.globalAlpha=1;
  }

  ctx.restore();
}

// --- UI
startBtn.addEventListener("click",()=>{
  ui.style.display="none";
  if(!running){ lives=3; level=1; score=0; chaos=false; reset(); running=true; paused=false; last=performance.now(); requestAnimationFrame(update); }
  else { paused=false; requestAnimationFrame(update); }
});

function showChaosHint(){
  if(document.getElementById("chaos-hint")) return;
  const d=document.createElement("div");
  d.id="chaos-hint";
  d.style.position="absolute"; d.style.bottom="8px"; d.style.left="50%"; d.style.transform="translateX(-50%)";
  d.style.background="rgba(0,0,0,.45)"; d.style.padding="6px 10px"; d.style.borderRadius="999px"; d.style.fontSize="12px";
  d.textContent="Press C to toggle CHAOS MODE";
  document.querySelector(".wrap").appendChild(d);
  setTimeout(()=>d.remove(),4500);
}

// resize/orientation
function doResize(){ layout(); }
window.addEventListener("resize", doResize);
window.addEventListener("orientationchange", ()=>setTimeout(doResize,50));

// boot
updateHUD(); layout();
