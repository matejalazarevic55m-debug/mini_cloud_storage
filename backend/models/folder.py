from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Folder(Base):
    __tablename__ = "folders"

    folder_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.folder_id"), nullable=True)

    is_starred = Column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side=[folder_id], backref="subfolders")
    files = relationship("File", back_populates="folder")
