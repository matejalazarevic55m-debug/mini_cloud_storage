"""add google oauth to users

Revision ID: 39917468d1e8
Revises: 21912082008e
Create Date: 2026-08-17 20:26:14.217345

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '39917468d1e8'
down_revision: Union[str, Sequence[str], None] = '21912082008e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(),
        nullable=True,
    )

    op.add_column(
        "users",
        sa.Column(
            "google_sub",
            sa.String(length=255),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_users_google_sub",
        "users",
        ["google_sub"],
        unique=True,
    )


def downgrade():
    op.drop_index(
        "ix_users_google_sub",
        table_name="users",
    )

    op.drop_column(
        "users",
        "google_sub",
    )

    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(),
        nullable=False,
    )
