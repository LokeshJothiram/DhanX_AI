"""
Reports Router - Endpoints for generating financial reports
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import get_user_by_email, get_user_transactions, get_user_connections
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from collections import defaultdict
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])
security = HTTPBearer()


def map_description_to_category(description: str) -> str:
    """Map transaction description to category"""
    desc_lower = description.lower()
    if any(word in desc_lower for word in ["food", "grocery", "restaurant", "meal", "tea", "snack"]):
        return "Food"
    elif any(word in desc_lower for word in ["fuel", "transport", "uber", "taxi", "ride", "delivery"]):
        return "Transport"
    elif any(word in desc_lower for word in ["bill", "recharge", "internet", "electricity", "water", "phone"]):
        return "Bills"
    elif any(word in desc_lower for word in ["medicine", "health", "hospital", "pharmacy"]):
        return "Health"
    elif any(word in desc_lower for word in ["rent", "rental"]):
        return "Rent"
    elif any(word in desc_lower for word in ["salary", "wage", "income", "payment received"]):
        return "Income"
    else:
        return "Other"


def get_transactions_for_period(db: Session, user_id, period: str) -> List[Dict[str, Any]]:
    """Get all transactions (manual + connections) for a user within a period - optimized"""
    transactions = []
    
    # Calculate date range based on period
    now = datetime.now()
    if period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter = (now.month - 1) // 3
        start_date = datetime(now.year, quarter * 3 + 1, 1)
    elif period == "year":
        start_date = datetime(now.year, 1, 1)
    else:
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    end_date = now
    
    # Get manual transactions with date filtering at database level (more efficient)
    from models import ManualTransaction
    from sqlalchemy import and_
    
    manual_transactions = db.query(ManualTransaction).filter(
        and_(
            ManualTransaction.user_id == user_id,
            ManualTransaction.transaction_date >= start_date,
            ManualTransaction.transaction_date <= end_date
        )
    ).order_by(ManualTransaction.transaction_date.desc()).all()
    
    for txn in manual_transactions:
        txn_date = txn.transaction_date
        if isinstance(txn_date, str):
            try:
                txn_date = datetime.fromisoformat(txn_date.replace("Z", "+00:00"))
            except:
                continue
        # Make timezone-naive for comparison
        if txn_date.tzinfo is not None:
            txn_date = txn_date.replace(tzinfo=None)
        
        category = txn.category or map_description_to_category(txn.description or "")
        transactions.append({
            "date": txn_date.isoformat(),
            "amount": float(txn.amount),
            "type": txn.type,  # "income" or "expense"
            "category": category,
            "description": txn.description or "",
            "source": txn.source or "manual"
        })
    
    # Get connection transactions - limit processing for performance
    connections = get_user_connections(db, user_id, status_filter="connected")
    # Limit to first 5 connections to avoid timeout
    for connection in connections[:5]:
        if not connection.connection_data:
            continue
        
        try:
            if isinstance(connection.connection_data, str):
                conn_data = json.loads(connection.connection_data)
            else:
                conn_data = connection.connection_data
        except (json.JSONDecodeError, TypeError):
            continue
        
        try:
            if isinstance(conn_data, dict) and "transactions" in conn_data:
                # Limit to recent 500 transactions per connection for performance
                conn_transactions = conn_data.get("transactions", [])[:500]
                for txn in conn_transactions:
                    if not isinstance(txn, dict):
                        continue
                    
                    timestamp = txn.get("timestamp")
                    if not timestamp:
                        continue
                    
                    # Parse date
                    try:
                        if isinstance(timestamp, str):
                            txn_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        else:
                            txn_date = timestamp
                        # Make timezone-naive for comparison
                        if txn_date.tzinfo is not None:
                            txn_date = txn_date.replace(tzinfo=None)
                    except Exception:
                        continue
                    
                    # Check if within period (early exit for performance)
                    if not (start_date <= txn_date <= end_date):
                        continue
                    
                    txn_type = txn.get("type", "").lower()
                    amount = float(txn.get("amount", 0))
                    description = txn.get("description", "Transaction")
                    category = map_description_to_category(description)
                    
                    if txn_type == "credit":
                        transactions.append({
                            "date": txn_date.isoformat(),
                            "amount": abs(amount),
                            "type": "income",
                            "category": "Income",
                            "description": description,
                            "source": connection.type or "connection"
                        })
                    elif txn_type == "debit":
                        transactions.append({
                            "date": txn_date.isoformat(),
                            "amount": abs(amount),
                            "type": "expense",
                            "category": category,
                            "description": description,
                            "source": connection.type or "connection"
                        })
        except Exception as e:
            logger.warning(f"Error processing connection transactions: {e}")
            continue
    
    return transactions


@router.get("")
async def get_reports(
    period: str = "month",  # "month", "quarter", or "year"
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Get financial reports for the current user.
    Returns income, expenses, savings, savings rate, and category breakdown.
    """
    try:
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Validate period
        if period not in ["month", "quarter", "year"]:
            period = "month"
        
        # Get transactions for the period
        transactions = get_transactions_for_period(db, user.id, period)
        
        # Calculate totals
        total_income = sum(t["amount"] for t in transactions if t["type"] == "income")
        total_expenses = sum(t["amount"] for t in transactions if t["type"] == "expense")
        total_savings = total_income - total_expenses
        savings_rate = (total_savings / total_income * 100) if total_income > 0 else 0
        
        # Calculate category breakdown
        category_totals = defaultdict(float)
        for txn in transactions:
            if txn["type"] == "expense":
                category = txn["category"]
                category_totals[category] += txn["amount"]
        
        # Add income to category breakdown
        if total_income > 0:
            category_totals["Income"] = total_income
        
        # Format category breakdown
        category_breakdown = []
        for category, amount in sorted(category_totals.items(), key=lambda x: x[1], reverse=True):
            percentage = (amount / total_income * 100) if total_income > 0 else 0
            category_breakdown.append({
                "category": category,
                "amount": round(amount, 2),
                "percentage": round(percentage, 1)
            })
        
        # Format period label
        now = datetime.now()
        if period == "month":
            period_label = now.strftime("%B %Y")
        elif period == "quarter":
            quarter = (now.month - 1) // 3 + 1
            period_label = f"Q{quarter} {now.year}"
        else:
            period_label = str(now.year)
        
        return {
            "period": period,
            "period_label": period_label,
            "income": round(total_income, 2),
            "expenses": round(total_expenses, 2),
            "savings": round(total_savings, 2),
            "savings_rate": round(savings_rate, 1),
            "category_breakdown": category_breakdown,
            "transaction_count": len(transactions)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error generating reports for user {user.id if 'user' in locals() else 'unknown'}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reports: {str(e)}"
        )


