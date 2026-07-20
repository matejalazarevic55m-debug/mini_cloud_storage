from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from database import Base
import enum

class PermissionType(str, enum.Enum):
    view = "view"
    edit = "edit"

class FileShare(Base):
    __tablename__ = "file_shares"

    share_id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.file_id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    shared_with_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    permission = Column(Enum(PermissionType), nullable=False, default=PermissionType.view)
    created_at = Column(DateTime(timezone=True), server_default=func.now())