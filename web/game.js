"use strict";

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

let W = window.innerWidth;
let H = window.innerHeight;
let dpr = 1;

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);
resize();

/* =========================
   INPUT
========================= */

const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false
};

/* =========================
   GAME STATE
========================= */

let running = false;
let last = 0;

let spawnTimer = 0;
let shotTimer = 0;
let waveTimer = 0;

let flash = 0;
let shake = 0;

let wave = 1;
let kills = 0;
let coins = 100;
let level = 1;
let xp = 0;
let score = 0;

let missionKills = 0;

let enemies = [];
let bullets = [];
let enemyBullets = [];
let particles = [];
let pickups = [];

let weaponIndex = 0;

/* =========================
   WEAPONS
========================= */

const weapons = [
    {
        name: "PISTOL",
        damage: 3,
        fireRate: 0.20,
        speed: 720,
        ammo: Infinity,
        spread: 0,
        color: "#fff59d"
    },
    {
        name: "RIFLE",
        damage: 4,
        fireRate: 0.11,
        speed: 900,
        ammo: 180,
        spread: 0.025,
        color: "#6dffb0"
    },
    {
        name: "SHOTGUN",
        damage: 5,
        fireRate: 0.60,
        speed: 650,
        ammo: 60,
        spread: 0.17,
        color: "#ffb35c"
    }
];

/* =========================
   PLAYER
========================= */

const player = {
    x: W / 2,
    y: H / 2,

    r: 19,

    hp: 100,
    maxHp: 100,

    armor: 75,
    maxArmor: 75,

    speed: 250,

    angle: -Math.PI / 2,

    damageCooldown: 0
};

/* =========================
   JOYSTICK
========================= */

const joy = {
    active: false,
    id: null,
    x: 0,
    y: 0
};

const stick = document.getElementById("stick");
const joyEl = document.getElementById("joystick");

/* =========================
   SAVE SYSTEM
========================= */

function loadSave() {
    try {
        const raw = localStorage.getItem("AREA51_WAR_V3");

        if (!raw) {
            return;
        }

        const save = JSON.parse(raw);

        coins = Number.isFinite(save.coins)
            ? save.coins
            : 100;

        level = Number.isFinite(save.level)
            ? save.level
            : 1;

        xp = Number.isFinite(save.xp)
            ? save.xp
            : 0;

        kills = Number.isFinite(save.kills)
            ? save.kills
            : 0;

        score = Number.isFinite(save.score)
            ? save.score
            : 0;

        player.maxHp = Number.isFinite(save.maxHp)
            ? save.maxHp
            : 100;

        player.maxArmor = Number.isFinite(save.maxArmor)
            ? save.maxArmor
            : 75;
    } catch (err) {
        console.log("Save load failed:", err);
    }
}

function saveGame() {
    try {
        localStorage.setItem(
            "AREA51_WAR_V3",
            JSON.stringify({
                coins,
                level,
                xp,
                kills,
                score,
                maxHp: player.maxHp,
                maxArmor: player.maxArmor
            })
        );
    } catch (err) {
        console.log("Save failed:", err);
    }
}

/* =========================
   MESSAGE
========================= */

let messageTimer = null;

function showMessage(text) {
    if (!message) {
        return;
    }

    message.textContent = text;
    message.classList.remove("hidden");

    if (messageTimer) {
        clearTimeout(messageTimer);
    }

    messageTimer = setTimeout(() => {
        if (message) {
            message.classList.add("hidden");
        }
    }, 1600);
}

/* =========================
   START / RESET
========================= */

function reset() {
    loadSave();

    player.x = W / 2;
    player.y = H / 2;

    player.hp = player.maxHp;
    player.armor = player.maxArmor;

    player.angle = -Math.PI / 2;
    player.damageCooldown = 0;

    enemies = [];
    bullets = [];
    enemyBullets = [];
    particles = [];
    pickups = [];

    wave = 1;

    spawnTimer = 0.5;
    shotTimer = 0;
    waveTimer = 0;

    missionKills = 0;

    running = true;

    if (message) {
        message.classList.add("hidden");
    }

    if (gameover) {
        gameover.classList.add("hidden");
    }

    last = performance.now();

    updateHud();

    requestAnimationFrame(loop);
}

