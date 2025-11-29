from sqlalchemy.orm import Session
from sqlalchemy import func, text
from models import User, PaymentConnection, Goal, ManualTransaction, Investment
from schemas import UserCreate, ConnectionCreate, ConnectionUpdate, GoalCreate, GoalUpdate, ManualTransactionCreate, InvestmentCreate, InvestmentUpdate
from auth import get_password_hash, verify_password
from fastapi import HTTPException, status
from typing import List, Optional, Tuple
from uuid import UUID
import uuid
import json
import logging
from datetime import datetime, timedelta, timezone

# IST timezone constant (UTC+5:30)
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    """Get current datetime in IST timezone"""
    return datetime.now(IST_TIMEZONE)

def to_ist(dt):
    """Convert datetime to IST timezone"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Assume UTC if timezone-naive
        dt = dt.replace(tzinfo=timezone.utc)
    # Convert to IST
    return dt.astimezone(IST_TIMEZONE)

logger = logging.getLogger(__name__)

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def get_user_by_id(db: Session, user_id: str):
    return db.query(User).filter(User.id == user_id).first()

def create_user(db: Session, user: UserCreate):
    # Check if user already exists
    existing_user = get_user_by_email(db, user.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = get_password_hash(user.password)
    
    # Create new user
    db_user = User(
        email=user.email,
        password_hash=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user

def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user

def update_user_password(db: Session, email: str, new_password: str):
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    return user

def update_user(db: Session, user_id: UUID, user_update):
    """Update user information"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    return user

