import os
import smtplib
import ssl
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

message = EmailMessage()
message["Subject"] = "Storio test poruka"
message["From"] = f"Storio <{os.environ['SMTP_FROM_EMAIL']}>"
message["To"] = "ipbobovo55m@gmail.com"

message.set_content(
    "Mailtrap je uspešno povezan sa Storio backendom."
)

ssl_context = ssl.create_default_context()

with smtplib.SMTP(
    os.environ["SMTP_HOST"],
    int(os.environ["SMTP_PORT"]),
    timeout=30,
) as smtp:
    smtp.ehlo()
    smtp.starttls(context=ssl_context)
    smtp.ehlo()
    smtp.login(
        os.environ["SMTP_USERNAME"],
        os.environ["SMTP_PASSWORD"],
    )
    smtp.send_message(message)

print("Testni mejl je uspešno poslat.")
