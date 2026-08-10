import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import bcrypt
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File as FastAPIFile,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from jose import JWTError, jwt
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


# ---------------------------------------------------------
# ENV
# ---------------------------------------------------------

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY nije podešen u .env fajlu."
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

AUTH_COOKIE_NAME = "storio_access_token"

COOKIE_SECURE = (
    os.getenv("COOKIE_SECURE", "true").lower()
    == "true"
)


STORAGE_ROOT = Path(
    os.getenv(
        "STORAGE_ROOT",
        str(Path(__file__).resolve().parent / "storage"),
    )
).resolve()

STORAGE_ROOT.mkdir(
    parents=True,
    exist_ok=True,
)

STORAGE_LIMIT_BYTES = int(
    os.getenv(
        "STORAGE_LIMIT_BYTES",
        str(15 * 1024 * 1024 * 1024),
    )
)


# Chunked/resumable upload podešavanja.
# Browser šalje fajl u manjim delovima kako veliki upload
# ne bi zavisio od limita jednog HTTP zahteva.
UPLOAD_CHUNK_SIZE_BYTES = int(
    os.getenv(
        "UPLOAD_CHUNK_SIZE_BYTES",
        str(20 * 1024 * 1024),
    )
)

MAX_UPLOAD_CHUNK_BYTES = int(
    os.getenv(
        "MAX_UPLOAD_CHUNK_BYTES",
        str(25 * 1024 * 1024),
    )
)

UPLOAD_SESSION_TTL_HOURS = int(
    os.getenv(
        "UPLOAD_SESSION_TTL_HOURS",
        "24",
    )
)

UPLOAD_ROOT = STORAGE_ROOT / ".uploads"
UPLOAD_ROOT.mkdir(
    parents=True,
    exist_ok=True,
)


# ---------------------------------------------------------
# APP
# ---------------------------------------------------------

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



class CreateFolderRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=255,
    )

    parent_id: int | None = None


class RenameRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=255,
    )


class StarRequest(BaseModel):
    is_starred: bool



class UploadInitRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=255,
    )

    size: int = Field(
        ge=0,
    )

    mime_type: str | None = None
    folder_id: int | None = None


# ---------------------------------------------------------
# JWT / AUTH FUNKCIJE
# ---------------------------------------------------------

def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(
        AUTH_COOKIE_NAME
    )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Korisnik nije prijavljen.",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Nevažeća sesija.",
            )

        user_id = int(user_id)

    except HTTPException:
        raise

    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Sesija je istekla ili nije važeća."
            ),
        )

    user = (
        db.query(User)
        .filter(User.user_id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Korisnik ne postoji.",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email nije verifikovan.",
        )

    return user


# ---------------------------------------------------------
# STORAGE POMOĆNE FUNKCIJE
# ---------------------------------------------------------

def _safe_display_name(name: str | None) -> str:
    safe_name = Path(name or "file").name.strip()

    if not safe_name:
        return "file"

    return safe_name[:255]


def _get_owned_file(
    db: Session,
    user: User,
    file_id: int,
) -> File:
    file_record = (
        db.query(File)
        .filter(
            File.file_id == file_id,
            File.owner_id == user.user_id,
        )
        .first()
    )

    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fajl nije pronađen.",
        )

    return file_record


def _get_owned_folder(
    db: Session,
    user: User,
    folder_id: int,
) -> Folder:
    folder = (
        db.query(Folder)
        .filter(
            Folder.folder_id == folder_id,
            Folder.owner_id == user.user_id,
        )
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder nije pronađen.",
        )

    return folder


def _resolve_storage_path(file_record: File) -> Path:
    file_path = (
        STORAGE_ROOT / file_record.path
    ).resolve()

    try:
        file_path.relative_to(STORAGE_ROOT)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nevažeća putanja fajla.",
        )

    return file_path


def _storage_used_bytes(
    db: Session,
    user_id: int,
) -> int:
    used = (
        db.query(
            func.coalesce(
                func.sum(File.size),
                0,
            )
        )
        .filter(
            File.owner_id == user_id
        )
        .scalar()
    )

    return int(used or 0)


