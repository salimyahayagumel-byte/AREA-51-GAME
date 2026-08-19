"use strict";

/* =========================================================
   👽 AREA 51 WAR ZONE — GAME.JS V2
   ========================================================= */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hpEl = document.getElementById("hp");
const coinsEl = document.getElementById("coins");
const levelEl = document.getElementById("level");
const waveEl = document.getElementById("wave");
const enemiesEl = document.getElementById("enemies");
const hpFill = document.getElementById("hpFill");
const message = document.getElementById("message");
const gameover = document.getElementById("gameover");
const finalText = document.getElementById("finalText");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const joyEl = document.getElementById("joystick");
const stick = document.getElementById("stick");
const fireBtn = document.getElementById("fire");

let W = window.innerWidth;
let H = window.innerHeight;
let dpr = 1;

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = W * dpr;
    canvas.height = H * dpr;

    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);
resize();

/* =========================================================
   INPUT
   ========================================================= */

const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false
};

const joystick = {
    active: false,
    id: null,
    x: 0,
    y: 0
};

/* =========================================================
   GAME STATE
   ========================================================= */

let running = false;
let last = 0;

let spawnTimer = 0;
let shotTimer = 0;
let reloadTimer = 0;

let wave = 1;
let kills = 0;
let coins = 100;
let level = 1;
let xp = 0;

let ammo = 30;
let maxAmmo = 30;

let grenades = 3;
let medkits = 2;

let bossAlive = false;
let waveMessageTimer = 0;

let enemies = [];
let bullets = [];
let enemyBullets = [];
let particles = [];
let pickups = [];
let explosions = [];

/* =========================================================
   PLAYER
   ========================================================= */

const player = {
    x: 0,
    y: 0,

    r: 19,

    hp: 180,
    maxHp: 180,

    speed: 235,

    angle: -Math.PI / 2,

    damage: 2,

    fireRate: 0.13,

    invulnerable: 0,

    recoil: 0
};

/* =========================================================
   SAVE
   ========================================================= */

function saveProgress() {
    try {
        localStorage.setItem(
            "area51-war-progress",
            JSON.stringify({
                coins,
                level,
                xp,
                kills
            })
        );
    } catch (e) {}
}

function loadProgress() {
    try {
        const raw = localStorage.getItem("area51-war-progress");

        if (!raw) return;

        const data = JSON.parse(raw);

        if (Number.isFinite(data.coins)) coins = data.coins;
        if (Number.isFinite(data.level)) level = data.level;
        if (Number.isFinite(data.xp)) xp = data.xp;
        if (Number.isFinite(data.kills)) kills = data.kills;
    } catch (e) {}
}

loadProgress();

/* =========================================================
   RESET
   ========================================================= */

function resetGame() {
    player.x = W / 2;
    player.y = H / 2;

    player.hp = player.maxHp;
    player.angle = -Math.PI / 2;
    player.invulnerable = 1;
    player.recoil = 0;

    wave = 1;

    ammo = maxAmmo;

    grenades = 3;
    medkits = 2;

    enemies = [];
    bullets = [];
    enemyBullets = [];
    particles = [];
    pickups = [];
    explosions = [];

    spawnTimer = 0.3;
    shotTimer = 0;
    reloadTimer = 0;

    bossAlive = false;
    waveMessageTimer = 3;

    running = true;

    if (message) {
        message.classList.remove("hidden");
        message.textContent = "👽 WAVE 1 — AREA 51 IS UNDER ATTACK!";
    }

    if (gameover) {
        gameover.classList.add("hidden");
    }

    last = performance.now();

    updateHud();

    requestAnimationFrame(loop);
}

/* =========================================================
   ENEMY SPAWNING
   ========================================================= */

function randomEdgePosition() {
    const side = Math.floor(Math.random() * 4);
    const pad = 55;

    if (side === 0) {
        return {
            x: -pad,
            y: 80 + Math.random() * Math.max(50, H - 130)
        };
    }

    if (side === 1) {
        return {
            x: W + pad,
            y: 80 + Math.random() * Math.max(50, H - 130)
        };
    }

    if (side === 2) {
        return {
            x: Math.random() * W,
            y: -pad
        };
    }

    return {
        x: Math.random() * W,
        y: H + pad
    };
}

