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
let flash = 0;

let wave = 1;
let kills = 0;
let coins = 100;
let level = 1;

let player = {
    x: 0,
    y: 0,

    r: 20,

    maxHp: 250,
    hp: 250,

    maxArmor: 100,
    armor: 100,

    speed: 230,

    angle: -Math.PI / 2,

    regenTimer: 0,
    damageCooldown: 0
};

let enemies = [];
let bullets = [];
let particles = [];
let medkits = [];

const joy = {
    active: false,
    id: null,
    x: 0,
    y: 0
};

const stick = document.getElementById("stick");
const joyEl = document.getElementById("joystick");


// =========================================================
// RESET
// =========================================================

function reset() {

    player.x = W / 2;
    player.y = H / 2;

    player.hp = player.maxHp;
    player.armor = player.maxArmor;

    player.angle = -Math.PI / 2;

    player.regenTimer = 0;
    player.damageCooldown = 0;

    enemies = [];
    bullets = [];
    particles = [];
    medkits = [];

    wave = 1;
    kills = 0;
    coins = 100;
    level = 1;

    spawnTimer = 1.5;
    shotTimer = 0;

    running = true;

    message.classList.add("hidden");
    gameover.classList.add("hidden");

    last = performance.now();

    updateHud();

    requestAnimationFrame(loop);
}


// =========================================================
// ENEMY
// =========================================================

function spawnEnemy() {

    const side = Math.floor(Math.random() * 4);

    const pad = 60;

    let x;
    let y;

    if (side === 0) {
        x = -pad;
        y = Math.random() * H;
    }

    if (side === 1) {
        x = W + pad;
        y = Math.random() * H;
    }

    if (side === 2) {
        x = Math.random() * W;
        y = -pad;
    }

    if (side === 3) {
        x = Math.random() * W;
        y = H + pad;
    }

    const eliteChance = Math.min(0.05 + wave * 0.01, 0.25);

    const elite = Math.random() < eliteChance;

    enemies.push({

        x,
        y,

        r: elite ? 19 : 16,

        hp: elite ? 5 + Math.floor(wave / 4) : 2,

        speed: elite
            ? 45 + wave * 2
            : 42 + wave * 3,

        shoot:
            2.0 + Math.random() * 2.0,

        hit: 0,

        elite
    });
}


// =========================================================
// PLAYER SHOOT
// =========================================================

function shoot() {

    if (!running) return;

    const a = player.angle;

    bullets.push({

        x: player.x + Math.cos(a) * 25,

        y: player.y + Math.sin(a) * 25,

        vx: Math.cos(a) * 650,

        vy: Math.sin(a) * 650,

        life: 1.2
    });

    shotTimer = 0.14;

    flash = 0.04;
}


// =========================================================
// DAMAGE SYSTEM
// =========================================================

function damagePlayer(amount) {

    if (!running) return;

    if (player.damageCooldown > 0) {
        return;
    }

    /*
     * Armor absorbs most damage.
     */

    if (player.armor > 0) {

        const armorDamage = Math.min(
            player.armor,
            amount * 0.75
        );

        player.armor -= armorDamage;

        amount -= armorDamage;
    }

    /*
     * Remaining damage goes to HP.
     */

    if (amount > 0) {
        player.hp -= amount;
    }

    player.damageCooldown = 0.25;

    player.regenTimer = 0;

    flash = 0.10;

    burst(
        player.x,
        player.y,
        6
    );
}


// =========================================================
// MEDKIT
// =========================================================

function spawnMedkit(x, y) {

    medkits.push({

        x,
        y,

        r: 13,

        life: 15
    });
}


function collectMedkits() {

    for (let i = medkits.length - 1; i >= 0; i--) {

        const m = medkits[i];

        const d = Math.hypot(
            player.x - m.x,
            player.y - m.y
        );

        if (d < player.r + m.r) {

            player.hp = Math.min(
                player.maxHp,
                player.hp + 55
            );

            player.armor = Math.min(
                player.maxArmor,
                player.armor + 20
            );

            coins += 3;

            medkits.splice(i, 1);

            burst(
                m.x,
                m.y,
                12
            );
        }
    }
}


// =========================================================
// UPDATE
// =========================================================