def _serialize_folder(folder: Folder) -> dict:
    return {
        "folder_id": folder.folder_id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "is_starred": bool(folder.is_starred),
        "deleted_at": (
            folder.deleted_at.isoformat()
            if folder.deleted_at
            else None
        ),
        "created_at": (
            folder.created_at.isoformat()
            if folder.created_at
            else None
        ),
        "updated_at": (
            folder.updated_at.isoformat()
            if folder.updated_at
            else None
        ),
    }


def _serialize_file(file_record: File) -> dict:
    return {
        "file_id": file_record.file_id,
        "name": file_record.name,
        "size": file_record.size,
        "type": file_record.type,
        "folder_id": file_record.folder_id,
        "is_starred": bool(file_record.is_starred),
        "deleted_at": (
            file_record.deleted_at.isoformat()
            if file_record.deleted_at
            else None
        ),
        "created_at": (
            file_record.created_at.isoformat()
            if file_record.created_at
            else None
        ),
        "updated_at": (
            file_record.updated_at.isoformat()
            if file_record.updated_at
            else None
        ),
    }


def _folder_breadcrumbs(
    db: Session,
    user: User,
    folder: Folder,
) -> list[dict]:
    chain: list[Folder] = []
    current = folder
    visited: set[int] = set()

    # Zaštita od eventualne ciklične parent relacije u bazi.
    while current is not None:
        if current.folder_id in visited:
            break

        visited.add(current.folder_id)
        chain.append(current)

        if current.parent_id is None:
            break

        current = (
            db.query(Folder)
            .filter(
                Folder.folder_id == current.parent_id,
                Folder.owner_id == user.user_id,
            )
            .first()
        )

    chain.reverse()

    return [
        {
            "folder_id": item.folder_id,
            "name": item.name,
        }
        for item in chain
    ]


def _folder_chain_has_deleted_item(
    db: Session,
    user_id: int,
    folder_id: int | None,
) -> bool:
    current_id = folder_id
    visited: set[int] = set()

    while current_id is not None:
        if current_id in visited:
            return True

        visited.add(current_id)

        folder = (
            db.query(Folder)
            .filter(
                Folder.folder_id == current_id,
                Folder.owner_id == user_id,
            )
            .first()
        )

        if folder is None:
            return True

        if folder.deleted_at is not None:
            return True

        current_id = folder.parent_id

    return False


def _collect_folder_tree_ids(
    db: Session,
    user_id: int,
    root_folder_id: int,
) -> list[int]:
    result: list[int] = []
    queue = [root_folder_id]
    visited: set[int] = set()

    while queue:
        folder_id = queue.pop(0)

        if folder_id in visited:
            continue

        visited.add(folder_id)
        result.append(folder_id)

        children = (
            db.query(Folder.folder_id)
            .filter(
                Folder.owner_id == user_id,
                Folder.parent_id == folder_id,
            )
            .all()
        )

        queue.extend(
            child_id
            for (child_id,) in children
            if child_id not in visited
        )

    return result


def _validate_upload_id(upload_id: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload sesija nije pronađena.",
        )

    return upload_id


def _upload_user_dir(user_id: int) -> Path:
    path = UPLOAD_ROOT / str(user_id)
    path.mkdir(
        parents=True,
        exist_ok=True,
    )
    return path


def _upload_session_paths(
    user_id: int,
    upload_id: str,
) -> tuple[Path, Path]:
    _validate_upload_id(upload_id)

    user_dir = _upload_user_dir(user_id)

    metadata_path = user_dir / f"{upload_id}.json"
    temp_path = user_dir / f"{upload_id}.part"

    return metadata_path, temp_path


def _write_upload_metadata(
    metadata_path: Path,
    metadata: dict,
) -> None:
    temp_metadata_path = metadata_path.with_suffix(
        ".json.tmp"
    )

    temp_metadata_path.write_text(
        json.dumps(
            metadata,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    os.replace(
        temp_metadata_path,
        metadata_path,
    )


def _load_upload_metadata(
    user_id: int,
    upload_id: str,
) -> tuple[dict, Path, Path]:
    metadata_path, temp_path = _upload_session_paths(
        user_id,
        upload_id,
    )

    if not metadata_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload sesija nije pronađena ili je istekla.",
        )

    try:
        metadata = json.loads(
            metadata_path.read_text(
                encoding="utf-8"
            )
        )
    except (OSError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload sesija je oštećena.",
        )

    if int(metadata.get("owner_id", -1)) != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload sesija nije pronađena.",
        )

    return metadata, metadata_path, temp_path


