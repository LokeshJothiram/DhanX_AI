"""
AI Coach Router - Endpoint for AI financial coaching queries
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import get_user_by_email, get_user_connections, get_user_goals, get_user_transactions
from services.ai_coach import orchestrate
from services.agentic_ai import agentic_orchestrate, autonomous_monitor
from typing import Optional
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coach", tags=["coach"])
security = HTTPBearer()


def map_description_to_category(description: str) -> str:
    """Map transaction description to category"""
    desc_lower = description.lower()
    if any(word in desc_lower for word in ["food", "grocery", "restaurant", "meal", "tea", "snack"]):
        return "food"
    elif any(word in desc_lower for word in ["fuel", "transport", "uber", "taxi", "ride", "delivery"]):
        return "transport"
    elif any(word in desc_lower for word in ["bill", "recharge", "internet", "electricity", "water", "phone"]):
        return "bills"
    elif any(word in desc_lower for word in ["medicine", "health", "hospital", "pharmacy"]):
        return "health"
    elif any(word in desc_lower for word in ["rent", "rental"]):
        return "rent"
    elif any(word in desc_lower for word in ["salary", "wage", "income", "payment received"]):
        return "cash_income"
    else:
        return "other"


def get_real_user_data(db: Session, user_id, user) -> dict:
    """
    Get real user data from database connections for AI coach.
    Extracts transactions from payment connections and formats them for AI agents.
    """
    transactions = []
    goals = []
    
    # Get all user connections - don't parse JSON yet (lazy parsing)
    connections = get_user_connections(db, user_id, status_filter="connected", parse_json=False)
    
    # Detach connections from session to prevent modification issues
    for conn in connections:
        db.expunge(conn)
    
    # Get manual transactions from database
    manual_transactions = get_user_transactions(db, user_id)
    for txn in manual_transactions:
        date_str = txn.transaction_date.strftime("%Y-%m-%d")
        category = txn.category or "other"
        source = txn.source or "manual"
        
        if txn.type == "income":
            # Income transaction - positive amount
            if "delivery" in (txn.description or "").lower():
                income_category = "delivery"
            elif "salary" in (txn.description or "").lower() or "wage" in (txn.description or "").lower():
                income_category = "salary"
            else:
                income_category = "cash_income"
            transactions.append((date_str, float(txn.amount), income_category, source))
        elif txn.type == "expense":
            # Expense transaction - negative amount
            transactions.append((date_str, -float(txn.amount), category, source))
    
    # Extract transactions from all connections
    for connection in connections:
        if not connection.connection_data:
            continue
            
        # Parse connection_data (it's stored as JSON string)
        # Since connections are expunged, we can safely use the parsed data
        try:
            if isinstance(connection.connection_data, str):
                conn_data = json.loads(connection.connection_data)
            elif isinstance(connection.connection_data, dict):
                conn_data = connection.connection_data
            else:
                conn_data = None
            if not conn_data:
                continue
        except (json.JSONDecodeError, TypeError):
            continue
        
        # Extract transactions from connection data
        if isinstance(conn_data, dict) and "transactions" in conn_data:
            for txn in conn_data.get("transactions", []):
                if not isinstance(txn, dict):
                    continue
                
                txn_type = txn.get("type", "").lower()
                amount = float(txn.get("amount", 0))
                description = txn.get("description", "Transaction")
                timestamp = txn.get("timestamp")
                
                # Parse date
                date_str = datetime.now().strftime("%Y-%m-%d")
                if timestamp:
                    try:
                        if isinstance(timestamp, str):
                            # Try parsing ISO format
                            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                            date_str = dt.strftime("%Y-%m-%d")
                        else:
                            date_str = timestamp.strftime("%Y-%m-%d")
                    except Exception:
                        pass
                
                # Map to category
                category = map_description_to_category(description)
                
                # Determine source
                source = connection.type.lower() if connection.type else "unknown"
                
                # Format: (date_str, amount, category, source)
                # Positive = income, Negative = expenses
                if txn_type == "credit":
                    # Income transaction - positive amount
                    # Use "cash_income", "salary", or "delivery" as category for income
                    if category == "cash_income":
                        income_category = "cash_income"
                    elif "delivery" in description.lower():
                        income_category = "delivery"
                    elif "salary" in description.lower() or "wage" in description.lower():
                        income_category = "salary"
                    else:
                        income_category = "cash_income"  # Default for income
                    transactions.append((date_str, abs(amount), income_category, source))
                elif txn_type == "debit":
                    # Expense transaction - negative amount
                    transactions.append((date_str, -abs(amount), category, source))
    
    # Get goals from database
    db_goals = get_user_goals(db, user_id, include_completed=False)
    goals = []
    for goal in db_goals:
        goals.append({
            "id": str(goal.id),
            "name": goal.name,
            "target": float(goal.target),
            "saved": float(goal.saved),
            "deadline": goal.deadline.isoformat() if goal.deadline else None,
            "type": goal.type
        })
    
    # Get user settings (default for now)
    settings = {"preferred_daily_save": 50}
    
    return {
        "name": user.first_name or "User",
        "language": "en-US",
        "transactions": transactions,
        "goals": goals,  # Empty for now, will be populated when goal models exist
        "settings": settings
    }


@router.post("/query")
async def coach_query(
    query_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Process a user query through the AI coach system.
    Runs all 4 agents (income, spending, goals, emergency) and returns LLM-generated response.
    
    Request body:
    {
        "query": "How much should I save this month?"
    }
    
    Returns:
    {
        "income": {...},
        "spending": {...},
        "goals": {...},
        "emergency": {...},
        "llm": {"text": "..."}
    }
    """
    try:
        # Get current user
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get user query
        user_query = query_data.get("query", "")
        if not user_query:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Query is required"
            )
        
        logger.info(f"Processing coach query for user {user.id}: {user_query}")
        
        # Get real user data from connections
        user_data = get_real_user_data(db, user.id, user)
        # Add user info
        user_data["user_id"] = str(user.id)
        
        logger.info(f"Loaded {len(user_data['transactions'])} transactions and {len(user_data['goals'])} goals for user {user.id}")
        
        # Run AGENTIC orchestration (agents can now take autonomous actions)
        result = agentic_orchestrate(user_data, user_query, db, user.id)
        
        if "error" in result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("details", "Internal error")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error processing coach query")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process query: {str(e)}"
        )


@router.post("/monitor")
async def autonomous_monitoring(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Autonomous monitoring endpoint - proactively checks user finances and takes actions.
    Can be called periodically (e.g., daily) to monitor and intervene.
    
    Returns:
    {
        "monitored": true,
        "interventions": [...],
        "actions_taken": [...],
        "summary": "..."
    }
    """
    try:
        # Get current user
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        logger.info(f"Running autonomous monitoring for user {user.id}")
        
        # Get real user data from connections
        user_data = get_real_user_data(db, user.id, user)
        user_data["user_id"] = str(user.id)
        
        # Run autonomous monitoring
        result = autonomous_monitor(user_data, db, user.id)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in autonomous monitoring")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run monitoring: {str(e)}"
        )

