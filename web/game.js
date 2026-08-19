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

let W = innerWidth;
let H = innerHeight;
let dpr = 1;

function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener("resize", resize);
resize();

const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false
};

let running = false;
let last = 0;

let spawnTimer = 0;
let shotTimer = 0;
let bossTimer = 0;
let waveTimer = 0;

let flash = 0;
let shake = 0;

let wave = 1;
let kills = 0;
let coins = 100;
let level = 1;
let xp = 0;
let score = 0;

let enemies = [];
let bullets = [];
let enemyBullets = [];
let particles = [];
let pickups = [];

let missionKills = 0;
let missionCoins = 0;

let weaponIndex = 0;

const weapons = [
    {
        name: "PISTOL",
        damage: 3,
        fireRate: 0.18,
        speed: 700,
        ammo: Infinity,
        spread: 0,
        color: "#fff59d"
    },
    {
        name: "RIFLE",
        damage: 4,
        fireRate: 0.10,
        speed: 850,
        ammo: 200,
        spread: 0.035,
        color: "#6dffb0"
    },
    {
        name: "SHOTGUN",
        damage: 6,
        fireRate: 0.58,
        speed: 620,
        ammo: 60,
        spread: 0.18,
        color: "#ffb35c"
    }
];

let player = {
    x: W / 2,
    y: H / 2,
    r: 18,

    // Increased starting survival
    hp: 150,
    maxHp: 150,

    armor: 100,
    maxArmor: 100,

    speed: 245,
    angle: -Math.PI / 2,

    // Small temporary invulnerability after taking damage
    invulnerable: 0
};

const joy = {
    active: false,
    id: null,
    x: 0,
    y: 0
};

const stick = document.getElementById("stick");
const joyEl = document.getElementById("joystick");

function loadSave() {
    try {
        const save = JSON.parse(
            localStorage.getItem("AREA51_WAR_V3")
        );

        if (!save) return;

        coins = Number(save.coins || 100);
        level = Number(save.level || 1);
        xp = Number(save.xp || 0);
        kills = Number(save.kills || 0);
        score = Number(save.score || 0);

        player.maxHp = Math.max(
            150,
            Number(save.maxHp || 150)
        );

        player.maxArmor = Math.max(
            100,
            Number(save.maxArmor || 100)
        );
    } catch (e) {
        console.log("Save load failed");
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
    } catch (e) {
        console.log("Save failed");
    }
}

function reset() {
    loadSave();

    player.x = W / 2;
    player.y = H / 2;

    player.hp = player.maxHp;
    player.armor = player.maxArmor;

    player.angle = -Math.PI / 2;
    player.invulnerable = 2;

    enemies = [];
    bullets = [];
    enemyBullets = [];
    particles = [];
    pickups = [];

    wave = 1;

    spawnTimer = 2.0;
    shotTimer = 0;
    bossTimer = 0;
    waveTimer = 0;

    missionKills = 0;
    missionCoins = 0;

    running = true;

    message.classList.add("hidden");
    gameover.classList.add("hidden");

    showMessage(
        "🛡️ AREA 51 WAR ZONE\nSURVIVAL MODE"
    );

    last = performance.now();

    updateHud();

    requestAnimationFrame(loop);
}

function gainXP(amount) {
    xp += amount;

    let needed = 100 + level * 50;

    while (xp >= needed) {
        xp -= needed;
        level++;

        player.maxHp += 15;
        player.maxArmor += 10;

        player.hp = player.maxHp;
        player.armor = player.maxArmor;

        coins += 50;

        showMessage(
            `⭐ LEVEL UP!\nLEVEL ${level}\n+15 HP\n+10 ARMOR\n+50 COINS`
        );

        needed = 100 + level * 50;
    }

    saveGame();
}

function showMessage(text) {
    if (!message) return;

    message.textContent = text;
    message.classList.remove("hidden");

    clearTimeout(showMessage.timer);

    showMessage.timer = setTimeout(() => {
        message.classList.add("hidden");
    }, 1800);
}

/*
 * Difficulty scaling.
 * Early waves are intentionally easier.
 */