def delete_user(db: Session, user_id: UUID):
    """Delete a user and all associated data"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Delete all associated data
    # Delete goals
    db.query(Goal).filter(Goal.user_id == user_id).delete()
    # Delete transactions
    db.query(ManualTransaction).filter(ManualTransaction.user_id == user_id).delete()
    # Delete investments
    db.query(Investment).filter(Investment.user_id == user_id).delete()
    # Delete connections
    db.query(PaymentConnection).filter(PaymentConnection.user_id == user_id).delete()
    
    # Delete user
    db.delete(user)
    db.commit()
    return True

def get_user_by_reset_token(db: Session, token: str):
    """Get user by reset token"""
    from models import PasswordResetToken
    from datetime import datetime
    
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).first()
    
    if not reset_token:
        return None
    
    return get_user_by_email(db, reset_token.email)

# Payment connection CRUD operations
def create_connection(db: Session, user_id: UUID, connection: ConnectionCreate):
    """Create a new payment connection for a user"""
    # Check if connection already exists for this user (including disconnected ones)
    existing = db.query(PaymentConnection).filter(
        PaymentConnection.user_id == user_id,
        PaymentConnection.name == connection.name
    ).first()
    
    if existing:
        if existing.status == "connected":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Connection '{connection.name}' is already connected"
            )
        else:
            # Connection exists but is disconnected - reuse it and preserve allocated_transaction_ids
            logger.info(f"Reconnecting existing connection '{connection.name}' (ID: {existing.id}) - preserving allocated_transaction_ids")
            
            # Preserve allocated_transaction_ids from existing connection
            preserved_allocated_ids = []
            if existing.connection_data:
                try:
                    if isinstance(existing.connection_data, str):
                        existing_data = json.loads(existing.connection_data)
                    else:
                        existing_data = existing.connection_data
                    if isinstance(existing_data, dict):
                        preserved_allocated_ids = existing_data.get("allocated_transaction_ids", [])
                        logger.info(f"Preserving {len(preserved_allocated_ids)} allocated transaction IDs: {preserved_allocated_ids[:5]}...")
                except Exception as e:
                    logger.warning(f"Error parsing existing connection_data: {e}")
            
            # connection.connection_data already contains merged mock_data from router
            # Just preserve allocated_transaction_ids
            connection_data_json = None
            if connection.connection_data:
                merged_data = connection.connection_data.copy()
            else:
                merged_data = {}
            
            # CRITICAL: Restore preserved allocated_transaction_ids
            if preserved_allocated_ids:
                merged_data["allocated_transaction_ids"] = preserved_allocated_ids
                logger.info(f"✅ Restored {len(preserved_allocated_ids)} allocated transaction IDs to reconnected connection")
            elif "allocated_transaction_ids" not in merged_data:
                merged_data["allocated_transaction_ids"] = []
            
            connection_data_json = json.dumps(merged_data)
            
            # Update existing connection instead of creating new one
            existing.status = "connected"
            existing.connection_data = connection_data_json
            existing.last_sync = get_ist_now()
            if connection.type:
                existing.type = connection.type
            if connection.icon:
                existing.icon = connection.icon
            
            db.commit()
            db.refresh(existing)
            
            # Parse connection_data back to dict for response
            if existing.connection_data:
                try:
                    existing.connection_data = json.loads(existing.connection_data)
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"Error parsing connection_data for reconnected connection {existing.name}: {e}")
                    existing.connection_data = {
                        "allocated_transaction_ids": preserved_allocated_ids,
                        "transactions": [],
                        "entries": [],
                        "monthly_summary": {},
                        "account_id": None,
                        "status": "connected",
                        "balance": 0
                    }
            
            return existing
    
    # Convert connection_data dict to JSON string
    connection_data_json = None
    if connection.connection_data:
        connection_data_json = json.dumps(connection.connection_data)
    
    db_connection = PaymentConnection(
        user_id=user_id,
        name=connection.name,
        type=connection.type,
        icon=connection.icon,
        status="connected",
        connection_data=connection_data_json,
        last_sync=get_ist_now()
    )
    
    db.add(db_connection)
    db.commit()
    db.refresh(db_connection)
    
    # Parse connection_data back to dict for response
    if db_connection.connection_data:
        try:
            db_connection.connection_data = json.loads(db_connection.connection_data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Error parsing connection_data for new connection {db_connection.name}: {e}")
            db_connection.connection_data = {
                "allocated_transaction_ids": [],
                "transactions": [],
                "entries": [],
                "monthly_summary": {},
                "account_id": None,
                "status": "connected",
                "balance": 0
            }
    
    return db_connection

def get_user_connections(db: Session, user_id: UUID, status_filter: Optional[str] = None, parse_json: bool = True):
    """Get all connections for a user - optimized with lazy JSON parsing and caching"""
    try:
        query = db.query(PaymentConnection).filter(PaymentConnection.user_id == user_id)
        
        if status_filter:
            query = query.filter(PaymentConnection.status == status_filter)
        
        connections = query.all()
        
        # Only parse JSON if requested (lazy parsing for better performance)
        # Most endpoints don't need parsed JSON immediately
        if parse_json:
            for conn in connections:
                # Handle None connection_data - initialize empty structure
                if conn.connection_data is None:
                    logger.warning(f"Connection '{conn.name}' (id: {conn.id}) has NULL connection_data in database - initializing empty structure")
                    conn.connection_data = {
                        "allocated_transaction_ids": [],
                        "transactions": [],
                        "entries": [],
                        "monthly_summary": {},
                        "account_id": None,
                        "status": "connected",
                        "balance": 0
                    }
                    continue  # Skip parsing since we just initialized it
                
                if conn.connection_data:
                    try:
                        if isinstance(conn.connection_data, str):
                            # Use faster json.loads with object_hook for large JSON
                            conn.connection_data = json.loads(conn.connection_data)
                        elif isinstance(conn.connection_data, dict):
                            # Already a dict, keep as is
                            pass
                        else:
                            # Unexpected type, initialize empty structure
                            logger.warning(f"Connection {conn.id} has unexpected connection_data type: {type(conn.connection_data)}")
                            conn.connection_data = {
                                "allocated_transaction_ids": [],
                                "transactions": [],
                                "entries": [],
                                "monthly_summary": {},
                                "account_id": None,
                                "status": "connected",
                                "balance": 0
                            }
                    except (json.JSONDecodeError, TypeError, ValueError) as e:
                        # Log error but don't fail - initialize empty structure instead of None
                        logger.error(f"Error parsing connection_data for connection {conn.id} ({conn.name}): {e}")
                        logger.error(f"Raw connection_data value: {str(conn.connection_data)[:200] if conn.connection_data else 'None'}...")
                        conn.connection_data = {
                            "allocated_transaction_ids": [],
                            "transactions": [],
                            "entries": [],
                            "monthly_summary": {},
                            "account_id": None,
                            "status": "connected",
                            "balance": 0
                        }
                        logger.warning(f"Initialized empty connection_data structure for connection {conn.id} ({conn.name}) due to parsing error")
        
        return connections
    except Exception as e:
        logger.error(f"Error getting connections for user {user_id}: {e}")
        # Return empty list on error instead of raising
        return []

def get_connection_by_id(db: Session, connection_id: UUID, user_id: UUID):
    """Get a specific connection by ID (ensuring it belongs to the user)"""
    connection = db.query(PaymentConnection).filter(
        PaymentConnection.id == connection_id,
        PaymentConnection.user_id == user_id
    ).first()
    
    if not connection:
        return None
    
    # Parse connection_data from JSON string to dict
    if connection.connection_data:
        try:
            connection.connection_data = json.loads(connection.connection_data)
        except (json.JSONDecodeError, TypeError):
            connection.connection_data = None
    
    return connection

def disconnect_connection(db: Session, connection_id: UUID, user_id: UUID):
    """Disconnect a payment connection - marks as disconnected instead of deleting to preserve allocated_transaction_ids"""
    # Get connection directly from database without parsing to avoid JSON encoding issues
    connection = db.query(PaymentConnection).filter(
        PaymentConnection.id == connection_id,
        PaymentConnection.user_id == user_id
    ).first()
    
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    # Store connection_data before disconnecting (parse it for return value)
    connection_data = None
    if connection.connection_data:
        try:
            # Parse for return value
            if isinstance(connection.connection_data, str):
                connection_data = json.loads(connection.connection_data)
            else:
                connection_data = connection.connection_data
        except (json.JSONDecodeError, TypeError):
            connection_data = None
    
    # Mark as disconnected instead of deleting - this preserves allocated_transaction_ids
    # so reconnecting won't cause duplicate allocations
    # CRITICAL: connection_data is already a JSON string from the database, so we don't need to re-encode it
    connection.status = "disconnected"
    db.commit()
    db.refresh(connection)
    
    logger.info(f"Connection '{connection.name}' marked as disconnected (preserving allocated_transaction_ids for future reconnect)")
    
    return connection_data

def update_connection(db: Session, connection_id: UUID, user_id: UUID, connection_update: ConnectionUpdate):
    """Update a payment connection"""
    # CRITICAL: Get connection directly from database to avoid parsing issues
    connection = db.query(PaymentConnection).filter(
        PaymentConnection.id == connection_id,
        PaymentConnection.user_id == user_id
    ).first()
    
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    if connection_update.status is not None:
        connection.status = connection_update.status
    
    if connection_update.connection_data is not None:
        # CRITICAL: Get fresh data directly from database to avoid stale reads
        # Expire and refresh to ensure we have the latest connection_data from DB
        db.expire(connection)
        db.refresh(connection)
        
        # Also query directly from database as a double-check
        from sqlalchemy import text
        result = db.execute(
            text("SELECT connection_data FROM payment_connections WHERE id = :id AND user_id = :user_id"),
            {"id": connection_id, "user_id": user_id}
        ).first()
        
        # Use the direct query result if available, otherwise use the refreshed connection object
        raw_connection_data = result[0] if result and result[0] else connection.connection_data
        
        # CRITICAL: Merge with existing connection_data instead of replacing
        # This prevents losing transactions when only updating allocated_transaction_ids
        existing_data = {}
        if raw_connection_data:
            try:
                if isinstance(raw_connection_data, str):
                    existing_data = json.loads(raw_connection_data)
                elif isinstance(raw_connection_data, dict):
                    existing_data = raw_connection_data
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"❌ Failed to parse existing connection_data in update_connection: {e}")
                existing_data = {}
        else:
            logger.warning(f"⚠️ update_connection: connection_data is NULL in database for '{connection.name}' - will merge with update data only")
        
        # Log what we're merging
        logger.info(f"🔄 update_connection: Existing data has {len(existing_data.get('transactions', []))} transactions, update has {len(connection_update.connection_data.get('transactions', []))} transactions")
        
        # Merge: new data overwrites existing, but preserve fields not in update
        merged_data = {**existing_data, **connection_update.connection_data}
        
        # CRITICAL: Preserve transactions and entries if they exist in existing_data but not in update
        if "transactions" in existing_data and "transactions" not in connection_update.connection_data:
            merged_data["transactions"] = existing_data["transactions"]
            logger.info(f"✅ update_connection: Preserved {len(existing_data['transactions'])} transactions from existing_data")
        if "entries" in existing_data and "entries" not in connection_update.connection_data:
            merged_data["entries"] = existing_data["entries"]
            logger.info(f"✅ update_connection: Preserved {len(existing_data['entries'])} entries from existing_data")
        if "monthly_summary" in existing_data and "monthly_summary" not in connection_update.connection_data:
            merged_data["monthly_summary"] = existing_data["monthly_summary"]
        
        # Save merged data
        connection.connection_data = json.dumps(merged_data)
        logger.info(f"✅ update_connection: Merged connection_data for '{connection.name}' (preserved {len(merged_data.get('transactions', []))} transactions, {len(merged_data.get('entries', []))} entries)")
    
    if connection_update.last_sync is not None:
        connection.last_sync = connection_update.last_sync
    elif connection_update.status == "connected":
        # Auto-update last_sync when reconnecting
        connection.last_sync = get_ist_now()
    
    db.commit()
    db.refresh(connection)
    
    # Parse connection_data back to dict
    if connection.connection_data:
        try:
            connection.connection_data = json.loads(connection.connection_data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse connection_data after update: {e}")
            connection.connection_data = {
                "allocated_transaction_ids": [],
                "transactions": [],
                "entries": [],
                "monthly_summary": {},
                "account_id": None,
                "status": "connected",
                "balance": 0
            }
    
    return connection

def sync_connection(db: Session, connection_id: UUID, user_id: UUID):
    """Sync a connection (reload mock data from JSON file and update last_sync timestamp)"""
    connection = get_connection_by_id(db, connection_id, user_id)
    
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    # Reload mock data from JSON file to pick up admin panel changes
    import os
    from pathlib import Path
    import logging
    logger = logging.getLogger(__name__)
    
    # CRITICAL: Query database directly to get latest connection_data as JSON string
    # This ensures we have the most recent allocated_transaction_ids that might have been saved
    # by background allocation tasks (which run in separate database sessions)
    # IMPORTANT: First, expire and refresh to get latest data from database
    # Also flush any pending changes to ensure we're reading committed data
    db.expire(connection)
    db.flush()  # Flush any pending changes
    db.refresh(connection)
    
    # Get raw connection_data - try multiple methods to ensure we get the data
    from models import PaymentConnection
    raw_connection_data_str = None
    
    # Method 1: Try to get from connection object (might be parsed dict from get_connection_by_id)
    # But get_connection_by_id parses it to dict, so if it's None here, the DB column is NULL
    if connection.connection_data:
        if isinstance(connection.connection_data, dict):
            # Already parsed to dict, convert back to JSON string
            raw_connection_data_str = json.dumps(connection.connection_data)
            logger.info(f"🔄 Sync: ✅ Got connection_data from connection object (dict, length: {len(raw_connection_data_str)} chars)")
        elif isinstance(connection.connection_data, str):
            # Already a string, use it directly
            raw_connection_data_str = connection.connection_data
            logger.info(f"🔄 Sync: ✅ Got connection_data from connection object (string, length: {len(raw_connection_data_str)} chars)")
    
    # Method 2: If connection object doesn't have it, try SQL query with explicit commit check
    if not raw_connection_data_str:
        try:
            # Force a fresh query by expiring and refreshing again
            db.expire(connection, ['connection_data'])
            db.refresh(connection, ['connection_data'])
            
            # If still None, try direct SQL query
            if not connection.connection_data:
                from sqlalchemy import text
                result = db.execute(
                    text("SELECT connection_data FROM payment_connections WHERE id = :id AND user_id = :user_id"),
                    {"id": connection_id, "user_id": user_id}
                ).first()
                
                if result and result[0] is not None:
                    raw_connection_data_str = result[0]
                    logger.info(f"🔄 Sync: ✅ Retrieved raw connection_data from database via SQL (length: {len(raw_connection_data_str)} chars)")
                else:
                    logger.warning(f"⚠️  Sync: SQL query returned None for connection '{connection.name}' (id: {connection_id}) - connection_data column is NULL in database")
            else:
                # Got it after refresh
                if isinstance(connection.connection_data, dict):
                    raw_connection_data_str = json.dumps(connection.connection_data)
                elif isinstance(connection.connection_data, str):
                    raw_connection_data_str = connection.connection_data
        except Exception as e:
            logger.warning(f"⚠️  Sync: SQL query failed: {e}")
    
    if not raw_connection_data_str:
        logger.warning(f"⚠️  Sync: connection_data is None/empty for '{connection.name}' - will initialize empty allocated_transaction_ids list")
    
    # Map connection name to filename (same logic as in connections.py)
    filename_map = {
        "PhonePe": "phonepe.json",
        "Google Pay": "gpay.json",
        "GPay": "gpay.json",
        "Paytm": "paytm.json",
        "HDFC Bank": "hdfc.json",
        "ICICI Bank": "icici.json",
        "SBI Bank": "sbi.json",
        "Cash Income": "cash_income.json",
        "testincome": "testincome.json",
        "testspend": "testspend.json"
    }
    
    filename = filename_map.get(connection.name, f"{connection.name.lower().replace(' ', '_')}.json")
    mock_data_dir = Path(__file__).parent / "mock_data"
    file_path = mock_data_dir / filename
    
    logger.info(f"🔄 Sync: Looking for mock data file at: {file_path}")
    logger.info(f"🔄 Sync: File exists: {file_path.exists()}")
    logger.info(f"🔄 Sync: Mock data directory: {mock_data_dir}")
    logger.info(f"🔄 Sync: Current file location: {Path(__file__).parent}")
    
    # If JSON file exists, reload it and update connection_data
    if file_path.exists():
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"🔄 Sync: Found mock data file: {filename} for connection '{connection.name}'")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                fresh_mock_data = json.load(f)
            logger.info(f"🔄 Sync: Successfully loaded JSON from {filename}")
            
            # Merge with existing connection_data to preserve any custom fields
            existing_data = {}
            # CRITICAL: Preserve allocated_transaction_ids FIRST before anything else
            preserved_allocated_ids = []
            
            # IMPORTANT: Use raw_connection_data_str (from direct database query) instead of connection.connection_data
            # This ensures we get the latest data that might have been saved by background tasks
            connection_data_to_parse = raw_connection_data_str if raw_connection_data_str else connection.connection_data
            
            if connection_data_to_parse:
                try:
                    # connection_data is ALWAYS a string in the database (stored as JSON)
                    if isinstance(connection_data_to_parse, str):
                        existing_data = json.loads(connection_data_to_parse)
                    elif isinstance(connection_data_to_parse, dict):
                        # If it's already a dict (from get_connection_by_id parsing), use it
                        existing_data = connection_data_to_parse
                    else:
                        existing_data = {}
                    
                    # Extract allocated_transaction_ids before we overwrite anything
                    preserved_allocated_ids = existing_data.get("allocated_transaction_ids", [])
                    if preserved_allocated_ids:
                        logger.info(f"🔄 Sync: ✅ Preserving {len(preserved_allocated_ids)} allocated transaction IDs from existing connection_data: {preserved_allocated_ids[:5]}...")
                    else:
                        logger.warning(f"⚠️  Sync: No allocated_transaction_ids found in existing connection_data for '{connection.name}' (keys: {list(existing_data.keys()) if existing_data else 'empty'})")
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"⚠️  Sync: Failed to parse existing connection_data: {e}")
                    existing_data = {}
            else:
                logger.warning(f"⚠️  Sync: connection_data is None for '{connection.name}' (raw_connection_data_str: {raw_connection_data_str is not None}, connection.connection_data: {connection.connection_data is not None})")
            
            # Update transactions/entries from fresh mock data, but keep other fields
            logger.info(f"🔄 Sync: Fresh mock data keys: {list(fresh_mock_data.keys())}")
            logger.info(f"🔄 Sync: Fresh mock data type: {type(fresh_mock_data)}")
            logger.info(f"🔄 Sync: Fresh mock data preview: {str(fresh_mock_data)[:500]}")
            
            if "transactions" in fresh_mock_data:
                transaction_count = len(fresh_mock_data.get("transactions", []))
                logger.info(f"🔄 Sync: Found {transaction_count} transactions in file {filename}")
                existing_data["transactions"] = fresh_mock_data["transactions"]
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"🔄 Sync: ✅ Loaded {transaction_count} transactions from {filename} for connection '{connection.name}'")
                logger.info(f"🔄 Sync: ✅ existing_data['transactions'] length after assignment: {len(existing_data.get('transactions', []))}")
                # Log sample transaction IDs
                if transaction_count > 0:
                    sample_txns = fresh_mock_data.get("transactions", [])[:3]
                    sample_ids = [t.get("id", "no-id")[:30] for t in sample_txns if isinstance(t, dict)]
                    logger.info(f"🔄 Sync: Sample transaction IDs from file: {sample_ids}")
                else:
                    logger.error(f"❌ Sync: File {filename} has 'transactions' key but array is EMPTY! This is the problem!")
            else:
                logger.error(f"❌ Sync: File {filename} does NOT have 'transactions' key! Available keys: {list(fresh_mock_data.keys())}")
            if "entries" in fresh_mock_data:
                entry_count = len(fresh_mock_data.get("entries", []))
                existing_data["entries"] = fresh_mock_data["entries"]
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"🔄 Sync: Loaded {entry_count} entries from {filename} for connection '{connection.name}'")
                # Log sample entry IDs
                if entry_count > 0:
                    sample_entries = fresh_mock_data.get("entries", [])[:3]
                    sample_ids = [e.get("id", "no-id")[:30] for e in sample_entries if isinstance(e, dict)]
                    logger.info(f"🔄 Sync: Sample entry IDs from file: {sample_ids}")
            if "monthly_summary" in fresh_mock_data:
                existing_data["monthly_summary"] = fresh_mock_data["monthly_summary"]
            
            # Preserve other fields from existing data
            for key in ["account_id", "status", "balance"]:
                if key not in existing_data and key in fresh_mock_data:
                    existing_data[key] = fresh_mock_data[key]
            
            # CRITICAL: Preserve allocated_transaction_ids to prevent double allocation
            # This list tracks which transactions have already been allocated to goals
            # Always restore preserved IDs, even if existing_data doesn't have them
            # This is the MOST IMPORTANT field to preserve - without it, transactions get allocated multiple times!
            if preserved_allocated_ids:
                existing_data["allocated_transaction_ids"] = preserved_allocated_ids
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"🔄 Sync: ✅ Restored {len(preserved_allocated_ids)} allocated transaction IDs to connection_data: {preserved_allocated_ids[:5]}...")
            elif "allocated_transaction_ids" in existing_data:
                # Keep the existing allocated_transaction_ids list if preserved_allocated_ids is empty
                # Don't overwrite it with fresh_mock_data (which doesn't have this field)
                import logging
                logger = logging.getLogger(__name__)
                existing_count = len(existing_data.get("allocated_transaction_ids", []))
                logger.info(f"🔄 Sync: Keeping existing {existing_count} allocated transaction IDs from existing_data")
            else:
                # No allocated_transaction_ids found - initialize empty list to prevent errors
                existing_data["allocated_transaction_ids"] = []
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"⚠️  Sync: No allocated_transaction_ids found, initializing empty list for '{connection.name}'")
            
            # CRITICAL: Ensure connection_data is ALWAYS saved, even if it was NULL before
            # Convert existing_data to JSON string and save it
            transaction_count_before_save = len(existing_data.get("transactions", []))
            entry_count_before_save = len(existing_data.get("entries", []))
            logger.info(f"🔄 Sync: Before saving - transactions: {transaction_count_before_save}, entries: {entry_count_before_save}")
            logger.info(f"🔄 Sync: existing_data keys before save: {list(existing_data.keys())}")
            
            connection_data_json = json.dumps(existing_data)
            connection.connection_data = connection_data_json
            
            # CRITICAL: Explicitly commit to ensure data is persisted
            db.flush()  # Flush before commit to catch any errors
            
            logger.info(f"🔄 Sync: ✅ Updated connection_data for '{connection.name}' with fresh data from {filename}")
            logger.info(f"🔄 Sync: JSON length: {len(connection_data_json)} chars")
            logger.info(f"🔄 Sync: Transactions in saved data: {transaction_count_before_save}")
            logger.info(f"🔄 Sync: Entries in saved data: {entry_count_before_save}")
            logger.info(f"🔄 Sync: Allocated IDs: {len(existing_data.get('allocated_transaction_ids', []))}")
        except Exception as e:
            # If reload fails, log error but continue with sync
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"❌ Failed to reload mock data from {filename}: {e}", exc_info=True)
            # Don't save empty structure if file load failed - keep existing data or initialize properly
            if not existing_data or not existing_data.get("transactions") and not existing_data.get("entries"):
                logger.error(f"❌ Sync failed for '{connection.name}' - no data to save. File: {file_path}")
    else:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"❌ Mock data file not found: {file_path} for connection '{connection.name}' (expected filename: {filename})")
        logger.error(f"❌ Current working directory: {Path.cwd()}")
        logger.error(f"❌ File path absolute: {file_path.absolute()}")
        logger.error(f"❌ Mock data directory exists: {mock_data_dir.exists()}")
        if mock_data_dir.exists():
            logger.error(f"❌ Files in mock_data directory: {list(mock_data_dir.iterdir())}")
        # If file doesn't exist, don't overwrite existing data with empty structure
        # Only initialize if connection_data is completely None
        if connection.connection_data is None:
            logger.warning(f"⚠️  Connection '{connection.name}' has no file and no existing data - initializing empty structure")
            connection.connection_data = json.dumps({
                "allocated_transaction_ids": [],
                "transactions": [],
                "entries": [],
                "monthly_summary": {},
                "account_id": None,
                "status": "connected",
                "balance": 0
            })
        else:
            logger.warning(f"⚠️  File not found but connection has existing data - preserving it")
    
    connection.last_sync = datetime.now(timezone.utc)
    
    # CRITICAL: Ensure connection_data is never NULL - initialize if needed
    if connection.connection_data is None:
        logger.warning(f"⚠️  Sync: connection_data is None before commit, initializing with empty structure")
        connection.connection_data = json.dumps({
            "allocated_transaction_ids": [],
            "transactions": [],
            "entries": [],
            "monthly_summary": {},
            "account_id": None,
            "status": "connected",
            "balance": 0
        })
    
    # Commit the changes
    try:
        db.commit()
        logger.info(f"🔄 Sync: ✅ Committed changes to database for '{connection.name}'")
    except Exception as e:
        logger.error(f"❌ Sync: CRITICAL - Failed to commit changes: {e}", exc_info=True)
        db.rollback()
        raise
    
    # CRITICAL: Refresh to verify the data was saved
    db.refresh(connection)
    
    # Verify connection_data was saved - query directly from database to be sure
    from sqlalchemy import text
    result = db.execute(
        text("SELECT connection_data FROM payment_connections WHERE id = :id"),
        {"id": connection_id}
    ).first()
    
    if result and result[0]:
        logger.info(f"🔄 Sync: ✅ Verified connection_data saved to database (length: {len(result[0])} chars)")
        # Verify it has transactions
        try:
            saved_data = json.loads(result[0])
            txn_count = len(saved_data.get("transactions", []))
            logger.info(f"🔄 Sync: ✅ Verified {txn_count} transactions in saved connection_data")
        except:
            logger.warning(f"🔄 Sync: ⚠️ Could not parse saved connection_data to verify transactions")
    else:
        logger.error(f"❌ Sync: CRITICAL - connection_data is still NULL after commit for '{connection.name}'!")
        logger.error(f"❌ Sync: This means the commit failed or was rolled back!")
    
    # Parse connection_data back to dict
    if connection.connection_data:
        try:
            connection.connection_data = json.loads(connection.connection_data)
            # Verify allocated_transaction_ids are preserved after sync
            if isinstance(connection.connection_data, dict):
                allocated_count = len(connection.connection_data.get("allocated_transaction_ids", []))
                import logging
                logger = logging.getLogger(__name__)
                if allocated_count > 0:
                    logger.info(f"🔄 Sync: ✅ Verified {allocated_count} allocated transaction IDs preserved after sync for '{connection.name}'")
                else:
                    logger.warning(f"⚠️  Sync: No allocated_transaction_ids found after sync for '{connection.name}' - this may cause duplicate allocations!")
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"❌ Sync: Failed to parse connection_data JSON for '{connection.name}' after commit: {e}")
            logger.error(f"❌ Sync: Raw connection_data value: {str(connection.connection_data)[:200]}...")
            # Initialize with empty structure instead of None to prevent frontend errors
            connection.connection_data = {
                "allocated_transaction_ids": [],
                "transactions": [],
                "entries": [],
                "monthly_summary": {},
                "account_id": None,
                "status": "connected",
                "balance": 0
            }
            logger.warning(f"⚠️  Sync: Initialized empty connection_data structure for '{connection.name}' due to parsing error")
    
    return connection

# Goal CRUD operations
def create_goal(db: Session, user_id: UUID, goal: GoalCreate):
    """Create a new goal for a user"""
    # For emergency funds or goals without deadline, set a far future date
    # Emergency funds don't have deadlines, so use a default far future date (10 years)
    deadline = goal.deadline
    if deadline is None:
        # Set to 10 years from now as default (effectively no deadline)
        # Use timezone-aware datetime for PostgreSQL DateTime(timezone=True)
        deadline = get_ist_now() + timedelta(days=3650)
    
    db_goal = Goal(
        user_id=user_id,
        name=goal.name,
        target=goal.target,
        saved=goal.saved or 0,
        deadline=deadline,
        type=goal.type
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

def get_user_goals(db: Session, user_id: UUID, include_completed: bool = True):
    """Get all goals for a user - optimized with indexes"""
    query = db.query(Goal).filter(Goal.user_id == user_id)
    if not include_completed:
        query = query.filter(Goal.is_completed == False)  # Uses index on is_completed
    return query.order_by(Goal.created_at.desc()).all()

def get_goal_by_id(db: Session, goal_id: UUID, user_id: UUID):
    """Get a specific goal by ID (ensuring it belongs to the user)"""
    return db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == user_id
    ).first()

def update_goal(db: Session, goal_id: UUID, user_id: UUID, goal_update: GoalUpdate):
    """Update a goal"""
    goal = get_goal_by_id(db, goal_id, user_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    if goal_update.name is not None:
        goal.name = goal_update.name
    if goal_update.target is not None:
        goal.target = goal_update.target
    if goal_update.saved is not None:
        goal.saved = goal_update.saved
    if goal_update.deadline is not None:
        goal.deadline = goal_update.deadline
    if goal_update.type is not None:
        goal.type = goal_update.type
    if goal_update.is_completed is not None:
        goal.is_completed = goal_update.is_completed
    
    db.commit()
    db.refresh(goal)
    return goal

def delete_goal(db: Session, goal_id: UUID, user_id: UUID):
    """Delete a goal"""
    goal = get_goal_by_id(db, goal_id, user_id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    db.delete(goal)
    db.commit()
    return True

# Manual Transaction CRUD operations
def create_manual_transaction(db: Session, user_id: UUID, transaction: ManualTransactionCreate):
    """Create a new manual transaction"""
    db_transaction = ManualTransaction(
        user_id=user_id,
        amount=transaction.amount,
        type=transaction.type,
        category=transaction.category,
        description=transaction.description,
        source=transaction.source or "manual",
        transaction_date=transaction.transaction_date
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def get_monthly_transaction_total(
    db: Session,
    user_id: UUID,
    transaction_type: str,
    reference_date: datetime = None
) -> float:
    """
    Calculate the total amount for a transaction type within the month of the reference date.
    Defaults to the current month if no reference date is provided.
    """
    if transaction_type not in ["income", "expense"]:
        raise ValueError("transaction_type must be either 'income' or 'expense'")
    
    if reference_date is None:
        reference_date = get_ist_now()
    else:
        reference_date = to_ist(reference_date)
    
    start_of_month = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_of_month.month == 12:
        end_of_month = start_of_month.replace(year=start_of_month.year + 1, month=1)
    else:
        end_of_month = start_of_month.replace(month=start_of_month.month + 1)
    
    total = (
        db.query(func.coalesce(func.sum(ManualTransaction.amount), 0))
        .filter(
            ManualTransaction.user_id == user_id,
            ManualTransaction.type == transaction_type,
            ManualTransaction.transaction_date >= start_of_month,
            ManualTransaction.transaction_date < end_of_month
        )
        .scalar()
    )
    
    return float(total or 0)

def get_connection_monthly_totals(
    db: Session,
    user_id: UUID,
    reference_date: datetime = None
) -> Tuple[float, float]:
    """
    Calculate monthly totals (income, expense) from connected payment gateways.
    """
    if reference_date is None:
        reference_date = get_ist_now()
    else:
        reference_date = to_ist(reference_date)
    
    start_of_month = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_of_month.month == 12:
        end_of_month = start_of_month.replace(year=start_of_month.year + 1, month=1)
    else:
        end_of_month = start_of_month.replace(month=start_of_month.month + 1)
    
    connections = get_user_connections(db, user_id, status_filter="connected", parse_json=True)
    
    total_income = 0.0
    total_expense = 0.0
    
    def parse_timestamp(value):
        if not value:
            return None
        try:
            if isinstance(value, str):
                ts = value.replace("Z", "+00:00")
                dt = datetime.fromisoformat(ts)
            elif isinstance(value, (int, float)):
                dt = datetime.fromtimestamp(value, tz=timezone.utc)
            elif isinstance(value, datetime):
                dt = value
            else:
                return None
            return to_ist(dt)
        except Exception:
            return None
    
    for connection in connections:
        conn_data = connection.connection_data if isinstance(connection.connection_data, dict) else None
        if not conn_data:
            continue
        transactions = conn_data.get("transactions", [])
        if not isinstance(transactions, list):
            continue
        for txn in transactions:
            if not isinstance(txn, dict):
                continue
            txn_date = parse_timestamp(txn.get("timestamp"))
            if not txn_date:
                continue
            if not (start_of_month <= txn_date < end_of_month):
                continue
            amount = float(txn.get("amount") or 0)
            txn_type = str(txn.get("type") or "").lower()
            if txn_type == "credit":
                total_income += amount
            elif txn_type == "debit":
                total_expense += amount
    
    return float(total_income), float(total_expense)

def get_monthly_budget_context(db: Session, user: User, reference_date: datetime = None) -> dict:
    """
    Build a monthly budget context combining manual and connection transactions.
    """
    if reference_date is None:
        reference_date = get_ist_now()
    else:
        reference_date = to_ist(reference_date)
    
    manual_income = get_monthly_transaction_total(db, user.id, "income", reference_date)
    manual_expense = get_monthly_transaction_total(db, user.id, "expense", reference_date)
    connection_income, connection_expense = get_connection_monthly_totals(db, user.id, reference_date)
    
    total_income = manual_income + connection_income
    total_expense = manual_expense + connection_expense
    
    if user.monthly_budget:
        budget_value = float(user.monthly_budget)
    elif total_income > 0:
        budget_value = max(total_income * 0.4, 0)
    else:
        budget_value = 5000.0
    
    remaining_budget = budget_value - total_expense
    
    return {
        "manual_income_total": manual_income,
        "manual_expense_total": manual_expense,
        "connection_income_total": connection_income,
        "connection_expense_total": connection_expense,
        "total_income": total_income,
        "total_expense": total_expense,
        "budget": budget_value,
        "remaining": remaining_budget,
    }

def get_user_transactions(db: Session, user_id: UUID, transaction_type: Optional[str] = None, limit: Optional[int] = None, offset: Optional[int] = None):
    """Get all manual transactions for a user - optimized with indexes and pagination"""
    query = db.query(ManualTransaction).filter(ManualTransaction.user_id == user_id)
    if transaction_type:
        query = query.filter(ManualTransaction.type == transaction_type)
    # Order by indexed column for faster sorting
    query = query.order_by(ManualTransaction.transaction_date.desc())
    # Add pagination support
    if offset is not None:
        query = query.offset(offset)
    if limit:
        query = query.limit(limit)
    return query.all()

def get_transaction_by_id(db: Session, transaction_id: UUID, user_id: UUID):
    """Get a specific transaction by ID"""
    return db.query(ManualTransaction).filter(
        ManualTransaction.id == transaction_id,
        ManualTransaction.user_id == user_id
    ).first()

def delete_transaction(db: Session, transaction_id: UUID, user_id: UUID):
    """Delete a transaction"""
    transaction = get_transaction_by_id(db, transaction_id, user_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    db.delete(transaction)
    db.commit()
    return True

# Investment CRUD operations
def create_investment(db: Session, user_id: UUID, investment: InvestmentCreate):
    """Create a new investment for a user"""
    db_investment = Investment(
        user_id=user_id,
        name=investment.name,
        type=investment.type,
        invested_amount=investment.invested_amount or 0,
        current_value=investment.current_value or investment.invested_amount or 0,
        expected_returns=investment.expected_returns,
        risk_level=investment.risk_level,
        min_investment=investment.min_investment,
        description=investment.description,
        icon=investment.icon,
    )
    db.add(db_investment)
    db.commit()
    db.refresh(db_investment)
    return db_investment

def get_user_investments(db: Session, user_id: UUID):
    """Get all investments for a user"""
    return db.query(Investment).filter(Investment.user_id == user_id).order_by(Investment.created_at.desc()).all()

def get_investment_by_id(db: Session, investment_id: UUID, user_id: UUID):
    """Get a specific investment by ID"""
    return db.query(Investment).filter(
        Investment.id == investment_id,
        Investment.user_id == user_id
    ).first()

def update_investment(db: Session, investment_id: UUID, user_id: UUID, investment_update: InvestmentUpdate):
    """Update an investment"""
    investment = get_investment_by_id(db, investment_id, user_id)
    if not investment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Investment not found"
        )
    
    update_data = investment_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(investment, field, value)
    
    db.commit()
    db.refresh(investment)
    return investment

def delete_investment(db: Session, investment_id: UUID, user_id: UUID):
    """Delete an investment"""
    investment = get_investment_by_id(db, investment_id, user_id)
    if not investment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Investment not found"
        )
    db.delete(investment)
    db.commit()
    return True
