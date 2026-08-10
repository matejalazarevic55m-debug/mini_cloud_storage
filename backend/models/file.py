from sqlalchemy import Boolean, Column, Integer, String, DateTime, BigInteger, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class File(Base):
    __tablename__ = "files"

    file_id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    size = Column(BigInteger, nullable=False)
    type = Column(String, nullable=True)   # MIME tip, npr. "image/png"
    path = Column(String, nullable=False)  # relativna putanja unutar STORAGE_ROOT

    folder_id = Column(Integer, ForeignKey("folders.folder_id"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    is_starred = Column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    folder = relationship("Folder", back_populates="files")
    owner = relationship("User", back_populates="files")
