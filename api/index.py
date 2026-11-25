import html
import hmac
import json
import os
import re
import secrets
import smtplib
import ssl
import time
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, formatdate
from html.parser import HTMLParser
from pathlib import Path

from flask import (
    Flask, Response, jsonify, redirect, render_template, request,
    session, url_for,
)

BASE_DIR = Path(__file__).resolve().parent.parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
    static_url_path="/static",
)
handler = app

SESSION_SECRET = os.environ.get("SESSION_SECRET", "").strip()
LOGIN_PASSWORD = os.environ.get("LOGIN_PASSWORD", "")
if len(SESSION_SECRET) < 32:
    raise RuntimeError("Set SESSION_SECRET to a random value of at least 32 characters.")
if not LOGIN_PASSWORD:
    raise RuntimeError("Set LOGIN_PASSWORD in Vercel.")

app.secret_key = SESSION_SECRET
app.config.update(
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "true").lower() == "true",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
    MAX_CONTENT_LENGTH=1_000_000,
)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
SMTP_TIMEOUT = 20
MAX_RECIPIENTS = 25
SEND_DELAY_SECONDS = 0
EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"
)


class PlainTextExtractor(HTMLParser):
    """Convert HTML email content to readable plain text."""

    BLOCK_TAGS = {
        "address", "article", "blockquote", "br", "div", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "li",
        "ol", "p", "section", "table", "tr", "ul",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)

    def get_text(self):
        text = "".join(self.parts)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n[ \t]+", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return html.unescape(text).strip()


def html_to_text(value):
    parser = PlainTextExtractor()
    parser.feed(value or "")
    parser.close()
    return parser.get_text()


def clean(value, limit=250):
    """Remove header-breaking newlines and limit user-controlled header values."""
    return str(value or "").replace("\r", " ").replace("\n", " ").strip()[:limit]


def valid_email(value):
    if not isinstance(value, str):
        return False
    address = value.strip()
    return len(address) <= 254 and bool(EMAIL_RE.fullmatch(address))


def logged_in():
    return session.get("authenticated") is True


def get_csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def csrf_is_valid(candidate):
    expected = session.get("csrf_token", "")
    return bool(expected and candidate and hmac.compare_digest(expected, candidate))


def error(message, status=400):
    return jsonify({"success": False, "message": message}), status


def normalize_recipient(item):
    if isinstance(item, str):
        item = {"email": item}
    if not isinstance(item, dict):
        return None

    address = str(item.get("email", "")).strip().lower()
    if not valid_email(address):
        return None

    return {
        "email": address,
        **{
            key: clean(item.get(key, ""), 150)
            for key in ("name", "hi", "hello", "thanks", "ref_code")
        },
    }


def personalize(value, recipient):
    result = str(value or "")
    for key in ("hi", "hello", "thanks", "name", "email", "ref_code"):
        result = result.replace("{{" + key + "}}", recipient.get(key, ""))
    return result


def build_message(gmail, sender_name, subject, body, is_html, recipient):
    message = EmailMessage()
    message["Subject"] = clean(personalize(subject, recipient), 250)
    message["From"] = formataddr((clean(sender_name, 150), gmail))
    message["To"] = recipient["email"]
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid()

    content = personalize(body, recipient)
    if is_html:
        message.set_content(
            html_to_text(content)
            or "Please view this email in an HTML-capable email client."
        )
        message.add_alternative(content, subtype="html")
    else:
        message.set_content(content)

    return message


@app.after_request
def add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.endpoint in {"home", "login"}:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/login", methods=["GET", "POST"])
def login():
    if logged_in():
        return redirect(url_for("home"))

    token = get_csrf_token()
    if request.method == "GET":
        return render_template("login.html", error=None, csrf_token=token)

    if not csrf_is_valid(request.form.get("csrf_token", "")):
        return render_template(
            "login.html", error="Your session expired. Please refresh and try again.",
            csrf_token=get_csrf_token(),
        ), 400

    submitted_password = request.form.get("password", "")
    if not hmac.compare_digest(submitted_password, LOGIN_PASSWORD):
        return render_template(
            "login.html", error="Incorrect password.", csrf_token=token
        ), 401

    session.clear()
    session.permanent = True
    session["authenticated"] = True
    get_csrf_token()
    return redirect(url_for("home"))


@app.route("/logout", methods=["POST"])
def logout():
    if not logged_in():
        return redirect(url_for("login"))
    if not csrf_is_valid(request.form.get("csrf_token", "")):
        return error("Invalid session token. Refresh the page and try again.", 400)
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def home():
    if not logged_in():
        return redirect(url_for("login"))
    return render_template("index.html", csrf_token=get_csrf_token())


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "smtp": "Gmail SMTP",
        "max_recipients": MAX_RECIPIENTS,
        "send_delay_seconds": SEND_DELAY_SECONDS,
    })


@app.route("/favicon.ico")
def favicon():
    return Response("", status=204)


