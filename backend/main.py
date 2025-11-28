import os
# Suppress gRPC ALTS warnings (harmless warnings when not running on GCP)
os.environ['GRPC_VERBOSITY'] = 'ERROR'
os.environ['GLOG_minloglevel'] = '2'  # Suppress Google logging warnings

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response
from routers import auth, connections, coach, goals, transactions, investments, reports, admin, health_score, affordability
from database import engine
from models import Base
from migrationfile import check_and_migrate
import logging
import time

# Configure logging - filter out gRPC ALTS warnings
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Filter out gRPC ALTS credential warnings
class GRPCFilter(logging.Filter):
    def filter(self, record):
        # Filter out ALTS credential warnings
        if 'ALTS creds ignored' in str(record.getMessage()):
            return False
        return True

# Apply filter to root logger
logging.getLogger().addFilter(GRPCFilter())

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="DhanX AI API",
    description="AI-powered financial coaching platform for India's gig workers",
    version="1.0.0"
)

# Add GZip compression middleware for faster responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request timing middleware for performance monitoring
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Run database migration on startup
@app.on_event("startup")
def startup_event():
    """Run database migration when the application starts"""
    logger.info("Application starting up...")
    logger.info("Running database migration...")
    if check_and_migrate():
        logger.info("Database migration completed successfully!")
    else:
        logger.warning("Database migration failed or was skipped. Please check your database connection.")

# Add health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "DhanX AI API is running"}

# Include routers
app.include_router(auth.router)
app.include_router(connections.router)
app.include_router(coach.router)
app.include_router(goals.router)
app.include_router(transactions.router)
app.include_router(investments.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(health_score.router)
app.include_router(affordability.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to DhanX AI API - Financial coaching for India's gig workers"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )
