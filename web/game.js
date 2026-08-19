let coins = 100;
let energy = 100;
let maxEnergy = 100;

const symbols = ["👽", "🛸", "💎", "💰", "⭐", "🚀"];

function updateUI() {

    document.getElementById("coins").textContent = coins;

    document.getElementById("energy").textContent = energy;

    document.getElementById("energyText").textContent =
        `${energy} / ${maxEnergy}`;

    document.getElementById("energyFill").style.width =
        `${energy}%`;
}


function showScreen(id) {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document.getElementById(id).classList.add("active");

    window.scrollTo(0, 0);
}


function mission() {

    if (energy < 20) {
        alert("⚡ Ba ka da Energy!");
        return;
    }

    energy -= 20;

    const reward =
        Math.floor(Math.random() * 61) + 20;

    coins += reward;

    updateUI();

    alert(
        `🎯 MISSION COMPLETE!\n\n` +
        `💰 +${reward} Coins\n` +
        `⚡ -20 Energy`
    );
}


function spinSlot() {

    if (coins < 20) {
        alert("💰 Ba ka da isasshen Coin!");
        return;
    }

    coins -= 20;
    updateUI();

    const boxes = [
        document.getElementById("slot1"),
        document.getElementById("slot2"),
        document.getElementById("slot3")
    ];

    let spins = 0;

    const animation = setInterval(() => {

        boxes.forEach(box => {
            box.textContent =
                symbols[Math.floor(Math.random() * symbols.length)];
        });

        spins++;

        if (spins >= 12) {

            clearInterval(animation);

            const result = boxes.map(
                box => box.textContent
            );

            if (
                result[0] === result[1] &&
                result[1] === result[2]
            ) {

                coins += 100;

                document.getElementById("slotResult")
                    .textContent =
                    "🏆 JACKPOT! +100 COINS 🔥";

            } else {

                document.getElementById("slotResult")
                    .textContent =
                    "❌ Ba ka ci wannan karon.";
            }

            updateUI();
        }

    }, 100);
}


function rollDice() {

    if (coins < 20) {
        alert("💰 Ba ka da isasshen Coin!");
        return;
    }

    coins -= 20;
    updateUI();

    const dice = document.getElementById("dice");

    dice.classList.remove("roll");

    void dice.offsetWidth;

    dice.classList.add("roll");

    const number =
        Math.floor(Math.random() * 6) + 1;

    setTimeout(() => {

        dice.textContent =
            ["⚀","⚁","⚂","⚃","⚄","⚅"][number - 1];

        if (number === 6) {

            coins += 100;

            document.getElementById("diceResult")
                .textContent =
                "🏆 JACKPOT! +100 COINS 🔥";

        } else {

            document.getElementById("diceResult")
                .textContent =
                `🎲 Number: ${number} — ❌ Ba ka ci.`;
        }

        updateUI();

    }, 700);
}


function dailyReward() {

    coins += 100;

    updateUI();

    alert("🎁 DAILY REWARD!\n\n💰 +100 Coins");
}


updateUI();
