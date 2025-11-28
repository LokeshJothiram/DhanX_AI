from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings
import os

# Create database engine with optimized connection pooling
engine = create_engine(
    settings.database_url,
    pool_size=10,           # Reduced core pool size for better resource management
    max_overflow=20,         # Additional connections for traffic spikes
    pool_pre_ping=True,     # Check connection health before use
    pool_recycle=1800,      # Recycle connections after 30 minutes (faster cleanup)
    pool_timeout=20,        # Reduced timeout for faster failure detection
    echo=False,             # Disable SQL logging in production
    # Enable statement caching for better performance
    connect_args={"connect_timeout": 10} if "postgresql" in settings.database_url else {}
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class
Base = declarative_base()

# Function to get database URL for Alembic
def get_database_url():
    """Get database URL from environment or settings"""
    return os.getenv("DATABASE_URL") or settings.database_url

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