function update(dt) {

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
            dx * player.speed * dt;

        player.y +=
            dy * player.speed * dt;

        player.angle =
            Math.atan2(dy, dx);
    }


    /*
     * Keep player inside arena.
     */

    player.x = Math.max(
        24,
        Math.min(W - 24, player.x)
    );

    player.y = Math.max(
        70,
        Math.min(H - 24, player.y)
    );


    /*
     * Timers
     */

    shotTimer -= dt;

    player.damageCooldown -= dt;


    /*
     * Automatic shooting
     */

    if (
        keys.fire &&
        shotTimer <= 0
    ) {
        shoot();
    }


    /*
     * Slow HP regeneration.
     *
     * Player must avoid damage for a while.
     */

    player.regenTimer += dt;

    if (
        player.regenTimer > 4 &&
        player.hp > 0 &&
        player.hp < player.maxHp
    ) {

        player.hp = Math.min(
            player.maxHp,
            player.hp + 4 * dt
        );
    }


    /*
     * Spawn enemies slowly at first.
     */

    spawnTimer -= dt;


    const targetEnemies =
        Math.min(
            2 + Math.floor(wave * 0.7),
            14
        );


    if (
        spawnTimer <= 0 &&
        enemies.length < targetEnemies
    ) {

        spawnEnemy();

        spawnTimer =
            Math.max(
                0.65,
                1.7 - wave * 0.035
            );
    }


    /*
     * Bullets
     */

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


    /*
     * Enemy movement and attacks.
     */

    for (const e of enemies) {

        const a = Math.atan2(
            player.y - e.y,
            player.x - e.x
        );

        const d = Math.hypot(
            player.x - e.x,
            player.y - e.y
        );


        /*
         * Do not let enemies instantly
         * reach the player.
         */

        if (d > 52) {

            e.x +=
                Math.cos(a) *
                e.speed *
                dt;

            e.y +=
                Math.sin(a) *
                e.speed *
                dt;
        }


        e.shoot -= dt;
        e.hit -= dt;


        /*
         * Ranged enemy damage.
         *
         * Very low at early waves.
         */

        if (
            e.shoot <= 0 &&
            d < 500
        ) {

            const baseDamage =
                e.elite
                    ? 4 + wave * 0.12
                    : 2.5 + wave * 0.08;

            damagePlayer(baseDamage);

            e.shoot =
                e.elite
                    ? 2.5 + Math.random() * 1.5
                    : 3.0 + Math.random() * 2.0;
        }


        /*
         * Contact damage is also gentle.
         */

        if (d < 34) {

            damagePlayer(
                e.elite
                    ? 5 * dt
                    : 2.5 * dt
            );
        }
    }


    /*
     * Bullet collisions.
     */

    for (
        let i = enemies.length - 1;
        i >= 0;
        i--
    ) {

        let killed = false;

        for (
            let j = bullets.length - 1;
            j >= 0;
            j--
        ) {

            const e = enemies[i];
            const b = bullets[j];

            if (
                Math.hypot(
                    e.x - b.x,
                    e.y - b.y
                ) < e.r + 6
            ) {

                e.hp--;

                e.hit = 0.10;

                bullets.splice(j, 1);

                burst(
                    e.x,
                    e.y,
                    5
                );


                if (e.hp <= 0) {

                    enemies.splice(i, 1);

                    kills++;

                    coins += e.elite ? 18 : 8;

                    level =
                        1 +
                        Math.floor(kills / 10);

                    wave =
                        1 +
                        Math.floor(kills / 8);


                    /*
                     * Chance to drop medkit.
                     */

                    if (
                        Math.random() <
                        0.16
                    ) {

                        spawnMedkit(
                            e.x,
                            e.y
                        );
                    }


                    killed = true;

                    break;
                }
            }
        }

        if (killed) {
            continue;
        }
    }


    /*
     * Medkits expire.
     */

    for (const m of medkits) {
        m.life -= dt;
    }

    medkits = medkits.filter(
        m => m.life > 0
    );


    collectMedkits();


    /*
     * Particles
     */

    particles.forEach(p => {

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.life -= dt;
    });


    particles = particles.filter(
        p => p.life > 0
    );


    /*
     * Game over.
     */

    if (player.hp <= 0) {

        player.hp = 0;

        running = false;

        finalText.textContent =
            `You survived to wave ${wave} ` +
            `and defeated ${kills} soldiers. ` +
            `Coins: ${coins}`;

        gameover.classList.remove(
            "hidden"
        );
    }


    updateHud();
}


