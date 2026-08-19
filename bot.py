import os
import json
import random
import logging
import threading
from datetime import date

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
# 👽 AREA 51 GAME V5
# Telegram Bot + Flask + WAR ZONE
# =========================================================

# =========================================================
# BOT CONFIG
# =========================================================

BOT_TOKEN = os.getenv(
    "BOT_TOKEN",
    "8785868698:AAG-Ipp7R6x5ghX3O2C-tH-9QpVQKMC2hg8"
).strip()

PORT = int(os.getenv("PORT", "8080"))

GAME_URL = os.getenv(
    "GAME_URL",
    "https://area-51-game.onrender.com"
).strip().rstrip("/")

DB_FILE = "database.json"


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger("AREA51")


# =========================================================
# DEFAULT PLAYER
# =========================================================

DEFAULT_PLAYER = {
    "coins": 100,
    "energy": 100,
    "max_energy": 100,
    "level": 1,
    "wins": 0,
    "missions": 0,
    "clan": None,
    "last_daily": None,
}


# =========================================================
# DATABASE
# =========================================================

db_lock = threading.Lock()


def load_db():

    with db_lock:

        if not os.path.exists(DB_FILE):
            return {}

        try:

            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, dict):
                return data

            return {}

        except Exception:

            logger.exception("Database load error")

            return {}


def save_db(data):

    with db_lock:

        temp_file = DB_FILE + ".tmp"

        with open(
            temp_file,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                data,
                f,
                ensure_ascii=False,
                indent=2
            )

        os.replace(
            temp_file,
            DB_FILE
        )


def get_player(user):

    data = load_db()

    user_id = str(user.id)

    changed = False

    if user_id not in data:

        data[user_id] = {
            "id": user.id,
            "name": user.first_name or "Agent",
            **DEFAULT_PLAYER,
        }

        changed = True

    else:

        if data[user_id].get("name") != (
            user.first_name or "Agent"
        ):

            data[user_id]["name"] = (
                user.first_name or "Agent"
            )

            changed = True

        for key, value in DEFAULT_PLAYER.items():

            if key not in data[user_id]:

                data[user_id][key] = value

                changed = True

    if changed:
        save_db(data)

    return data[user_id]


def update_player(user_id, **changes):

    data = load_db()

    key = str(user_id)

    if key not in data:

        data[key] = {
            "id": user_id,
            "name": "Agent",
            **DEFAULT_PLAYER,
        }

    for key_name, value in changes.items():

        data[key][key_name] = value

    save_db(data)

    return data[key]


# =========================================================
# FLASK WEB SERVER
# =========================================================

web_app = Flask(
    __name__,
    static_folder="web",
    static_url_path=""
)


@web_app.route("/")
def home():

    return send_from_directory(
        "web",
        "index.html"
    )


@web_app.route("/<path:filename>")
def static_files(filename):

    return send_from_directory(
        "web",
        filename
    )


@web_app.route("/api/health")
def health():

    return jsonify({
        "ok": True,
        "game": "AREA 51",
        "version": "V5",
        "status": "online"
    })


@web_app.route("/api/player")
def api_player():

    user_id = request.args.get(
        "user_id",
        ""
    ).strip()

    if not user_id:

        return jsonify({
            "ok": False,
            "error": "user_id required"
        }), 400

    data = load_db()

    player = data.get(user_id)

    if not player:

        player = {
            "id": user_id,
            "name": "Agent",
            **DEFAULT_PLAYER,
        }

    return jsonify({
        "ok": True,
        "player": player
    })


@web_app.route("/api/leaderboard")
def api_leaderboard():

    data = load_db()

    players = list(
        data.values()
    )

    players.sort(
        key=lambda p: (
            int(p.get("wins", 0)),
            int(p.get("coins", 0)),
            int(p.get("level", 1))
        ),
        reverse=True
    )

    result = []

    for rank, player in enumerate(
        players[:50],
        start=1
    ):

        result.append({
            "rank": rank,
            "name": player.get(
                "name",
                "Agent"
            ),
            "coins": player.get(
                "coins",
                0
            ),
            "level": player.get(
                "level",
                1
            ),
            "wins": player.get(
                "wins",
                0
            ),
            "missions": player.get(
                "missions",
                0
            )
        })

    return jsonify({
        "ok": True,
        "leaderboard": result
    })


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