function spawnEnemy(type = "soldier") {
    const pos = randomEdgePosition();

    if (type === "boss") {
        enemies.push({
            x: pos.x,
            y: pos.y,

            r: 30,

            hp: 100 + wave * 30,
            maxHp: 100 + wave * 30,

            speed: 38 + wave * 2,

            damage: 12,

            shoot: 0.8,

            shootRate: 0.9,

            type: "boss",

            hit: 0
        });

        bossAlive = true;
        return;
    }

    const elite = Math.random() < Math.min(0.08 + wave * 0.01, 0.22);

    const hp = elite
        ? 6 + Math.floor(wave * 0.7)
        : 2 + Math.floor(wave * 0.25);

    enemies.push({
        x: pos.x,
        y: pos.y,

        r: elite ? 19 : 16,

        hp,
        maxHp: hp,

        speed: elite
            ? 48 + wave * 3
            : 55 + wave * 4,

        damage: elite ? 10 : 6,

        shoot: 1 + Math.random() * 1.8,

        shootRate: elite ? 1.0 : 1.5 + Math.random(),

        type: elite ? "elite" : "soldier",

        hit: 0
    });
}

/* =========================================================
   PLAYER SHOOTING
   ========================================================= */

function shoot() {
    if (!running) return;

    if (reloadTimer > 0) return;

    if (ammo <= 0) {
        reload();
        return;
    }

    const angle = player.angle;

    const spread =
        (Math.random() - 0.5) * 0.035;

    const a = angle + spread;

    bullets.push({
        x: player.x + Math.cos(a) * 27,
        y: player.y + Math.sin(a) * 27,

        vx: Math.cos(a) * 720,
        vy: Math.sin(a) * 720,

        life: 1.1,

        damage: player.damage
    });

    ammo--;

    shotTimer = player.fireRate;

    player.recoil = 0.08;

    burst(
        player.x + Math.cos(a) * 28,
        player.y + Math.sin(a) * 28,
        2,
        "#fff1a0"
    );

    if (ammo <= 0) {
        reload();
    }
}

function reload() {
    if (reloadTimer > 0) return;

    if (ammo >= maxAmmo) return;

    reloadTimer = 1.15;

    if (message) {
        message.textContent = "🔄 RELOADING...";
        message.classList.remove("hidden");
    }
}

/* =========================================================
   GRENADE
   ========================================================= */

function throwGrenade() {
    if (!running) return;

    if (grenades <= 0) {
        showMessage("💣 NO GRENADES!");
        return;
    }

    grenades--;

    const distance = 180;

    const gx =
        player.x +
        Math.cos(player.angle) * distance;

    const gy =
        player.y +
        Math.sin(player.angle) * distance;

    explosions.push({
        x: gx,
        y: gy,
        timer: 0.35,
        max: 0.35,
        radius: 130
    });

    burst(gx, gy, 25, "#ffb347");

    for (const enemy of enemies) {
        const d = Math.hypot(
            enemy.x - gx,
            enemy.y - gy
        );

        if (d < 130) {
            enemy.hp -= 30;
        }
    }
}

/* =========================================================
   MEDKIT
   ========================================================= */

function useMedkit() {
    if (!running) return;

    if (medkits <= 0) {
        showMessage("❤️ NO MEDKIT!");
        return;
    }

    if (player.hp >= player.maxHp) {
        showMessage("❤️ HP IS FULL!");
        return;
    }

    medkits--;

    player.hp = Math.min(
        player.maxHp,
        player.hp + 65
    );

    burst(player.x, player.y, 15, "#45ff87");

    showMessage("❤️ +65 HP");
}

/* =========================================================
   ENEMY SHOOTING
   ========================================================= */

function enemyShoot(enemy) {
    const a = Math.atan2(
        player.y - enemy.y,
        player.x - enemy.x
    );

    enemyBullets.push({
        x: enemy.x,
        y: enemy.y,

        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,

        life: 2.5,

        damage:
            enemy.type === "boss"
                ? 14
                : enemy.type === "elite"
                    ? 9
                    : 5
    });
}

/* =========================================================
   DAMAGE
   ========================================================= */

function damagePlayer(amount) {
    if (player.invulnerable > 0) return;

    player.hp -= amount;

    player.invulnerable = 0.28;

    burst(player.x, player.y, 6, "#ff554d");

    if (player.hp <= 0) {
        player.hp = 0;
        endGame();
    }
}

/* =========================================================
   UPDATE
   ========================================================= */