/* =========================
   LEVEL SYSTEM
========================= */

function gainXP(amount) {
    xp += amount;

    let needed = 100 + level * 50;

    while (xp >= needed) {
        xp -= needed;
        level++;

        player.maxHp += 12;
        player.maxArmor += 8;

        player.hp = player.maxHp;
        player.armor = player.maxArmor;

        coins += 50;

        showMessage(
            "⭐ LEVEL UP!\nLEVEL " +
            level +
            "\n+HP +ARMOR +50 COINS"
        );

        needed = 100 + level * 50;
    }

    saveGame();
}

/* =========================
   ENEMY SPAWN
========================= */

function randomSpawnPosition(distance) {
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;

    if (side === 0) {
        x = -distance;
        y = Math.random() * H;
    } else if (side === 1) {
        x = W + distance;
        y = Math.random() * H;
    } else if (side === 2) {
        x = Math.random() * W;
        y = -distance;
    } else {
        x = Math.random() * W;
        y = H + distance;
    }

    return { x, y };
}

function spawnEnemy() {
    const pos = randomSpawnPosition(50);

    /*
     * Early waves are intentionally easy.
     * Strong enemies appear later.
     */

    let type = "soldier";

    const roll = Math.random();

    if (wave >= 4 && roll < 0.15) {
        type = "heavy";
    } else if (wave >= 3 && roll < 0.35) {
        type = "runner";
    }

    if (type === "heavy") {
        const hp = 12 + wave * 2;

        enemies.push({
            type: "heavy",
            x: pos.x,
            y: pos.y,
            r: 24,
            hp,
            maxHp: hp,
            speed: 42 + wave * 1.5,
            damage: 5,
            shoot: 2.5,
            hit: 0,
            color: "#777b75"
        });

        return;
    }

    if (type === "runner") {
        const hp = 3 + Math.floor(wave / 3);

        enemies.push({
            type: "runner",
            x: pos.x,
            y: pos.y,
            r: 14,
            hp,
            maxHp: hp,
            speed: 90 + wave * 2,
            damage: 3,
            shoot: 3.2,
            hit: 0,
            color: "#b9a34c"
        });

        return;
    }

    const hp = 4 + Math.floor(wave / 4);

    enemies.push({
        type: "soldier",
        x: pos.x,
        y: pos.y,
        r: 17,
        hp,
        maxHp: hp,
        speed: 48 + wave * 2,
        damage: 3,
        shoot: 2.5 + Math.random(),
        hit: 0,
        color: "#65705e"
    });
}

/* =========================
   BOSS
========================= */

function spawnBoss() {
    const pos = randomSpawnPosition(90);

    const hp = 100 + wave * 25;

    enemies.push({
        type: "boss",
        boss: true,
        x: pos.x,
        y: pos.y,
        r: 42,
        hp,
        maxHp: hp,
        speed: 30 + wave,
        damage: 8,
        shoot: 1.5,
        hit: 0,
        color: "#a92f45"
    });

    showMessage("☠️ BOSS INCOMING!");
}

/* =========================
   SHOOT
========================= */

function shoot() {
    if (!running) {
        return;
    }

    const weapon = weapons[weaponIndex];

    if (
        weapon.ammo !== Infinity &&
        weapon.ammo <= 0
    ) {
        showMessage("🔴 OUT OF AMMO");
        return;
    }

    const count =
        weaponIndex === 2
            ? 5
            : 1;

    for (let i = 0; i < count; i++) {
        let angle = player.angle;

        if (count === 5) {
            angle +=
                (i - 2) *
                weapon.spread;
        } else if (weapon.spread > 0) {
            angle +=
                (Math.random() - 0.5) *
                weapon.spread;
        }

        bullets.push({
            x:
                player.x +
                Math.cos(angle) *
                25,

            y:
                player.y +
                Math.sin(angle) *
                25,

            vx:
                Math.cos(angle) *
                weapon.speed,

            vy:
                Math.sin(angle) *
                weapon.speed,

            damage: weapon.damage,
            life: 1.3,
            color: weapon.color
        });
    }

    if (weapon.ammo !== Infinity) {
        weapon.ammo -= 1;
    }

    shotTimer = weapon.fireRate;
    flash = 0.04;
}

