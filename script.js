/* Hedgehog Breaker: Arcade Chaos (no portals, clamped paddle size) */

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
let SPEED_MULT  = MOBILE ? 1.9 : 1.05;
let PADDLE_MULT = MOBILE ? 1.7 : 1.1;

let running=false, paused=false, chaos=true;
let score=0, lives=3, level=1, combo=1, comboTimer=0;
let DPR=1, scaleX=1, scaleY=1, last=0, dt=16;

const hog = new Image(); hog.src = HEDGEHOG_SRC; let hogReady=false; hog.onload=()=>hogReady=true;

// --- tiny beeps
const ACtx = new (window.AudioContext||window.webkitAudioContext)();
function beep(f=600, d=0.06, v=0.05, type="sine"){ const o=ACtx.createOscillator(), g=ACtx.createGain(); o.type=type; o.frequency.value=f; g.gain.value=v; o.connect(g); g.connect(ACtx.destination); o.start(); o.stop(ACtx.currentTime+d); }
function boom(){ beep(120,0.2,0.06,"triangle"); }
function vibe(ms=30){ if(navigator.vibrate) navigator.vibrate(ms); }

// --- entities
const paddle = { w:0, h:0, x:0, y:0, vx:0, speed:10, sticky:false, laser:false, shield:0, magnet:false };
const balls = [];
const powerUps = [];
const bullets  = [];
const lasers   = [];
const bursts   = [];

const BRICK = { rows:6, cols:11, pad:0, w:0, h:0, top:0, left:0 };
let bricks=[];

// effects
let wind=0, gravity=1, slowmo=1, dark=0, reverseCtlT=0, tinyT=0, rainT=0, eventTimer=0;
let shakeT=0, shakeMag=0;

// boss
let boss=null;

// ---------- helpers (paddle width clamp) ----------
function canvasCSSWidth(){ return canvas.width / DPR; }
function paddleMinWidth(){ return canvasCSSWidth() * 0.12; }  // 12% of canvas
function paddleMaxWidth(){ return canvasCSSWidth() * 0.60; }  // 60% of canvas
function setPaddleWidth(w){
  paddle.w = Math.max(paddleMinWidth(), Math.min(paddleMaxWidth(), w));
}
function clampPaddleWidth(){ setPaddleWidth(paddle.w); }