def _delete_upload_session(
    metadata_path: Path,
    temp_path: Path,
) -> None:
    try:
        metadata_path.unlink(
            missing_ok=True
        )
    except OSError:
        pass

    try:
        temp_path.unlink(
            missing_ok=True
        )
    except OSError:
        pass


def _parse_iso_datetime(
    value: str | None,
) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(
            value
        )
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=timezone.utc
        )

    return parsed


def _cleanup_stale_uploads(
    user_id: int,
) -> None:
    user_dir = _upload_user_dir(
        user_id
    )

    cutoff = (
        datetime.now(timezone.utc)
        - timedelta(
            hours=UPLOAD_SESSION_TTL_HOURS
        )
    )

    for metadata_path in user_dir.glob(
        "*.json"
    ):
        try:
            metadata = json.loads(
                metadata_path.read_text(
                    encoding="utf-8"
                )
            )
        except (
            OSError,
            json.JSONDecodeError,
        ):
            try:
                metadata_path.unlink(
                    missing_ok=True
                )
            except OSError:
                pass
            continue

        updated_at = _parse_iso_datetime(
            metadata.get("updated_at")
        )

        if (
            updated_at is not None
            and updated_at >= cutoff
        ):
            continue

        upload_id = metadata_path.stem

        if not re.fullmatch(
            r"[0-9a-f]{32}",
            upload_id,
        ):
            continue

        temp_path = (
            user_dir
            / f"{upload_id}.part"
        )

        _delete_upload_session(
            metadata_path,
            temp_path,
        )


def _reserved_upload_bytes(
    user_id: int,
) -> int:
    _cleanup_stale_uploads(
        user_id
    )

    reserved = 0
    user_dir = _upload_user_dir(
        user_id
    )

    for metadata_path in user_dir.glob(
        "*.json"
    ):
        try:
            metadata = json.loads(
                metadata_path.read_text(
                    encoding="utf-8"
                )
            )

            if (
                int(
                    metadata.get(
                        "owner_id",
                        -1,
                    )
                )
                != user_id
            ):
                continue

            reserved += int(
                metadata.get(
                    "total_size",
                    0,
                )
            )
        except (
            OSError,
            ValueError,
            TypeError,
            json.JSONDecodeError,
        ):
            continue

    return reserved


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
    response: Response,
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

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Prvo verifikuj email adresu.",
        )

    access_token = create_access_token(
        user.user_id
    )

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=JWT_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
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
# PROVERA TRENUTNE SESIJE
# ---------------------------------------------------------

@app.get("/auth/me")
def auth_me(
    user: User = Depends(get_current_user),
):
    return {
        "user": {
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
        }
    }


# ---------------------------------------------------------
# LOGOUT
# ---------------------------------------------------------