/* =========================
   ENEMY SHOOT
========================= */

function enemyShoot(enemy) {
    const angle = Math.atan2(
        player.y - enemy.y,
        player.x - enemy.x
    );

    enemyBullets.push({
        x: enemy.x,
        y: enemy.y,

        vx: Math.cos(angle) * 250,
        vy: Math.sin(angle) * 250,

        damage: enemy.boss
            ? 7
            : enemy.damage,

        life: 3,

        boss: !!enemy.boss
    });
}

/* =========================
   PLAYER DAMAGE
========================= */

function damagePlayer(amount) {
    if (!running) {
        return;
    }

    /*
     * Prevent instant repeated damage.
     */

    if (player.damageCooldown > 0) {
        return;
    }

    player.damageCooldown = 0.35;

    /*
     * Armor absorbs most damage.
     */

    if (player.armor > 0) {
        const absorbed = Math.min(
            player.armor,
            amount * 0.8
        );

        player.armor -= absorbed;
        amount -= absorbed;
    }

    player.hp -= amount;

    flash = 0.12;
    shake = 5;

    burst(
        player.x,
        player.y,
        5,
        "#ff554d"
    );

    if (player.hp <= 0) {
        player.hp = 0;
        endGame();
    }
}

/* =========================
   GAME OVER
========================= */

function endGame() {
    running = false;

    saveGame();

    if (finalText) {
        finalText.textContent =
            "Wave " +
            wave +
            " • " +
            kills +
            " soldiers defeated • " +
            score +
            " score • " +
            coins +
            " coins";
    }

    if (gameover) {
        gameover.classList.remove("hidden");
    }

    updateHud();
}

/* =========================
   UPDATE
========================= */

