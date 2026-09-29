"""Gastos: ventana de escritorio con pywebview y datos en SQLite.

Uso:
    python app.py          # carga el build de dist/ (antes: npm run build)
    python app.py --dev    # levanta Vite con recarga en caliente y abre la ventana
"""

import os
import socket
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import webview

# En la carpeta del usuario y no en %APPDATA%: el Python de la Microsoft Store redirige
# %APPDATA% a una carpeta privada, y la app de desarrollo y el .exe verían bases distintas.
DATA_DIR = Path.home() / ".gastos"
DB_PATH = DATA_DIR / "gastos.db"

# Al empaquetar con PyInstaller los archivos quedan en sys._MEIPASS.
BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
DEV_URL = "http://localhost:1420"


def connect():
    # Una conexión por llamada: pywebview ejecuta cada llamada en otro hilo.
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def migrate():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY NOT NULL,
                description TEXT NOT NULL,
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                category TEXT NOT NULL,
                date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT ''
            )"""
        )
        columns = {row["name"] for row in con.execute("PRAGMA table_info(expenses)")}
        if "extraordinary" not in columns:
            con.execute(
                "ALTER TABLE expenses ADD COLUMN extraordinary INTEGER NOT NULL DEFAULT 0"
            )
        # Pago generado a partir de un gasto fijo de la configuración (su id); NULL si no.
        if "fixed_id" not in columns:
            con.execute("ALTER TABLE expenses ADD COLUMN fixed_id TEXT")
        # Ingresos fuera del ingreso fijo (bonos, ventas, aguinaldo...). Pueden tener fecha futura.
        con.execute(
            """CREATE TABLE IF NOT EXISTS extra_incomes (
                id TEXT PRIMARY KEY NOT NULL,
                description TEXT NOT NULL,
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT ''
            )"""
        )
        extra_columns = {row["name"] for row in con.execute("PRAGMA table_info(extra_incomes)")}
        # 1 = pago del ingreso fijo registrado automáticamente en su día de pago.
        if "fixed_income" not in extra_columns:
            con.execute(
                "ALTER TABLE extra_incomes ADD COLUMN fixed_income INTEGER NOT NULL DEFAULT 0"
            )
        con.execute(
            """CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            )"""
        )


class Api:
    """Cada método público queda disponible en JS como window.pywebview.api.<método>."""

    def list_expenses(self):
        with connect() as con:
            rows = con.execute(
                "SELECT id, description, amount_cents, category, date, note, extraordinary, "
                "fixed_id "
                "FROM expenses ORDER BY date DESC, id DESC"
            ).fetchall()
        return [
            {
                "id": row["id"],
                "description": row["description"],
                "amountCents": row["amount_cents"],
                "category": row["category"],
                "date": row["date"],
                "note": row["note"],
                "extraordinary": bool(row["extraordinary"]),
                "fixedId": row["fixed_id"],
            }
            for row in rows
        ]

    def save_expense(self, expense):
        with connect() as con:
            con.execute(
                "INSERT OR IGNORE INTO expenses "
                "(id, description, amount_cents, category, date, note, extraordinary, fixed_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    expense["id"],
                    expense["description"],
                    expense["amountCents"],
                    expense["category"],
                    expense["date"],
                    expense["note"],
                    int(bool(expense.get("extraordinary"))),
                    expense.get("fixedId"),
                ),
            )

    def update_expense(self, expense):
        with connect() as con:
            con.execute(
                "UPDATE expenses SET description = ?, amount_cents = ?, category = ?, "
                "date = ?, note = ? WHERE id = ?",
                (
                    expense["description"],
                    expense["amountCents"],
                    expense["category"],
                    expense["date"],
                    expense["note"],
                    expense["id"],
                ),
            )

    def remove_expense(self, id):
        with connect() as con:
            con.execute("DELETE FROM expenses WHERE id = ?", (id,))

    def reassign_category(self, source, target):
        with connect() as con:
            con.execute(
                "UPDATE expenses SET category = ? WHERE category = ?", (target, source)
            )

    def list_extras(self):
        with connect() as con:
            rows = con.execute(
                "SELECT id, description, amount_cents, date, note, fixed_income "
                "FROM extra_incomes ORDER BY date DESC, id DESC"
            ).fetchall()
        return [
            {
                "id": row["id"],
                "description": row["description"],
                "amountCents": row["amount_cents"],
                "date": row["date"],
                "note": row["note"],
                "fixedIncome": bool(row["fixed_income"]),
            }
            for row in rows
        ]

    def save_extra(self, extra):
        with connect() as con:
            con.execute(
                "INSERT OR IGNORE INTO extra_incomes "
                "(id, description, amount_cents, date, note, fixed_income) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    extra["id"],
                    extra["description"],
                    extra["amountCents"],
                    extra["date"],
                    extra["note"],
                    int(bool(extra.get("fixedIncome"))),
                ),
            )

    def update_extra(self, extra):
        with connect() as con:
            con.execute(
                "UPDATE extra_incomes SET description = ?, amount_cents = ?, date = ?, note = ? "
                "WHERE id = ?",
                (
                    extra["description"],
                    extra["amountCents"],
                    extra["date"],
                    extra["note"],
                    extra["id"],
                ),
            )

    def remove_extra(self, id):
        with connect() as con:
            con.execute("DELETE FROM extra_incomes WHERE id = ?", (id,))

    def get_settings(self):
        with connect() as con:
            rows = con.execute("SELECT key, value FROM settings").fetchall()
        return {row["key"]: row["value"] for row in rows}

    def save_setting(self, key, value):
        with connect() as con:
            con.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )


def vite_running():
    # create_connection prueba IPv4 e IPv6: Node suele escuchar "localhost" en ::1.
    try:
        socket.create_connection(("localhost", 1420), timeout=0.2).close()
        return True
    except OSError:
        return False


def start_vite():
    """Arranca `npm run dev` si no está corriendo y espera a que responda."""
    if vite_running():
        return None
    process = subprocess.Popen("npm run dev", cwd=BASE_DIR, shell=True)
    for _ in range(150):
        if vite_running():
            return process
        if process.poll() is not None:
            sys.exit("No se pudo iniciar Vite (npm run dev).")
        time.sleep(0.2)
    stop_vite(process)
    sys.exit("Vite no respondió en el puerto 1420.")


def stop_vite(process):
    if process and process.poll() is None:
        # shell=True crea un árbol de procesos (cmd -> npm -> node); se cierra completo.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
        )


def main():
    migrate()
    dev = "--dev" in sys.argv
    vite = start_vite() if dev else None
    url = DEV_URL if dev else str(BASE_DIR / "dist" / "index.html")
    webview.create_window(
        "Gastos",
        url,
        js_api=Api(),
        width=1280,
        height=820,
        min_size=(780, 620),
    )
    # debug permite clic derecho → Inspeccionar, sin abrir las DevTools solas.
    webview.settings["OPEN_DEVTOOLS_IN_DEBUG"] = False
    try:
        webview.start(debug=dev)
    finally:
        stop_vite(vite)


if __name__ == "__main__":
    main()
