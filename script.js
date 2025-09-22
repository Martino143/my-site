// --- Mobile-friendly Hedgehog Breaker ---
// Put your image next to index.html as "hedgehog.png"
const HEDGEHOG_SRC = "hedgehog.png";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");
const startBtn = document.getElementById("start");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

// Virtual design size; we scale to this internally for consistent physics.
const BASE_W = 720, BASE_H = 480;

let running = false, paused = false;
let score = 0, lives = 3, level = 1;
let DPR = window.devicePixelRatio || 1;
let scaleX = 1, scaleY = 1;

// Entities (sizes/positions will be set by layout())
const paddle = { w: 0, h: 0, x: 0, y: 0, speed: 8, vx: 0 };
const ball = { r: 0, x: 0, y: 0, vx: 0, vy: 0, img: new Image(), ready: false };
ball.img.onload = () => (ball.ready = true);
ball.img.src = HEDGEHOG_SRC;

// Bricks (recomputed on layout)
const BRICK = { rows: 5, cols: 10, pad: 0, w: 0, h: 0, top: 0, left: 0 };
let bricks = [];

function setCanvasForDPR() {
  // Match internal pixels to CSS size * DPR for crisp rendering
  const rect = canvas.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * DPR);
  canvas.height = Math.round(rect.height * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // draw in CSS pixels
  scaleX = canvas.width  / DPR / BASE_W;
  scaleY = canvas.height / DPR / BASE_H;
}

// Layout responsive sizes based on CSS pixels
function layout() {
  setCanvasForDPR();

  // Paddle/ball relative to base size, then scaled to current canvas
  paddle.w = 0.16 * BASE_W * scaleX;
  paddle.h = 0.035 * BASE_H * scaleY;
  paddle.x = (BASE_W * scaleX) / 2 - paddle.w / 2;
  paddle.y = (BASE_H * scaleY) - paddle.h - 16;

  ball.r = Math.max(10 * Math.min(scaleX, scaleY), 8);
  resetBall(true);

  // Bricks grid scaled
  BRICK.cols = 10;
  BRICK.rows = 5;
  BRICK.pad = 6 * scaleX;
  BRICK.left = 24 * scaleX;
  BRICK.top = 50 * scaleY;

  // compute width to fit cols
  const totalPad = (BRICK.cols - 1) * BRICK.pad;
  BRICK.w = ((BASE_W * scaleX) - BRICK.left * 2 - totalPad) / BRICK.cols;
  BRICK.h = 18 * scaleY;

  makeBricks();
  draw(); // paint first frame
}

function makeBricks() {
  bricks = [];
  for (let r = 0; r < BRICK.rows; r++) {
    for (let c = 0; c < BRICK.cols; c++) {
      bricks.push({
        x: BRICK.left + c * (BRICK.w + BRICK.pad),
        y: BRICK.top + r * (BRICK.h + BRICK.pad),
        alive: true,
        hp: 1 + Math.floor((level - 1) / 2)
      });
    }
  }
}

function resetBall(keepSpeed=false) {
  ball.x = (BASE_W * scaleX) / 2;
  ball.y = (BASE_H * scaleY) - 60 * scaleY;
  const baseSpeed = 4.25 + (level - 1) * 0.35;
  const speed = keepSpeed ? Math.hypot(ball.vx, ball.vy) || baseSpeed : baseSpeed;
  const angle = (Math.random() * 0.8 + 0.6) * Math.PI;
  ball.vx = Math.cos(angle) * speed * scaleX;
  ball.vy = Math.sin(angle) * speed * scaleY;
}

function reset(levelUp=false) {
  if (levelUp) level++;
  score = levelUp ? score : 0;
  lives = levelUp ? lives : lives;
  updateHUD();
  layout();
}

function updateHUD() {
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
  levelEl.textContent = `Level: ${level}`;
}

// ----- Input (keyboard + mouse + touch) -----
const keys = new Set();
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.add("left");
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.add("right");
  if (e.key.toLowerCase() === "p") paused = !paused;
  if (e.key.toLowerCase() === "r") { lives = 3; level = 1; reset(); }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.delete("left");
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.delete("right");
});

