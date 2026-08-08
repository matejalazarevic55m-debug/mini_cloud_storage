import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from email_service import (
    send_password_reset_email,
    send_verification_email,
)

# Uvoz svih modela registruje SQLAlchemy relacije.
from models import File, FileShare, Folder, FolderShare, User  # noqa: F401


# Učitavanje .env fajla
load_dotenv()


app = FastAPI(title="Storio API")


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://storiocloud.net",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# REQUEST MODELI
# ---------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class LoginRequest(BaseModel):
    email: EmailStr

    password: str = Field(
        min_length=1,
        max_length=128,
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str

    new_password: str = Field(
        min_length=8,
        max_length=128,
    )


# ---------------------------------------------------------
# TEST RUTA
# ---------------------------------------------------------

@app.get("/")
def read_root():
    return {
        "status": "radi"
    }


# ---------------------------------------------------------
# REGISTRACIJA
# ---------------------------------------------------------

@app.post(
    "/auth/register",
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    username = data.username.strip()
    email = str(data.email).lower().strip()

    if not username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Korisničko ime ne sme biti prazno.",
        )

    # Provera da li već postoji email ili username
    existing_user = (
        db.query(User)
        .filter(
            or_(
                func.lower(User.email) == email,
                func.lower(User.username)
                == username.lower(),
            )
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Email ili korisničko ime već postoji."
            ),
        )

    # Generisanje verification tokena
    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    # Hashovanje lozinke
    password_hash = bcrypt.hashpw(
        data.password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    # Kreiranje korisnika
    user = User(
        username=username,
        email=email,
        password_hash=password_hash,
        is_verified=False,
        verification_token=token_hash,
        verification_token_expires_at=(
            datetime.now(timezone.utc)
            + timedelta(hours=24)
        ),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Link koji korisniku stiže na email
    api_url = os.getenv(
        "API_URL",
        "https://api.storiocloud.net",
    ).rstrip("/")

    verification_url = (
        f"{api_url}/auth/verify-email"
        f"?token={raw_token}"
    )

    try:
        send_verification_email(
            recipient_email=user.email,
            username=user.username,
            verification_url=verification_url,
        )

    except Exception as exc:
        print(
            "Greška pri slanju verification emaila:",
            exc,
        )

        # Ako email nije poslat, brišemo nov nalog
        db.delete(user)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Nalog nije kreiran jer verifikacioni "
                "mejl nije mogao da bude poslat. "
                "Pokušaj ponovo."
            ),
        )

    return {
        "message": (
            "Nalog je kreiran. Proveri mejl i klikni "
            "na dugme za verifikaciju."
        )
    }


# ---------------------------------------------------------
# LOGIN
# ---------------------------------------------------------

@app.post("/auth/login")
def login_user(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(data.email).lower().strip()

    # Traženje korisnika po email adresi
    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == email
        )
        .first()
    )

    # Namerno ista poruka za nepostojeći email
    # i pogrešnu lozinku.
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pogrešan email ili lozinka.",
        )

    password_is_correct = bcrypt.checkpw(
        data.password.encode("utf-8"),
        user.password_hash.encode("utf-8"),
    )

    if not password_is_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pogrešan email ili lozinka.",
        )

    # Korisnik mora prvo verifikovati email
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Prvo verifikuj email adresu."
            ),
        )

    return {
        "message": "Uspešna prijava.",
        "user": {
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
        },
    }


# ---------------------------------------------------------
# EMAIL VERIFIKACIJA
# ---------------------------------------------------------

