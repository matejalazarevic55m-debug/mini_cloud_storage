import os
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from dotenv import load_dotenv

load_dotenv()


def send_verification_email(
    recipient_email: str,
    username: str,
    verification_url: str,
) -> None:
    """Pošalji korisniku verifikacioni mejl preko Mailtrap SMTP-a."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL")

    if not all((smtp_host, smtp_username, smtp_password, from_email)):
        raise RuntimeError("SMTP podešavanja nisu kompletna u backend .env fajlu.")

    safe_username = escape(username)
    safe_url = escape(verification_url, quote=True)

    message = EmailMessage()
    message["Subject"] = "Potvrdi svoj Storio nalog"
    message["From"] = f"Storio <{from_email}>"
    message["To"] = recipient_email

    message.set_content(
        f"""Zdravo {username},

Klikni na sledeći link da potvrdiš svoj Storio nalog:

{verification_url}

Link važi 24 sata.
Ako nisi napravio ovaj nalog, slobodno ignoriši poruku.
"""
    )

    message.add_alternative(
        f"""<!doctype html>
<html lang="sr">
  <body style="margin:0;background:#f2f3f8;font-family:Arial,sans-serif;color:#333;">
    <div style="padding:36px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:34px;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.08);">
        <h1 style="margin:0 0 18px;color:#7e87b7;font-size:42px;">Storio</h1>
        <h2 style="margin:0 0 14px;font-size:22px;">Potvrdi svoju email adresu</h2>
        <p style="line-height:1.6;margin:0 0 22px;">Zdravo <strong>{safe_username}</strong>, klikni na dugme ispod da aktiviraš nalog.</p>
        <a href="{safe_url}" style="display:inline-block;background:#7e87b7;color:#fff;text-decoration:none;padding:13px 26px;border-radius:24px;font-weight:700;">Verifikuj nalog</a>
        <p style="font-size:13px;color:#777;line-height:1.5;margin:24px 0 0;">Link važi 24 sata. Ako nisi napravio nalog, ignoriši ovaj mejl.</p>
      </div>
    </div>
  </body>
</html>""",
        subtype="html",
    )

    tls_context = ssl.create_default_context()

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls(context=tls_context)
        smtp.ehlo()
        smtp.login(smtp_username, smtp_password)
        smtp.send_message(message)


def send_password_reset_email(
    recipient_email: str,
    username: str,
    reset_url: str,
) -> None:
    message = EmailMessage()

    message["Subject"] = "Resetovanje Storio lozinke"
    message["From"] = f"Storio <{os.environ['SMTP_FROM_EMAIL']}>"
    message["To"] = recipient_email

    message.set_content(
        f"""
Zdravo {username},

Dobili smo zahtev za promenu tvoje Storio lozinke.

Otvori ovaj link:

{reset_url}

Link važi 30 minuta.

Ako nisi tražio promenu lozinke, ignoriši ovu poruku.
        """.strip()
    )

    message.add_alternative(
        f"""
<!doctype html>
<html lang="sr">
<body style="
    font-family:Arial,sans-serif;
    background:#f4f4f8;
    padding:30px;
">
  <div style="
      max-width:520px;
      margin:auto;
      background:white;
      padding:30px;
      border-radius:16px;
      text-align:center;
  ">

    <h1 style="color:#7e87b7;">
      Storio
    </h1>

    <h2>Resetovanje lozinke</h2>

    <p>
      Zdravo <strong>{username}</strong>,
    </p>

    <p>
      Klikni na dugme ispod da postaviš novu lozinku.
    </p>

    <a
      href="{reset_url}"
      style="
        display:inline-block;
        margin:20px 0;
        padding:13px 25px;
        background:#7e87b7;
        color:white;
        text-decoration:none;
        border-radius:25px;
      "
    >
      Resetuj lozinku
    </a>

    <p style="
        font-size:13px;
        color:#777;
    ">
      Link važi 30 minuta.
    </p>

    <p style="
        font-size:12px;
        color:#999;
    ">
      Ako nisi zatražio promenu lozinke,
      možeš ignorisati ovu poruku.
    </p>

  </div>
</body>
</html>
        """.strip(),
        subtype="html",
    )

    with smtplib.SMTP(
        os.environ["SMTP_HOST"],
        int(os.environ["SMTP_PORT"]),
        timeout=30,
    ) as smtp:

        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()

        smtp.login(
            os.environ["SMTP_USERNAME"],
            os.environ["SMTP_PASSWORD"],
        )

        smtp.send_message(message)
