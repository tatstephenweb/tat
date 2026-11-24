import os

import psycopg2
from flask import Flask, render_template, redirect, url_for, flash, request
from dotenv import load_dotenv
load_dotenv()
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")


# ---------- database helpers ----------
def get_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL is not set")
        return None
    try:
        return psycopg2.connect(url)
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None


def create_message_table():
    conn = get_connection()
    if not conn:
        return
    try:
        with conn, conn.cursor() as cur:   # "with conn" commits, or rolls back on error
            cur.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
    except Exception as e:
        print(f"Error creating table: {e}")
    finally:
        conn.close()


def save_message(name, email, text):
    conn = get_connection()
    if not conn:
        return False
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO messages (name, email, message) VALUES (%s, %s, %s)",
                (name, email, text),
            )
        return True
    except Exception as e:
        print(f"Error saving message: {e}")
        return False
    finally:
        conn.close()


# Runs on every import/cold start (needed on Vercel, where __main__ never runs).
# CREATE TABLE IF NOT EXISTS makes this safe to repeat.
create_message_table()


# ---------- routes ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/works")
def works():
    return render_template("works.html")


@app.route("/contact", methods=["GET", "POST"])
def contact():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        text = request.form.get("message", "").strip()

        if not name or not email or not text:
            flash("Please fill in all fields.", "error")
        elif "@" not in email or len(email) > 255:
            flash("Please enter a valid email address.", "error")
        elif len(name) > 100 or len(text) > 5000:
            flash("Your name or message is too long.", "error")
        elif save_message(name, email, text):
            flash("Thanks! Your message has been sent.", "success")
        else:
            flash("Something went wrong. Please try again later.", "error")
        return redirect(url_for("contact"))

    return render_template("contact.html")


@app.route("/Admin-Tat/admin")
def admin():
    return render_template("admin.html")


if __name__ == "__main__":
    create_message_table()
    app.run(debug=True)
