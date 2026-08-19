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
# 👽 AREA 51 GAME V4
# Telegram Bot + Flask Web Game
# =========================================================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

PORT = int(os.getenv("PORT", "8080"))

GAME_URL = os.getenv(
    "GAME_URL",
    "https://area-51-game.onrender.com"
).strip().rstrip("/")

DB_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "database.json"
)

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
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
    return send_from_directory(
        os.path.join(web_app.root_path, "web"),
        "index.html"
    )


@web_app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(
        os.path.join(web_app.root_path, "web"),
        filename
    )


@web_app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "game": "AREA 51",
        "version": "V4"
    })


# =========================================================
# DATABASE
# =========================================================

def load_db():
    with db_lock:
        try:
            if not os.path.exists(DB_FILE):
                return {}

            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

                if not isinstance(data, dict):
                    return {}

                return data

        except Exception as e:
            logger.error("Database read error: %s", e)
            return {}


def save_db(data):
    with db_lock:
        try:
            temp_file = DB_FILE + ".tmp"

            with open(
                temp_file,
                "w",
                encoding="utf-8"
            ) as f:
                json.dump(
                    data,
                    f,
                    indent=2,
                    ensure_ascii=False
                )

            os.replace(temp_file, DB_FILE)

        except Exception as e:
            logger.error("Database save error: %s", e)


def create_player(user):
    db = load_db()

    uid = str(user.id)

    if uid not in db:
        db[uid] = {
            "id": user.id,
            "name": user.first_name or "Agent",
            "username": user.username or "",
            "coins": 100,
            "energy": 100,
            "max_energy": 100,
            "level": 1,
            "wins": 0,
            "missions": 0,
            "games": 0,
            "daily": "",
            "created": datetime.utcnow().isoformat(),
        }

        save_db(db)

    else:
        changed = False

        if user.first_name:
            db[uid]["name"] = user.first_name
            changed = True

        if user.username:
            db[uid]["username"] = user.username
            changed = True

        if changed:
            save_db(db)

    return db[uid]


def get_player(user_id):
    db = load_db()

    return db.get(str(user_id))


def update_player(user_id, **changes):
    db = load_db()

    uid = str(user_id)

    if uid not in db:
        return None

    db[uid].update(changes)

    save_db(db)

    return db[uid]


# =========================================================
# PLAYER TEXT
# =========================================================

def player_text(player):
    name = player.get("name", "Agent")

    return (
        "👽 *AREA 51 GAME*\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 Player: *{name}*\n"
        f"💰 Coins: *{player.get('coins', 0)}*\n"
        f"⚡ Energy: *{player.get('energy', 0)}/"
        f"{player.get('max_energy', 100)}*\n"
        f"⭐ Level: *{player.get('level', 1)}*\n"
        f"🏆 Wins: *{player.get('wins', 0)}*\n"
        f"🎯 Missions: *{player.get('missions', 0)}*\n"
        "🏰 Clan: *None*\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "\n"
        "🔥 *AREA 51 GAME*\n"
        "Zaɓi abin da kake son yi a ƙasa 👇"
    )


# =========================================================
# MAIN KEYBOARD
# =========================================================

def main_keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "🎮 PLAY FULLSCREEN GAME",
                web_app=WebAppInfo(url=GAME_URL)
            )
        ],
        [
            InlineKeyboardButton(
                "🎯 MISSIONS",
                callback_data="missions"
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
    ])


# =========================================================
# /START
# =========================================================

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    user = update.effective_user

    if not user:
        return

    player = create_player(user)

    await update.message.reply_text(
        player_text(player),
        parse_mode="Markdown",
        reply_markup=main_keyboard()
    )


# =========================================================
# MISSIONS
# =========================================================

async def missions(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    player = create_player(user)

    energy = player["energy"]

    if energy < 20:

        await query.edit_message_text(
            "🎯 *MISSIONS*\n\n"
            "❌ Ba ka da isasshen Energy.\n\n"
            f"⚡ Energy: {energy}/100\n"
            "Kana buƙatar akalla 20 Energy.",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "🔙 BACK",
                        callback_data="back"
                    )
                ]
            ])
        )

        return

    reward = random.randint(20, 60)

    new_energy = energy - 20
    new_coins = player["coins"] + reward
    new_missions = player["missions"] + 1

    # Every 5 missions -> level up
    new_level = 1 + (new_missions // 5)

    player = update_player(
        user.id,
        energy=new_energy,
        coins=new_coins,
        missions=new_missions,
        level=new_level
    )

    await query.edit_message_text(
        "🎯 *MISSION COMPLETE*\n\n"
        "🪖 Agent mission successful!\n"
        f"💰 Reward: *+{reward} Coins*\n"
        f"⚡ Energy: *{new_energy}/100*\n"
        f"🎯 Missions: *{new_missions}*\n"
        f"⭐ Level: *{new_level}*",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🎯 ANOTHER MISSION",
                    callback_data="missions"
                )
            ],
            [
                InlineKeyboardButton(
                    "🔙 BACK",
                    callback_data="back"
                )
            ]
        ])
    )