function difficulty() {
    if (wave <= 2) return 0.55;
    if (wave <= 4) return 0.70;
    if (wave <= 6) return 0.85;
    return Math.min(1.35, 0.85 + (wave - 6) * 0.06);
}

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    const pad = 60;

    let x;
    let y;

    if (side === 0) {
        x = -pad;
        y = Math.random() * H;
    } else if (side === 1) {
        x = W + pad;
        y = Math.random() * H;
    } else if (side === 2) {
        x = Math.random() * W;
        y = -pad;
    } else {
        x = Math.random() * W;
        y = H + pad;
    }

    const roll = Math.random();
    const diff = difficulty();

    let type = "soldier";

    // Heavy enemies are delayed
    if (wave >= 4 && roll < 0.15) {
        type = "heavy";
    } else if (wave >= 3 && roll < 0.35) {
        type = "runner";
    }

    if (type === "heavy") {
        const hp = Math.round(
            (12 + wave * 2) * diff
        );

        enemies.push({
            type,
            x,
            y,
            r: 24,
            hp: Math.max(8, hp),
            maxHp: Math.max(8, hp),
            speed: 35 + Math.min(20, wave * 1.5),
            damage: Math.min(5 + wave * 0.4, 10),
            shoot:
                2.8 +
                Math.random() * 1.5,
            hit: 0,
            color: "#8d7777"
        });

    } else if (type === "runner") {
        const hp = Math.round(
            (3 + Math.floor(wave / 2)) * diff
        );

        enemies.push({
            type,
            x,
            y,
            r: 14,
            hp: Math.max(2, hp),
            maxHp: Math.max(2, hp),
            speed:
                90 +
                Math.min(45, wave * 3),
            damage: Math.min(
                3 + wave * 0.25,
                7
            ),
            shoot:
                4 +
                Math.random() * 2,
            hit: 0,
            color: "#d1b65c"
        });

    } else {
        const hp = Math.round(
            (3 + Math.floor(wave / 2)) * diff
        );

        enemies.push({
            type,
            x,
            y,
            r: 17,
            hp: Math.max(2, hp),
            maxHp: Math.max(2, hp),
            speed:
                48 +
                Math.min(45, wave * 3),
            damage: Math.min(
                3 + wave * 0.25,
                7
            ),
            shoot:
                3 +
                Math.random() * 2,
            hit: 0,
            color: "#65705e"
        });
    }
}

function spawnBoss() {
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;

    if (side === 0) {
        x = -90;
        y = Math.random() * H;
    } else if (side === 1) {
        x = W + 90;
        y = Math.random() * H;
    } else if (side === 2) {
        x = Math.random() * W;
        y = -90;
    } else {
        x = Math.random() * W;
        y = H + 90;
    }

    /*
     * Boss HP is strong but its damage is deliberately controlled.
     */
    const hp =
        140 +
        Math.min(250, wave * 30);

    enemies.push({
        type: "boss",
        boss: true,
        x,
        y,
        r: 42,
        hp,
        maxHp: hp,
        speed: 28 + Math.min(15, wave),
        damage: Math.min(
            8 + wave * 0.35,
            14
        ),
        shoot: 2.2,
        hit: 0,
        color: "#b73e51"
    });

    showMessage("☠️ BOSS INCOMING!");
}

function shoot() {
    if (!running) return;

    const weapon = weapons[weaponIndex];

    if (
        weapon.ammo !== Infinity &&
        weapon.ammo <= 0
    ) {
        showMessage("🔴 OUT OF AMMO");
        return;
    }

    const count =
        weaponIndex === 2 ? 5 : 1;

    for (let i = 0; i < count; i++) {
        let angle = player.angle;

        if (count > 1) {
            angle +=
                (i - 2) *
                weapon.spread;
        } else if (weapon.spread) {
            angle +=
                (Math.random() - 0.5) *
                weapon.spread;
        }

        bullets.push({
            x:
                player.x +
                Math.cos(angle) * 25,

            y:
                player.y +
                Math.sin(angle) * 25,

            vx:
                Math.cos(angle) *
                weapon.speed,

            vy:
                Math.sin(angle) *
                weapon.speed,

            damage: weapon.damage,
            life: 1.2,
            color: weapon.color
        });
    }

    if (weapon.ammo !== Infinity) {
        weapon.ammo--;
    }

    shotTimer = weapon.fireRate;
    flash = 0.04;
}