# =========================================================
# MAIN MENU
# =========================================================

def main_keyboard():

    return InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🎮 PLAY FULLSCREEN WAR ZONE",
                web_app=WebAppInfo(
                    url=GAME_URL
                )
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


def back_keyboard():

    return InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🔙 BACK",
                callback_data="back"
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

    player = get_player(user)

    name = user.first_name or "Agent"

    text = (
        "👽 *AREA 51 WAR ZONE*\n\n"

        f"Welcome, *{name}*! 🚀\n\n"

        "🪖 Shiga cikin WAR ZONE.\n"
        "🎯 Yi missions.\n"
        "🪖 Yaki da sojojin enemy.\n"
        "💰 Tara Coins.\n"
        "⭐ Ka hau Level.\n\n"

        "━━━━━━━━━━━━━━━━━━\n"

        f"💰 Coins: *{player['coins']}*\n"
        f"⚡ Energy: *{player['energy']}/"
        f"{player['max_energy']}*\n"
        f"⭐ Level: *{player['level']}*\n"
        f"🏆 Wins: *{player['wins']}*\n"
        f"🎯 Missions: *{player['missions']}*\n"

        "━━━━━━━━━━━━━━━━━━\n\n"

        "🔥 Ka shirya shiga WAR ZONE?"
    )

    await update.message.reply_text(
        text,
        parse_mode="Markdown",
        reply_markup=main_keyboard()
    )


# =========================================================
# MISSIONS
# =========================================================

async def show_missions(query):

    text = (
        "🎯 *AREA 51 MISSIONS*\n\n"

        "🪖 *ENEMY BASE*\n"
        "⚡ Energy: 20\n"
        "💰 Reward: 20–80 Coins\n\n"

        "🪖 *DESERT PATROL*\n"
        "⚡ Energy: 30\n"
        "💰 Reward: 40–120 Coins\n\n"

        "💥 Yi yaki da sojoji a cikin\n"
        "FULLSCREEN WAR ZONE."
    )

    keyboard = InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🎮 ENTER WAR ZONE",
                web_app=WebAppInfo(
                    url=GAME_URL
                )
            )
        ],

        [
            InlineKeyboardButton(
                "🔙 BACK",
                callback_data="back"
            )
        ]

    ])

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


# =========================================================
# MINI GAMES MENU
# =========================================================

async def show_games(query):

    text = (
        "🎰 *AREA 51 MINI GAMES*\n\n"

        "Zaɓi wasan:\n\n"

        "🎰 SLOT — 20 Coins\n"
        "🎲 DICE — 20 Coins\n\n"

        "⚠️ Virtual Coins kawai."
    )

    keyboard = InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🎰 SLOT",
                callback_data="slot"
            ),

            InlineKeyboardButton(
                "🎲 DICE",
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

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


# =========================================================
# SLOT
# =========================================================

async def play_slot(query):

    user = query.from_user

    player = get_player(user)

    cost = 20

    if player["coins"] < cost:

        await query.answer(
            "💰 Ba ka da isasshen Coin!",
            show_alert=True
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

    result = [
        random.choice(symbols),
        random.choice(symbols),
        random.choice(symbols)
    ]

    reward = 0

    if (
        result[0] ==
        result[1] ==
        result[2]
    ):

        reward = 100

    elif (
        result[0] == result[1]
        or
        result[1] == result[2]
    ):

        reward = 40

    new_coins = (
        player["coins"]
        - cost
        + reward
    )

    update_player(
        user.id,
        coins=new_coins
    )

    if reward > 0:

        text = (
            "🎰 *SLOT WIN!*\n\n"

            f"{' | '.join(result)}\n\n"

            f"💰 Bet: -{cost}\n"
            f"🎁 Reward: +{reward}\n"
            f"💰 Balance: {new_coins}"
        )

    else:

        text = (
            "🎰 *SLOT*\n\n"

            f"{' | '.join(result)}\n\n"

            "❌ Ba ka ci wannan karon.\n"
            f"💰 Balance: {new_coins}"
        )

    keyboard = InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🎰 SPIN AGAIN",
                callback_data="slot"
            )
        ],

        [
            InlineKeyboardButton(
                "🔙 BACK",
                callback_data="games"
            )
        ]

    ])

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