// ---------- layout & scaling ----------
function setCanvasForDPR(){
  const r = canvas.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  canvas.width  = Math.round(r.width  * DPR);
  canvas.height = Math.round(r.height * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  scaleX = canvas.width/DPR/BASE_W;
  scaleY = canvas.height/DPR/BASE_H;
}
function layout(){
  setCanvasForDPR();

  // paddle
  setPaddleWidth(0.18 * BASE_W * scaleX);
  paddle.h = 0.035 * BASE_H * scaleY;
  paddle.x = (BASE_W*scaleX)/2 - paddle.w/2;
  paddle.y = (BASE_H*scaleY) - paddle.h - 16;

  // bricks grid
  BRICK.pad = 6 * scaleX;
  BRICK.left= 24 * scaleX;
  BRICK.top = 56 * scaleY;
  const padW = (BRICK.cols-1)*BRICK.pad;
  BRICK.w = ((BASE_W*scaleX) - BRICK.left*2 - padW) / BRICK.cols;
  BRICK.h = 18 * scaleY;

  balls.length=0; lasers.length=0; powerUps.length=0; bullets.length=0; bursts.length=0;
  boss=null;
  makeLevel();
  spawnBall(true);
  draw();
}

function makeLevel(){
  bricks=[];
  if(level % 5 === 0){
    // mini-boss level (no portal bricks used anywhere)
    for(let r=0;r<4;r++){
      for(const c of [0, BRICK.cols-1]){
        addBrick(c, r+1, "steel", 4);
      }
    }
    boss = {
      x: (BASE_W*scaleX)/2 - 80*scaleX,
      y: BRICK.top + 20*scaleY,
      w: 160*scaleX, h: 28*scaleY,
      hp: 40 + 10*(level/5-1), max: 40 + 10*(level/5-1),
      dir: 1, shootT: 1200
    };
    return;
  }

  // Mix WITHOUT portals (no circular bricks)
  const pool = ["normal","normal","normal","steel","bomb","moving","regen","shooter","normal"];
  for(let r=0;r<BRICK.rows;r++){
    for(let c=0;c<BRICK.cols;c++){
      const t = pool[(Math.random()*pool.length)|0];
      const hp = (t==="steel") ? 3 : 1;
      addBrick(c,r,t,hp);
    }
  }
}
function addBrick(c,r,type="normal",hp=1){
  const x = BRICK.left + c*(BRICK.w+BRICK.pad);
  const y = BRICK.top  + r*(BRICK.h+BRICK.pad);
  bricks.push({x,y,type,hp,alive:true,phi:Math.random()*Math.PI*2, shootT: 1500+Math.random()*1200});
}

// ---------- balls ----------
function spawnBall(keep=false, atX=paddle.x+paddle.w/2){
  const r = Math.max(10*Math.min(scaleX,scaleY), 8);
  const base = (4.7 + (level-1)*0.42) * SPEED_MULT;
  const sp = keep && balls[0] ? Math.hypot(balls[0].vx, balls[0].vy) : base;
  const ang = (Math.random()*0.7 + 0.6) * Math.PI;
  balls.push({x:atX, y:paddle.y-r-2, vx:Math.cos(ang)*sp*scaleX, vy:-Math.abs(Math.sin(ang))*sp*scaleY, r, trail:[], stuck:false, phaseT:0});
}

function reset(levelUp=false){
  if(levelUp) level++;
  updateHUD();
  combo=1; comboTimer=0;
  wind=0; gravity=1; slowmo=1; dark=0; reverseCtlT=0; tinyT=0; rainT=0; eventTimer=0;
  paddle.sticky=false; paddle.laser=false; paddle.magnet=false; paddle.shield=0;
  layout();
}
function updateHUD(){ scoreEl.textContent=`Score: ${score}  x${combo.toFixed(1)}`; livesEl.textContent=`Lives: ${lives}`; levelEl.textContent=`Level: ${level}${chaos?" • CHAOS":""}`; }

// ---------- input ----------
const keys=new Set();
document.addEventListener("keydown",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a") keys.add("left");
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d") keys.add("right");
  if(e.key.toLowerCase()==="p") paused=!paused;
  if(e.key.toLowerCase()==="r"){ lives=3; level=1; score=0; reset(); }
  if(e.key===" " && paddle.laser){ fireLasers(); }
});
document.addEventListener("keyup",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a") keys.delete("left");
  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d") keys.delete("right");
});

function pointerX(evt){ const rect=canvas.getBoundingClientRect(); return (evt.touches?evt.touches[0].clientX:evt.clientX)-rect.left; }
function onDrag(evt){
  const mx = pointerX(evt);
  paddle.x = Math.min(Math.max(mx - paddle.w/2, 0), canvas.width/DPR - paddle.w);
  if(evt.cancelable) evt.preventDefault();
  for(const b of balls) if(b.stuck){ b.stuck=false; b.vy = -Math.abs(Math.max(3.2, Math.hypot(b.vx,b.vy))*0.9); }
}
canvas.addEventListener("mousemove",onDrag);
canvas.addEventListener("touchstart",onDrag,{passive:false});
canvas.addEventListener("touchmove",onDrag,{passive:false});