@app.post("/auth/logout")
def logout_user(
    response: Response,
):
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )

    return {
        "message": "Uspešno ste se odjavili."
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
    token_hash = hashlib.sha256(
        data.token.encode("utf-8")
    ).hexdigest()

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

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

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

    new_password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    user.password_hash = new_password_hash

    user.reset_password_token = None
    user.reset_password_token_expires_at = None

    db.commit()

    return {
        "message": (
            "Lozinka je uspešno promenjena."
        )
    }



# ---------------------------------------------------------
# STORAGE - LISTA STAVKI
# ---------------------------------------------------------

@app.get("/storage/items")
def storage_items(
    include_deleted: bool = True,
    folder_id: int | None = None,
    recursive: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_folder = None
    breadcrumbs: list[dict] = []

    if folder_id is not None:
        folder = _get_owned_folder(
            db,
            user,
            folder_id,
        )

        if folder.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Folder je u otpadu.",
            )

        current_folder = _serialize_folder(folder)
        breadcrumbs = _folder_breadcrumbs(
            db,
            user,
            folder,
        )

    if recursive:
        folder_query = (
            db.query(Folder)
            .filter(
                Folder.owner_id == user.user_id,
            )
        )

        file_query = (
            db.query(File)
            .filter(
                File.owner_id == user.user_id,
            )
        )
    else:
        folder_query = (
            db.query(Folder)
            .filter(
                Folder.owner_id == user.user_id,
                Folder.parent_id == folder_id,
            )
        )

        file_query = (
            db.query(File)
            .filter(
                File.owner_id == user.user_id,
                File.folder_id == folder_id,
            )
        )

    if not include_deleted:
        folder_query = folder_query.filter(
            Folder.deleted_at.is_(None)
        )

        file_query = file_query.filter(
            File.deleted_at.is_(None)
        )

    folders = (
        folder_query
        .order_by(Folder.name.asc())
        .all()
    )

    files = (
        file_query
        .order_by(File.created_at.desc())
        .all()
    )

    return {
        "current_folder": current_folder,
        "breadcrumbs": breadcrumbs,
        "folders": [
            _serialize_folder(folder)
            for folder in folders
        ],
        "files": [
            _serialize_file(file_record)
            for file_record in files
        ],
    }


# ---------------------------------------------------------
# STORAGE - ZAUZEĆE
# ---------------------------------------------------------

@app.get("/storage/usage")
def storage_usage(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    used_bytes = _storage_used_bytes(
        db,
        user.user_id,
    )

    return {
        "used_bytes": used_bytes,
        "limit_bytes": STORAGE_LIMIT_BYTES,
        "free_bytes": max(
            STORAGE_LIMIT_BYTES - used_bytes,
            0,
        ),
    }


# ---------------------------------------------------------
# FOLDERI - KREIRANJE
# ---------------------------------------------------------

@app.post(
    "/folders",
    status_code=status.HTTP_201_CREATED,
)
def create_folder(
    data: CreateFolderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Naziv foldera ne sme biti prazan.",
        )

    if data.parent_id is not None:
        parent = _get_owned_folder(
            db,
            user,
            data.parent_id,
        )

        if parent.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nije moguće kreirati folder unutar Otpada.",
            )

    existing = (
        db.query(Folder)
        .filter(
            Folder.owner_id == user.user_id,
            Folder.parent_id == data.parent_id,
            Folder.deleted_at.is_(None),
            func.lower(Folder.name) == name.lower(),
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder sa tim nazivom već postoji.",
        )

    folder = Folder(
        name=name,
        owner_id=user.user_id,
        parent_id=data.parent_id,
        is_starred=False,
    )

    db.add(folder)
    db.commit()
    db.refresh(folder)

    return {
        "folder": _serialize_folder(folder)
    }


# ---------------------------------------------------------
# FOLDERI - PREIMENOVANJE
# ---------------------------------------------------------

@app.patch("/folders/{folder_id}/rename")
def rename_folder(
    folder_id: int,
    data: RenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _get_owned_folder(
        db,
        user,
        folder_id,
    )

    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Naziv foldera ne sme biti prazan.",
        )

    existing = (
        db.query(Folder)
        .filter(
            Folder.owner_id == user.user_id,
            Folder.parent_id == folder.parent_id,
            Folder.folder_id != folder.folder_id,
            Folder.deleted_at.is_(None),
            func.lower(Folder.name) == name.lower(),
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder sa tim nazivom već postoji.",
        )

    folder.name = name

    db.commit()
    db.refresh(folder)

    return {
        "folder": _serialize_folder(folder)
    }


# ---------------------------------------------------------
# FOLDERI - ZVEZDICA
# ---------------------------------------------------------

@app.patch("/folders/{folder_id}/star")
def star_folder(
    folder_id: int,
    data: StarRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _get_owned_folder(
        db,
        user,
        folder_id,
    )

    folder.is_starred = data.is_starred

    db.commit()
    db.refresh(folder)

    return {
        "folder": _serialize_folder(folder)
    }


# ---------------------------------------------------------
# FOLDERI - PREMESTI U OTPAD
# ---------------------------------------------------------

@app.delete("/folders/{folder_id}")
def move_folder_to_trash(
    folder_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _get_owned_folder(
        db,
        user,
        folder_id,
    )

    folder.deleted_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(folder)

    return {
        "folder": _serialize_folder(folder)
    }


# ---------------------------------------------------------
# FOLDERI - VRATI IZ OTPADA
# ---------------------------------------------------------

@app.post("/folders/{folder_id}/restore")
def restore_folder(
    folder_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _get_owned_folder(
        db,
        user,
        folder_id,
    )

    # Ako je roditeljski folder i dalje u otpadu, vraćamo ovaj
    # folder u koren Moj Disk kako ne bi ostao nevidljiv.
    if _folder_chain_has_deleted_item(
        db,
        user.user_id,
        folder.parent_id,
    ):
        folder.parent_id = None

    folder.deleted_at = None

    db.commit()
    db.refresh(folder)

    return {
        "folder": _serialize_folder(folder)
    }


# ---------------------------------------------------------
# FOLDERI - TRAJNO BRISANJE
# ---------------------------------------------------------

@app.delete("/folders/{folder_id}/permanent")
def permanently_delete_folder(
    folder_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = _get_owned_folder(
        db,
        user,
        folder_id,
    )

    tree_ids = _collect_folder_tree_ids(
        db,
        user.user_id,
        folder.folder_id,
    )

    file_records = (
        db.query(File)
        .filter(
            File.owner_id == user.user_id,
            File.folder_id.in_(tree_ids),
        )
        .all()
    )

    file_ids = [
        record.file_id
        for record in file_records
    ]

    file_paths = [
        _resolve_storage_path(record)
        for record in file_records
    ]

    try:
        if file_ids:
            (
                db.query(FileShare)
                .filter(FileShare.file_id.in_(file_ids))
                .delete(synchronize_session=False)
            )

        (
            db.query(FolderShare)
            .filter(FolderShare.folder_id.in_(tree_ids))
            .delete(synchronize_session=False)
        )

        if file_ids:
            (
                db.query(File)
                .filter(File.file_id.in_(file_ids))
                .delete(synchronize_session=False)
            )

        # Obrnuti redosled garantuje da se podfolderi brišu
        # pre roditeljskog foldera.
        for item_id in reversed(tree_ids):
            (
                db.query(Folder)
                .filter(
                    Folder.folder_id == item_id,
                    Folder.owner_id == user.user_id,
                )
                .delete(synchronize_session=False)
            )

        db.commit()

    except Exception:
        db.rollback()
        raise

    for file_path in file_paths:
        try:
            file_path.unlink(missing_ok=True)
        except OSError as exc:
            print(
                "Greška pri brisanju fajla iz foldera:",
                exc,
            )

    return {
        "message": "Folder i njegov sadržaj su trajno obrisani."
    }


# ---------------------------------------------------------
# CHUNKED UPLOAD - INICIJALIZACIJA
# ---------------------------------------------------------

@app.post(
    "/uploads/init",
    status_code=status.HTTP_201_CREATED,
)
def init_chunked_upload(
    data: UploadInitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    display_name = _safe_display_name(
        data.name
    )

    if data.size > STORAGE_LIMIT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Fajl je veći od ukupnog Storio "
                "storage limita."
            ),
        )

    if data.folder_id is not None:
        folder = _get_owned_folder(
            db,
            user,
            data.folder_id,
        )

        if folder.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Nije moguće uploadovati u folder "
                    "koji je u Otpadu."
                ),
            )

    used_bytes = _storage_used_bytes(
        db,
        user.user_id,
    )

    reserved_bytes = _reserved_upload_bytes(
        user.user_id
    )

    if (
        used_bytes
        + reserved_bytes
        + data.size
        > STORAGE_LIMIT_BYTES
    ):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Nema dovoljno slobodnog prostora "
                "za ovaj fajl."
            ),
        )

    upload_id = uuid4().hex

    metadata_path, temp_path = _upload_session_paths(
        user.user_id,
        upload_id,
    )

    temp_path.touch(
        exist_ok=False
    )

    now = datetime.now(
        timezone.utc
    ).isoformat()

    metadata = {
        "upload_id": upload_id,
        "owner_id": user.user_id,
        "name": display_name,
        "mime_type": (
            data.mime_type
            or "application/octet-stream"
        ),
        "total_size": data.size,
        "folder_id": data.folder_id,
        "bytes_received": 0,
        "created_at": now,
        "updated_at": now,
    }

    _write_upload_metadata(
        metadata_path,
        metadata,
    )

    return {
        "upload_id": upload_id,
        "name": display_name,
        "total_size": data.size,
        "bytes_received": 0,
        "chunk_size": UPLOAD_CHUNK_SIZE_BYTES,
        "expires_in_hours": UPLOAD_SESSION_TTL_HOURS,
    }


# ---------------------------------------------------------
# CHUNKED UPLOAD - STATUS / RESUME
# ---------------------------------------------------------

@app.get(
    "/uploads/{upload_id}"
)
def chunked_upload_status(
    upload_id: str,
    user: User = Depends(get_current_user),
):
    metadata, _, temp_path = _load_upload_metadata(
        user.user_id,
        upload_id,
    )

    if not temp_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Privremeni upload fajl ne postoji.",
        )

    actual_size = temp_path.stat().st_size
    expected_size = int(
        metadata.get(
            "bytes_received",
            0,
        )
    )

    if actual_size != expected_size:
        # Poslednji zahtev je možda pukao nakon što je
        # deo podataka već upisan. Vraćamo fajl na poslednji
        # potvrđeni offset kako bi retry bio bezbedan.
        with temp_path.open("r+b") as target:
            target.truncate(
                expected_size
            )

    return {
        "upload_id": upload_id,
        "name": metadata["name"],
        "mime_type": metadata["mime_type"],
        "total_size": int(
            metadata["total_size"]
        ),
        "bytes_received": expected_size,
        "folder_id": metadata.get(
            "folder_id"
        ),
        "chunk_size": UPLOAD_CHUNK_SIZE_BYTES,
    }


# ---------------------------------------------------------
# CHUNKED UPLOAD - JEDAN DEO FAJLA
# ---------------------------------------------------------

@app.post(
    "/uploads/{upload_id}/chunk"
)
async def upload_chunk(
    upload_id: str,
    offset: int,
    request: Request,
    user: User = Depends(get_current_user),
):
    metadata, metadata_path, temp_path = _load_upload_metadata(
        user.user_id,
        upload_id,
    )

    expected_offset = int(
        metadata.get(
            "bytes_received",
            0,
        )
    )

    total_size = int(
        metadata.get(
            "total_size",
            0,
        )
    )

    if offset != expected_offset:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Upload offset se ne poklapa. "
                    "Nastavi od očekivanog offseta."
                ),
                "expected_offset": expected_offset,
            },
        )

    received = 0

    try:
        with temp_path.open(
            "r+b"
        ) as target:
            # Ako je prethodni request prekinut usred
            # pisanja, brišemo nepotvrđeni deo.
            target.seek(
                expected_offset
            )
            target.truncate(
                expected_offset
            )

            async for body_chunk in request.stream():
                if not body_chunk:
                    continue

                received += len(
                    body_chunk
                )

                if (
                    received
                    > MAX_UPLOAD_CHUNK_BYTES
                ):
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=(
                            "Jedan upload chunk je prevelik."
                        ),
                    )

                if (
                    expected_offset
                    + received
                    > total_size
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Primljeno je više podataka "
                            "od deklarisane veličine fajla."
                        ),
                    )

                target.write(
                    body_chunk
                )

            target.flush()

    except Exception:
        # Retry mora uvek da počne od poslednjeg
        # potvrđenog offseta.
        try:
            with temp_path.open(
                "r+b"
            ) as target:
                target.truncate(
                    expected_offset
                )
        except OSError:
            pass

        raise

    if (
        received == 0
        and expected_offset
        < total_size
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prazan upload chunk.",
        )

    new_offset = (
        expected_offset + received
    )

    metadata["bytes_received"] = new_offset
    metadata["updated_at"] = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    _write_upload_metadata(
        metadata_path,
        metadata,
    )

    return {
        "upload_id": upload_id,
        "bytes_received": new_offset,
        "total_size": total_size,
        "complete": (
            new_offset == total_size
        ),
    }