function update(dt) {
    if (!running) return;

    player.invulnerable -= dt;
    player.recoil = Math.max(0, player.recoil - dt);

    shotTimer -= dt;

    waveMessageTimer -= dt;

    if (reloadTimer > 0) {
        reloadTimer -= dt;

        if (reloadTimer <= 0) {
            ammo = maxAmmo;
            showMessage("🔫 RELOADED!");
        }
    }

    /* movement */

    let dx =
        (keys.right ? 1 : 0) -
        (keys.left ? 1 : 0);

    let dy =
        (keys.down ? 1 : 0) -
        (keys.up ? 1 : 0);

    if (joystick.active) {
        dx = joystick.x;
        dy = joystick.y;
    }

    const len = Math.hypot(dx, dy);

    if (len > 0.08) {
        if (len > 1) {
            dx /= len;
            dy /= len;
        }

        player.x += dx * player.speed * dt;
        player.y += dy * player.speed * dt;

        player.angle = Math.atan2(dy, dx);
    }

    player.x = Math.max(
        22,
        Math.min(W - 22, player.x)
    );

    player.y = Math.max(
        70,
        Math.min(H - 22, player.y)
    );

    if (keys.fire && shotTimer <= 0) {
        shoot();
    }

    /* enemy spawn */

    const desiredEnemies =
        Math.min(
            4 + wave * 2,
            25
        );

    spawnTimer -= dt;

    if (
        spawnTimer <= 0 &&
        enemies.length < desiredEnemies
    ) {
        spawnEnemy();

        spawnTimer =
            Math.max(
                0.18,
                0.85 - wave * 0.025
            );
    }

    /* boss */

    if (
        wave >= 5 &&
        wave % 5 === 0 &&
        !bossAlive &&
        enemies.length <= 2
    ) {
        spawnEnemy("boss");
    }

    /* bullets */

    updateBullets(dt);

    updateEnemyBullets(dt);

    /* enemies */

    updateEnemies(dt);

    /* collisions */

    checkBulletHits();

    checkEnemyBulletHits();

    /* particles */

    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
    }

    particles = particles.filter(
        p => p.life > 0
    );

    /* explosions */

    for (const e of explosions) {
        e.timer -= dt;
    }

    explosions = explosions.filter(
        e => e.timer > 0
    );

    /* pickups */

    updatePickups(dt);

    /* wave */

    if (
        enemies.length === 0 &&
        spawnTimer <= 0
    ) {
        nextWave();
    }

    updateHud();
}

/* =========================================================
   BULLETS
   ========================================================= */

function updateBullets(dt) {
    for (const b of bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
    }

    bullets = bullets.filter(
        b =>
            b.life > 0 &&
            b.x > -40 &&
            b.x < W + 40 &&
            b.y > -40 &&
            b.y < H + 40
    );
}

function updateEnemyBullets(dt) {
    for (const b of enemyBullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
    }

    enemyBullets = enemyBullets.filter(
        b =>
            b.life > 0 &&
            b.x > -40 &&
            b.x < W + 40 &&
            b.y > -40 &&
            b.y < H + 40
    );
}

/* =========================================================
   ENEMIES
   ========================================================= */

function updateEnemies(dt) {
    for (const e of enemies) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;

        const distance = Math.hypot(dx, dy);

        const angle = Math.atan2(dy, dx);

        if (distance > 90) {
            e.x +=
                Math.cos(angle) *
                e.speed *
                dt;

            e.y +=
                Math.sin(angle) *
                e.speed *
                dt;
        }

        e.shoot -= dt;
        e.hit -= dt;

        if (
            e.shoot <= 0 &&
            distance < 520
        ) {
            enemyShoot(e);

            e.shoot =
                e.shootRate +
                Math.random() * 0.8;
        }

        if (distance < e.r + player.r + 8) {
            damagePlayer(
                e.type === "boss"
                    ? 18 * dt
                    : e.damage * dt
            );
        }
    }
}

/* =========================================================
   COLLISION: PLAYER BULLETS
   ========================================================= */