// =========================================================
// PARTICLES
// =========================================================

function burst(x, y, n) {

    for (let i = 0; i < n; i++) {

        const a =
            Math.random() *
            Math.PI * 2;

        const s =
            30 +
            Math.random() * 100;

        particles.push({

            x,
            y,

            vx:
                Math.cos(a) * s,

            vy:
                Math.sin(a) * s,

            life:
                0.25 +
                Math.random() * 0.35
        });
    }
}


// =========================================================
// DRAW
// =========================================================

function draw() {

    ctx.clearRect(
        0,
        0,
        W,
        H
    );


    /*
     * Background
     */

    ctx.fillStyle =
        "#07100b";

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

    ctx.fillStyle =
        "#101a16";

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


    ctx.strokeStyle =
        "#25483a";

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
     * Medkits
     */

    for (const m of medkits) {

        ctx.save();

        ctx.translate(
            m.x,
            m.y
        );

        ctx.fillStyle =
            "#ffffff";

        ctx.fillRect(
            -12,
            -12,
            24,
            24
        );

        ctx.fillStyle =
            "#e83c3c";

        ctx.fillRect(
            -4,
            -9,
            8,
            18
        );

        ctx.fillRect(
            -9,
            -4,
            18,
            8
        );

        ctx.restore();
    }


    /*
     * Particles
     */

    for (const p of particles) {

        ctx.globalAlpha =
            Math.max(
                0,
                p.life * 2
            );

        ctx.fillStyle =
            "#ffd66b";

        ctx.fillRect(
            p.x - 2,
            p.y - 2,
            4,
            4
        );
    }

    ctx.globalAlpha = 1;


    /*
     * Bullets
     */

    for (const b of bullets) {

        ctx.fillStyle =
            "#fff5a0";

        ctx.shadowBlur = 10;

        ctx.shadowColor =
            "#fff";

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
     * Soldiers
     */

    for (const e of enemies) {
        drawSoldier(e);
    }


    /*
     * Player
     */

    drawPlayer();


    /*
     * Damage flash
     */

    if (flash > 0) {

        ctx.fillStyle =
            "rgba(255,70,50,.10)";

        ctx.fillRect(
            0,
            0,
            W,
            H
        );

        flash -= 0.016;
    }
}


// =========================================================
// SOLDIER
// =========================================================

function drawSoldier(e) {

    ctx.save();

    ctx.translate(
        e.x,
        e.y
    );


    /*
     * Elite soldier
     */

    ctx.fillStyle =
        e.hit > 0
            ? "#ff766c"
            : e.elite
                ? "#8b5960"
                : "#65705e";


    ctx.fillRect(
        -11,
        -1,
        22,
        20
    );


    /*
     * Head
     */

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


    /*
     * Helmet
     */

    ctx.fillStyle =
        "#283028";

    ctx.fillRect(
        -10,
        -19,
        20,
        6
    );


    /*
     * Weapon
     */

    ctx.strokeStyle =
        "#c5d0c7";

    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.moveTo(
        8,
        5
    );

    ctx.lineTo(
        25,
        9
    );

    ctx.stroke();


    /*
     * Elite marker
     */

    if (e.elite) {

        ctx.fillStyle =
            "#ffcc45";

        ctx.beginPath();

        ctx.arc(
            0,
            -27,
            3,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    ctx.restore();
}


// =========================================================
// PLAYER
// =========================================================

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
     * Shield circle
     */

    if (player.armor > 0) {

        ctx.strokeStyle =
            "rgba(80,190,255,.55)";

        ctx.lineWidth = 3;

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
     * Body
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


    /*
     * Helmet
     */

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


    /*
     * Visor
     */

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
     * Gun
     */

    ctx.fillStyle =
        "#b9fff0";

    ctx.fillRect(
        12,
        -3,
        20,
        6
    );


    ctx.restore();
}


// =========================================================
// GAME LOOP
// =========================================================

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


// =========================================================
// HUD
// =========================================================

function updateHud() {

    hpEl.textContent =
        Math.max(
            0,
            Math.ceil(player.hp)
        );

    coinsEl.textContent =
        coins;

    levelEl.textContent =
        level;

    waveEl.textContent =
        wave;

    enemiesEl.textContent =
        enemies.length;


    const hpPercent =
        Math.max(
            0,
            Math.min(
                100,
                (player.hp /
                    player.maxHp) *
                    100
            )
        );


    hpFill.style.width =
        hpPercent + "%";


    if (player.hp < 60) {

        hpFill.style.background =
            "#ff554d";

    } else if (player.hp < 130) {

        hpFill.style.background =
            "#ffd34e";

    } else {

        hpFill.style.background =
            "#37e879";
    }
}


// =========================================================
// BUTTONS
// =========================================================

document
    .getElementById("startBtn")
    .onclick = reset;


document
    .getElementById("restartBtn")
    .onclick = reset;


document
    .getElementById("fullscreenBtn")
    .onclick = async () => {

        try {

            if (!document.fullscreenElement) {

                await document
                    .documentElement
                    .requestFullscreen();

            } else {

                await document
                    .exitFullscreen();
            }

        } catch (e) {

            console.log(
                "Fullscreen error:",
                e
            );
        }
    };


// =========================================================
// JOYSTICK
// =========================================================

function joyPos(ev) {

    const r =
        joyEl.getBoundingClientRect();

    const cx =
        r.left +
        r.width / 2;

    const cy =
        r.top +
        r.height / 2;


    let x =
        ev.clientX - cx;

    let y =
        ev.clientY - cy;


    const max = 43;

    const d =
        Math.hypot(x, y);


    if (d > max) {

        x =
            (x / d) *
            max;

        y =
            (y / d) *
            max;
    }


    joy.x =
        x / max;

    joy.y =
        y / max;


    stick.style.transform =
        `translate(${x}px, ${y}px)`;
}


joyEl.addEventListener(
    "pointerdown",
    e => {

        joy.active = true;

        joy.id =
            e.pointerId;

        joyPos(e);

        joyEl.setPointerCapture(
            e.pointerId
        );
    }
);


joyEl.addEventListener(
    "pointermove",
    e => {

        if (joy.active) {
            joyPos(e);
        }
    }
);


function joyEnd() {

    joy.active = false;

    joy.x = 0;
    joy.y = 0;

    stick.style.transform =
        "translate(0,0)";
}


joyEl.addEventListener(
    "pointerup",
    joyEnd
);

joyEl.addEventListener(
    "pointercancel",
    joyEnd
);


// =========================================================
// FIRE BUTTON
// =========================================================

const fire =
    document.getElementById("fire");


fire.addEventListener(
    "pointerdown",
    e => {

        keys.fire = true;

        shoot();

        fire.setPointerCapture(
            e.pointerId
        );
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


// =========================================================
// KEYBOARD
// =========================================================

addEventListener(
    "keydown",
    e => {

        if (
            e.key === "w" ||
            e.key === "ArrowUp"
        ) {
            keys.up = true;
        }


        if (
            e.key === "s" ||
            e.key === "ArrowDown"
        ) {
            keys.down = true;
        }


        if (
            e.key === "a" ||
            e.key === "ArrowLeft"
        ) {
            keys.left = true;
        }


        if (
            e.key === "d" ||
            e.key === "ArrowRight"
        ) {
            keys.right = true;
        }


        if (e.code === "Space") {
            keys.fire = true;
        }
    }
);


addEventListener(
    "keyup",
    e => {

        if (
            e.key === "w" ||
            e.key === "ArrowUp"
        ) {
            keys.up = false;
        }


        if (
            e.key === "s" ||
            e.key === "ArrowDown"
        ) {
            keys.down = false;
        }


        if (
            e.key === "a" ||
            e.key === "ArrowLeft"
        ) {
            keys.left = false;
        }


        if (
            e.key === "d" ||
            e.key === "ArrowRight"
        ) {
            keys.right = false;
        }


        if (e.code === "Space") {
            keys.fire = false;
        }
    }
);


// =========================================================
// INITIAL STATE
// =========================================================

updateHud();
draw();