# =========================================================
# MINI GAMES MENU
# =========================================================

async def games(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    await query.edit_message_text(
        "🎰 *AREA 51 MINI GAME*\n\n"
        "Zaɓi wasan:",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
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
                    "🔙 BACK",
                    callback_data="back"
                )
            ]
        ])
    )


# =========================================================
# SLOT GAME
# =========================================================

async def slot(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    player = create_player(user)

    cost = 20

    if player["coins"] < cost:

        await query.edit_message_text(
            "🎰 *SLOT*\n\n"
            "❌ Ba ka da isasshen Coin.\n"
            f"💰 Balance: {player['coins']}",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "🔙 BACK",
                        callback_data="games"
                    )
                ]
            ])
        )

        return

    symbols = [
        "👽",
        "🛸",
        "💎",
        "💰",
        "⭐",
        "🚀"
    ]

    a = random.choice(symbols)
    b = random.choice(symbols)
    c = random.choice(symbols)

    result = f"{a} | {b} | {c}"

    coins = player["coins"] - cost

    win = False
    reward = 0

    if a == b == c:
        win = True
        reward = 100
    elif a == b or b == c or a == c:
        win = True
        reward = 40

    if win:
        coins += reward

        player = update_player(
            user.id,
            coins=coins,
            wins=player["wins"] + 1,
            games=player["games"] + 1
        )

        message = (
            "🎰 *SLOT*\n\n"
            f"🎰 {result}\n\n"
            "🎉 *YOU WIN!*\n"
            f"💰 Reward: *+{reward}*\n"
            f"💰 Balance: *{coins}*"
        )

    else:

        player = update_player(
            user.id,
            coins=coins,
            games=player["games"] + 1
        )

        message = (
            "🎰 *SLOT*\n\n"
            f"🎰 {result}\n\n"
            "❌ Ba ka ci wannan karon.\n"
            f"💰 Balance: *{coins}*"
        )

    await query.edit_message_text(
        message,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🎰 SPIN AGAIN",
                    callback_data="slot"
                )
            ],
            [
                InlineKeyboardButton(
                    "🔙 MINI GAMES",
                    callback_data="games"
                )
            ]
        ])
    )


# =========================================================
# DICE GAME
# =========================================================

async def dice(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    player = create_player(user)

    cost = 20

    if player["coins"] < cost:

        await query.edit_message_text(
            "🎲 *DICE*\n\n"
            "❌ Ba ka da isasshen Coin.\n"
            f"💰 Balance: {player['coins']}",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "🔙 BACK",
                        callback_data="games"
                    )
                ]
            ])
        )

        return

    number = random.randint(1, 6)

    coins = player["coins"] - cost

    if number in [5, 6]:

        reward = 60
        coins += reward

        player = update_player(
            user.id,
            coins=coins,
            wins=player["wins"] + 1,
            games=player["games"] + 1
        )

        message = (
            "🎲 *DICE*\n\n"
            f"Number: *{number}*\n\n"
            "🎉 *Ka yi nasara!*\n"
            f"💰 Reward: *+{reward}*\n"
            f"💰 Balance: *{coins}*"
        )

    else:

        player = update_player(
            user.id,
            coins=coins,
            games=player["games"] + 1
        )

        message = (
            "🎲 *DICE*\n\n"
            f"Number: *{number}*\n\n"
            "❌ Ka yi rashin sa'a.\n"
            f"💰 Balance: *{coins}*"
        )

    await query.edit_message_text(
        message,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🎲 ROLL AGAIN",
                    callback_data="dice"
                )
            ],
            [
                InlineKeyboardButton(
                    "🔙 MINI GAMES",
                    callback_data="games"
                )
            ]
        ])
    )


# =========================================================
# DAILY REWARD
# =========================================================

async def daily(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    player = create_player(user)

    today = date.today().isoformat()

    if player.get("daily") == today:

        await query.edit_message_text(
            "🎁 *DAILY REWARD*\n\n"
            "❌ Ka riga ka karɓi reward na yau.\n\n"
            "⏰ Ka dawo gobe.",
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "🔙 BACK",
                        callback_data="back"
                    )
                ]
            ])
        )

        return

    reward = 50

    coins = player["coins"] + reward

    player = update_player(
        user.id,
        coins=coins,
        daily=today
    )

    await query.edit_message_text(
        "🎁 *DAILY REWARD*\n\n"
        "🎉 An karɓi reward!\n\n"
        f"💰 *+{reward} Coins*\n"
        f"💰 Balance: *{coins}*",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🔙 BACK",
                    callback_data="back"
                )
            ]
        ])
    )


# =========================================================
# PROFILE
# =========================================================