function update(dt) {
    player.damageCooldown -= dt;

    if (player.damageCooldown < 0) {
        player.damageCooldown = 0;
    }

    /*
     * Movement
     */

    let dx =
        (keys.right ? 1 : 0) -
        (keys.left ? 1 : 0);

    let dy =
        (keys.down ? 1 : 0) -
        (keys.up ? 1 : 0);

    if (joy.active) {
        dx = joy.x;
        dy = joy.y;
    }

    const moveLength = Math.hypot(dx, dy);

    if (moveLength > 1) {
        dx /= moveLength;
        dy /= moveLength;
    }

    if (moveLength > 0.08) {
        player.x +=
            dx *
            player.speed *
            dt;

        player.y +=
            dy *
            player.speed *
            dt;

        player.angle =
            Math.atan2(dy, dx);
    }

    player.x = Math.max(
        24,
        Math.min(W - 24, player.x)
    );

    player.y = Math.max(
        70,
        Math.min(H - 24, player.y)
    );

    /*
     * Shooting
     */

    shotTimer -= dt;

    if (
        keys.fire &&
        shotTimer <= 0
    ) {
        shoot();
    }

    /*
     * Spawn enemies.
     */

    spawnTimer -= dt;

    const targetEnemies = Math.min(
        3 + Math.floor(wave * 0.8),
        14
    );

    if (
        spawnTimer <= 0 &&
        enemies.length < targetEnemies
    ) {
        spawnEnemy();

        spawnTimer = Math.max(
            0.45,
            1.2 - wave * 0.025
        );
    }

    /*
     * Boss every 5 waves.
     */

    if (
        wave >= 5 &&
        wave % 5 === 0 &&
        !enemies.some(
            enemy => enemy.boss
        )
    ) {
        spawnBoss();
    }

    /*
     * Player bullets.
     */

    for (const bullet of bullets) {
        bullet.x +=
            bullet.vx * dt;

        bullet.y +=
            bullet.vy * dt;

        bullet.life -= dt;
    }

    bullets = bullets.filter(
        bullet =>
            bullet.life > 0 &&
            bullet.x > -60 &&
            bullet.x < W + 60 &&
            bullet.y > -60 &&
            bullet.y < H + 60
    );

    /*
     * Enemy bullets.
     */

    for (const bullet of enemyBullets) {
        bullet.x +=
            bullet.vx * dt;

        bullet.y +=
            bullet.vy * dt;

        bullet.life -= dt;

        if (
            Math.hypot(
                player.x - bullet.x,
                player.y - bullet.y
            ) <
            player.r + 7
        ) {
            damagePlayer(
                bullet.damage
            );

            bullet.life = 0;
        }
    }

    enemyBullets =
        enemyBullets.filter(
            bullet =>
                bullet.life > 0 &&
                bullet.x > -80 &&
                bullet.x < W + 80 &&
                bullet.y > -80 &&
                bullet.y < H + 80
        );

    /*
     * Enemies.
     */

    for (const enemy of enemies) {
        const angle = Math.atan2(
            player.y - enemy.y,
            player.x - enemy.x
        );

        const distance = Math.hypot(
            player.x - enemy.x,
            player.y - enemy.y
        );

        if (
            distance >
            enemy.r +
            player.r +
            10
        ) {
            enemy.x +=
                Math.cos(angle) *
                enemy.speed *
                dt;

            enemy.y +=
                Math.sin(angle) *
                enemy.speed *
                dt;
        }

        enemy.shoot -= dt;
        enemy.hit -= dt;

        if (
            enemy.shoot <= 0 &&
            distance < 480
        ) {
            enemyShoot(enemy);

            enemy.shoot =
                enemy.boss
                    ? 1.1
                    : 2.3 + Math.random();
        }

        if (
            distance <
            enemy.r +
            player.r
        ) {
            damagePlayer(
                enemy.damage * dt
            );
        }
    }

    /*
     * Bullet collision.
     */

    for (
        let i = enemies.length - 1;
        i >= 0;
        i--
    ) {
        const enemy = enemies[i];

        for (
            let j = bullets.length - 1;
            j >= 0;
            j--
        ) {
            const bullet = bullets[j];

            const distance = Math.hypot(
                enemy.x - bullet.x,
                enemy.y - bullet.y
            );

            if (
                distance <
                enemy.r + 7
            ) {
                enemy.hp -=
                    bullet.damage;

                enemy.hit = 0.08;

                bullets.splice(j, 1);

                burst(
                    enemy.x,
                    enemy.y,
                    enemy.boss ? 8 : 4,
                    enemy.boss
                        ? "#ff4555"
                        : "#ffd66b"
                );

                if (enemy.hp <= 0) {
                    killEnemy(enemy);
                    enemies.splice(i, 1);
                }

                break;
            }
        }
    }

    /*
     * Pickups.
     */

    for (const pickup of pickups) {
        pickup.life -= dt;

        const distance = Math.hypot(
            player.x - pickup.x,
            player.y - pickup.y
        );

        if (
            distance <
            player.r +
            pickup.r
        ) {
            collectPickup(pickup);
            pickup.life = 0;
        }
    }

    pickups =
        pickups.filter(
            pickup =>
                pickup.life > 0
        );

    /*
     * Particles.
     */

    for (const particle of particles) {
        particle.x +=
            particle.vx * dt;

        particle.y +=
            particle.vy * dt;

        particle.life -= dt;
    }

    particles =
        particles.filter(
            particle =>
                particle.life > 0
        );

    /*
     * Wave timer.
     *
     * This avoids the old bug where
     * the game could remain stuck.
     */

    waveTimer -= dt;

    if (
        enemies.length === 0 &&
        waveTimer <= 0
    ) {
        wave++;

        waveTimer = 1.5;

        coins += 25;

        showMessage(
            "🌊 WAVE " +
            wave +
            "\n+25 COINS"
        );

        saveGame();
    }

    updateHud();
}

/* =========================
   KILL ENEMY
========================= */

function killEnemy(enemy) {
    kills++;
    missionKills++;

    let reward = 8;
    let xpReward = 10;

    if (enemy.type === "runner") {
        reward = 10;
        xpReward = 12;
    }

    if (enemy.type === "heavy") {
        reward = 20;
        xpReward = 25;
    }

    if (enemy.boss) {
        reward = 150;
        xpReward = 100;

        showMessage(
            "☠️ BOSS DEFEATED!\n+150 COINS"
        );
    }

    coins += reward;
    score += reward * 10;

    gainXP(xpReward);

    if (Math.random() < 0.35) {
        spawnPickup(
            enemy.x,
            enemy.y
        );
    }

    burst(
        enemy.x,
        enemy.y,
        enemy.boss ? 30 : 12,
        enemy.boss
            ? "#ff355d"
            : "#ffd66b"
    );

    if (missionKills >= 25) {
        missionKills = 0;
        coins += 100;

        showMessage(
            "🏆 MISSION COMPLETE!\n+100 COINS"
        );
    }

    saveGame();
}