// ---------- power-ups ----------
const PUPS = [
  "BIG","STICKY","MULTI","BOOST","SLOW","HEART",
  "LASER","SHIELD","MAGNET","PHASE",
  "CONFUSE","TINY"
];
function dropPower(x,y,forceType=null){
  const roll = Math.random();
  if(forceType || roll < 0.16 || rainT>0){
    const type = forceType || PUPS[(Math.random()*PUPS.length)|0];
    powerUps.push({x,y, vx:(Math.random()*0.8-0.4), vy:1.8*scaleY, r:11, type});
  }
}
function applyPower(t){
  switch(t){
    case "BIG": setPaddleWidth(paddle.w * 1.35); break;
    case "STICKY": paddle.sticky=true; break;
    case "MULTI": { const n=Math.min(3, 6-balls.length); for(let i=0;i<n;i++) spawnBall(false, balls[0]?.x+(i-1)*18); } break;
    case "BOOST": for(const b of balls){ b.vx*=1.2; b.vy*=1.2; } break;
    case "SLOW":  for(const b of balls){ b.vx*=0.75; b.vy*=0.75; } break;
    case "HEART": lives++; break;
    case "LASER": paddle.laser=true; break;
    case "SHIELD": paddle.shield = Math.min(paddle.shield+2, 4); break;
    case "MAGNET": paddle.magnet=true; setTimeout(()=>paddle.magnet=false, 9000); break;
    case "PHASE":  for(const b of balls){ b.phaseT = Math.max(b.phaseT, 6000); } break;
    case "CONFUSE": reverseCtlT = Math.max(reverseCtlT, 6000); break;
    case "TINY": tinyT = Math.max(tinyT, 6000); setPaddleWidth(paddle.w * 0.5); break;
  }
  clampPaddleWidth();
  beep(540);
  updateHUD();
}
function fireLasers(){
  const y = paddle.y - 4;
  lasers.push({x:paddle.x+6, y, vy:-10*scaleY}, {x:paddle.x+paddle.w-6, y, vy:-10*scaleY});
  beep(780,0.05,0.06);
}

// ---------- enemies / bullets ----------
function enemyShoot(x,y){ bullets.push({x,y, vy: 3.2*scaleY}); beep(300,0.05,0.04,"square"); }

// ---------- events (kept, no portals involved) ----------
function scheduleEvent(dt){
  eventTimer -= dt;
  if(eventTimer>0) return;
  eventTimer = 16000 + Math.random()*8000;

  if(!chaos) return;
  const pick = (Math.random()*6)|0;
  switch(pick){
    case 0: wind = (Math.random()*2-1) * 0.06; setTimeout(()=>wind=0, 7000); break;
    case 1: gravity = 0.85; setTimeout(()=>gravity=1, 7000); break;
    case 2: slowmo = 0.7; setTimeout(()=>slowmo=1, 6000); break;
    case 3: dark = 0.6; setTimeout(()=>dark=0, 7000); break;
    case 4: reverseCtlT = 5000; break;
    case 5: rainT = 2500; break;
  }
}

// ---------- particles ----------
function shake(ms=140, mag=3){ shakeT=ms; shakeMag=mag; vibe(20); }
function spray(x,y,n=10){ for(let i=0;i<n;i++){ bursts.push({x,y, vx:(Math.random()*2-1)*2, vy:(Math.random()*2-1)*2, life:1}); } }

