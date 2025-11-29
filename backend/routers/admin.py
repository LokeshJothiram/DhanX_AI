from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email, get_password_hash
from crud import (
    get_user_by_email, 
    get_user_by_id, 
    update_user, 
    delete_user, 
    update_user_password,
    get_user_connections,
    get_user_goals,
    get_user_transactions,
    get_user_investments
)
from schemas import UserResponse, UserUpdate, MessageResponse
from models import User
from typing import List, Dict, Any, Optional
from uuid import UUID
import json
import os
from pathlib import Path
from datetime import datetime
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/admin", tags=["admin"])
security = HTTPBearer()

# Admin emails
ADMIN_EMAILS = [
    "lokesh.jothiram@tringapps.net",
    "itslokelokesh06@gmail.com"
]

# Mock data directory path
MOCK_DATA_DIR = Path(__file__).parent.parent / "mock_data"

class TransactionCreate(BaseModel):
    amount: float
    type: str  # "credit" or "debit" for UPI files, "Income" for cash_income
    description: str
    timestamp: Optional[str] = None  # ISO format timestamp
    date: Optional[str] = None  # For cash_income format
    status: Optional[str] = "completed"
    category: Optional[str] = None  # For cash_income

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    description: Optional[str] = None
    timestamp: Optional[str] = None
    date: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None

def is_admin(email: str) -> bool:
    """Check if user is an admin"""
    return email in ADMIN_EMAILS