# =========================================================
# DICE
# =========================================================

async def play_dice(query):

    user = query.from_user

    player = get_player(user)

    cost = 20

    if player["coins"] < cost:

        await query.answer(
            "💰 Ba ka da isasshen Coin!",
            show_alert=True
        )

        return

    number = random.randint(
        1,
        6
    )

    reward = 0

    if number == 6:

        reward = 100

    elif number >= 4:

        reward = 40

    new_coins = (
        player["coins"]
        - cost
        + reward
    )

    update_player(
        user.id,
        coins=new_coins
    )

    if reward > 0:

        text = (
            "🎲 *DICE WIN!*\n\n"

            f"Number: *{number}* 🎲\n\n"

            f"💰 Bet: -{cost}\n"
            f"🎁 Reward: +{reward}\n"
            f"💰 Balance: {new_coins}"
        )

    else:

        text = (
            "🎲 *DICE*\n\n"

            f"Number: *{number}*\n\n"

            "❌ Ka yi rashin sa'a.\n"
            f"💰 Balance: {new_coins}"
        )

    keyboard = InlineKeyboardMarkup([

        [
            InlineKeyboardButton(
                "🎲 ROLL AGAIN",
                callback_data="dice"
            )
        ],

        [
            InlineKeyboardButton(
                "🔙 BACK",
                callback_data="games"
            )
        ]

    ])

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


# =========================================================
# DAILY REWARD
# =========================================================

async def daily_reward(query):

    user = query.from_user

    player = get_player(user)

    today = date.today().isoformat()

    if player.get("last_daily") == today:

        await query.answer(
            "🎁 Ka riga ka karɓi reward yau!",
            show_alert=True
        )

        return

    reward = random.randint(
        25,
        60
    )

    update_player(
        user.id,
        coins=player["coins"] + reward,
        last_daily=today
    )

    player = get_player(user)

    text = (
        "🎁 *DAILY REWARD*\n\n"

        f"🎉 +{reward} Coins!\n\n"

        f"💰 Balance: *{player['coins']}*\n\n"

        "⏰ Ka dawo gobe."
    )

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=back_keyboard()
    )


# =========================================================
# PROFILE
# =========================================================

async def profile(query):

    user = query.from_user

    player = get_player(user)

    text = (
        "👤 *AGENT PROFILE*\n\n"

        f"🧑 Name: *{player.get('name', 'Agent')}*\n"
        f"💰 Coins: *{player['coins']}*\n"
        f"⚡ Energy: *{player['energy']}/"
        f"{player['max_energy']}*\n"
        f"⭐ Level: *{player['level']}*\n"
        f"🏆 Wins: *{player['wins']}*\n"
        f"🎯 Missions: *{player['missions']}*\n"
        f"🏰 Clan: *{player.get('clan') or 'None'}*"
    )

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=back_keyboard()
    )


# =========================================================
# LEADERBOARD
# =========================================================