// ---------- loop ----------
function update(ts){
  if(!running || paused) return;
  dt = Math.min(32, (ts - last) || 16) * slowmo;
  last = ts;

  const W = canvas.width/DPR, H = canvas.height/DPR;

  // paddle keys
  let left = keys.has("left"), right = keys.has("right");
  if(reverseCtlT>0){ const L=left; left=right; right=L; reverseCtlT-=dt; if(reverseCtlT<0) reverseCtlT=0; }
  paddle.vx = 0;
  if(left)  paddle.vx = -paddle.speed * PADDLE_MULT * Math.max(scaleX,scaleY);
  if(right) paddle.vx =  paddle.speed * PADDLE_MULT * Math.max(scaleX,scaleY);
  paddle.x = Math.min(Math.max(paddle.x + paddle.vx, 0), W - paddle.w);

  // magnet pulls power-ups
  if(paddle.magnet){
    for(const p of powerUps){
      const dx = (paddle.x+paddle.w/2)-p.x, dy=(paddle.y)-p.y;
      const d = Math.hypot(dx,dy)+1;
      p.vx += (dx/d)*0.02; p.vy += (dy/d)*0.02;
    }
  }

  // lasers
  for(const L of [...lasers]){
    L.y += L.vy;
    if(L.y < -10) lasers.splice(lasers.indexOf(L),1);
  }

  // enemy bullets
  for(const b of [...bullets]){
    b.y += b.vy;
    if(b.x>paddle.x && b.x<paddle.x+paddle.w && b.y>paddle.y && b.y<paddle.y+paddle.h){
      if(paddle.shield>0){ paddle.shield--; spray(b.x,b.y,8); beep(200,0.06,0.05); }
      else { loseBall(); }
      bullets.splice(bullets.indexOf(b),1);
      continue;
    }
    if(b.y>H+20) bullets.splice(bullets.indexOf(b),1);
  }

  // balls
  for(const b of [...balls]){
    if(b.stuck){ b.x = Math.max(paddle.x+b.r, Math.min(paddle.x+paddle.w-b.r, b.x)); b.y = paddle.y - b.r - 1; continue; }

    b.x += (b.vx + wind) * (dt/16);
    b.y += (b.vy + gravity*0.0) * (dt/16);

    if(b.x-b.r<0){ b.x=b.r; b.vx*=-1; beep(500,0.03); }
    if(b.x+b.r>W){ b.x=W-b.r; b.vx*=-1; beep(500,0.03); }
    if(b.y-b.r<0){ b.y=b.r; b.vy*=-1; beep(450,0.03); }
    if(b.y-b.r>H){ balls.splice(balls.indexOf(b),1); continue; }

    // paddle bounce
    if(b.x>paddle.x && b.x<paddle.x+paddle.w && b.y+b.r>paddle.y && b.y-b.r<paddle.y+paddle.h){
      b.y = paddle.y - b.r;
      const hit = (b.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
      const sp = Math.min(12*SPEED_MULT, Math.hypot(b.vx,b.vy)*1.03 + 0.12);
      const ang = (-Math.PI/3)*hit;
      b.vx = sp*Math.sin(ang);
      b.vy = -Math.abs(sp*Math.cos(ang));
      if(paddle.sticky) b.stuck=true;
      spray(b.x, b.y, 8);
      beep(720,0.04,0.05);
    }

    comboTimer -= dt; if(comboTimer<=0) { combo = Math.max(1, combo-0.1); comboTimer=0; }

    b.trail.push({x:b.x,y:b.y,life:1});
    if(b.trail.length>14) b.trail.shift();
  }

  if(balls.length===0){ loseBall(true); }

  // bricks update (moving/regenerating/shooters only)
  for(const br of bricks){
    if(!br.alive) continue;
    if(br.type==="moving"){ br.phi += dt*0.003; br.x += Math.sin(br.phi)*0.8; }
    if(br.type==="regen" && Math.random()<0.002*dt){ br.hp = Math.min(br.hp+1, 3); }
    if(br.type==="shooter"){ br.shootT -= dt; if(br.shootT<=0){ enemyShoot(br.x+BRICK.w/2, br.y+BRICK.h); br.shootT = 1500 + Math.random()*1200; } }
  }

  // ball vs bricks
  for(const ball of balls){
    for(const br of bricks){
      if(!br.alive) continue;
      if(ball.x+ball.r>br.x && ball.x-ball.r<br.x+BRICK.w &&
         ball.y+ball.r>br.y && ball.y-ball.r<br.y+BRICK.h){

        const ox=Math.min(ball.x+ball.r-br.x, (br.x+BRICK.w)-(ball.x-ball.r));
        const oy=Math.min(ball.y+ball.r-br.y, (br.y+BRICK.h)-(ball.y-ball.r));
        if(ox<oy) ball.vx*=-1; else ball.vy*=-1;

        br.hp--;
        if(br.hp<=0){
          br.alive=false;
          score += Math.round(10*combo);
          combo = Math.min(5, combo+0.25);
          comboTimer = 2500;
          dropPower(br.x+BRICK.w/2, br.y+BRICK.h/2);
          spray(ball.x, ball.y, 12);
          shake(120,3);
          boom();
          if(br.type==="bomb"){
            for(const nb of bricks){
              if(!nb.alive) continue;
              const dx=(nb.x+BRICK.w/2)-(br.x+BRICK.w/2);
              const dy=(nb.y+BRICK.h/2)-(br.y+BRICK.h/2);
              if(Math.hypot(dx,dy) < BRICK.w*1.4) { nb.hp-=2; if(nb.hp<=0) nb.alive=false; }
            }
          }
        }else{
          beep(360,0.03);
        }
        break;
      }
    }
  }

  // lasers vs bricks/boss
  for(const L of [...lasers]){
    if(boss){
      if(L.x>boss.x && L.x<boss.x+boss.w && L.y>boss.y && L.y<boss.y+boss.h){
        lasers.splice(lasers.indexOf(L),1);
        boss.hp -= 1.5; spray(L.x,L.y,6); beep(900,0.03,0.06);
        if(boss.hp<=0){ score+=200; boss=null; shake(240,5); boom(); }
        continue;
      }
    }
    let hit=false;
    for(const br of bricks){
      if(!br.alive) continue;
      if(L.x>br.x && L.x<br.x+BRICK.w && L.y>br.y && L.y<br.y+BRICK.h){
        br.hp-=2; if(br.hp<=0){ br.alive=false; score+=Math.round(10*combo); }
        lasers.splice(lasers.indexOf(L),1); spray(L.x,L.y,6); hit=true; break;
      }
    }
    if(hit) continue;
    L.y += L.vy;
    if(L.y<-10) lasers.splice(lasers.indexOf(L),1);
  }

  // boss
  if(boss){
    boss.x += (level%2?1:-1) * boss.dir * 1.6 * (dt/16);
    if(boss.x<30 || boss.x+boss.w>W-30) boss.dir*=-1;
    boss.shootT -= dt;
    if(boss.shootT<=0){ enemyShoot(boss.x + boss.w/2, boss.y+boss.h); boss.shootT = 900 + Math.random()*700; }
  }

  // collect power-ups
  for(const p of [...powerUps]){
    p.x += p.vx*(dt/16); p.y += p.vy*(dt/16);
    if(p.x>paddle.x && p.x<paddle.x+paddle.w && p.y>paddle.y && p.y<paddle.y+paddle.h){
      applyPower(p.type); powerUps.splice(powerUps.indexOf(p),1);
    } else if(p.y > H+30) powerUps.splice(powerUps.indexOf(p),1);
  }

  // next level
  if(!boss && bricks.every(b=>!b.alive)){ reset(true); }

  // timers
  if(tinyT>0){ tinyT-=dt; if(tinyT<=0){ setPaddleWidth(paddle.w * 2.0); tinyT=0; } }
  if(rainT>0){ rainT-=dt; dropPower(Math.random()*(W-40)+20, -20); }
  scheduleEvent(dt);

  draw();
  requestAnimationFrame(update);
}

function loseBall(fromBottom=false){
  if(fromBottom && paddle.shield>0){ paddle.shield--; beep(240,0.06,0.05); return; }
  lives--; updateHUD(); shake(180,4); boom();
  if(lives<=0){ running=false; ui.style.display="grid"; startBtn.textContent="Play again"; return; }
  balls.length=0; spawnBall(true);
}

// ---------- render ----------
function draw(){
  ctx.save();
  if(shakeT>0){ shakeT-=dt; ctx.translate((Math.random()*2-1)*shakeMag, (Math.random()*2-1)*shakeMag); }

  const W = canvas.width/DPR, H = canvas.height/DPR;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#10142e"); g.addColorStop(1,"#0a0d21");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  if(dark>0){
    ctx.fillStyle=`rgba(0,0,0,${dark})`; ctx.fillRect(0,0,W,H);
    for(const b of balls){
      const grd = ctx.createRadialGradient(b.x,b.y,10, b.x,b.y,120);
      grd.addColorStop(0,"rgba(255,255,255,0.0)");
      grd.addColorStop(1,"rgba(0,0,0,0.7)");
      ctx.globalCompositeOperation="destination-out";
      ctx.fillStyle=grd; ctx.fillRect(b.x-130,b.y-130,260,260);
      ctx.globalCompositeOperation="source-over";
    }
  }

  // bricks
  for(const br of bricks){
    if(!br.alive) continue;
    let col = "#58a6ff";
    if(br.type==="steel")  col="#9aa0a6";
    if(br.type==="bomb")   col="#ff7676";
    if(br.type==="moving") col="#77e3a9";
    if(br.type==="regen")  col="#b1e37a";
    if(br.type==="shooter") col="#ffb66e";
    ctx.fillStyle = col;
    ctx.fillRect(br.x, br.y, BRICK.w, BRICK.h);
    if(br.hp>1){
      ctx.fillStyle="#0008"; ctx.fillRect(br.x,br.y+BRICK.h-4,BRICK.w,4);
      ctx.fillStyle="#fff";  ctx.fillRect(br.x,br.y+BRICK.h-4,(BRICK.w/br.hp)*(br.hp-1),4);
    }
  }

  // boss
  if(boss){
    ctx.fillStyle="#e66"; ctx.fillRect(boss.x,boss.y,boss.w,boss.h);
    ctx.fillStyle="#0008"; ctx.fillRect(20, 16, W-40, 8);
    ctx.fillStyle="#0f0";  ctx.fillRect(20, 16, (W-40)*(boss.hp/boss.max), 8);
  }

  // paddle (with shield glow)
  if(paddle.shield>0){
    ctx.fillStyle="rgba(100,255,200,0.25)";
    ctx.fillRect(paddle.x-4, paddle.y-4, paddle.w+8, paddle.h+8);
  }
  const grd=ctx.createLinearGradient(paddle.x,paddle.y,paddle.x,paddle.y+paddle.h);
  grd.addColorStop(0,"#93c5fd"); grd.addColorStop(1,"#60a5fa");
  ctx.fillStyle=grd; ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);
  ctx.fillStyle="#0004"; ctx.fillRect(paddle.x,paddle.y+paddle.h-3,paddle.w,3);

  // power-ups
  for(const p of powerUps){
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,.92)";
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111"; ctx.font="bold 11px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(p.type[0], p.x, p.y);
    ctx.restore();
  }

  // enemy bullets
  ctx.fillStyle="#ff6b6b";
  for(const b of bullets){ ctx.fillRect(b.x-2, b.y-6, 4, 12); }

  // lasers
  ctx.fillStyle="#7cf";
  for(const L of lasers){ ctx.fillRect(L.x-1, L.y-10, 2, 10); }

  // balls (with trails)
  for(const b of balls){
    for(const t of b.trail){
      t.life -= 0.08; if(t.life<=0) continue;
      ctx.globalAlpha=Math.max(0,t.life*0.5);
      ctx.beginPath(); ctx.arc(t.x,t.y,b.r*(0.6*t.life),0,Math.PI*2); ctx.fillStyle="#fff"; ctx.fill();
      ctx.globalAlpha=1;
    }
    if(hogReady){
      const size=b.r*2; ctx.save();
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.clip();
      ctx.drawImage(hog, b.x-b.r, b.y-b.r, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle="#ffd166"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    }
  }

  // particles
  for(const p of [...bursts]){
    p.x+=p.vx; p.y+=p.vy; p.life-=0.03;
    if(p.life<=0){ bursts.splice(bursts.indexOf(p),1); continue; }
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle="#fff"; ctx.fillRect(p.x,p.y,2,2);
    ctx.globalAlpha=1;
  }

  ctx.restore();
}

// ---------- boot & resize ----------
startBtn.addEventListener("click",()=>{
  ui.style.display="none";
  if(!running){ lives=3; level=1; score=0; reset(); running=true; paused=false; last=performance.now(); requestAnimationFrame(update); }
  else { paused=false; requestAnimationFrame(update); }
});
function handleResize(){ layout(); clampPaddleWidth(); }
window.addEventListener("resize", handleResize);
window.addEventListener("orientationchange", ()=>setTimeout(handleResize,60));

updateHUD(); layout();