function enemyShoot(enemy) {
    /*
     * Enemies don't instantly punish the player.
     */
    const angle = Math.atan2(
        player.y - enemy.y,
        player.x - enemy.x
    );

    enemyBullets.push({
        x: enemy.x,
        y: enemy.y,

        vx:
            Math.cos(angle) *
            (enemy.boss ? 260 : 220),

        vy:
            Math.sin(angle) *
            (enemy.boss ? 260 : 220),

        damage: enemy.damage,
        life: enemy.boss ? 2.5 : 2.2,
        boss: enemy.boss
    });
}

function damagePlayer(amount) {
    if (!running) return;

    /*
     * Invulnerability prevents rapid repeated damage.
     */
    if (player.invulnerable > 0) {
        return;
    }

    /*
     * Armor absorbs 85% of incoming damage.
     */
    if (player.armor > 0) {
        const absorbed = Math.min(
            player.armor,
            amount * 0.85
        );

        player.armor -= absorbed;
        amount -= absorbed;
    }

    player.hp -= amount;

    /*
     * Short protection window.
     */
    player.invulnerable = 0.45;

    flash = 0.10;
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

function endGame() {
    running = false;

    saveGame();

    finalText.textContent =
        `Wave ${wave} • ${kills} soldiers defeated • ` +
        `${score} score • ${coins} coins`;

    gameover.classList.remove("hidden");

    updateHud();
}

function update(dt) {
    if (player.invulnerable > 0) {
        player.invulnerable -= dt;
    }

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

    const len = Math.hypot(dx, dy);

    if (len > 1) {
        dx /= len;
        dy /= len;
    }

    if (len > 0.08) {
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
        22,
        Math.min(W - 22, player.x)
    );

    player.y = Math.max(
        65,
        Math.min(H - 22, player.y)
    );

    shotTimer -= dt;

    if (
        keys.fire &&
        shotTimer <= 0
    ) {
        shoot();
    }

    /*
     * Slower enemy spawning at beginning.
     */
    spawnTimer -= dt;

    const target = Math.min(
        3 + Math.floor(wave * 0.9),
        16
    );

    if (
        spawnTimer <= 0 &&
        enemies.length < target
    ) {
        spawnEnemy();

        const spawnDelay =
            wave <= 2
                ? 1.8
                : Math.max(
                      0.45,
                      1.35 -
                          wave * 0.025
                  );

        spawnTimer = spawnDelay;
    }

    /*
     * Boss only from wave 5 onward.
     */
    if (
        wave >= 5 &&
        wave % 5 === 0 &&
        !enemies.some(e => e.boss) &&
        bossTimer <= 0 &&
        enemies.length < 5
    ) {
        spawnBoss();
        bossTimer = 30;
    }

    bossTimer -= dt;

    /*
     * Player bullets.
     */
    for (const b of bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
    }

    bullets = bullets.filter(
        b =>
            b.life > 0 &&
            b.x > -50 &&
            b.x < W + 50 &&
            b.y > -50 &&
            b.y < H + 50
    );

    /*
     * Enemy bullets.
     */
    for (const b of enemyBullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        if (
            Math.hypot(
                player.x - b.x,
                player.y - b.y
            ) <
            player.r + 6
        ) {
            damagePlayer(b.damage);
            b.life = 0;
        }
    }

    enemyBullets =
        enemyBullets.filter(
            b =>
                b.life > 0 &&
                b.x > -80 &&
                b.x < W + 80 &&
                b.y > -80 &&
                b.y < H + 80
        );

    /*
     * Enemies.
     */
    for (const e of enemies) {
        const angle = Math.atan2(
            player.y - e.y,
            player.x - e.x
        );

        const distance = Math.hypot(
            player.x - e.x,
            player.y - e.y
        );

        /*
         * Keep enemies from instantly touching player.
         */
        if (
            distance >
            e.r + player.r + 12
        ) {
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
            distance < 500
        ) {
            enemyShoot(e);

            e.shoot = e.boss
                ? 2.2
                : 3.0 +
                  Math.random() * 2.0;
        }

        /*
         * Contact damage is now much lower.
         */
        if (
            distance <
            e.r + player.r
        ) {
            damagePlayer(
                e.damage * dt
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
        const e = enemies[i];

        for (
            let j = bullets.length - 1;
            j >= 0;
            j--
        ) {
            const b = bullets[j];

            if (
                Math.hypot(
                    e.x - b.x,
                    e.y - b.y
                ) <
                e.r + 6
            ) {
                e.hp -= b.damage;
                e.hit = 0.08;

                bullets.splice(j, 1);

                burst(
                    e.x,
                    e.y,
                    4,
                    e.boss
                        ? "#ff4555"
                        : "#ffd66b"
                );

                if (e.hp <= 0) {
                    killEnemy(e);
                    enemies.splice(i, 1);
                }

                break;
            }
        }
    }

    /*
     * Pickups.
     */
    for (const p of pickups) {
        p.life -= dt;

        if (
            Math.hypot(
                player.x - p.x,
                player.y - p.y
            ) <
            player.r + 16
        ) {
            collectPickup(p);
            p.life = 0;
        }
    }

    pickups = pickups.filter(
        p => p.life > 0
    );

    /*
     * Particles.
     */
    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
    }

    particles = particles.filter(
        p => p.life > 0
    );

    /*
     * Automatic healing every few seconds
     * when the player is badly damaged.
     */
    waveTimer += dt;

    if (
        waveTimer >= 12 &&
        player.hp > 0 &&
        player.hp < player.maxHp * 0.45
    ) {
        player.hp = Math.min(
            player.maxHp,
            player.hp + 5
        );

        waveTimer = 0;
    }

    /*
     * Wave progression.
     *
     * Every 8 kills + cleared battlefield.
     */
    if (
        kills > 0 &&
        kills % 8 === 0 &&
        enemies.length === 0
    ) {
        wave++;

        spawnTimer = 2;

        /*
         * Reward between waves.
         */
        coins += 30;

        /*
         * Restore some HP and armor
         * after clearing a wave.
         */
        player.hp = Math.min(
            player.maxHp,
            player.hp + 25
        );

        player.armor = Math.min(
            player.maxArmor,
            player.armor + 20
        );

        showMessage(
            `🌊 WAVE ${wave}\n+30 COINS\n❤️ +25 HP\n🛡️ +20 ARMOR`
        );

        saveGame();
    }

    updateHud();
}

function killEnemy(e) {
    kills++;
    missionKills++;

    let reward = 8;
    let xpReward = 10;

    if (e.type === "runner") {
        reward = 10;
        xpReward = 12;
    }

    if (e.type === "heavy") {
        reward = 20;
        xpReward = 25;
    }

    if (e.boss) {
        reward = 150;
        xpReward = 100;

        showMessage(
            "☠️ BOSS DEFEATED!\n+150 COINS"
        );
    }

    coins += reward;
    missionCoins += reward;

    score += reward * 10;

    gainXP(xpReward);

    /*
     * Better pickup chance.
     */
    if (Math.random() < 0.38) {
        spawnPickup(
            e.x,
            e.y
        );
    }

    burst(
        e.x,
        e.y,
        e.boss ? 30 : 12,
        e.boss
            ? "#ff355d"
            : "#ffd66b"
    );

    if (
        missionKills >= 25
    ) {
        coins += 100;
        missionKills = 0;

        showMessage(
            "🏆 MISSION COMPLETE!\n+100 COINS"
        );
    }

    saveGame();
}

function spawnPickup(x, y) {
    const types = [
        "health",
        "armor",
        "ammo",
        "coins"
    ];

    pickups.push({
        x,
        y,
        type:
            types[
                Math.floor(
                    Math.random() *
                    types.length
                )
            ],
        r: 12,
        life: 15
    });
}

function collectPickup(p) {
    if (p.type === "health") {
        player.hp = Math.min(
            player.maxHp,
            player.hp + 40
        );

        showMessage(
            "❤️ +40 HEALTH"
        );
    }

    if (p.type === "armor") {
        player.armor = Math.min(
            player.maxArmor,
            player.armor + 35
        );

        showMessage(
            "🛡️ +35 ARMOR"
        );
    }

    if (p.type === "ammo") {
        for (const w of weapons) {
            if (w.ammo !== Infinity) {
                w.ammo += 35;
            }
        }

        showMessage(
            "🔫 AMMO RESTORED"
        );
    }

    if (p.type === "coins") {
        coins += 30;

        showMessage(
            "🪙 +30 COINS"
        );
    }

    saveGame();
}

function burst(
    x,
    y,
    n,
    color
) {
    for (let i = 0; i < n; i++) {
        const a =
            Math.random() *
            Math.PI *
            2;

        const s =
            35 +
            Math.random() *
            150;

        particles.push({
            x,
            y,
            vx:
                Math.cos(a) * s,
            vy:
                Math.sin(a) * s,
            life:
                0.25 +
                Math.random() * 0.45,
            color:
                color ||
                "#ffd66b"
        });
    }
}

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
     * Battlefield.
     */
    ctx.fillStyle =
        "#07100b";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );

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
     * Buildings.
     */
    ctx.fillStyle =
        "#101a16";

    ctx.fillRect(
        W * 0.18,
        H * 0.2,
        90,
        55
    );

    ctx.fillRect(
        W * 0.68,
        H * 0.28,
        120,
        60
    );

    ctx.strokeStyle =
        "#25483a";

    ctx.strokeRect(
        W * 0.18,
        H * 0.2,
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
     * Pickups.
     */
    for (const p of pickups) {
        ctx.save();

        ctx.translate(
            p.x,
            p.y
        );

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            p.r,
            0,
            Math.PI * 2
        );

        if (
            p.type === "health"
        ) {
            ctx.fillStyle =
                "#ff4f64";
        } else if (
            p.type === "armor"
        ) {
            ctx.fillStyle =
                "#5bb8ff";
        } else if (
            p.type === "ammo"
        ) {
            ctx.fillStyle =
                "#ffd34e";
        } else {
            ctx.fillStyle =
                "#55f5c3";
        }

        ctx.shadowBlur = 15;
        ctx.shadowColor =
            ctx.fillStyle;

        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle =
            "#07100b";

        ctx.font =
            "bold 13px Arial";

        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";

        ctx.fillText(
            p.type === "health"
                ? "+"
                : p.type === "armor"
                ? "S"
                : p.type === "ammo"
                ? "A"
                : "$",
            0,
            0
        );

        ctx.restore();
    }

    /*
     * Particles.
     */
    for (const p of particles) {
        ctx.globalAlpha =
            Math.max(
                0,
                p.life * 2
            );

        ctx.fillStyle =
            p.color;

        ctx.fillRect(
            p.x - 2,
            p.y - 2,
            4,
            4
        );
    }

    ctx.globalAlpha = 1;

    /*
     * Player bullets.
     */
    for (const b of bullets) {
        ctx.fillStyle =
            b.color;

        ctx.shadowBlur = 12;
        ctx.shadowColor =
            b.color;

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

    /*
     * Enemy bullets.
     */
    for (const b of enemyBullets) {
        ctx.fillStyle =
            b.boss
                ? "#ff3154"
                : "#ffb45e";

        ctx.shadowBlur = 10;
        ctx.shadowColor =
            ctx.fillStyle;

        ctx.beginPath();

        ctx.arc(
            b.x,
            b.y,
            b.boss ? 6 : 4,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.shadowBlur = 0;
    }

    /*
     * Enemies.
     */
    for (const e of enemies) {
        drawEnemy(e);
    }

    drawPlayer();

    /*
     * Damage flash.
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
    }

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();

    ctx.translate(
        e.x,
        e.y
    );

    /*
     * Boss.
     */
    if (e.boss) {
        ctx.fillStyle =
            e.hit > 0
                ? "#ff8b91"
                : "#a92f45";

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            e.r,
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

        ctx.fillStyle =
            "#151515";

        ctx.fillRect(
            -18,
            -28,
            36,
            8
        );

        /*
         * Boss HP.
         */
        ctx.fillStyle =
            "#270b10";

        ctx.fillRect(
            -35,
            -55,
            70,
            7
        );

        ctx.fillStyle =
            "#ff425b";

        ctx.fillRect(
            -35,
            -55,
            70 *
                Math.max(
                    0,
                    e.hp /
                        e.maxHp
                ),
            7
        );

        ctx.restore();

        return;
    }

    /*
     * Heavy.
     */
    if (
        e.type === "heavy"
    ) {
        ctx.fillStyle =
            e.hit > 0
                ? "#ff766c"
                : "#737c76";

        ctx.fillRect(
            -17,
            -2,
            34,
            25
        );

        ctx.fillStyle =
            "#bca989";

        ctx.beginPath();

        ctx.arc(
            0,
            -17,
            11,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
            "#303630";

        ctx.fillRect(
            -14,
            -27,
            28,
            7
        );

    } else if (
        e.type === "runner"
    ) {
        /*
         * Runner.
         */
        ctx.fillStyle =
            e.hit > 0
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

        ctx.fillStyle =
            "#222";

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
        /*
         * Normal soldier.
         */
        ctx.fillStyle =
            e.hit > 0
                ? "#ff766c"
                : "#65705e";

        ctx.fillRect(
            -11,
            -1,
            22,
            20
        );

        ctx.fillStyle =
            "#bca989";

        ctx.beginPath();

        ctx.arc(
            0,
            -12,
            9,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
            "#283028";

        ctx.fillRect(
            -10,
            -19,
            20,
            6
        );
    }

    /*
     * Enemy weapon.
     */
    ctx.strokeStyle =
        "#c5d0c7";

    ctx.lineWidth =
        e.type === "heavy"
            ? 5
            : 3;

    ctx.beginPath();

    ctx.moveTo(
        8,
        5
    );

    ctx.lineTo(
        e.type === "heavy"
            ? 30
            : 25,
        9
    );

    ctx.stroke();

    /*
     * Enemy HP bar.
     */
    if (
        e.hp < e.maxHp
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
                    e.hp /
                        e.maxHp
                ),
            5
        );
    }

    ctx.restore();
}

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
     * Invulnerability visual.
     */
    if (
        player.invulnerable > 0
    ) {
        ctx.strokeStyle =
            "rgba(255,255,255,.75)";

        ctx.lineWidth = 3;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            27,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    /*
     * Armor ring.
     */
    if (
        player.armor > 0
    ) {
        ctx.strokeStyle =
            "rgba(75,180,255,.85)";

        ctx.lineWidth = 4;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            23,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    /*
     * Player body.
     */
    ctx.fillStyle =
        "#55f5c3";

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        18,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
        "#0b2a20";

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

    ctx.fillStyle =
        "#d9fff3";

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
     * Weapon.
     */
    ctx.fillStyle =
        weapons[
            weaponIndex
        ].color;

    ctx.fillRect(
        12,
        -3,
        25,
        6
    );

    ctx.restore();
}

function updateHud() {
    if (hpEl) {
        hpEl.textContent =
            Math.max(
                0,
                Math.ceil(
                    player.hp
                )
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
        hpFill.style.width =
            Math.max(
                0,
                Math.min(
                    100,
                    (player.hp /
                        player.maxHp) *
                        100
                )
            ) + "%";

        hpFill.style.background =
            player.hp <
            player.maxHp * 0.25
                ? "#ff554d"
                : player.hp <
                  player.maxHp * 0.55
                ? "#ffd34e"
                : "#37e879";
    }
}

function switchWeapon() {
    weaponIndex =
        (weaponIndex + 1) %
        weapons.length;

    const weapon =
        weapons[weaponIndex];

    showMessage(
        `🔫 ${weapon.name}`
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

    player.hp =
        Math.min(
            player.maxHp,
            player.hp + 50
        );

    saveGame();

    showMessage(
        "❤️ +50 HEALTH"
    );
}

function repairArmor() {
    if (coins < 20) {
        showMessage(
            "🪙 NEED 20 COINS"
        );
        return;
    }

    if (
        player.armor >=
        player.maxArmor
    ) {
        showMessage(
            "🛡️ ARMOR FULL"
        );
        return;
    }

    coins -= 20;

    player.armor =
        Math.min(
            player.maxArmor,
            player.armor + 50
        );

    saveGame();

    showMessage(
        "🛡️ +50 ARMOR"
    );
}

function loop(t) {
    if (!running) {
        draw();
        return;
    }

    const dt =
        Math.min(
            0.033,
            (t - last) / 1000
        );

    last = t;

    update(dt);
    draw();

    requestAnimationFrame(
        loop
    );
}

/*
 * Buttons.
 */
const startBtn =
    document.getElementById(
        "startBtn"
    );

if (startBtn) {
    startBtn.onclick = reset;
}

const restartBtn =
    document.getElementById(
        "restartBtn"
   