@app.get(
    "/auth/verify-email",
    response_class=HTMLResponse,
)
def verify_email(
    token: str,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    user = (
        db.query(User)
        .filter(
            User.verification_token == token_hash
        )
        .first()
    )

    if not user:
        return HTMLResponse(
            content=_verification_page(
                title="Link nije ispravan",
                message=(
                    "Verifikacioni link je nevažeći "
                    "ili je već iskorišćen."
                ),
                success=False,
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    expires_at = (
        user.verification_token_expires_at
    )

    if expires_at is None:
        return HTMLResponse(
            content=_verification_page(
                title="Link nije ispravan",
                message=(
                    "Verifikacioni link nema rok "
                    "važenja."
                ),
                success=False,
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Ako PostgreSQL vrati datetime bez timezone-a
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if expires_at < datetime.now(timezone.utc):
        return HTMLResponse(
            content=_verification_page(
                title="Link je istekao",
                message=(
                    "Verifikacioni link je istekao."
                ),
                success=False,
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Aktiviranje naloga
    user.is_verified = True

    # Token brišemo da ne može ponovo da se koristi
    user.verification_token = None
    user.verification_token_expires_at = None

    db.commit()

    return HTMLResponse(
        content=_verification_page(
            title="Email je verifikovan!",
            message=(
                "Tvoj Storio nalog je aktiviran. "
                "Sada možeš da se prijaviš."
            ),
            success=True,
        )
    )


# ---------------------------------------------------------
# ZABORAVLJENA LOZINKA
# ---------------------------------------------------------

@app.post("/auth/forgot-password")
def forgot_password(
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = str(data.email).lower().strip()

    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == email
        )
        .first()
    )

    # Uvek vraćamo istu poruku.
    # Tako neko ne može da proverava
    # koji email postoji u bazi.
    generic_response = {
        "message": (
            "Ako nalog sa tom email adresom postoji, "
            "poslali smo link za promenu lozinke."
        )
    }

    if not user:
        return generic_response

    # Generisanje reset tokena
    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    # Čuvamo samo hash tokena
    user.reset_password_token = token_hash

    # Link važi 30 minuta
    user.reset_password_token_expires_at = (
        datetime.now(timezone.utc)
        + timedelta(minutes=30)
    )

    db.commit()

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "https://storiocloud.net",
    ).rstrip("/")

    reset_url = (
        f"{frontend_url}/reset-password"
        f"?token={raw_token}"
    )

    # Slanje emaila u background task-u
    background_tasks.add_task(
        send_password_reset_email,
        user.email,
        user.username,
        reset_url,
    )

    return generic_response


# ---------------------------------------------------------
# POSTAVLJANJE NOVE LOZINKE
# ---------------------------------------------------------

@app.post("/auth/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    # Token iz URL-a pretvaramo u hash
    token_hash = hashlib.sha256(
        data.token.encode("utf-8")
    ).hexdigest()

    # Traženje korisnika sa tim tokenom
    user = (
        db.query(User)
        .filter(
            User.reset_password_token
            == token_hash
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Link za promenu lozinke nije "
                "ispravan ili je već iskorišćen."
            ),
        )

    expires_at = (
        user.reset_password_token_expires_at
    )

    if expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Link za promenu lozinke nije "
                "ispravan."
            ),
        )

    # PostgreSQL ponekad vrati naive datetime
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    # Provera da li je link istekao
    if expires_at < datetime.now(timezone.utc):
        user.reset_password_token = None
        user.reset_password_token_expires_at = None

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Link za promenu lozinke je istekao. "
                "Zatraži novi link."
            ),
        )

    # Hashovanje nove lozinke
    new_password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    # Upis nove lozinke
    user.password_hash = new_password_hash

    # Token brišemo nakon uspešnog reseta
    user.reset_password_token = None
    user.reset_password_token_expires_at = None

    db.commit()

    return {
        "message": (
            "Lozinka je uspešno promenjena."
        )
    }


# ---------------------------------------------------------
# HTML STRANICA ZA EMAIL VERIFIKACIJU
# ---------------------------------------------------------

def _verification_page(
    title: str,
    message: str,
    success: bool,
) -> str:
    status_icon = "✓" if success else "!"

    icon_background = (
        "#7e87b7"
        if success
        else "#b75f67"
    )

    return f"""
    <!DOCTYPE html>
    <html lang="sr">
    <head>
        <meta charset="UTF-8">

        <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
        >

        <title>Storio</title>

        <style>
            * {{
                box-sizing: border-box;
            }}

            body {{
                margin: 0;
                min-height: 100vh;

                display: flex;
                align-items: center;
                justify-content: center;

                background: #7e87b7;

                font-family:
                    Arial,
                    Helvetica,
                    sans-serif;

                padding: 20px;
            }}

            .card {{
                width: 100%;
                max-width: 420px;

                background: white;

                border-radius: 20px;

                padding: 40px 30px;

                text-align: center;

                box-shadow:
                    0 10px 30px
                    rgba(0, 0, 0, 0.15);
            }}

            .logo {{
                color: #7e87b7;

                font-size: 48px;
                font-weight: 700;

                margin-bottom: 25px;
            }}

            .icon {{
                width: 70px;
                height: 70px;

                margin: 0 auto 20px;

                display: flex;
                align-items: center;
                justify-content: center;

                border-radius: 50%;

                background:
                    {icon_background};

                color: white;

                font-size: 38px;
                font-weight: bold;
            }}

            h1 {{
                color: #333333;

                font-size: 24px;

                margin:
                    0 0 15px;
            }}

            p {{
                color: #666666;

                font-size: 15px;
                line-height: 1.6;

                margin-bottom: 25px;
            }}

            a {{
                display: inline-block;

                padding:
                    13px 28px;

                background: #7e87b7;

                color: white;

                text-decoration: none;

                border-radius: 30px;

                font-weight: 600;
            }}

            a:hover {{
                background: #6b73a3;
            }}
        </style>
    </head>

    <body>

        <div class="card">

            <div class="logo">
                Storio
            </div>

            <div class="icon">
                {status_icon}
            </div>

            <h1>
                {title}
            </h1>

            <p>
                {message}
            </p>

            <a href="https://storiocloud.net">
                Otvori Storio
            </a>

        </div>

    </body>
    </html>
    """