# ---------------------------------------------------------
# CHUNKED UPLOAD - FINALIZACIJA
# ---------------------------------------------------------

@app.post(
    "/uploads/{upload_id}/complete",
    status_code=status.HTTP_201_CREATED,
)
def complete_chunked_upload(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    metadata, metadata_path, temp_path = _load_upload_metadata(
        user.user_id,
        upload_id,
    )

    total_size = int(
        metadata["total_size"]
    )

    bytes_received = int(
        metadata.get(
            "bytes_received",
            0,
        )
    )

    if (
        bytes_received != total_size
        or not temp_path.is_file()
        or temp_path.stat().st_size != total_size
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Upload još nije završen."
                ),
                "expected_offset": bytes_received,
                "total_size": total_size,
            },
        )

    used_bytes = _storage_used_bytes(
        db,
        user.user_id,
    )

    if (
        used_bytes + total_size
        > STORAGE_LIMIT_BYTES
    ):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Nema dovoljno slobodnog prostora "
                "za finalizaciju fajla."
            ),
        )

    folder_id = metadata.get(
        "folder_id"
    )

    if folder_id is not None:
        folder = _get_owned_folder(
            db,
            user,
            int(folder_id),
        )

        if folder.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Ciljni folder je u Otpadu."
                ),
            )

    user_storage_dir = (
        STORAGE_ROOT
        / str(user.user_id)
    )

    user_storage_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    display_name = _safe_display_name(
        metadata["name"]
    )

    suffix = Path(
        display_name
    ).suffix[:20]

    destination = (
        user_storage_dir
        / f"{uuid4().hex}{suffix}"
    )

    os.replace(
        temp_path,
        destination,
    )

    relative_path = (
        destination
        .relative_to(
            STORAGE_ROOT
        )
        .as_posix()
    )

    file_record = File(
        name=display_name,
        size=total_size,
        type=(
            metadata.get(
                "mime_type"
            )
            or "application/octet-stream"
        ),
        path=relative_path,
        folder_id=folder_id,
        owner_id=user.user_id,
        is_starred=False,
    )

    try:
        db.add(
            file_record
        )
        db.commit()
        db.refresh(
            file_record
        )
    except Exception:
        db.rollback()

        try:
            os.replace(
                destination,
                temp_path,
            )
        except OSError:
            pass

        raise

    try:
        metadata_path.unlink(
            missing_ok=True
        )
    except OSError:
        pass

    return {
        "file": _serialize_file(
            file_record
        )
    }