@app.route("/send-batch", methods=["POST"])
def send_batch():
    if not logged_in():
        return jsonify({
            "success": False,
            "message": "Please log in again.",
            "login_required": True,
        }), 401

    if not csrf_is_valid(request.headers.get("X-CSRF-Token", "")):
        return error("Your session token is invalid. Refresh the page and try again.", 400)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Invalid JSON request.")

    sender_name = clean(data.get("sender_name", ""), 150)
    gmail = clean(data.get("gmail", ""), 254).lower()
    app_password = re.sub(r"\s+", "", str(data.get("app_password", "")))
    subject = clean(data.get("subject", ""), 250)
    body = str(data.get("body", ""))
    is_html = data.get("is_html") is True
    incoming = data.get("recipients", [])

    if not sender_name or not valid_email(gmail) or not gmail.endswith("@gmail.com"):
        return error("Enter a sender name and valid @gmail.com address.")
    if not app_password or not subject or not body.strip():
        return error("App Password, subject and body are required.")
    if len(body) > 100_000:
        return error("Email body is too large.")
    if not isinstance(incoming, list):
        return error("Recipients must be a list.")
    if data.get("consent_confirmed") is not True:
        return error("Confirm recipients have permission to receive this email.")

    recipients, seen, invalid = [], set(), 0
    for item in incoming:
        recipient = normalize_recipient(item)
        if not recipient:
            invalid += 1
        elif recipient["email"] not in seen:
            seen.add(recipient["email"])
            recipients.append(recipient)

    if not recipients:
        return error("No valid recipients found.")
    if len(recipients) > MAX_RECIPIENTS:
        return error(f"Maximum {MAX_RECIPIENTS} unique recipients per batch.")

    def generate():
        total = len(recipients)
        sent = failed = 0

        def emit(payload):
            return json.dumps(payload, ensure_ascii=False) + "\n"

        yield emit({
            "type": "start", "total": total, "sent": 0, "failed": 0,
            "remaining": total, "invalid_skipped": invalid,
        })

        smtp = None
        try:
            smtp = smtplib.SMTP_SSL(
                SMTP_HOST, SMTP_PORT,
                context=ssl.create_default_context(),
                timeout=SMTP_TIMEOUT,
            )
            smtp.ehlo()
            smtp.login(gmail, app_password)

            for index, recipient in enumerate(recipients):
                if index and SEND_DELAY_SECONDS:
                    time.sleep(SEND_DELAY_SECONDS)

                try:
                    message = build_message(
                        gmail, sender_name, subject, body, is_html, recipient
                    )
                    refused = smtp.send_message(
                        message, from_addr=gmail, to_addrs=[recipient["email"]]
                    )
                    if refused:
                        failed += 1
                        result = "failed"
                        error_message = "Gmail refused this recipient."
                    else:
                        sent += 1
                        result = "sent"
                        error_message = None

                except smtplib.SMTPRecipientsRefused:
                    failed += 1
                    result = "failed"
                    error_message = "Gmail refused this recipient."
                except smtplib.SMTPResponseException as exc:
                    failed += 1
                    result = "failed"
                    detail = exc.smtp_error.decode("utf-8", "replace") if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error)
                    error_message = f"SMTP error {exc.smtp_code}: {detail[:200]}"
                except (smtplib.SMTPException, TimeoutError, OSError) as exc:
                    failed += 1
                    result = "failed"
                    error_message = f"SMTP/network error: {str(exc)[:200]}"

                event = {
                    "type": "progress",
                    "recipient": recipient["email"],
                    "result": result,
                    "total": total,
                    "sent": sent,
                    "failed": failed,
                    "remaining": total - sent - failed,
                }
                if error_message:
                    event["error"] = error_message
                yield emit(event)

        except smtplib.SMTPAuthenticationError:
            failed = total
            yield emit({
                "type": "error",
                "message": "Gmail authentication failed. Check your Gmail address and App Password.",
                "total": total, "sent": sent, "failed": failed, "remaining": 0,
            })
        except (smtplib.SMTPException, TimeoutError, OSError) as exc:
            failed = total - sent
            yield emit({
                "type": "error",
                "message": f"Could not connect to Gmail SMTP: {str(exc)[:200]}",
                "total": total, "sent": sent, "failed": failed,
                "remaining": total - sent - failed,
            })
        finally:
            if smtp is not None:
                try:
                    smtp.quit()
                except Exception:
                    try:
                        smtp.close()
                    except Exception:
                        pass

        yield emit({
            "type": "complete",
            "success": failed == 0,
            "message": "Sending attempt finished. SMTP acceptance does not prove Inbox delivery.",
            "total": total,
            "sent": sent,
            "failed": failed,
            "remaining": total - sent - failed,
        })

    response = Response(
        generate(),
        content_type="application/x-ndjson; charset=utf-8",
        direct_passthrough=True,
    )
    response.headers["Cache-Control"] = "no-store, no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