@router.get("/trends")
async def get_trends(
    period: str = "month",  # "month", "quarter", or "year"
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Get trend data for income vs spending over time.
    Returns monthly data points for the selected period.
    """
    try:
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Validate period
        if period not in ["month", "quarter", "year"]:
            period = "month"
        
        # Calculate how many months to show
        if period == "month":
            months = 1
        elif period == "quarter":
            months = 3
        else:
            months = 12
        
        # Get all transactions first (no period filter) - optimized with date range
        all_transactions = []
        now = datetime.now()
        
        # Calculate date range for trends (go back enough months)
        if period == "month":
            months_back = 1
        elif period == "quarter":
            months_back = 3
        else:
            months_back = 12
        
        # Calculate earliest date needed
        earliest_date = (now - timedelta(days=months_back * 32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Get manual transactions with date filtering at database level
        from models import ManualTransaction
        from sqlalchemy import and_
        
        manual_transactions = db.query(ManualTransaction).filter(
            and_(
                ManualTransaction.user_id == user.id,
                ManualTransaction.transaction_date >= earliest_date,
                ManualTransaction.transaction_date <= now
            )
        ).order_by(ManualTransaction.transaction_date.desc()).all()
        
        for txn in manual_transactions:
            txn_date = txn.transaction_date
            if isinstance(txn_date, str):
                try:
                    txn_date = datetime.fromisoformat(txn_date.replace("Z", "+00:00"))
                except:
                    continue
            if txn_date.tzinfo is not None:
                txn_date = txn_date.replace(tzinfo=None)
            
            category = txn.category or map_description_to_category(txn.description or "")
            all_transactions.append({
                "date": txn_date,
                "amount": float(txn.amount),
                "type": txn.type,
                "category": category,
            })
        
        # Get connection transactions - limit for performance
        connections = get_user_connections(db, user.id, status_filter="connected")
        # Limit to first 3 connections for trends to avoid timeout
        for connection in connections[:3]:
            if not connection.connection_data:
                continue
            try:
                if isinstance(connection.connection_data, str):
                    conn_data = json.loads(connection.connection_data)
                else:
                    conn_data = connection.connection_data
            except:
                continue
            
            try:
                if isinstance(conn_data, dict) and "transactions" in conn_data:
                    # Limit to recent 300 transactions per connection for trends
                    conn_transactions = conn_data.get("transactions", [])[:300]
                    for txn in conn_transactions:
                        if not isinstance(txn, dict):
                            continue
                        timestamp = txn.get("timestamp")
                        if not timestamp:
                            continue
                        try:
                            if isinstance(timestamp, str):
                                txn_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                            else:
                                txn_date = timestamp
                            if txn_date.tzinfo is not None:
                                txn_date = txn_date.replace(tzinfo=None)
                        except:
                            continue
                        
                        # Early exit if before earliest date
                        if txn_date < earliest_date:
                            continue
                        
                        txn_type = txn.get("type", "").lower()
                        amount = float(txn.get("amount", 0))
                        description = txn.get("description", "Transaction")
                        category = map_description_to_category(description)
                        
                        if txn_type == "credit":
                            all_transactions.append({
                                "date": txn_date,
                                "amount": abs(amount),
                                "type": "income",
                                "category": "Income",
                            })
                        elif txn_type == "debit":
                            all_transactions.append({
                                "date": txn_date,
                                "amount": abs(amount),
                                "type": "expense",
                                "category": category,
                            })
            except Exception:
                continue
        
        # Calculate monthly data
        trends = []
        for i in range(months):
            # Calculate month start/end
            month_date = now - timedelta(days=30 * (months - i - 1))
            month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if month_start.month == 12:
                month_end = datetime(month_start.year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = datetime(month_start.year, month_start.month + 1, 1) - timedelta(days=1)
            month_end = month_end.replace(hour=23, minute=59, second=59)
            
            # Filter transactions for this month
            month_transactions = [
                t for t in all_transactions
                if month_start <= t["date"] <= month_end
            ]
            
            month_income = sum(t["amount"] for t in month_transactions if t["type"] == "income")
            month_expenses = sum(t["amount"] for t in month_transactions if t["type"] == "expense")
            
            trends.append({
                "month": month_start.strftime("%B %Y"),
                "income": round(month_income, 2),
                "expenses": round(month_expenses, 2),
                "savings": round(month_income - month_expenses, 2)
            })
        
        return {"trends": trends}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error generating trends for user {user.id if 'user' in locals() else 'unknown'}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate trends: {str(e)}"
        )