# ---------------------------------------------------------
# CHUNKED UPLOAD - OTKAZIVANJE
# ---------------------------------------------------------

@app.delete(
    "/uploads/{upload_id}"
)
def cancel_chunked_upload(
    upload_id: str,
    user: User = Depends(get_current_user),
):
    _, metadata_path, temp_path = _load_upload_metadata(
        user.user_id,
        upload_id,
    )

    _delete_upload_session(
        metadata_path,
        temp_path,
    )

    return {
        "message": "Upload je otkazan."
    }


# ---------------------------------------------------------
# FAJLOVI - UPLOAD
# ---------------------------------------------------------

@app.post(
    "/files/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_files(
    files: list[UploadFile] = FastAPIFile(...),
    folder_id: int | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if folder_id is not None:
        folder = _get_owned_folder(
            db,
            user,
            folder_id,
        )

        if folder.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nije moguće uploadovati u folder koji je u Otpadu.",
            )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nijedan fajl nije izabran.",
        )

    used_bytes = _storage_used_bytes(
        db,
        user.user_id,
    )

    user_storage_dir = (
        STORAGE_ROOT / str(user.user_id)
    )

    user_storage_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    created_records = []
    created_paths = []

    try:
        for upload in files:
            display_name = _safe_display_name(
                upload.filename
            )

            suffix = Path(display_name).suffix[:20]
            stored_name = f"{uuid4().hex}{suffix}"
            destination = user_storage_dir / stored_name
            created_paths.append(destination)

            written_bytes = 0

            with destination.open("wb") as target:
                while True:
                    chunk = await upload.read(
                        1024 * 1024
                    )

                    if not chunk:
                        break

                    written_bytes += len(chunk)

                    if (
                        used_bytes + written_bytes
                        > STORAGE_LIMIT_BYTES
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=(
                                "Nema dovoljno prostora. "
                                "Storage limit je 15 GB."
                            ),
                        )

                    target.write(chunk)

            await upload.close()

            used_bytes += written_bytes

            relative_path = (
                destination
                .relative_to(STORAGE_ROOT)
                .as_posix()
            )

            file_record = File(
                name=display_name,
                size=written_bytes,
                type=(
                    upload.content_type
                    or "application/octet-stream"
                ),
                path=relative_path,
                folder_id=folder_id,
                owner_id=user.user_id,
                is_starred=False,
            )

            db.add(file_record)
            created_records.append(file_record)

        db.commit()

        for record in created_records:
            db.refresh(record)

    except Exception:
        db.rollback()

        for path in created_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

        raise

    return {
        "files": [
            _serialize_file(record)
            for record in created_records
        ]
    }


