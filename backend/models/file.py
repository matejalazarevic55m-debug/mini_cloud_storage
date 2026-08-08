from sqlalchemy import Column, Integer, String, DateTime, BigInteger, ForeignKey
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
    type = Column(String, nullable=True)   # MIME type, npr. "image/png"
    path = Column(String, nullable=False)  # putanja na disku ili S3 ključ

    folder_id = Column(Integer, ForeignKey("folders.folder_id"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)

    folder = relationship("Folder", back_populates="files")
    owner = relationship("User", back_populates="files")