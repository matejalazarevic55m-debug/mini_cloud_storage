from sqlalchemy import Column, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from database import Base
from models.file_share import PermissionType

class FolderShare(Base):
    __tablename__ = "folder_shares"

    share_id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("folders.folder_id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    shared_with_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    permission = Column(Enum(PermissionType), nullable=False, default=PermissionType.view)
    created_at = Column(DateTime(timezone=True), server_default=func.now())