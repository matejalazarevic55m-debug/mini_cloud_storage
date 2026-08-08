"""add verification token expiry

Revision ID: 8d6f3c2a9b11
Revises: 5e7700bbe736
Create Date: 2026-08-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8d6f3c2a9b11"
down_revision: Union[str, Sequence[str], None] = "5e7700bbe736"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "verification_token_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "verification_token_expires_at")
