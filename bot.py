import os
import json
import random
import logging
import threading
from datetime import datetime, date
from flask import Flask, send_from_directory, jsonify, request

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
)

# =========================================================
# AREA 51 GAME V3
# Telegram Bot + Flask + Telegram Mini App
# =========================================================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

PORT = int(os.getenv("PORT", "8080"))

# Render URL za a saka ta environment variable.
# Example:
# https://area51-game.onrender.com
GAME_URL = os.getenv(
    "GAME_URL",
    "https://YOUR-RENDER-URL.onrender.com"
).strip().rstrip("/")

DB_FILE = "database.json"

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger("AREA51")

db_lock = threading.Lock()

# =========================================================
# FLASK WEB APP
# =========================================================

web_app = Flask(
    __name__,
    static_folder="web",
    static_url_path=""
)


@web_app.route("/")
def home():
    return send_from_directory("web", "index.html")


@web_app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("web", filename)


# =========================================================
# DATABASE
# =========================================================

def default_database():
    return {
        "players": {}
    }


def load_db():
    with db_lock:
        if not os.path.exists(DB_FILE):
            return default_database()

        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            if "players" not in data:
                data["players"] = {}

            return data

        except Exception:
            logger.exception("Database read error")
            return default_database()


def save_db(db):
    with db_lock:
        temp_file = DB_FILE + ".tmp"

        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(
                db,
                f,
                ensure_ascii=False,
                indent=2
            )

        os.replace(temp_file, DB_FILE)


def create_player(user):
    return {
        "id": str(user.id),
        "name": user.first_name or "Agent",
        "username": user.username or "",
        "coins": 100,
        "energy": 100,
        "max_energy": 100,
        "level": 1,
        "xp": 0,
        "wins": 0,
        "missions": 0,
        "games": 0,
        "referrals": 0,
        "clan": "None",
        "vip": 0,
        "last_daily": "",
        "created_at": datetime.utcnow().isoformat(),
    }


def get_or_create_player(user):
    db = load_db()
    uid = str(user.id)

    if uid not in db["players"]:
        db["players"][uid] = create_player(user)
        save_db(db)

    return db, db["players"][uid]


def normalize_player(p):
    defaults = {
        "coins": 100,
        "energy": 100,
        "max_energy": 100,
        "level": 1,
        "xp": 0,
        "wins": 0,
        "missions": 0,
        "games": 0,
        "referrals": 0,
        "clan": "None",
        "vip": 0,
        "last_daily": "",
    }

    for key, value in defaults.items():
        if key not in p:
            p[key] = value

    return p


# =========================================================
# GAME HELPERS
# =========================================================

def add_xp(player, amount):
    player["xp"] += amount

    leveled_up = False

    while player["xp"] >= player["level"] * 100:
        player["xp"] -= player["level"] * 100
        player["level"] += 1
        leveled_up = True

    return leveled_up


def recharge_energy(player):
    if player["energy"] < player["max_energy"]:
        player["energy"] = min(
            player["max_energy"],
            player["energy"] + 5
        )


def player_public(player):
    return {
        "id": player.get("id"),
        "name": player.get("name", "Agent"),
        "username": player.get("username", ""),
        "coins": player.get("coins", 0),
        "energy": player.get("energy", 0),
        "max_energy": player.get("max_energy", 100),
        "level": player.get("level", 1),
        "xp": player.get("xp", 0),
        "wins": player.get("wins", 0),
        "missions": player.get("missions", 0),
        "games": player.get("games", 0),
        "referrals": player.get("referrals", 0),
        "clan": player.get("clan", "None"),
    }


