import os
from datetime import datetime, timezone

from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")

# ---- database config ----
# Production (Vercel): DATABASE_URL comes from your Neon/Supabase dashboard.
# Local dev: falls back to a SQLite file so you can run the app without Postgres.
db_url = os.environ.get("DATABASE_URL")
if db_url.startswith("postgres://"):           # some providers use the old scheme
    db_url = db_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
# Serverless-friendly: check connections before using them, recycle old ones
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "pool_recycle": 300}

db = SQLAlchemy(app)


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# Create the table if it doesn't exist yet (safe to run on every cold start)
with app.app_context():
    try:
        db.create_all()
    except Exception as exc:  # don't crash the whole site if the DB is briefly unreachable
        app.logger.error("Could not create tables: %s", exc)


@app.route("/message", methods=["GET", "POST"])
def message():
    if request.method == "POST":
        # Honeypot: real users never fill this hidden field, bots usually do
        if request.form.get("website"):
            return redirect(url_for("contact"))

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        text = request.form.get("message", "").strip()

        if not name or not email or not text:
            flash("Please fill in all fields.", "error")
        elif "@" not in email or len(email) > 255:
            flash("Please enter a valid email address.", "error")
        elif len(name) > 100 or len(text) > 5000:
            flash("Your name or message is too long.", "error")
        else:
            try:
                db.session.add(Message(name=name, email=email, message=text))
                db.session.commit()
                flash("Thanks! Your message has been sent.", "success")
            except Exception as exc:
                db.session.rollback()
                app.logger.error("Could not save message: %s", exc)
                flash("Something went wrong. Please try again later.", "error")
        return redirect(url_for("contact"))

    return render_template("contact.html")


if __name__ == "__main__":
    app.run(debug=True)