async def profile(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    player = create_player(query.from_user)

    await query.edit_message_text(
        "👤 *MY PROFILE*\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 Name: *{player['name']}*\n"
        f"💰 Coins: *{player['coins']}*\n"
        f"⚡ Energy: *{player['energy']}/"
        f"{player['max_energy']}*\n"
        f"⭐ Level: *{player['level']}*\n"
        f"🏆 Wins: *{player['wins']}*\n"
        f"🎯 Missions: *{player['missions']}*\n"
        f"🎰 Games: *{player['games']}*\n"
        "━━━━━━━━━━━━━━━━━━",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🔙 BACK",
                    callback_data="back"
                )
            ]
        ])
    )


# =========================================================
# LEADERBOARD
# =========================================================

async def leaderboard(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    db = load_db()

    players = list(db.values())

    players.sort(
        key=lambda x: (
            x.get("coins", 0),
            x.get("wins", 0),
            x.get("level", 1)
        ),
        reverse=True
    )

    top = players[:10]

    text = "🏆 *AREA 51 LEADERBOARD*\n"
    text += "━━━━━━━━━━━━━━━━━━\n\n"

    if not top:
        text += "Babu players tukuna."
    else:

        medals = [
            "🥇",
            "🥈",
            "🥉"
        ]

        for index, player in enumerate(top, start=1):

            medal = (
                medals[index - 1]
                if index <= 3
                else f"{index}."
            )

            text += (
                f"{medal} *{player.get('name', 'Agent')}* "
                f"— 💰 {player.get('coins', 0)} "
                f"⭐ {player.get('level', 1)}\n"
            )

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "🔙 BACK",
                    callback_data="back"
                )
            ]
        ])
    )


# =========================================================
# BACK
# =========================================================

async def back(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    player = create_player(query.from_user)

    await query.edit_message_text(
        player_text(player),
        parse_mode="Markdown",
        reply_markup=main_keyboard()
    )


# =========================================================
# CALLBACK ROUTER
# =========================================================

async def callback_handler(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    data = query.data

    if data == "missions":
        await missions(update, context)

    elif data == "games":
        await games(update, context)

    elif data == "slot":
        await slot(update, context)

    elif data == "dice":
        await dice(update, context)

    elif data == "daily":
        await daily(update, context)

    elif data == "leaderboard":
        await leaderboard(update, context)

    elif data == "profile":
        await profile(update, context)

    elif data == "back":
        await back(update, context)

    else:
        await query.answer("Unknown command")


# =========================================================
# WEB API
# =========================================================

@web_app.route("/api/player/<int:user_id>")
def api_player(user_id):

    player = get_player(user_id)

    if not player:
        return jsonify({
            "error": "player_not_found"
        }), 404

    return jsonify(player)


@web_app.route("/api/leaderboard")
def api_leaderboard():

    db = load_db()

    players = list(db.values())

    players.sort(
        key=lambda x: (
            x.get("coins", 0),
            x.get("wins", 0),
            x.get("level", 1)
        ),
        reverse=True
    )

    return jsonify(players[:50])


@web_app.route("/api/health")
def api_health():

    return jsonify({
        "status": "online",
        "game": "AREA 51",
        "version": "V4"
    })


# =========================================================
# TELEGRAM BOT
# =========================================================

application = None


def create_application():

    global application

    if not BOT_TOKEN:
        logger.warning(
            "BOT_TOKEN ba a samu ba. Telegram bot ba zai fara ba."
        )
        return None

    application = (
        Application.builder()
        .token(BOT_TOKEN)
        .build()
    )

    application.add_handler(
        CommandHandler("start", start)
    )

    application.add_handler(
        CallbackQueryHandler(callback_handler)
    )

    return application


def run_telegram_bot():

    if not BOT_TOKEN:
        logger.error(
            "BOT_TOKEN bai samu ba. "
            "Set BOT_TOKEN kafin fara bot."
        )
        return

    try:

        app = create_application()

        if app is None:
            return

        logger.info("Telegram bot starting...")

        app.run_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=True
        )

    except Exception as e:

        logger.exception(
            "Telegram bot error: %s",
            e
        )


# =========================================================
# START EVERYTHING
# =========================================================

def run_web():

    logger.info(
        "Starting Flask on port %s",
        PORT
    )

    web_app.run(
        host="0.0.0.0",
        port=PORT,
        debug=False,
        use_reloader=False
    )


def main():

    print()
    print("=" * 50)
    print("        👽 AREA 51 GAME V4")
    print("=" * 50)
    print()
    print("🟢 Starting...")
    print()
    print("🌐 GAME URL:")
    print(GAME_URL)
    print()

    if not BOT_TOKEN:
        print("⚠️ BOT_TOKEN bai samu ba.")
        print()
        print('A Termux yi:')
        print('export BOT_TOKEN="YOUR_BOT_TOKEN"')
        print()
        print("Web game zai iya aiki,")
        print("amma Telegram bot ba zai fara ba.")
        print()

    bot_thread = threading.Thread(
        target=run_telegram_bot,
        daemon=True
    )

    bot_thread.start()

    run_web()


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":
    main()