async def leaderboard(query):

    data = load_db()

    players = list(
        data.values()
    )

    players.sort(
        key=lambda p: (
            int(p.get("wins", 0)),
            int(p.get("coins", 0)),
            int(p.get("level", 1))
        ),
        reverse=True
    )

    lines = [
        "🏆 *AREA 51 LEADERBOARD*\n"
    ]

    medals = [
        "🥇",
        "🥈",
        "🥉"
    ]

    if not players:

        lines.append(
            "Babu players tukuna."
        )

    else:

        for i, player in enumerate(
            players[:10]
        ):

            if i < 3:
                rank = medals[i]
            else:
                rank = f"{i + 1}."

            lines.append(
                f"{rank} "
                f"*{player.get('name', 'Agent')}* — "
                f"💰 {player.get('coins', 0)} | "
                f"⭐ {player.get('level', 1)} | "
                f"🏆 {player.get('wins', 0)}"
            )

    await query.edit_message_text(
        "\n".join(lines),
        parse_mode="Markdown",
        reply_markup=back_keyboard()
    )


# =========================================================
# BACK MENU
# =========================================================

async def back_menu(query):

    user = query.from_user

    player = get_player(user)

    text = (
        "👽 *AREA 51 WAR ZONE*\n\n"

        f"Welcome, *{user.first_name or 'Agent'}*! 🚀\n\n"

        f"💰 Coins: *{player['coins']}*\n"
        f"⚡ Energy: *{player['energy']}/"
        f"{player['max_energy']}*\n"
        f"⭐ Level: *{player['level']}*\n"
        f"🏆 Wins: *{player['wins']}*\n"
        f"🎯 Missions: *{player['missions']}*\n\n"

        "🔥 Ka shirya?"
    )

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=main_keyboard()
    )


# =========================================================
# CALLBACK HANDLER
# =========================================================

async def callback_handler(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    await query.answer()

    action = query.data

    if action == "back":

        await back_menu(query)

    elif action == "missions":

        await show_missions(query)

    elif action == "games":

        await show_games(query)

    elif action == "slot":

        await play_slot(query)

    elif action == "dice":

        await play_dice(query)

    elif action == "daily":

        await daily_reward(query)

    elif action == "profile":

        await profile(query)

    elif action == "leaderboard":

        await leaderboard(query)


# =========================================================
# ERROR HANDLER
# =========================================================

async def error_handler(
    update,
    context: ContextTypes.DEFAULT_TYPE
):

    logger.error(
        "Telegram error: %s",
        context.error,
        exc_info=True
    )


# =========================================================
# RUN TELEGRAM BOT
# =========================================================

def run_bot():

    application = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .build()
    )

    application.add_handler(
        CommandHandler(
            "start",
            start
        )
    )

    application.add_handler(
        CallbackQueryHandler(
            callback_handler
        )
    )

    application.add_error_handler(
        error_handler
    )

    logger.info(
        "Telegram bot starting..."
    )

    application.run_polling(
        drop_pending_updates=True,
        allowed_updates=Update.ALL_TYPES
    )


# =========================================================
# TOKEN CHECK
# =========================================================

def token_ready():

    if not BOT_TOKEN:
        return False

    if BOT_TOKEN == (
        "PASTE_YOUR_BOT_TOKEN_HERE"
    ):
        return False

    return True


# =========================================================
# MAIN
# =========================================================

if __name__ == "__main__":

    print("=" * 52)

    print(
        "        👽 AREA 51 GAME V5"
    )

    print("=" * 52)

    print()

    print("🟢 Starting...")

    print()

    print("🌐 GAME URL:")

    print(GAME_URL)

    print()

    # Start Flask
    web_thread = threading.Thread(
        target=run_web,
        daemon=True,
        name="FlaskThread"
    )

    web_thread.start()

    # Start Telegram bot
    if token_ready():

        print(
            "🤖 Telegram Bot: READY"
        )

        print(
            "🌐 Web Server: READY"
        )

        print()

        run_bot()

    else:

        print(
            "⚠️ BOT_TOKEN bai samu ba."
        )

        print()

        print(
            "A saka token a cikin:"
        )

        print(
            'BOT_TOKEN = "YOUR_BOT_TOKEN"'
        )

        print()

        print(
            "🌐 Web game zai iya aiki."
        )

        print(
            "🤖 Telegram bot ba zai fara ba."
        )

        # Keep Flask alive
        web_thread.join()