// Mouse/touch drag
function pointX(evt) {
  const rect = canvas.getBoundingClientRect();
  if (evt.touches && evt.touches[0]) return evt.touches[0].clientX - rect.left;
  return evt.clientX - rect.left;
}
function onPointerMove(evt) {
  const mx = pointX(evt);
  paddle.x = Math.min(Math.max(mx - paddle.w / 2, 0), canvas.width / DPR - paddle.w);
  if (evt.cancelable) evt.preventDefault();
}
canvas.addEventListener("mousemove", onPointerMove);
canvas.addEventListener("touchstart", onPointerMove, { passive: false });
canvas.addEventListener("touchmove", onPointerMove, { passive: false });

// ----- Game loop -----
function update() {
  if (!running || paused) return;

  // Keyboard paddle
  paddle.vx = 0;
  if (keys.has("left")) paddle.vx = -8 * Math.max(scaleX, scaleY);
  if (keys.has("right")) paddle.vx =  8 * Math.max(scaleX, scaleY);
  paddle.x = Math.min(Math.max(paddle.x + paddle.vx, 0), canvas.width / DPR - paddle.w);

  // Ball movement
  ball.x += ball.vx;
  ball.y += ball.vy;

  const W = canvas.width / DPR, H = canvas.height / DPR;

  // Walls
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
  if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }
  if (ball.y - ball.r > H) {
    lives--; updateHUD();
    if (lives <= 0) {
      running = false;
      ui.style.display = "grid";
      startBtn.textContent = "Play again";
      return;
    }
    resetBall();
  }

  // Paddle collision
  if (
    ball.x > paddle.x &&
    ball.x < paddle.x + paddle.w &&
    ball.y + ball.r > paddle.y &&
    ball.y - ball.r < paddle.y + paddle.h
  ) {
    ball.y = paddle.y - ball.r;
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = (-Math.PI / 3) * hit;
    ball.vx = speed * Math.sin(angle);
    ball.vy = -Math.abs(speed * Math.cos(angle));
  }

  // Bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    if (
      ball.x + ball.r > b.x &&
      ball.x - ball.r < b.x + BRICK.w &&
      ball.y + ball.r > b.y &&
      ball.y - ball.r < b.y + BRICK.h
    ) {
      const overlapX = Math.min(ball.x + ball.r - b.x, (b.x + BRICK.w) - (ball.x - ball.r));
      const overlapY = Math.min(ball.y + ball.r - b.y, (b.y + BRICK.h) - (ball.y - ball.r));
      if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;

      b.hp--;
      if (b.hp <= 0) { b.alive = false; score += 10; updateHUD(); }
      break;
    }
  }

  if (bricks.every(b => !b.alive)) reset(true);

  draw();
  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // draw in CSS pixels (ctx already scaled by setTransform)

  // bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = `hsl(${(b.y/2 + level*40)%360} 65% 55%)`;
    ctx.fillRect(b.x, b.y, BRICK.w, BRICK.h);
    if (b.hp > 1) {
      ctx.fillStyle = "#0008";
      ctx.fillRect(b.x, b.y + BRICK.h - 4, BRICK.w, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(b.x, b.y + BRICK.h - 4, (BRICK.w / b.hp) * (b.hp - 1), 4);
    }
  }

  // paddle
  const grd = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  grd.addColorStop(0, "#93c5fd");
  grd.addColorStop(1, "#60a5fa");
  ctx.fillStyle = grd;
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
  ctx.fillStyle = "#0004";
  ctx.fillRect(paddle.x, paddle.y + paddle.h - 3, paddle.w, 3);

  // ball (hedgehog)
  if (ball.ready) {
    const size = ball.r * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(ball.img, ball.x - ball.r, ball.y - ball.r, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// UI
startBtn.addEventListener("click", () => {
  ui.style.display = "none";
  if (!running) {
    lives = 3; level = 1; reset();
    running = true; paused = false;
    requestAnimationFrame(update);
  } else {
    paused = false;
    requestAnimationFrame(update);
  }
});

// Handle resize/orientation changes
const doResize = () => {
  layout();
};
window.addEventListener("resize", doResize);
window.addEventListener("orientationchange", () => setTimeout(doResize, 50));

// Boot
updateHUD();
layout();   // sizes canvas to screen & draws first frame