/* =========================
   PICKUPS
========================= */

function spawnPickup(x, y) {
    const types = [
        "health",
        "armor",
        "ammo",
        "coins"
    ];

    const type =
        types[
            Math.floor(
                Math.random() *
                types.length
            )
        ];

    pickups.push({
        x,
        y,
        type,
        r: 13,
        life: 15
    });
}

function collectPickup(pickup) {
    if (pickup.type === "health") {
        player.hp = Math.min(
            player.maxHp,
            player.hp + 30
        );

        showMessage(
            "❤️ +30 HEALTH"
        );
    }

    if (pickup.type === "armor") {
        player.armor = Math.min(
            player.maxArmor,
            player.armor + 25
        );

        showMessage(
            "🛡️ +25 ARMOR"
        );
    }

    if (pickup.type === "ammo") {
        weapons[1].ammo += 40;
        weapons[2].ammo += 15;

        showMessage(
            "🔫 AMMO +"
        );
    }

    if (pickup.type === "coins") {
        coins += 30;

        showMessage(
            "🪙 +30 COINS"
        );
    }

    saveGame();
}

/* =========================
   PARTICLES
========================= */

function burst(
    x,
    y,
    count,
    color
) {
    for (let i = 0; i < count; i++) {
        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            35 +
            Math.random() *
            150;

        particles.push({
            x,
            y,

            vx:
                Math.cos(angle) *
                speed,

            vy:
                Math.sin(angle) *
                speed,

            life:
                0.25 +
                Math.random() *
                0.4,

            color:
                color ||
                "#ffd66b"
        });
    }
}

/* =========================
   DRAW
========================= */

function draw() {
    ctx.save();

    if (shake > 0) {
        ctx.translate(
            (Math.random() - 0.5) *
                shake,

            (Math.random() - 0.5) *
                shake
        );

        shake *= 0.88;

        if (shake < 0.2) {
            shake = 0;
        }
    }

    ctx.clearRect(
        0,
        0,
        W,
        H
    );

    /*
     * Background
     */

    ctx.fillStyle = "#07100b";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );

    /*
     * Grid
     */

    ctx.strokeStyle =
        "rgba(80,160,120,.10)";

    ctx.lineWidth = 1;

    for (
        let x = 0;
        x < W;
        x += 50
    ) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }

    for (
        let y = 50;
        y < H;
        y += 50
    ) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    /*
     * Buildings
     */

    ctx.fillStyle = "#101a16";

    ctx.fillRect(
        W * 0.18,
        H * 0.20,
        90,
        55
    );

    ctx.fillRect(
        W * 0.68,
        H * 0.28,
        120,
        60
    );

    ctx.strokeStyle = "#25483a";

    ctx.strokeRect(
        W * 0.18,
        H * 0.20,
        90,
        55
    );

    ctx.strokeRect(
        W * 0.68,
        H * 0.28,
        120,
        60
    );

    /*
     * Pickups
     */

    for (const pickup of pickups) {
        drawPickup(pickup);
    }

    /*
     * Particles
     */

    for (const particle of particles) {
        ctx.globalAlpha =
            Math.max(
                0,
                particle.life * 2
            );

        ctx.fillStyle =
            particle.color;

        ctx.fillRect(
            particle.x - 2,
            particle.y - 2,
            4,
            4
        );
    }

    ctx.globalAlpha = 1;

    /*
     * Player bullets
     */

    for (const bullet of bullets) {
        ctx.fillStyle =
            bullet.color;

        ctx.shadowBlur = 12;
        ctx.shadowColor =
            bullet.color;

        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.shadowBlur = 0;
    }

    /*
     * Enemy bullets
     */

    for (const bullet of enemyBullets) {
        ctx.fillStyle =
            bullet.boss
                ? "#ff3154"
                : "#ffb45e";

        ctx.shadowBlur = 10;
        ctx.shadowColor =
            ctx.fillStyle;

        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            bullet.boss ? 6 : 4,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.shadowBlur = 0;
    }

    /*
     * Enemies
     */

    for (const enemy of enemies) {
        drawEnemy(enemy);
    }

    drawPlayer();

    /*
     * Damage flash
     */

    if (flash > 0) {
        ctx.fillStyle =
            "rgba(255,70,50,.12)";

        ctx.fillRect(
            0,
            0,
            W,
            H
        );

        flash -= 0.016;

        if (flash < 0) {
            flash = 0;
        }
    }

    ctx.restore();
}