function checkBulletHits() {
    for (
        let i = bullets.length - 1;
        i >= 0;
        i--
    ) {
        const b = bullets[i];

        let hitSomething = false;

        for (
            let j = enemies.length - 1;
            j >= 0;
            j--
        ) {
            const e = enemies[j];

            const d = Math.hypot(
                e.x - b.x,
                e.y - b.y
            );

            if (d < e.r + 6) {
                e.hp -= b.damage;
                e.hit = 0.08;

                bullets.splice(i, 1);

                burst(
                    b.x,
                    b.y,
                    5,
                    "#ffd166"
                );

                hitSomething = true;

                if (e.hp <= 0) {
                    killEnemy(j);
                }

                break;
            }
        }

        if (hitSomething) continue;
    }
}

/* =========================================================
   COLLISION: ENEMY BULLETS
   ========================================================= */

function checkEnemyBulletHits() {
    for (
        let i = enemyBullets.length - 1;
        i >= 0;
        i--
    ) {
        const b = enemyBullets[i];

        const d = Math.hypot(
            player.x - b.x,
            player.y - b.y
        );

        if (d < player.r + 7) {
            damagePlayer(b.damage);

            enemyBullets.splice(i, 1);
        }
    }
}

/* =========================================================
   KILL
   ========================================================= */

function killEnemy(index) {
    const enemy = enemies[index];

    if (!enemy) return;

    enemies.splice(index, 1);

    kills++;

    let reward = 8;
    let gainedXp = 10;

    if (enemy.type === "elite") {
        reward = 20;
        gainedXp = 25;
    }

    if (enemy.type === "boss") {
        reward = 150;
        gainedXp = 100;
        bossAlive = false;

        showMessage("💀 BOSS DEFEATED! +150 COINS");
    }

    coins += reward;
    xp += gainedXp;

    burst(
        enemy.x,
        enemy.y,
        enemy.type === "boss" ? 35 : 12,
        "#ff9f43"
    );

    /* chance of pickup */

    if (Math.random() < 0.12) {
        pickups.push({
            x: enemy.x,
            y: enemy.y,
            type:
                Math.random() < 0.5
                    ? "medkit"
                    : "ammo",
            life: 15
        });
    }

    checkLevelUp();

    saveProgress();
}

/* =========================================================
   XP / LEVEL
   ========================================================= */

function checkLevelUp() {
    const needed = level * 100;

    if (xp >= needed) {
        xp -= needed;
        level++;

        player.maxHp += 10;
        player.hp = player.maxHp;

        player.damage += 0.4;

        if (level % 3 === 0) {
            maxAmmo += 3;
        }

        showMessage(
            `⭐ LEVEL UP! LEVEL ${level}`
        );

        burst(
            player.x,
            player.y,
            30,
            "#55f5c3"
        );

        saveProgress();
    }
}

/* =========================================================
   WAVES
   ========================================================= */

function nextWave() {
    wave++;

    spawnTimer = 1;

    waveMessageTimer = 3;

    if (wave % 5 === 0) {
        showMessage(
            `☠️ BOSS WAVE ${wave}!`
        );
    } else {
        showMessage(
            `🎯 WAVE ${wave} INCOMING!`
        );
    }

    player.hp = Math.min(
        player.maxHp,
        player.hp + 15
    );
}

/* =========================================================
   PICKUPS
   ========================================================= */

function updatePickups(dt) {
    for (const p of pickups) {
        p.life -= dt;

        const d = Math.hypot(
            player.x - p.x,
            player.y - p.y
        );

        if (d < 30) {
            if (p.type === "medkit") {
                medkits++;
                showMessage("❤️ MEDKIT +1");
            } else {
                ammo = Math.min(
                    maxAmmo,
                    ammo + 12
                );

                showMessage("🔫 AMMO +12");
            }

            p.life = 0;
        }
    }

    pickups = pickups.filter(
        p => p.life > 0
    );
}

/* =========================================================
   PARTICLES
   ========================================================= */

function burst(
    x,
    y,
    amount = 8,
    color = "#ffd166"
) {
    for (let i = 0; i < amount; i++) {
        const a =
            Math.random() *
            Math.PI *
            2;

        const speed =
            35 +
            Math.random() * 130;

        particles.push({
            x,
            y,

            vx:
                Math.cos(a) *
                speed,

            vy:
                Math.sin(a) *
                speed,

            life:
                0.25 +
                Math.random() *
                0.45,

            color
        });
    }
}

/* =========================================================
   MESSAGE
   ========================================================= */

function showMessage(text) {
    if (!message) return;

    message.textContent = text;
    message.classList.remove("hidden");

    clearTimeout(showMessage.timer);

    showMessage.timer =
        setTimeout(() => {
            if (waveMessageTimer <= 0) {
                message.classList.add(
                    "hidden"
                );
            }
        }, 2200);
}