# =========================================================
# TELEGRAM /START
# =========================================================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):

    user = update.effective_user

    db, player = get_or_create_player(user)
    normalize_player(player)

    save_db(db)

    keyboard = [
        [
            InlineKeyboardButton(
                "🎮 PLAY FULLSCREEN GAME",
                web_app=WebAppInfo(url=GAME_URL)
            )
        ],
        [
            InlineKeyboardButton(
                "🎯 MISSION",
                callback_data="mission"
            ),
            InlineKeyboardButton(
                "🎰 MINI GAMES",
                callback_data="games"
            )
        ],
        [
            InlineKeyboardButton(
                "🎁 DAILY REWARD",
                callback_data="daily"
            ),
            InlineKeyboardButton(
                "🏆 LEADERBOARD",
                callback_data="leaderboard"
            )
        ],
        [
            InlineKeyboardButton(
                "👤 MY PROFILE",
                callback_data="profile"
            )
        ]
    ]

    text = (
        "👽 *AREA 51 GAME*\n\n"
        f"Welcome, *{player['name']}*! 🚀\n\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 Player: *{player['name']}*\n"
        f"💰 Coins: `{player['coins']}`\n"
        f"⚡ Energy: `{player['energy']}/{player['max_energy']}`\n"
        f"⭐ Level: `{player['level']}`\n"
        f"🏆 Wins: `{player['wins']}`\n"
        f"🎯 Missions: `{player['missions']}`\n"
        f"🏰 Clan: `{player['clan']}`\n"
        "━━━━━━━━━━━━━━━━━━\n\n"
        "🔥 *AREA 51 GAME*\n"
        "Zaɓi abin da kake son yi a ƙasa 👇"
    )

    if update.message:
        await update.message.reply_text(
            text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )


# =========================================================
# PROFILE
# =========================================================

