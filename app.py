from flask import Flask, url_for, session
from flask import render_template, redirect
import os

app = Flask(__name__)
app.secret_key = os.getenv("secret_key")


@app.route("/")
def index():
    return render_template ("index.html")

@app.route("/works")
def works():
    return render_template("works.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/Admin-Tat/admin")
def admin():
    return render_template("admin.html")

if __name__ == "__main__":
    app.run(debug=True)