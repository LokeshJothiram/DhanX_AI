"""
Database Migration Script
Automatically creates tables if they don't exist
"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from database import engine, get_database_url
from models import Base, User, PasswordResetToken, PaymentConnection, Goal, ManualTransaction, Investment, UserStreak
import logging

logger = logging.getLogger(__name__)

def table_exists(engine, table_name: str) -> bool:
    """Check if a table exists in the database"""
    try:
        inspector = inspect(engine)
        return table_name in inspector.get_table_names()
    except Exception as e:
        logger.error(f"Error checking if table {table_name} exists: {e}")
        return False

def run_migration():
    """Run database migration to create tables if they don't exist"""
    try:
        logger.info("Starting database migration check...")
        
        # Check if tables exist
        users_exists = table_exists(engine, "users")
        password_reset_tokens_exists = table_exists(engine, "password_reset_tokens")
        payment_connections_exists = table_exists(engine, "payment_connections")
        goals_exists = table_exists(engine, "goals")
        manual_transactions_exists = table_exists(engine, "manual_transactions")
        investments_exists = table_exists(engine, "investments")
        user_streaks_exists = table_exists(engine, "user_streaks")
        
        # If all tables exist, skip migration
        if (users_exists and password_reset_tokens_exists and payment_connections_exists 
            and goals_exists and manual_transactions_exists and investments_exists and user_streaks_exists):
            logger.info("All tables already exist. Skipping migration.")
            return True
        
        # Create tables that don't exist
        logger.info("Creating missing tables...")
        
        # Create all tables defined in models
        Base.metadata.create_all(bind=engine)
        
        logger.info("Database migration completed successfully!")
        return True
        
    except OperationalError as e:
        logger.error(f"Database connection error during migration: {e}")
        logger.error("Please check your database connection settings.")
        return False
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def create_indexes():
    """Create indexes for better query performance"""
    try:
        with engine.connect() as conn:
            # Fix deadline column to allow NULL (if it has NOT NULL constraint)
            try:
                conn.execute(text("ALTER TABLE goals ALTER COLUMN deadline DROP NOT NULL;"))
                conn.commit()
                logger.info("Fixed deadline column to allow NULL")
            except Exception as e:
                # Column might already allow NULL or not exist
                if "does not exist" not in str(e).lower() and "already" not in str(e).lower():
                    logger.warning(f"Could not alter deadline column (may already be nullable): {e}")
            
            # Add monthly_budget column to users table if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(10, 2);"))
                conn.commit()
                logger.info("Added monthly_budget column to users table")
            except Exception as e:
                if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                    logger.warning(f"Could not add monthly_budget column (may already exist): {e}")
            
            # Add language_preference column to users table if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR DEFAULT 'en';"))
                conn.commit()
                logger.info("Added language_preference column to users table")
            except Exception as e:
                if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                    logger.warning(f"Could not add language_preference column (may already exist): {e}")
            
            # Drop notification_preferences column from users table if it exists (no longer needed)
            try:
                conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS notification_preferences;"))
                conn.commit()
                logger.info("Dropped notification_preferences column from users table")
            except Exception as e:
                if "does not exist" not in str(e).lower():
                    logger.warning(f"Could not drop notification_preferences column (may not exist): {e}")
            
            # Create indexes if they don't exist (idempotent)
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_manual_transactions_type ON manual_transactions(type);",
                "CREATE INDEX IF NOT EXISTS idx_manual_transactions_date ON manual_transactions(transaction_date);",
                "CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);",
                "CREATE INDEX IF NOT EXISTS idx_goals_completed ON goals(is_completed);",
                # Composite index for common query pattern
                "CREATE INDEX IF NOT EXISTS idx_manual_transactions_user_type_date ON manual_transactions(user_id, type, transaction_date DESC);",
            ]
            
            for index_sql in indexes:
                try:
                    conn.execute(text(index_sql))
                    conn.commit()
                    logger.info(f"Index created or already exists")
                except Exception as e:
                    logger.warning(f"Index creation skipped (may already exist): {e}")
        
        return True
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        return False

def check_and_migrate():
    """Check database connection and run migration if needed"""
    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Run migration
        migration_success = run_migration()
        
        # Create indexes for performance
        if migration_success:
            create_indexes()
        
        return migration_success
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        logger.error("Migration will be skipped. Please check your database connection.")
        return False

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("Running database migration...")
    if check_and_migrate():
        print("Migration completed successfully!")
    else:
        print("Migration failed. Please check the logs above.")
        exit(1)