# ---------------------------------------------------------
# FAJLOVI - PREIMENOVANJE
# ---------------------------------------------------------

@app.patch("/files/{file_id}/rename")
def rename_file(
    file_id: int,
    data: RenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_record.name = _safe_display_name(data.name)

    db.commit()
    db.refresh(file_record)

    return {
        "file": _serialize_file(file_record)
    }


# ---------------------------------------------------------
# FAJLOVI - ZVEZDICA
# ---------------------------------------------------------

@app.patch("/files/{file_id}/star")
def star_file(
    file_id: int,
    data: StarRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_record.is_starred = data.is_starred

    db.commit()
    db.refresh(file_record)

    return {
        "file": _serialize_file(file_record)
    }


# ---------------------------------------------------------
# FAJLOVI - DOWNLOAD
# ---------------------------------------------------------

@app.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_path = _resolve_storage_path(file_record)

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fajl ne postoji na disku.",
        )

    return FileResponse(
        path=file_path,
        filename=file_record.name,
        media_type=(
            file_record.type
            or "application/octet-stream"
        ),
    )


# ---------------------------------------------------------
# FAJLOVI - OTVARANJE U BROWSERU
# ---------------------------------------------------------

@app.get("/files/{file_id}/content")
def file_content(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_path = _resolve_storage_path(file_record)

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fajl ne postoji na disku.",
        )

    return FileResponse(
        path=file_path,
        media_type=(
            file_record.type
            or "application/octet-stream"
        ),
        headers={
            "Content-Disposition": "inline"
        },
    )


# ---------------------------------------------------------
# FAJLOVI - PREMESTI U OTPAD
# ---------------------------------------------------------

@app.delete("/files/{file_id}")
def move_file_to_trash(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_record.deleted_at = (
        datetime.now(timezone.utc)
    )

    db.commit()
    db.refresh(file_record)

    return {
        "file": _serialize_file(file_record)
    }


# ---------------------------------------------------------
# FAJLOVI - VRATI IZ OTPADA
# ---------------------------------------------------------

@app.post("/files/{file_id}/restore")
def restore_file(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    if _folder_chain_has_deleted_item(
        db,
        user.user_id,
        file_record.folder_id,
    ):
        file_record.folder_id = None

    file_record.deleted_at = None

    db.commit()
    db.refresh(file_record)

    return {
        "file": _serialize_file(file_record)
    }


# ---------------------------------------------------------
# FAJLOVI - TRAJNO BRISANJE
# ---------------------------------------------------------

@app.delete("/files/{file_id}/permanent")
def permanently_delete_file(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_record = _get_owned_file(
        db,
        user,
        file_id,
    )

    file_path = _resolve_storage_path(file_record)

    db.delete(file_record)
    db.commit()

    try:
        file_path.unlink(missing_ok=True)
    except OSError as exc:
        print(
            "Greška pri brisanju fajla sa diska:",
            exc,
        )

    return {
        "message": "Fajl je trajno obrisan."
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