async def profile(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db, player = get_or_create_player(query.from_user)

    text = (
        "👤 *YOUR AREA 51 PROFILE*\n\n"
        f"👽 Agent: *{player['name']}*\n"
        f"💰 Coins: `{player['coins']}`\n"
        f"⚡ Energy: `{player['energy']}/{player['max_energy']}`\n"
        f"⭐ Level: `{player['level']}`\n"
        f"✨ XP: `{player['xp']}`\n"
        f"🏆 Wins: `{player['wins']}`\n"
        f"🎯 Missions: `{player['missions']}`\n"
        f"🎮 Games: `{player['games']}`\n"
        f"🏰 Clan: `{player['clan']}`"
    )

    keyboard = [
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="back"
            )
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# MISSION
# =========================================================

async def mission(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db, player = get_or_create_player(query.from_user)

    normalize_player(player)

    if player["energy"] < 20:

        await query.answer(
            "❌ Ba ka da Energy. Jira kaɗan.",
            show_alert=True
        )
        return

    player["energy"] -= 20

    reward = random.randint(20, 60)

    player["coins"] += reward
    player["missions"] += 1

    xp = random.randint(10, 30)
    level_up = add_xp(player, xp)

    save_db(db)

    text = (
        "🎯 *MISSION COMPLETE*\n\n"
        "🪖 Agent mission successful!\n\n"
        f"💰 Reward: `+{reward} Coins`\n"
        f"✨ XP: `+{xp}`\n"
        f"⚡ Energy: `{player['energy']}/{player['max_energy']}`\n"
        f"🎯 Missions: `{player['missions']}`"
    )

    if level_up:
        text += (
            f"\n\n🎉 *LEVEL UP!*\n"
            f"⭐ Sabon Level: `{player['level']}`"
        )

    keyboard = [
        [
            InlineKeyboardButton(
                "🎯 MISSION AGAIN",
                callback_data="mission"
            )
        ],
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="back"
            )
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# MINI GAMES MENU
# =========================================================

async def games(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    text = (
        "🎰 *AREA 51 MINI GAMES*\n\n"
        "Zaɓi wasan:"
    )

    keyboard = [
        [
            InlineKeyboardButton(
                "🎰 SLOT GAME",
                callback_data="slot"
            )
        ],
        [
            InlineKeyboardButton(
                "🎲 LUCKY DICE",
                callback_data="dice"
            )
        ],
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="back"
            )
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# SLOT
# =========================================================

async def slot(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db, player = get_or_create_player(query.from_user)

    COST = 20

    if player["coins"] < COST:
        await query.answer(
            "❌ Ba ka da Coins 20.",
            show_alert=True
        )
        return

    player["coins"] -= COST
    player["games"] += 1

    symbols = ["💰", "🚀", "👽", "⭐", "💎"]

    a = random.choice(symbols)
    b = random.choice(symbols)
    c = random.choice(symbols)

    reward = 0
    won = False

    if a == b == c:
        reward = 150
        won = True

    elif a == b or b == c or a == c:
        reward = 40
        won = True

    if won:
        player["coins"] += reward
        player["wins"] += 1
        add_xp(player, 20)

    save_db(db)

    if won:
        result = (
            "🎉 *YOU WIN!*\n\n"
            f"🎰 `{a} | {b} | {c}`\n\n"
            f"💰 Reward: `+{reward}`\n"
            f"💰 Balance: `{player['coins']}`"
        )
    else:
        result = (
            "🎰 *SLOT*\n\n"
            f"`{a} | {b} | {c}`\n\n"
            "❌ Ba ka ci wannan karon.\n"
            f"💰 Balance: `{player['coins']}`"
        )

    keyboard = [
        [
            InlineKeyboardButton(
                "🎰 SPIN AGAIN - 20",
                callback_data="slot"
            )
        ],
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="games"
            )
        ]
    ]

    await query.edit_message_text(
        result,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# DICE
# =========================================================

async def dice(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db, player = get_or_create_player(query.from_user)

    COST = 20

    if player["coins"] < COST:
        await query.answer(
            "❌ Ba ka da Coins 20.",
            show_alert=True
        )
        return

    player["coins"] -= COST
    player["games"] += 1

    number = random.randint(1, 6)

    if number == 6:

        reward = 100
        player["coins"] += reward
        player["wins"] += 1
        add_xp(player, 20)

        result = (
            "🎲 *DICE JACKPOT!*\n\n"
            f"Number: `{number}`\n"
            "🎉 Ka ci!\n\n"
            f"💰 Reward: `+{reward}`\n"
            f"💰 Balance: `{player['coins']}`"
        )

    elif number >= 4:

        reward = 40
        player["coins"] += reward
        player["wins"] += 1
        add_xp(player, 10)

        result = (
            "🎲 *DICE WIN!*\n\n"
            f"Number: `{number}`\n"
            f"💰 Reward: `+{reward}`\n"
            f"💰 Balance: `{player['coins']}`"
        )

    else:

        result = (
            "🎲 *DICE*\n\n"
            f"Number: `{number}`\n"
            "❌ Ka yi rashin sa'a.\n"
            f"💰 Balance: `{player['coins']}`"
        )

    save_db(db)

    keyboard = [
        [
            InlineKeyboardButton(
                "🎲 ROLL AGAIN - 20",
                callback_data="dice"
            )
        ],
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="games"
            )
        ]
    ]

    await query.edit_message_text(
        result,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# DAILY REWARD
# =========================================================

async def daily(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db, player = get_or_create_player(query.from_user)

    today = date.today().isoformat()

    if player.get("last_daily") == today:

        text = (
            "🎁 *DAILY REWARD*\n\n"
            "❌ Ka riga ka karɓi reward ɗinka yau.\n\n"
            "⏰ Ka dawo gobe."
        )

    else:

        reward = random.randint(50, 150)

        player["coins"] += reward
        player["last_daily"] = today

        add_xp(player, 10)

        save_db(db)

        text = (
            "🎁 *DAILY REWARD CLAIMED!*\n\n"
            f"💰 `+{reward} Coins`\n"
            f"💰 Balance: `{player['coins']}`\n"
            "✨ XP: `+10`"
        )

    keyboard = [
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="back"
            )
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# LEADERBOARD
# =========================================================

async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    db = load_db()

    players = []

    for player in db["players"].values():
        normalize_player(player)
        players.append(player)

    players.sort(
        key=lambda x: x.get("coins", 0),
        reverse=True
    )

    top = players[:10]

    text = "🏆 *AREA 51 GLOBAL LEADERBOARD*\n\n"

    if not top:
        text += "Babu players tukuna."

    else:

        medals = ["🥇", "🥈", "🥉"]

        for index, player in enumerate(top, start=1):

            medal = (
                medals[index - 1]
                if index <= 3
                else f"`#{index}`"
            )

            text += (
                f"{medal} "
                f"*{player.get('name', 'Agent')}* — "
                f"💰 `{player.get('coins', 0)}`\n"
            )

    keyboard = [
        [
            InlineKeyboardButton(
                "🔄 REFRESH",
                callback_data="leaderboard"
            )
        ],
        [
            InlineKeyboardButton(
                "⬅️ BACK",
                callback_data="back"
            )
        ]
    ]

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# BACK
# =========================================================

async def back(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    user = query.from_user

    db, player = get_or_create_player(user)

    keyboard = [
        [
            InlineKeyboardButton(
                "🎮 PLAY FULLSCREEN GAME",
                web_app=WebAppInfo(url=GAME_URL)
            )
        ],
        [
            InlineKeyboardButton(
                "🎯 MISSION",
                callback_data="mission"
            ),
            InlineKeyboardButton(
                "🎰 MINI GAMES",
                callback_data="games"
            )
        ],
        [
            InlineKeyboardButton(
                "🎁 DAILY REWARD",
                callback_data="daily"
            ),
            InlineKeyboardButton(
                "🏆 LEADERBOARD",
                callback_data="leaderboard"
            )
        ],
        [
            InlineKeyboardButton(
                "👤 MY PROFILE",
                callback_data="profile"
            )
        ]
    ]

    text = (
        "👽 *AREA 51 GAME*\n\n"
        f"Welcome, *{player['name']}*! 🚀\n\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"💰 Coins: `{player['coins']}`\n"
        f"⚡ Energy: `{player['energy']}/{player['max_energy']}`\n"
        f"⭐ Level: `{player['level']}`\n"
        f"🏆 Wins: `{player['wins']}`\n"
        f"🎯 Missions: `{player['missions']}`\n"
        "━━━━━━━━━━━━━━━━━━\n\n"
        "🔥 Zaɓi abin da kake son yi:"
    )

    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


# =========================================================
# CALLBACK ROUTER
# =========================================================

async def button_handler(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    if query.data == "mission":
        await mission(update, context)

    elif query.data == "games":
        await games(update, context)

    elif query.data == "slot":
        await slot(update, context)

    elif query.data == "dice":
        await dice(update, context)

    elif query.data == "daily":
        await daily(update, context)

    elif query.data == "leaderboard":
        await leaderboard(update, context)

    elif query.data == "profile":
        await profile(update, context)

    elif query.data == "back":
        await back(update, context)

    else:
        await query.answer()


# =========================================================
# WEB API
# =========================================================

@web_app.route("/api/health")
def api_health():

    return jsonify({
        "status": "online",
        "game": "AREA 51",
        "version": "3.0"
    })


@web_app.route("/api/player")
def api_player():

    uid = request.args.get("id", "").strip()

    if not uid:
        return jsonify({
            "error": "missing id"
        }), 400

    db = load_db()

    player = db["players"].get(uid)

    if not player:
        return jsonify({
            "error": "player not found"
        }), 404

    normalize_player(player)

    return jsonify(player_public(player))


@web_app.route("/api/mission", methods=["POST"])
def api_mission():

    data = request.get_json(silent=True) or {}

    uid = str(data.get("id", "")).strip()

    if not uid:
        return jsonify({
            "error": "missing id"
        }), 400

    db = load_db()

    player = db["players"].get(uid)

    if not player:
        return jsonify({
            "error": "player not found"
        }), 404

    normalize_player(player)

    if player["energy"] < 20:
        return jsonify({
            "success": False,
            "message": "Ba ka da Energy."
        }), 400

    player["energy"] -= 20

    reward = random.randint(20, 60)

    player["coins"] += reward
    player["missions"] += 1

    xp = random.randint(10, 30)

    level_before = player["level"]

    add_xp(player, xp)

    save_db(db)

    return jsonify({
        "success": True,
        "reward": reward,
        "xp": xp,
        "level_up": player["level"] > level_before,
        "player": player_public(player)
    })


@web_app.route("/api/slot", methods=["POST"])
def api_slot():

    data = request.get_json(silent=True) or {}

    uid = str(data.get("id", "")).strip()

    if not uid:
        return jsonify({
            "error": "missing id"
        }), 400

    db = load_db()

    player = db["players"].get(uid)

    if not player:
        return jsonify({
            "error": "player not found"
        }), 404

    normalize_player(player)

    cost = 20

    if player["coins"] < cost:
        return jsonify({
            "success": False,
            "message": "Ba ka da Coins."
        }), 400

    player["coins"] -= cost
    player["games"] += 1

    symbols = ["💰", "🚀", "👽", "⭐", "💎"]

    result = [
        random.choice(symbols),
        random.choice(symbols),
        random.choice(symbols)
    ]

    reward = 0

    if result[0] == result[1] == result[2]:
        reward = 150

    elif (
        result[0] == result[1]
        or result[1] == result[2]
        or result[0] == result[2]
    ):
        reward = 40

    if reward:
        player["coins"] += reward
        player["wins"] += 1
        add_xp(player, 20)

    save_db(db)

    return jsonify({
        "success": True,
        "result": result,
        "reward": reward,
        "win": reward > 0,
        "player": player_public(player)
    })


@web_app.route("/api/dice", methods=["POST"])
def api_dice():

    data = request.get_json(silent=True) or {}

    uid = str(data.get("id", "")).strip()

    if not uid:
        return jsonify({
            "error": "missing id"
        }), 400

    db = load_db()

    player = db["players"].get(uid)

    if not player:
        return jsonify({
            "error": "player not found"
        }), 404

    normalize_player(player)

    cost = 20

    if player["coins"] < cost:
        return jsonify({
            "success": False,
            "message": "Ba ka da Coins."
        }), 400

    player["coins"] -= cost
    player["games"] += 1

    number = random.randint(1, 6)

    reward = 0

    if number == 6:
        reward = 100

    elif number >= 4:
        reward = 40

    if reward:
        player["coins"] += reward
        player["wins"] += 1
        add_xp(player, 20 if number == 6 else 10)

    save_db(db)

    return jsonify({
        "success": True,
        "number": number,
        "reward": reward,
        "win": reward > 0,
        "player": player_public(player)
    })


@web_app.route("/api/leaderboard")
def api_leaderboard():

    db = load_db()

    players = []

    for player in db["players"].values():

        normalize_player(player)

        players.append({
            "name": player.get("name", "Agent"),
            "coins": player.get("coins", 0),
            "level": player.get("level", 1),
            "wins": player.get("wins", 0),
            "missions": player.get("missions", 0)
        })

    players.sort(
        key=lambda x: x["coins"],
        reverse=True
    )

    return jsonify(players[:50])


# =========================================================
# ENERGY RECHARGE
# =========================================================

def recharge_all_players():

    while True:

        import time

        time.sleep(600)

        try:

            db = load_db()

            changed = False

            for player in db["players"].values():

                normalize_player(player)

                if player["energy"] < player["max_energy"]:

                    old = player["energy"]

                    player["energy"] = min(
                        player["max_energy"],
                        player["energy"] + 5
                    )

                    if old != player["energy"]:
                        changed = True

            if changed:
                save_db(db)

        except Exception:

            logger.exception(
                "Energy recharge error"
            )


# =========================================================
# FLASK SERVER
# =========================================================

def run_web():

    logger.info(
        "🌐 Web server starting on port %s",
        PORT
    )

    web_app.run(
        host="0.0.0.0",
        port=PORT,
        debug=False,
        use_reloader=False
    )


# =========================================================
# ERROR HANDLER
# =========================================================

async def error_handler(
    update: object,
    context: ContextTypes.DEFAULT_TYPE
):

    logger.exception(
        "Telegram update error",
        exc_info=context.error
    )


# =========================================================
# MAIN
# =========================================================

def main():

    print()
    print("=" * 45)
    print("        👽 AREA 51 GAME V3")
    print("=" * 45)
    print()
    print("🟢 Starting...")
    print()
    print("🌐 GAME URL:")
    print(GAME_URL)
    print()

    if not BOT_TOKEN:

        print("❌ ERROR:")
        print("BOT_TOKEN bai samu ba.")
        print()
        print("A Termux yi:")
        print('export BOT_TOKEN="YOUR_BOT_TOKEN"')
        print()

        return

    # Flask
    web_thread = threading.Thread(
        target=run_web,
        daemon=True
    )

    web_thread.start()

    # Energy system
    energy_thread = threading.Thread(
        target=recharge_all_players,
        daemon=True
    )

    energy_thread.start()

    # Telegram
    application = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .build()
    )

    application.add_handler(
        CommandHandler("start", start)
    )

    application.add_handler(
        CallbackQueryHandler(button_handler)
    )

    application.add_error_handler(
        error_handler
    )

    print("=" * 45)
    print("👽 AREA 51 GAME YANA AIKI!")
    print("=" * 45)
    print()
    print("Telegram: /start")
    print("Web: /")
    print()
    print("Kada ka rufe Termux yayin testing.")
    print()

    application.run_polling(
        drop_pending_updates=True
    )


if __name__ == "__main__":
    main()