/* =========================
   DRAW PICKUP
========================= */

function drawPickup(pickup) {
    ctx.save();

    ctx.translate(
        pickup.x,
        pickup.y
    );

    let color = "#55f5c3";
    let symbol = "$";

    if (pickup.type === "health") {
        color = "#ff4f64";
        symbol = "+";
    } else if (
        pickup.type === "armor"
    ) {
        color = "#5bb8ff";
        symbol = "S";
    } else if (
        pickup.type === "ammo"
    ) {
        color = "#ffd34e";
        symbol = "A";
    }

    ctx.fillStyle = color;

    ctx.shadowBlur = 15;
    ctx.shadowColor = color;

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        pickup.r,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#07100b";

    ctx.font =
        "bold 13px Arial";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
        symbol,
        0,
        0
    );

    ctx.restore();
}

/* =========================
   DRAW ENEMY
========================= */

function drawEnemy(enemy) {
    ctx.save();

    ctx.translate(
        enemy.x,
        enemy.y
    );

    if (enemy.boss) {
        drawBoss(enemy);
        ctx.restore();
        return;
    }

    if (enemy.type === "heavy") {
        ctx.fillStyle =
            enemy.hit > 0
                ? "#ff766c"
                : "#737c76";

        ctx.fillRect(
            -17,
            -2,
            34,
            25
        );

        ctx.fillStyle = "#bca989";

        ctx.beginPath();

        ctx.arc(
            0,
            -17,
            11,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle = "#303630";

        ctx.fillRect(
            -14,
            -27,
            28,
            7
        );
    } else if (
        enemy.type === "runner"
    ) {
        ctx.fillStyle =
            enemy.hit > 0
                ? "#ff766c"
                : "#b9a34c";

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            14,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle = "#222";

        ctx.beginPath();

        ctx.arc(
            0,
            -5,
            8,
            0,
            Math.PI * 2
        );

        ctx.fill();
    } else {
        ctx.fillStyle =
            enemy.hit > 0
                ? "#ff766c"
                : "#65705e";

        ctx.fillRect(
            -11,
            -1,
            22,
            20
        );

        ctx.fillStyle = "#bca989";

        ctx.beginPath();

        ctx.arc(
            0,
            -12,
            9,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle = "#283028";

        ctx.fillRect(
            -10,
            -19,
            20,
            6
        );
    }

    /*
     * Gun
     */

    ctx.strokeStyle = "#c5d0c7";

    ctx.lineWidth =
        enemy.type === "heavy"
            ? 5
            : 3;

    ctx.beginPath();

    ctx.moveTo(
        8,
        5
    );

    ctx.lineTo(
        enemy.type === "heavy"
            ? 30
            : 25,
        9
    );

    ctx.stroke();

    /*
     * HP bar
     */

    if (
        enemy.hp <
        enemy.maxHp
    ) {
        ctx.fillStyle =
            "#270b10";

        ctx.fillRect(
            -18,
            -35,
            36,
            5
        );

        ctx.fillStyle =
            "#46e879";

        ctx.fillRect(
            -18,
            -35,
            36 *
                Math.max(
                    0,
                    enemy.hp /
                        enemy.maxHp
                ),
            5
        );
    }

    ctx.restore();
}

/* =========================
   DRAW BOSS
========================= */

function drawBoss(enemy) {
    ctx.fillStyle =
        enemy.hit > 0
            ? "#ff8b91"
            : "#a92f45";

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        enemy.r,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle =
        "#ff526b";

    ctx.lineWidth = 4;

    ctx.stroke();

    ctx.fillStyle =
        "#ffcf55";

    ctx.beginPath();

    ctx.arc(
        0,
        -5,
        15,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = "#151515";

    ctx.fillRect(
        -18,
        -28,
        36,
        8
    );

    /*
     * Boss HP
     */

    ctx.fillStyle = "#270b10";

    ctx.fillRect(
        -35,
        -55,
        70,
        7
    );

    ctx.fillStyle = "#ff425b";

    ctx.fillRect(
        -35,
        -55,
        70 *
            Math.max(
                0,
                enemy.hp /
                    enemy.maxHp
            ),
        7
    );
}

/* =========================
   DRAW PLAYER
========================= */

function drawPlayer() {
    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    ctx.rotate(
        player.angle
    );

    /*
     * Armor
     */

    if (player.armor > 0) {
        ctx.strokeStyle =
            "rgba(75,180,255,.85)";

        ctx.lineWidth = 4;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            24,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    /*
     * Damage protection blink
     */

    if (
        player.damageCooldown > 0 &&
        Math.floor(
            player.damageCooldown * 20
        ) % 2 === 0
    ) {
        ctx.globalAlpha = 0.45;
    }

    /*
     * Body
     */

    ctx.fillStyle = "#55f5c3";

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        18,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /*
     * Helmet
     */

    ctx.fillStyle = "#0b2a20";

    ctx.beginPath();

    ctx.ellipse(
        3,
        -5,
        11,
        7,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = "#d9fff3";

    ctx.beginPath();

    ctx.ellipse(
        5,
        -6,
        6,
        3,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    /*
     * Weapon
     */

    ctx.globalAlpha = 1;

    ctx.fillStyle =
        weapons[weaponIndex].color;

    ctx.fillRect(
        12,
        -3,
        26,
        6
    );

    ctx.restore();
}

/* =========================
   HUD
========================= */

function updateHud() {
    if (hpEl) {
        hpEl.textContent =
            Math.max(
                0,
                Math.ceil(player.hp)
            );
    }

    if (coinsEl) {
        coinsEl.textContent =
            coins;
    }

    if (levelEl) {
        levelEl.textContent =
            level;
    }

    if (waveEl) {
        waveEl.textContent =
            wave;
    }

    if (enemiesEl) {
        enemiesEl.textContent =
            enemies.length;
    }

    if (hpFill) {
        const hpPercent =
            Math.max(
                0,
                Math.min(
                    100,
                    player.hp /
                        player.maxHp *
                        100
                )
            );

        hpFill.style.width =
            hpPercent + "%";

        hpFill.style.background =
            hpPercent < 30
                ? "#ff554d"
                : hpPercent < 60
                ? "#ffd34e"
                : "#37e879";
    }
}

/* =========================
   WEAPON SWITCH
========================= */

function switchWeapon() {
    weaponIndex =
        (weaponIndex + 1) %
        weapons.length;

    showMessage(
        "🔫 " +
        weapons[weaponIndex].name
    );
}

function heal() {
    if (coins < 25) {
        showMessage(
            "🪙 NEED 25 COINS"
        );
        return;
    }

    if (
        player.hp >=
        player.maxHp
    ) {
        showMessage(
            "❤️ HEALTH FULL"
        );
        return;
    }

    coins -= 25;

    player.hp = Math.min(
        player.maxHp,
        player.hp + 40
    );

    saveGame();

    showMessage(
        "❤️ +40 HEALTH"
    );
}

/* =========================
   GAME LOOP
========================= */

function loop(time) {
    if (!running) {
        draw();
        return;
    }

    const dt = Math.min(
        0.033,
        Math.max(
            0,
            (time - last) / 1000
        )
    );

    last = time;

    update(dt);
    draw();

    if (running) {
        requestAnimationFrame(loop);
    }
}

/* =========================
   BUTTONS
========================= */

const startBtn =
    document.getElementById(
        "startBtn"
    );

if (startBtn) {
    startBtn.addEventListener(
        "click",
        reset
    );
}

const restartBtn =
    document.getElementById(
        "restartBtn"
    );

if (restartBtn) {
    restartBtn.addEventListener(
        "click",
        reset
    );
}

const fullscreenBtn =
    document.getElementById(
        "fullscreenBtn"
    );

if (fullscreenBtn) {
    fullscreenBtn.addEventListener(
        "click",
        async () => {
            try {
                if (
                    !document.fullscreenElement
                ) {
                    await document.documentElement.requestFullscreen();
                } else {
                    await document.exitFullscreen();
                }
            } catch (err) {
                console.log(
                    "Fullscreen unavailable"
                );
            }
        }
    );
}

/* =========================
   JOYSTICK
========================= */

function joyPos(event) {
    if (!joyEl) {
        return;
    }

    const rect =
        joyEl.getBoundingClientRect();

    const centerX =
        rect.left +
        rect.width / 2;

    const centerY =
        rect.top +
        rect.height / 2;

    let x =
        event.clientX -
        centerX;

    let y =
        event.clientY -
        centerY;

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

    joy.x = x / max;
    joy.y = y / max;

    if (stick) {
        stick.style.transform =
            "translate(" +
            x +
            "px," +
            y +
            "px)";
    }
}

function joyEnd() {
    joy.active = false;
    joy.id = null;

    joy.x = 0;
    joy.y = 0;

    if (stick) {
        stick.style.transform =
            "translate(0,0)";
    }
}

if (joyEl) {
    joyEl.addEventListener(
        "pointerdown",
        event => {
            joy.active = true;
            joy.id =
                event.pointerId;

            joyPos(event);

            try {
                joyEl.setPointerCapture(
                    event.pointerId
                );
            } catch (err) {}
        }
    );

    joyEl.addEventListener(
        "pointermove",
        event => {
            if (
                joy.active &&
                event.pointerId === joy.id
            ) {
                joyPos(event);
            }
        }
    );

    joyEl.addEventListener(
        "pointerup",
        joyEnd
    );

    joyEl.addEventListener(
        "pointercancel",
        joyEnd
    );

    joyEl.addEventListener(
        "lostpointercapture",
        joyEnd
    );
}

/* =========================
   FIRE BUTTON
========================= */

const fire =
    document.getElementById(
        "fire"
    );

if (fire) {
    fire.addEventListener(
        "pointerdown",
        event => {
            keys.fire = true;

            shoot();

            try {
                fire.setPointerCapture(
                    event.pointerId
                );
            } catch (err) {}
        }
    );

    fire.addEventListener(
        "pointerup",
        () => {
            keys.fire = false;
        }
    );

    fire.addEventListener(
        "pointercancel",
        () => {
            keys.fire = false;
        }
    );

    fire.addEventListener(
        "lostpointercapture",
        () => {
            keys.fire = false;
        }
    );
}

/* =========================
   KEYBOARD
========================= */

window.addEventListener(
    "keydown",
    event => {
        const key =
            event.key.toLowerCase();

        if (
            key === "w" ||
            event.key === "ArrowUp"
        ) {
            keys.up = true;
        }

        if (
            key === "s" ||
            event.key === "ArrowDown"
        ) {
            keys.down = true;
        }

        if (
            key === "a" ||
            event.key === "ArrowLeft"
        ) {
            keys.left = true;
        }

        if (
            key === "d" ||
            event.key === "ArrowRight"
        ) {
            keys.right = true;
        }

        if (
            event.code === "Space"
        ) {
            keys.fire = true;
        }

        if (event.key === "1") {
            weaponIndex = 0;
            showMessage("🔫 PISTOL");
        }

        if (event.key === "2") {
            weaponIndex = 1;
            showMessage("🔫 RIFLE");
        }

        if (event.key === "3") {
            weaponIndex = 2;
            showMessage("🔫 SHOTGUN");
        }

        if (key === "q") {
            switchWeapon();
        }

        if (key === "h") {
            heal();
        }
    }
);

window.addEventListener(
    "keyup",
    event => {
        const key =
            event.key.toLowerCase();

        if (
            key === "w" ||
            event.key === "ArrowUp"
        ) {
            keys.up = false;
        }

        if (
            key === "s" ||
            event.key === "ArrowDown"
        ) {
            keys.down = false;
        }

        if (
            key === "a" ||
            event.key === "ArrowLeft"
        ) {
            keys.left = false;
        }

        if (
            key === "d" ||
            event.key === "ArrowRight"
        ) {
            keys.right = false;
        }

        if (
            event.code === "Space"
        ) {
            keys.fire = false;
        }
    }
);

/* =========================
   STARTUP
========================= */

loadSave();
updateHud();
draw();
