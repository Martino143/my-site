// --- tiny breakout with hedgehog "ball" ---
// Replace this path if your image name/location differs
const HEDGEHOG_SRC = "hedgehog.png";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");
const startBtn = document.getElementById("start");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");

// Game state
let running = false, paused = false;
let score = 0, lives = 3, level = 1;

// Paddle
const paddle = {
  w: 110, h: 14,
  x: canvas.width / 2 - 55,
  y: canvas.height - 28,
  speed: 8,
  vx: 0
};

// Ball (drawn with image)
const ball = {
  r: 14,
  x: canvas.width / 2,
  y: canvas.height - 60,
  vx: 4.25,
  vy: -4.25,
  img: new Image(),
  ready: false
};
ball.img.onload = () => (ball.ready = true);
ball.img.src = HEDGEHOG_SRC;

// Bricks
const BRICK = { rows: 5, cols: 10, pad: 8, w: 60, h: 18, top: 60, left: 30 };
let bricks = [];

function makeBricks() {
  bricks = [];
  for (let r = 0; r < BRICK.rows; r++) {
    for (let c = 0; c < BRICK.cols; c++) {
      bricks.push({
        x: BRICK.left + c * (BRICK.w + BRICK.pad),
        y: BRICK.top + r * (BRICK.h + BRICK.pad),
        alive: true,
        hp: 1 + Math.floor((level - 1) / 2) // gets tougher every 2 levels
      });
    }
  }
}

function resetBall() {
  ball.x = canvas.width / 2;
  ball.y = canvas.height - 60;
  const speed = 4.25 + (level - 1) * 0.35;
  const angle = (Math.random() * 0.8 + 0.6) * Math.PI; // shoot upward-ish
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

function reset(levelUp=false) {
  if (levelUp) level++;
  score = levelUp ? score : 0;
  paddle.x = canvas.width / 2 - paddle.w / 2;
  makeBricks();
  resetBall();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
  levelEl.textContent = `Level: ${level}`;
}

// Input
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
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  paddle.x = Math.min(
    Math.max(mx - paddle.w / 2, 0),
    canvas.width - paddle.w
  );
});

// Core loop
function update() {
  if (!running || paused) return;

  // Paddle velocity (keyboard)
  paddle.vx = 0;
  if (keys.has("left")) paddle.vx = -paddle.speed;
  if (keys.has("right")) paddle.vx = paddle.speed;
  paddle.x = Math.min(Math.max(paddle.x + paddle.vx, 0), canvas.width - paddle.w);

  // Ball physics
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Walls
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
  if (ball.x + ball.r > canvas.width) { ball.x = canvas.width - ball.r; ball.vx *= -1; }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }
  if (ball.y - ball.r > canvas.height) {
    lives--;
    updateHUD();
    if (lives <= 0) {
      running = false;
      ui.style.display = "grid";
      startBtn.textContent = "Play again";
      return;
    }
    resetBall();
  }

  // Paddle collision (simple AABB + reflect)
  if (
    ball.x > paddle.x &&
    ball.x < paddle.x + paddle.w &&
    ball.y + ball.r > paddle.y &&
    ball.y - ball.r < paddle.y + paddle.h
  ) {
    ball.y = paddle.y - ball.r;
    // reflect with angle based on hit position
    const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = (-Math.PI / 3) * hit; // spread
    ball.vx = speed * Math.sin(angle);
    ball.vy = -Math.abs(speed * Math.cos(angle));
  }

  // Brick collisions
  for (const b of bricks) {
    if (!b.alive) continue;
    if (
      ball.x + ball.r > b.x &&
      ball.x - ball.r < b.x + BRICK.w &&
      ball.y + ball.r > b.y &&
      ball.y - ball.r < b.y + BRICK.h
    ) {
      // pick vertical or horizontal bounce
      const overlapX = Math.min(ball.x + ball.r - b.x, (b.x + BRICK.w) - (ball.x - ball.r));
      const overlapY = Math.min(ball.y + ball.r - b.y, (b.y + BRICK.h) - (ball.y - ball.r));
      if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;

      b.hp--;
      if (b.hp <= 0) { b.alive = false; score += 10; updateHUD(); }
      break;
    }
  }

  // Next level if all gone
  if (bricks.every(b => !b.alive)) {
    reset(true);
  }

  draw();
  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = `hsl(${(b.y/2 + level*40)%360} 65% 55%)`;
    ctx.fillRect(b.x, b.y, BRICK.w, BRICK.h);
    // tiny hp bar for tougher bricks
    if (b.hp > 1) {
      ctx.fillStyle = "#0008";
      ctx.fillRect(b.x, b.y + BRICK.h - 4, BRICK.w, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(b.x, b.y + BRICK.h - 4, (BRICK.w / b.hp) * (b.hp - 1), 4);
    }
  }

  // Paddle
  const grd = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  grd.addColorStop(0, "#93c5fd");
  grd.addColorStop(1, "#60a5fa");
  ctx.fillStyle = grd;
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
  ctx.fillStyle = "#0004";
  ctx.fillRect(paddle.x, paddle.y + paddle.h - 3, paddle.w, 3);

  // Ball (hedgehog)
  if (ball.ready) {
    const size = ball.r * 2;
    ctx.save();
    ctx.beginPath(); // soft round mask so it feels ball-ish
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(ball.img, ball.x - ball.r, ball.y - ball.r, size, size);
    ctx.restore();
  } else {
    // fallback circle
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }
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

// Boot
updateHUD();
makeBricks();
draw();