def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Dependency to get admin user"""
    email = get_current_user_email(credentials.credentials)
    if not is_admin(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

def load_mock_file(filename: str) -> Dict[str, Any]:
    """Load a mock data JSON file"""
    filepath = MOCK_DATA_DIR / filename
    if not filepath.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock data file '{filename}' not found"
        )
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid JSON in file '{filename}': {str(e)}"
        )

def save_mock_file(filename: str, data: Dict[str, Any]):
    """Save data to a mock data JSON file"""
    filepath = MOCK_DATA_DIR / filename
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file '{filename}': {str(e)}"
        )

def get_file_type(filename: str) -> str:
    """Determine the file type based on filename"""
    if filename == "cash_income.json":
        return "cash_income"
    elif filename in ["testincome.json", "testspend.json"]:
        return "test"
    else:
        return "upi"  # gpay, phonepe, paytm, etc.

@router.get("/mock-files")
def list_mock_files(admin_user = Depends(get_admin_user)):
    """List all available mock data files"""
    files = []
    for filepath in MOCK_DATA_DIR.glob("*.json"):
        files.append({
            "filename": filepath.name,
            "type": get_file_type(filepath.name),
            "size": filepath.stat().st_size
        })
    return {"files": files}

@router.get("/mock-files/{filename}")
def get_mock_file(filename: str, admin_user = Depends(get_admin_user)):
    """Get the contents of a mock data file"""
    if not filename.endswith('.json'):
        filename += '.json'
    
    return load_mock_file(filename)

@router.post("/mock-files/{filename}/transactions")
def add_transaction(
    filename: str,
    transaction: TransactionCreate,
    admin_user = Depends(get_admin_user)
):
    """Add a new transaction to a mock data file"""
    if not filename.endswith('.json'):
        filename += '.json'
    
    data = load_mock_file(filename)
    file_type = get_file_type(filename)
    
    # Generate transaction ID
    if file_type == "cash_income":
        # For cash_income, use entries array
        if "entries" not in data:
            data["entries"] = []
        
        # Generate entry ID
        existing_ids = [entry.get("id", "") for entry in data["entries"]]
        entry_num = 1
        while f"entry_{entry_num:03d}" in existing_ids or f"entry_recent_{entry_num:03d}" in existing_ids:
            entry_num += 1
        
        entry_id = f"entry_recent_{entry_num:03d}"
        
        # Create entry
        entry = {
            "id": entry_id,
            "amount": transaction.amount,
            "description": transaction.description,
            "date": transaction.date or datetime.now().strftime("%Y-%m-%d"),
            "category": transaction.category or "Income"
        }
        
        data["entries"].insert(0, entry)  # Add to beginning
        
        # Update monthly summary
        if "monthly_summary" not in data:
            data["monthly_summary"] = {"total_income": 0.0, "entry_count": 0}
        data["monthly_summary"]["total_income"] = sum(e.get("amount", 0) for e in data["entries"])
        data["monthly_summary"]["entry_count"] = len(data["entries"])
        
    else:
        # For UPI/test files, use transactions array
        if "transactions" not in data:
            data["transactions"] = []
        
        # Generate transaction ID
        existing_ids = [txn.get("id", "") for txn in data["transactions"]]
        txn_num = 1
        while f"txn_{txn_num:03d}" in existing_ids or f"txn_recent_{txn_num:03d}" in existing_ids:
            txn_num += 1
        
        txn_id = f"txn_recent_{txn_num:03d}"
        
        # Use provided timestamp or current time
        timestamp = transaction.timestamp
        if not timestamp:
            timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # Create transaction
        txn = {
            "id": txn_id,
            "amount": transaction.amount,
            "type": transaction.type,
            "description": transaction.description,
            "timestamp": timestamp,
            "status": transaction.status or "completed"
        }
        
        data["transactions"].insert(0, txn)  # Add to beginning
        
        # Update monthly summary if exists
        if "monthly_summary" in data:
            if transaction.type == "credit":
                data["monthly_summary"]["total_credit"] = data["monthly_summary"].get("total_credit", 0) + transaction.amount
            elif transaction.type == "debit":
                data["monthly_summary"]["total_debit"] = data["monthly_summary"].get("total_debit", 0) + transaction.amount
            data["monthly_summary"]["transaction_count"] = len(data["transactions"])
    
    save_mock_file(filename, data)
    
    return {
        "message": "Transaction added successfully",
        "transaction_id": entry_id if file_type == "cash_income" else txn_id,
        "data": entry if file_type == "cash_income" else txn
    }

@router.put("/mock-files/{filename}/transactions/{transaction_id}")
def update_transaction(
    filename: str,
    transaction_id: str,
    transaction_update: TransactionUpdate,
    admin_user = Depends(get_admin_user)
):
    """Update a transaction in a mock data file"""
    if not filename.endswith('.json'):
        filename += '.json'
    
    data = load_mock_file(filename)
    file_type = get_file_type(filename)
    
    if file_type == "cash_income":
        # Find entry in entries array
        entries = data.get("entries", [])
        entry = next((e for e in entries if e.get("id") == transaction_id), None)
        
        if not entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction '{transaction_id}' not found"
            )
        
        # Update entry fields
        if transaction_update.amount is not None:
            entry["amount"] = transaction_update.amount
        if transaction_update.description is not None:
            entry["description"] = transaction_update.description
        if transaction_update.date is not None:
            entry["date"] = transaction_update.date
        if transaction_update.category is not None:
            entry["category"] = transaction_update.category
        
        # Update monthly summary
        if "monthly_summary" in data:
            data["monthly_summary"]["total_income"] = sum(e.get("amount", 0) for e in entries)
            data["monthly_summary"]["entry_count"] = len(entries)
        
    else:
        # Find transaction in transactions array
        transactions = data.get("transactions", [])
        txn = next((t for t in transactions if t.get("id") == transaction_id), None)
        
        if not txn:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction '{transaction_id}' not found"
            )
        
        # Update transaction fields
        if transaction_update.amount is not None:
            txn["amount"] = transaction_update.amount
        if transaction_update.type is not None:
            txn["type"] = transaction_update.type
        if transaction_update.description is not None:
            txn["description"] = transaction_update.description
        if transaction_update.timestamp is not None:
            txn["timestamp"] = transaction_update.timestamp
        if transaction_update.status is not None:
            txn["status"] = transaction_update.status
        
        # Update monthly summary if exists
        if "monthly_summary" in data:
            total_credit = sum(t.get("amount", 0) for t in transactions if t.get("type") == "credit")
            total_debit = sum(t.get("amount", 0) for t in transactions if t.get("type") == "debit")
            data["monthly_summary"]["total_credit"] = total_credit
            data["monthly_summary"]["total_debit"] = total_debit
            data["monthly_summary"]["transaction_count"] = len(transactions)
    
    save_mock_file(filename, data)
    
    return {
        "message": "Transaction updated successfully",
        "transaction": entry if file_type == "cash_income" else txn
    }

@router.delete("/mock-files/{filename}/transactions/{transaction_id}")
def delete_transaction(
    filename: str,
    transaction_id: str,
    admin_user = Depends(get_admin_user)
):
    """Delete a transaction from a mock data file"""
    if not filename.endswith('.json'):
        filename += '.json'
    
    data = load_mock_file(filename)
    file_type = get_file_type(filename)
    
    if file_type == "cash_income":
        # Remove entry from entries array
        entries = data.get("entries", [])
        original_count = len(entries)
        data["entries"] = [e for e in entries if e.get("id") != transaction_id]
        
        if len(data["entries"]) == original_count:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction '{transaction_id}' not found"
            )
        
        # Update monthly summary
        if "monthly_summary" in data:
            data["monthly_summary"]["total_income"] = sum(e.get("amount", 0) for e in data["entries"])
            data["monthly_summary"]["entry_count"] = len(data["entries"])
        
    else:
        # Remove transaction from transactions array
        transactions = data.get("transactions", [])
        original_count = len(transactions)
        data["transactions"] = [t for t in transactions if t.get("id") != transaction_id]
        
        if len(data["transactions"]) == original_count:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transaction '{transaction_id}' not found"
            )
        
        # Update monthly summary if exists
        if "monthly_summary" in data:
            total_credit = sum(t.get("amount", 0) for t in data["transactions"] if t.get("type") == "credit")
            total_debit = sum(t.get("amount", 0) for t in data["transactions"] if t.get("type") == "debit")
            data["monthly_summary"]["total_credit"] = total_credit
            data["monthly_summary"]["total_debit"] = total_debit
            data["monthly_summary"]["transaction_count"] = len(data["transactions"])
    
    save_mock_file(filename, data)
    
    return {"message": "Transaction deleted successfully"}

# ==================== USER MANAGEMENT ENDPOINTS ====================

class UserUpdateAdmin(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    monthly_budget: Optional[float] = None
    language_preference: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None

class PasswordResetAdmin(BaseModel):
    new_password: str

@router.get("/users")
def list_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """List all users with pagination and search"""
    query = db.query(User)
    
    # Search by email or name
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_term)) |
            (User.first_name.ilike(search_term)) |
            (User.last_name.ilike(search_term))
        )
    
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    # Get statistics for each user
    users_with_stats = []
    for user in users:
        connections_count = len(get_user_connections(db, user.id, parse_json=False))
        goals_count = len(get_user_goals(db, user.id, include_completed=True))
        transactions_count = len(get_user_transactions(db, user.id))
        investments_count = len(get_user_investments(db, user.id))
        
        users_with_stats.append({
            **UserResponse.model_validate(user).model_dump(),
            "stats": {
                "connections": connections_count,
                "goals": goals_count,
                "transactions": transactions_count,
                "investments": investments_count
            }
        })
    
    return {
        "users": users_with_stats,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/users/{user_id}")
def get_user_details(
    user_id: UUID,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific user"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get all user data
    connections = get_user_connections(db, user.id, parse_json=True)
    goals = get_user_goals(db, user.id, include_completed=True)
    transactions = get_user_transactions(db, user.id, limit=50)
    investments = get_user_investments(db, user.id)
    
    # Calculate statistics
    total_goals_saved = sum(float(g.saved) for g in goals)
    total_goals_target = sum(float(g.target) for g in goals)
    active_goals = [g for g in goals if not g.is_completed]
    
    return {
        "user": UserResponse.model_validate(user).model_dump(),
        "connections": [{"id": str(c.id), "name": c.name, "type": c.type, "status": c.status} for c in connections],
        "goals": [{"id": str(g.id), "name": g.name, "target": float(g.target), "saved": float(g.saved), "is_completed": g.is_completed} for g in goals],
        "transactions": [{"id": str(t.id), "amount": float(t.amount), "type": t.type, "description": t.description, "transaction_date": t.transaction_date.isoformat()} for t in transactions],
        "investments": [{"id": str(i.id), "name": i.name, "type": i.type, "invested_amount": float(i.invested_amount), "current_value": float(i.current_value)} for i in investments],
        "statistics": {
            "connections_count": len(connections),
            "goals_count": len(goals),
            "active_goals_count": len(active_goals),
            "transactions_count": len(transactions),
            "investments_count": len(investments),
            "total_goals_saved": total_goals_saved,
            "total_goals_target": total_goals_target,
            "goals_progress_percent": (total_goals_saved / total_goals_target * 100) if total_goals_target > 0 else 0
        }
    }

@router.patch("/users/{user_id}")
def update_user_admin(
    user_id: UUID,
    user_update: UserUpdateAdmin,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Update user information (admin only)"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Convert to UserUpdate schema (excluding is_active and is_verified)
    update_data = user_update.model_dump(exclude_unset=True)
    
    # Handle is_active and is_verified separately (not in UserUpdate schema)
    if "is_active" in update_data:
        user.is_active = update_data.pop("is_active")
    if "is_verified" in update_data:
        user.is_verified = update_data.pop("is_verified")
    
    # Update other fields using existing update_user function
    if update_data:
        from schemas import UserUpdate
        user_update_schema = UserUpdate(**update_data)
        user = update_user(db, user_id, user_update_schema)
    else:
        db.commit()
        db.refresh(user)
    
    return UserResponse.model_validate(user).model_dump()

@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
def reset_user_password(
    user_id: UUID,
    password_data: PasswordResetAdmin,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Reset a user's password (admin only)"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    update_user_password(db, user.email, password_data.new_password)
    return {"message": "Password reset successfully"}

@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user_admin(
    user_id: UUID,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a user and all associated data (admin only)"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if str(user.id) == str(admin_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    delete_user(db, user_id)
    return {"message": f"User {user.email} deleted successfully"}

@router.get("/users/{user_id}/connections")
def get_user_connections_admin(
    user_id: UUID,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get all connections for a specific user"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    connections = get_user_connections(db, user.id, parse_json=True)
    return {"connections": [{"id": str(c.id), "name": c.name, "type": c.type, "status": c.status, "created_at": c.created_at.isoformat(), "last_sync": c.last_sync.isoformat() if c.last_sync else None} for c in connections]}

@router.get("/users/{user_id}/goals")
def get_user_goals_admin(
    user_id: UUID,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get all goals for a specific user"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    goals = get_user_goals(db, user.id, include_completed=True)
    return {"goals": [{"id": str(g.id), "name": g.name, "target": float(g.target), "saved": float(g.saved), "type": g.type, "is_completed": g.is_completed, "deadline": g.deadline.isoformat() if g.deadline else None} for g in goals]}

@router.get("/users/{user_id}/transactions")
def get_user_transactions_admin(
    user_id: UUID,
    limit: int = 100,
    admin_user = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get transactions for a specific user"""
    user = get_user_by_id(db, str(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    transactions = get_user_transactions(db, user.id, limit=limit)
    return {"transactions": [{"id": str(t.id), "amount": float(t.amount), "type": t.type, "description": t.description, "category": t.category, "transaction_date": t.transaction_date.isoformat()} for t in transactions]}