/* =========================================================
   HUD
   ========================================================= */

function updateHud() {
    if (hpEl) {
        hpEl.textContent =
            Math.ceil(
                Math.max(0, player.hp)
            );
    }

    if (coinsEl) {
        coinsEl.textContent = coins;
    }

    if (levelEl) {
        levelEl.textContent = level;
    }

    if (waveEl) {
        waveEl.textContent = wave;
    }

    if (enemiesEl) {
        enemiesEl.textContent =
            enemies.length;
    }

    if (hpFill) {
        hpFill.style.width =
            `${Math.max(
                0,
                player.hp /
                player.maxHp *
                100
            )}%`;
    }
}

/* =========================================================
   DRAW
   ========================================================= */

function draw() {
    ctx.clearRect(0, 0, W, H);

    /* background */

    ctx.fillStyle = "#07100b";
    ctx.fillRect(0, 0, W, H);

    /* grid */

    ctx.strokeStyle =
        "rgba(80,160,120,.10)";

    ctx.lineWidth = 1;

    for (let x = 0; x < W; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }

    for (let y = 50; y < H; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    drawBuildings();

    drawPickups();

    drawParticles();

    drawBullets();

    drawEnemyBullets();

    for (const e of enemies) {
        drawSoldier(e);
    }

    drawPlayer();

    drawExplosions();
}

/* =========================================================
   BUILDINGS
   ========================================================= */

function drawBuildings() {
    const buildings = [
        {
            x: W * 0.14,
            y: H * 0.22,
            w: 110,
            h: 65
        },
        {
            x: W * 0.70,
            y: H * 0.25,
            w: 140,
            h: 70
        },
        {
            x: W * 0.38,
            y: H * 0.70,
            w: 130,
            h: 60
        }
    ];

    for (const b of buildings) {
        ctx.fillStyle = "#101a16";
        ctx.fillRect(
            b.x,
            b.y,
            b.w,
            b.h
        );

        ctx.strokeStyle = "#25483a";
        ctx.strokeRect(
            b.x,
            b.y,
            b.w,
            b.h
        );
    }
}

/* =========================================================
   PLAYER
   ========================================================= */

function drawPlayer() {
    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    ctx.rotate(player.angle);

    if (player.invulnerable > 0) {
        ctx.globalAlpha =
            Math.sin(
                performance.now() * 0.03
            ) > 0
                ? 0.45
                : 1;
    }

    /* body */

    ctx.fillStyle = "#55f5c3";

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        player.r,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /* helmet */

    ctx.fillStyle = "#0b2a20";

    ctx.beginPath();

    ctx.ellipse(
        4,
        -5,
        12,
        8,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /* visor */

    ctx.fillStyle = "#d9fff3";

    ctx.beginPath();

    ctx.ellipse(
        6,
        -6,
        7,
        3,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /* gun */

    ctx.fillStyle = "#b9fff0";

    ctx.fillRect(
        12,
        -3,
        25,
        6
    );

    ctx.restore();
}

/* =========================================================
   SOLDIERS
   ========================================================= */

function drawSoldier(e) {
    ctx.save();

    ctx.translate(
        e.x,
        e.y
    );

    const color =
        e.type === "boss"
            ? "#c93d4b"
            : e.type === "elite"
                ? "#b77d32"
                : "#65705e";

    /* shadow */

    ctx.fillStyle =
        "rgba(0,0,0,.35)";

    ctx.beginPath();

    ctx.ellipse(
        0,
        14,
        e.r + 5,
        5,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /* body */

    ctx.fillStyle =
        e.hit > 0
            ? "#ff766c"
            : color;

    ctx.fillRect(
        -e.r * 0.65,
        -2,
        e.r * 1.3,
        e.r * 1.2
    );

    /* head */

    ctx.fillStyle =
        e.type === "boss"
            ? "#d8b08b"
            : "#bca989";

    ctx.beginPath();

    ctx.arc(
        0,
        -e.r * 0.85,
        e.r * 0.55,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /* helmet */

    ctx.fillStyle = "#283028";

    ctx.fillRect(
        -e.r * 0.6,
        -e.r * 1.2,
        e.r * 1.2,
        6
    );

    /* gun */

    ctx.strokeStyle =
        "#c5d0c7";

    ctx.lineWidth =
        e.type === "boss"
            ? 5
            : 3;

    ctx.beginPath();

    ctx.moveTo(
        e.r * 0.45,
        5
    );

    ctx.lineTo(
        e.r * 1.5,
        9
    );

    ctx.stroke();

    /* boss ring */

    if (e.type === "boss") {
        ctx.strokeStyle =
            "rgba(255,70,70,.7)";

        ctx.lineWidth = 3;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            e.r + 8,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    /* health bar */

    const barW =
        e.type === "boss"
            ? 65
            : 36;

    ctx.fillStyle =
        "rgba(0,0,0,.7)";

    ctx.fillRect(
        -barW / 2,
        -e.r * 1.65,
        barW,
        5
    );

    ctx.fillStyle =
        e.type === "boss"
            ? "#ff3d4d"
            : "#37e879";

    ctx.fillRect(
        -barW / 2,
        -e.r * 1.65,
        barW *
            Math.max(
                0,
                e.hp / e.maxHp
            ),
        5
    );

    ctx.restore();
}

/* =========================================================
   BULLETS DRAW
   ========================================================= */

function drawBullets() {
    for (const b of bullets) {
        ctx.fillStyle = "#fff5a0";

        ctx.shadowBlur = 12;
        ctx.shadowColor = "#fff";

        ctx.beginPath();

        ctx.arc(
            b.x,
            b.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

function drawEnemyBullets() {
    for (const b of enemyBullets) {
        ctx.fillStyle = "#ff554d";

        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff554d";

        ctx.beginPath();

        ctx.arc(
            b.x,
            b.y,
            5,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

/* =========================================================
   PICKUPS DRAW
   ========================================================= */

function drawPickups() {
    for (const p of pickups) {
        ctx.save();

        ctx.translate(
            p.x,
            p.y
        );

        ctx.fillStyle =
            p.type === "medkit"
                ? "#45ff87"
                : "#5bbcff";

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            12,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle = "#07100b";

        ctx.font =
            "bold 14px Arial";

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(
            p.type === "medkit"
                ? "+"
                : "A",
            0,
            1
        );

        ctx.restore();
    }
}

/* =========================================================
   PARTICLES DRAW
   ========================================================= */

function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha =
            Math.max(
                0,
                Math.min(1, p.life * 2)
            );

        ctx.fillStyle =
            p.color || "#ffd166";

        ctx.fillRect(
            p.x - 2,
            p.y - 2,
            4,
            4
        );
    }

    ctx.globalAlpha = 1;
}

/* =========================================================
   EXPLOSIONS
   ========================================================= */

function drawExplosions() {
    for (const e of explosions) {
        const progress =
            1 -
            e.timer / e.max;

        ctx.globalAlpha =
            Math.max(
                0,
                1 - progress
            );

        ctx.strokeStyle = "#ffb347";

        ctx.lineWidth = 5;

        ctx.beginPath();

        ctx.arc(
            e.x,
            e.y,
            e.radius * progress,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    ctx.globalAlpha = 1;
}

/* =========================================================
   GAME OVER
   ========================================================= */

function endGame() {
    running = false;

    saveProgress();

    if (finalText) {
        finalText.textContent =
            `You survived to wave ${wave} ` +
            `and defeated ${kills} soldiers. ` +
            `Coins: ${coins}`;
    }

    if (gameover) {
        gameover.classList.remove(
            "hidden"
        );
    }
}

/* =========================================================
   MAIN LOOP
   ========================================================= */

function loop(time) {
    if (!running) {
        draw();
        return;
    }

    const dt =
        Math.min(
            0.033,
            (time - last) / 1000
        );

    last = time;

    update(dt);
    draw();

    requestAnimationFrame(loop);
}

/* =========================================================
   JOYSTICK
   ========================================================= */

function joystickPosition(ev) {
    if (!joyEl) return;

    const rect =
        joyEl.getBoundingClientRect();

    const cx =
        rect.left +
        rect.width / 2;

    const cy =
        rect.top +
        rect.height / 2;

    let x =
        ev.clientX - cx;

    let y =
        ev.clientY - cy;

    const max = 43;

    const distance =
        Math.hypot(x, y);

    if (distance > max) {
        x =
            (x / distance) *
            max;

        y =
            (y / distance) *
            max;
    }

    joystick.x =
        x / max;

    joystick.y =
        y / max;

    if (stick) {
        stick.style.transform =
            `translate(${x}px, ${y}px)`;
    }
}

function joystickEnd() {
    joystick.active = false;

    joystick.x = 0;
    joystick.y = 0;

    if (stick) {
        stick.style.transform =
            "translate(0,0)";
    }
}

if (joyEl) {
    joyEl.addEventListener(
        "pointerdown",
        ev => {
            joystick.active = true;
            joystick.id =
                ev.pointerId;

            joystickPosition(ev);

            try {
                joyEl.setPointerCapture(
                    ev.pointerId
                );
            } catch (e) {}
        }
    );

    joyEl.addEventListener(
        "pointermove",
        ev => {
            if (joystick.active) {
                joystickPosition(ev);
            }
        }
    );

    joyEl.addEventListener(
        "pointerup",
        joystickEnd
    );

    joyEl.addEventListener(
        "pointercancel",
        joystickEnd
    );
}

/* =========================================================
   FIRE BUTTON
   ========================================================= */

if (fireBtn) {
    fireBtn.addEventListener(
        "pointerdown",
        ev => {
            keys.fire = true;

            shoot();

            try {
                fireBtn.setPointerCapture(
                    ev.pointerId
                );
            } catch (e) {}
        }
    );

    fireBtn.addEventListener(
        "pointerup",
        () => {
            keys.fire = false;
        }
    );

    fireBtn.addEventListener(
        "pointercancel",
        () => {
            keys.fire = false;
        }
    );
}

/* =========================================================
   KEYBOARD
   ========================================================= */

window.addEventListener(
    "keydown",
    ev => {
        if (
            ev.key === "w" ||
            ev.key === "ArrowUp"
        ) {
            keys.up = true;
        }

        if (
            ev.key === "s" ||
            ev.key === "ArrowDown"
        ) {
            keys.down = true;
        }

        if (
            ev.key === "a" ||
            ev.key === "ArrowLeft"
        ) {
            keys.left = true;
        }

        if (
            ev.key === "d" ||
            ev.key === "ArrowRight"
        ) {
            keys.right = true;
        }

        if (ev.code === "Space") {
            keys.fire = true;
            shoot();
        }

        if (
            ev.key === "r" ||
            ev.key === "R"
        ) {
            reload();
        }

        if (
            ev.key === "g" ||
            ev.key === "G"
        ) {
            throwGrenade();
        }

        if (
            ev.key === "h" ||
            ev.key === "H"
        ) {
            useMedkit();
        }
    }
);

window.addEventListener(
    "keyup",
    ev => {
        if (
            ev.key === "w" ||
            ev.key === "ArrowUp"
        ) {
            keys.up = false;
        }

        if (
            ev.key === "s" ||
            ev.key === "ArrowDown"
        ) {
            keys.down = false;
        }

        if (
            ev.key === "a" ||
            ev.key === "ArrowLeft"
        ) {
            keys.left = false;
        }

        if (
            ev.key === "d" ||
            ev.key === "ArrowRight"
        ) {
            keys.right = false;
        }

        if (ev.code === "Space") {
            keys.fire = false;
        }
    }
);

/* =========================================================
   BUTTONS
   ========================================================= */

if (startBtn) {
    startBtn.onclick = resetGame;
}

if (restartBtn) {
    restartBtn.onclick = resetGame;
}

if (fullscreenBtn) {
    fullscreenBtn.onclick =
        async () => {
            try {
                if (
                    !document.fullscreenElement
                ) {
                    await document.documentElement
                        .requestFullscreen();
                } else {
                    await document.exitFullscreen();
                }
            } catch (e) {}
        };
}

/* =========================================================
   OPTIONAL TOUCH BUTTONS
   ========================================================= */

const grenadeBtn =
    document.getElementById(
        "grenade"
    );

const medkitBtn =
    document.getElementById(
        "medkit"
    );

const reloadBtn =
    document.getElementById(
        "reload"
    );

if (grenadeBtn) {
    grenadeBtn.addEventListener(
        "click",
        throwGrenade
    );
}

if (medkitBtn) {
    medkitBtn.addEventListener(
        "click",
        useMedkit
    );
}

if (reloadBtn) {
    reloadBtn.addEventListener(
        "click",
        reload
    );
}

/* =========================================================
   START
   ========================================================= */

updateHud();
draw();
