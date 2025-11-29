from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from schemas import ConnectionCreate, ConnectionResponse, ConnectionUpdate, MessageResponse, GoalCreate
from crud import (
    create_connection,
    get_user_connections,
    get_connection_by_id,
    disconnect_connection,
    update_connection,
    sync_connection,
    get_user_by_email,
    get_user_by_id,
    get_user_goals,
    create_goal,
    update_goal,
    get_monthly_budget_context,
)
from auth import get_current_user_email
from uuid import UUID
from typing import Optional, List
from collections import defaultdict
from routers.coach import get_real_user_data, map_description_to_category
from services.ai_coach import analyze_and_generate_goals, analyze_and_update_goals, determine_allocation_percentages
from schemas import GoalUpdate
from datetime import datetime, timedelta, timezone
import json
import os
import logging

logger = logging.getLogger(__name__)

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

router = APIRouter(prefix="/connections", tags=["connections"])
security = HTTPBearer()

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current user ID from token"""
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user.id

def load_mock_data(connection_name: str) -> dict:
    """Load mock data for a payment gateway"""
    # Normalize connection name to filename
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
    
    filename = filename_map.get(connection_name, f"{connection_name.lower().replace(' ', '_')}.json")
    mock_data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mock_data")
    file_path = os.path.join(mock_data_dir, filename)
    
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        # Return default mock data if file doesn't exist
        return {
            "account_id": f"mock_{connection_name.lower().replace(' ', '_')}_123",
            "status": "active",
            "balance": 0,
            "transactions": []
        }

def _format_spending_category(description: str) -> str:
    mapped = map_description_to_category(description or "")
    category_map = {
        "food": "Food",
        "transport": "Transport",
        "bills": "Bills",
        "health": "Health",
        "rent": "Rent",
        "shopping": "Shopping",
        "entertainment": "Entertainment",
        "other": "Other",
    }
    return category_map.get(mapped.lower(), "Spending")

def _normalize_timestamp(value):
    """Normalize timestamp to IST timezone"""
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
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Convert to IST
        return to_ist(dt)
    except Exception:
        return None

def notify_connection_spending(db_session: Session, user, new_expense_transactions: List[dict]):
    if not new_expense_transactions:
        return
    
    from email_service import (
        send_spending_activity_email,
        send_spending_budget_warning_email,
        send_spending_budget_exceeded_email,
    )
    
    valid_transactions = [t for t in new_expense_transactions if t.get("date") and t.get("amount")]
    if not valid_transactions:
        return
    
    user_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email.split('@')[0]
    
    grouped = defaultdict(list)
    for txn in valid_transactions:
        txn_date = txn["date"]
        key = (txn_date.year, txn_date.month)
        grouped[key].append(txn)
    
    for _, txns in grouped.items():
        txns.sort(key=lambda x: x["date"])
        month_total_new = sum(t["amount"] for t in txns)
        context = get_monthly_budget_context(db_session, user, txns[0]["date"])
        budget_value = context["budget"]
        context_total = context["total_expense"]
        base_total = max(context_total - month_total_new, 0)
        running_total = base_total
        
        for txn in txns:
            running_total += txn["amount"]
            remaining_budget = budget_value - running_total
            description = txn.get("description") or "Expense from connection"
            category_label = txn.get("category") or "Spending"
            transaction_date_iso = txn["date"].isoformat()
            
            send_spending_activity_email(
                email=user.email,
                user_name=user_name,
                expense_amount=txn["amount"],
                category=category_label,
                description=description,
                month_total=running_total,
                budget=budget_value,
                remaining_budget=remaining_budget,
                transaction_date=transaction_date_iso,
            )
            
            if budget_value > 0:
                warning_threshold = budget_value * 0.9
                previous_total = running_total - txn["amount"]
                
                if previous_total < warning_threshold <= running_total < budget_value:
                    send_spending_budget_warning_email(
                        email=user.email,
                        user_name=user_name,
                        month_total=running_total,
                        budget=budget_value,
                        remaining_budget=remaining_budget,
                    )
                
                if previous_total < budget_value <= running_total:
                    send_spending_budget_exceeded_email(
                        email=user.email,
                        user_name=user_name,
                        month_total=running_total,
                        budget=budget_value,
                        overage_amount=running_total - budget_value,
                    )

@router.get("", response_model=List[ConnectionResponse])
def get_connections(
    status_filter: Optional[str] = None,
    include_transactions: bool = True,  # Default to True to include transaction data for frontend
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get all connections for the current user - includes transaction data by default for frontend processing"""
    try:
        # Parse JSON to include transaction data for frontend processing
        connections = get_user_connections(db, user_id, status_filter, parse_json=True)
        
        # Process connection data - include transactions if requested, otherwise limit them
        for conn in connections:
            # Handle None connection_data - initialize empty structure
            if conn.connection_data is None:
                logger.warning(f"Connection '{conn.name}' has NULL connection_data in database - initializing empty structure")
                conn.connection_data = {
                    "allocated_transaction_ids": [],
                    "transactions": [],
                    "entries": [],
                    "monthly_summary": {},
                    "account_id": None,
                    "status": "connected",
                    "balance": 0
                }
            
            # connection_data is already parsed by get_user_connections when parse_json=True
            if conn.connection_data and isinstance(conn.connection_data, dict):
                parsed = conn.connection_data
                if include_transactions:
                    # Include transactions but limit to recent 200 to prevent huge payloads
                    # Frontend will further limit to 100 per connection
                    if "transactions" in parsed:
                        transactions = parsed.get("transactions", [])
                        if isinstance(transactions, list):
                            logger.info(f"Connection '{conn.name}' has {len(transactions)} transactions")
                            if len(transactions) > 200:
                                parsed["transactions"] = transactions[:200]
                                logger.debug(f"Limited transactions to 200 for connection {conn.id}")
                        else:
                            logger.warning(f"Connection '{conn.name}' has non-list transactions: {type(transactions)}")
                    else:
                        logger.warning(f"Connection '{conn.name}' has no 'transactions' key in connection_data. Keys: {list(parsed.keys())}")
                    if "entries" in parsed:
                        entries = parsed.get("entries", [])
                        if isinstance(entries, list):
                            logger.info(f"Connection '{conn.name}' has {len(entries)} entries")
                            if len(entries) > 200:
                                parsed["entries"] = entries[:200]
                                logger.debug(f"Limited entries to 200 for connection {conn.id}")
                else:
                    # Remove transaction arrays if not requested (for list view optimization)
                    if "transactions" in parsed:
                        transaction_count = len(parsed.get("transactions", []))
                        parsed["transaction_count"] = transaction_count
                        parsed["transactions"] = []
                    if "entries" in parsed:
                        entry_count = len(parsed.get("entries", []))
                        parsed["entry_count"] = entry_count
                        parsed["entries"] = []
            elif conn.connection_data and isinstance(conn.connection_data, str):
                # Fallback: if somehow still a string, parse it
                try:
                    parsed = json.loads(conn.connection_data)
                    if isinstance(parsed, dict):
                        conn.connection_data = parsed
                        # Apply same logic as above
                        if include_transactions:
                            if "transactions" in parsed and isinstance(parsed.get("transactions"), list) and len(parsed["transactions"]) > 200:
                                parsed["transactions"] = parsed["transactions"][:200]
                            if "entries" in parsed and isinstance(parsed.get("entries"), list) and len(parsed["entries"]) > 200:
                                parsed["entries"] = parsed["entries"][:200]
                        else:
                            if "transactions" in parsed:
                                parsed["transaction_count"] = len(parsed.get("transactions", []))
                                parsed["transactions"] = []
                            if "entries" in parsed:
                                parsed["entry_count"] = len(parsed.get("entries", []))
                                parsed["entries"] = []
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    logger.error(f"Failed to parse connection_data for connection '{conn.name}': {e}")
                    conn.connection_data = {
                        "allocated_transaction_ids": [],
                        "transactions": [],
                        "entries": [],
                        "monthly_summary": {},
                        "account_id": None,
                        "status": "connected",
                        "balance": 0
                    }
        
        logger.info(f"Retrieved {len(connections)} connections for user {user_id} (include_transactions={include_transactions})")
        return connections
    except Exception as e:
        logger.error(f"Error getting connections for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve connections: {str(e)}"
        )

@router.get("/available", response_model=List[dict])
def get_available_connections():
    """Get list of available payment gateways to connect"""
    return [
        {"name": "PhonePe", "type": "UPI", "icon": "📱"},
        {"name": "Google Pay", "type": "UPI", "icon": "💳"},
        {"name": "Paytm", "type": "UPI", "icon": "📲"},
        {"name": "HDFC Bank", "type": "Bank Account", "icon": "🏦"},
        {"name": "ICICI Bank", "type": "Bank Account", "icon": "🏦"},
        {"name": "SBI Bank", "type": "Bank Account", "icon": "🏦"},
        {"name": "Cash Income", "type": "Manual", "icon": "💵"},
        {"name": "testincome", "type": "Test", "icon": "💰"},
        {"name": "testspend", "type": "Test", "icon": "💸"},
    ]

def process_goals_after_connection(user_id: UUID):
    """Background task to process goals after connection is created"""
    logger.info(f"BACKGROUND TASK STARTED: Processing goals for user {user_id}")
    try:
        # Get a new database session for background task
        from database import SessionLocal
        background_db = SessionLocal()
        try:
            user = get_user_by_id(background_db, str(user_id))
            if not user:
                logger.error(f"User not found for auto goal generation: {user_id}")
                return
            
            logger.info(f"User found: {user.email if hasattr(user, 'email') else user_id}")
            
            # Check if user already has goals (including completed ones to be thorough)
            existing_goals = get_user_goals(background_db, user_id, include_completed=False)
            all_goals = get_user_goals(background_db, user_id, include_completed=True)
            
            logger.info(f"User {user_id} has {len(existing_goals)} active goals and {len(all_goals)} total goals")
            
            # Get user data from connections
            user_data = get_real_user_data(background_db, user_id, user)
            user_data["user_id"] = str(user_id)
            
            # Check what goals exist
            has_emergency = any(g.type == "emergency" for g in all_goals)
            savings_goals = [g for g in all_goals if g.type != "emergency" and not g.is_completed]
            has_savings_goal_1 = any("Goal 1" in g.name or "Savings Goal 1" in g.name for g in savings_goals)
            has_savings_goal_2 = any("Goal 2" in g.name or "Savings Goal 2" in g.name for g in savings_goals)
            
            logger.info(f"Goal status - Emergency: {has_emergency}, Savings Goal 1: {has_savings_goal_1}, Savings Goal 2: {has_savings_goal_2}")
            
            # If user has no goals at all, or missing essential goals, create them
            needs_goals = len(all_goals) == 0 or not has_emergency or len(savings_goals) < 2
            
            if needs_goals:
                if len(all_goals) == 0:
                    logger.info(f"No goals found for user {user_id}. Auto-generating all goals based on income...")
                else:
                    logger.info(f"User {user_id} is missing some goals. Creating missing goals...")
                
                # Calculate income to determine goal targets
                from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
                income_analysis = income_pattern_agent(user_data)
                
                recent_txs = get_last_3_months_transactions(user_data)
                income_txs = [t for t in recent_txs if float(t[1]) > 0]
                total_income = sum(float(t[1]) for t in income_txs) if income_txs else 0
                avg_monthly_income = total_income / max(1, len(income_txs) / 30) if income_txs else 0
                
                # If no income data, try to get from connection data
                if avg_monthly_income == 0:
                    # Try to estimate from connection transactions
                    connections = get_user_connections(background_db, user_id, status_filter="connected", parse_json=True)
                    for conn in connections:
                        conn_data = conn.connection_data if isinstance(conn.connection_data, dict) else {}
                        transactions = conn_data.get("transactions", [])
                        if transactions:
                            income_from_conn = [t for t in transactions if isinstance(t, dict) and t.get("type", "").lower() == "credit"]
                            if income_from_conn:
                                total_conn_income = sum(float(t.get("amount", 0)) for t in income_from_conn)
                                avg_monthly_income = total_conn_income / max(1, len(income_from_conn) / 30)
                                break
                
                # Default to ₹30,000/month if still no income data
                if avg_monthly_income == 0:
                    avg_monthly_income = 30000
                    logger.warning(f"No income data found, using default ₹{avg_monthly_income:,}/month for goal creation")
                
                # Use hybrid approach: formulas as base + LLM refinement for personalization
                logger.info("=" * 80)
                logger.info("🎯 STARTING GOAL TARGET CALCULATION")
                logger.info("=" * 80)
                logger.info(f"User Income Data: ₹{avg_monthly_income:,.0f}/month")
                
                from services.goal_target_calculator import calculate_goal_targets
                
                # Calculate targets using hybrid approach (formulas + optional LLM refinement)
                logger.info("Step 1: Calculating base targets using financial formulas...")
                target_result = calculate_goal_targets(
                    avg_monthly_income=avg_monthly_income,
                    user_data=user_data,
                    use_llm_refinement=True,  # Enable LLM refinement for intelligent personalization
                    spending_patterns=None
                )
                
                targets = target_result["targets"]
                emergency_fund_target = targets["emergency_fund"]
                savings_goal_1_target = targets["savings_goal_1"]
                savings_goal_2_target = targets["savings_goal_2"]
                
                if target_result.get("refined"):
                    logger.info(f"✅ Goal targets finalized using hybrid approach (LLM refined)")
                else:
                    logger.info(f"✅ Goal targets finalized using formulas (base calculation)")
                logger.info("=" * 80)
                
                # Create only missing goals
                logger.info("Creating missing goals using hybrid calculation (formulas + LLM refinement)")
                goals_to_create = []
                
                # Only add goals that don't exist - check carefully to avoid duplicates
                # Double-check: ensure no emergency fund exists (active or completed)
                emergency_goals_exist = [g for g in all_goals if g.type == "emergency"]
                if len(emergency_goals_exist) == 0:
                    logger.info("Emergency Fund missing - will create")
                    goals_to_create.append({
                        "name": "Emergency Fund",
                        "target": emergency_fund_target,
                        "type": "emergency",
                        "deadline": None,
                        "saved": 0
                    })
                else:
                    logger.info(f"Emergency Fund already exists ({len(emergency_goals_exist)} found) - skipping creation")
                
                if not has_savings_goal_1:
                    logger.info("Savings Goal 1 missing - will create")
                    goals_to_create.append({
                        "name": "Savings Goal 1",
                        "target": savings_goal_1_target,
                        "type": "savings",
                        "deadline": (get_ist_now() + timedelta(days=180)).isoformat(),
                        "saved": 0
                    })
                else:
                    logger.info("Savings Goal 1 already exists - skipping")
                
                if not has_savings_goal_2:
                    logger.info("Savings Goal 2 missing - will create")
                    goals_to_create.append({
                        "name": "Savings Goal 2",
                        "target": savings_goal_2_target,
                        "type": "savings",
                        "deadline": (get_ist_now() + timedelta(days=120)).isoformat(),
                        "saved": 0
                    })
                else:
                    logger.info("Savings Goal 2 already exists - skipping")
                
                if len(goals_to_create) == 0:
                    logger.info("All essential goals already exist, skipping creation")
                else:
                    # Refresh goals list right before creating to ensure we have latest data
                    all_goals_refreshed = get_user_goals(background_db, user_id, include_completed=True)
                    logger.info(f"Refreshed goals list: {len(all_goals_refreshed)} total goals before creation")
                    
                    # Create goals in database
                    created_count = 0
                    for goal_data in goals_to_create:
                        try:
                            # Double-check: verify goal doesn't already exist before creating
                            goal_type = goal_data.get("type", "savings")
                            goal_name = goal_data.get("name", "")
                            
                            # Check if a goal with same type and name already exists
                            if goal_type == "emergency":
                                existing_emergency = [g for g in all_goals_refreshed if g.type == "emergency"]
                                if existing_emergency:
                                    logger.warning(f"Emergency Fund already exists (found {len(existing_emergency)} emergency goals) - skipping creation to avoid duplicate")
                                    continue
                            else:
                                # For savings goals, check by name pattern
                                existing_similar = [g for g in all_goals_refreshed if g.type != "emergency" and not g.is_completed and (
                                    goal_name in g.name or g.name in goal_name or
                                    ("Goal 1" in goal_name and ("Goal 1" in g.name or "Savings Goal 1" in g.name)) or
                                    ("Goal 2" in goal_name and ("Goal 2" in g.name or "Savings Goal 2" in g.name))
                                )]
                                if existing_similar:
                                    logger.warning(f"Similar goal '{existing_similar[0].name}' already exists - skipping '{goal_name}' to avoid duplicate")
                                    continue
                            
                            # Create goal
                            goal_create = GoalCreate(
                                name=goal_data["name"],
                                target=goal_data["target"],
                                type=goal_data.get("type", "savings"),
                                deadline=datetime.fromisoformat(goal_data["deadline"]) if goal_data.get("deadline") else None,
                                saved=goal_data.get("saved", 0)
                            )
                            created_goal = create_goal(background_db, user_id, goal_create)
                            # create_goal already commits, so no need to commit again
                            created_count += 1
                            logger.info(f"✓ Created goal: {goal_data['name']} (₹{goal_data['target']:,}) - ID: {created_goal.id}")
                        except Exception as goal_err:
                            logger.error(f"✗ Error creating goal '{goal_data.get('name', 'unknown')}': {goal_err}", exc_info=True)
                            background_db.rollback()
                            continue
                    
                    if created_count > 0:
                        logger.info(f"✅ SUCCESS: Created {created_count} goals for user {user_id}")
                    else:
                        logger.error(f"❌ FAILED: Could not create any goals for user {user_id} - all attempts failed")
            else:
                # User has existing goals - update them based on new financial data
                logger.info(f"User {user_id} has {len(existing_goals)} existing goals. Analyzing and updating goals...")
                
                # Convert goals to dict format for analysis
                existing_goals_dict = []
                for goal in existing_goals:
                    existing_goals_dict.append({
                        "id": str(goal.id),
                        "name": goal.name,
                        "target": float(goal.target),
                        "saved": float(goal.saved),
                        "deadline": goal.deadline.isoformat() if goal.deadline else None,
                        "type": goal.type
                    })
                
                # ONLY UPDATE existing goals - DO NOT create new ones
                # Calculate income change to adjust goal targets proportionally
                from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
                income_analysis = income_pattern_agent(user_data)
                
                recent_txs = get_last_3_months_transactions(user_data)
                income_txs = [t for t in recent_txs if float(t[1]) > 0]
                total_income = sum(float(t[1]) for t in income_txs) if income_txs else 0
                avg_monthly_income = total_income / max(1, len(income_txs) / 30) if income_txs else 0
                avg_monthly_expenses = avg_monthly_income * 0.7 if avg_monthly_income > 0 else 0
                
                updated_count = 0
                
                # Update each existing goal based on income changes
                for goal in existing_goals:
                    try:
                        current_target = float(goal.target)
                        goal_type = goal.type
                        goal_id = goal.id
                        
                        # Calculate new target based on income
                        if goal_type == "emergency":
                            # Emergency fund: 4.5 months of expenses
                            new_target = int(avg_monthly_expenses * 4.5) if avg_monthly_expenses > 0 else current_target
                            new_target = max(10000, new_target)  # Minimum ₹10,000
                        else:
                            # Regular savings goals: adjust proportionally based on income
                            # Use income-based calculation
                            if avg_monthly_income > 0:
                                # Base target on months of income for savings goals
                                if "Goal 1" in goal.name or "Savings Goal 1" in goal.name or len(existing_goals) == 1:
                                    new_target = int(avg_monthly_income * 2)
                                elif "Goal 2" in goal.name or "Savings Goal 2" in goal.name:
                                    new_target = int(avg_monthly_income * 1.5)
                                else:
                                    # For other named goals, keep proportional to income
                                    # Calculate based on current target ratio to average income
                                    if current_target > 0:
                                        # Maintain similar ratio but adjust for new income
                                        ratio = current_target / max(50000, avg_monthly_income * 2)  # Normalize
                                        new_target = int(avg_monthly_income * 2 * ratio)
                                    else:
                                        new_target = int(avg_monthly_income * 1.5)
                                
                                new_target = max(5000, new_target)  # Minimum ₹5,000
                            else:
                                # No income data, keep current target
                                new_target = current_target
                        
                        # Only update if target changed significantly (more than 10% difference)
                        if abs(new_target - current_target) > current_target * 0.1:
                            goal_update = GoalUpdate(target=new_target)
                            update_goal(background_db, goal_id, user_id, goal_update)
                            updated_count += 1
                            logger.info(f"Updated goal '{goal.name}': ₹{current_target:,.0f} → ₹{new_target:,.0f} (income-based adjustment)")
                        else:
                            logger.info(f"Goal '{goal.name}' target unchanged: ₹{current_target:,.0f} (change < 10%)")
                    except Exception as update_err:
                        logger.error(f"Error updating goal '{goal.name}': {update_err}", exc_info=True)
                        background_db.rollback()
                        continue
                    
                if updated_count > 0:
                    logger.info(f"Updated {updated_count} existing goals for user {user_id} based on new income. NO NEW GOALS CREATED.")
                else:
                    logger.info(f"No goal updates needed for user {user_id} - targets are appropriate for current income.")
        finally:
            background_db.close()
            logger.info(f"BACKGROUND TASK COMPLETED for user {user_id}")
    except Exception as e:
        logger.error(f"❌ CRITICAL ERROR in background goal processing for user {user_id}: {e}", exc_info=True)


def allocate_income_from_sync(user_id: UUID, connection_id: UUID, new_income_transactions: List[dict], previous_last_sync):
    """Background task to allocate income from sync operation"""
    logger.info(f"BACKGROUND TASK STARTED: Allocating income from sync for connection {connection_id} for user {user_id}")
    try:
        from database import SessionLocal
        from crud import get_connection_by_id, get_user_by_id
        from routers.coach import get_real_user_data
        from services.agentic_ai import ToolRegistry, ToolType
        from services.ai_coach import emergency_fund_agent, determine_allocation_percentages
        from datetime import datetime, timedelta, timezone
        import json
        
        background_db = SessionLocal()
        try:
            user = get_user_by_id(background_db, str(user_id))
            if not user:
                logger.warning(f"User not found for income allocation: {user_id}")
                return
            
            # Get the connection
            connection = get_connection_by_id(background_db, connection_id, user_id)
            if not connection:
                logger.warning(f"Connection {connection_id} not found for income allocation")
                return
            
            # CRITICAL: get_connection_by_id parses connection_data to dict, which causes issues
            # when SQLAlchemy tries to save it. We need to expire it and refresh to get raw string.
            # But we'll work with the dict for processing, then convert back to string when saving.
            background_db.expire(connection, ['connection_data'])
            background_db.refresh(connection, ['connection_data'])
            
            # Now parse it ourselves for processing
            raw_connection_data = connection.connection_data
            
            # Parse connection data from raw string
            connection_data = None
            if raw_connection_data:
                try:
                    if isinstance(raw_connection_data, str):
                        connection_data = json.loads(raw_connection_data)
                    elif isinstance(raw_connection_data, dict):
                        connection_data = raw_connection_data
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"Failed to parse connection_data: {e}")
                    connection_data = {}
            
            if connection_data is None:
                logger.warning(f"⚠️  Background task: connection_data is None for connection {connection_id}, initializing empty dict")
                connection_data = {}
            elif isinstance(connection_data, str):
                try:
                    connection_data = json.loads(connection_data)
                    logger.info(f"✅ Background task: Parsed connection_data from JSON string (keys: {list(connection_data.keys()) if isinstance(connection_data, dict) else 'not a dict'})")
                except Exception as e:
                    logger.warning(f"⚠️  Background task: Failed to parse connection_data: {e}")
                    connection_data = {}
            elif isinstance(connection_data, dict):
                logger.info(f"✅ Background task: connection_data is already a dict (keys: {list(connection_data.keys())})")
            
            # Ensure connection_data is a dict
            if not isinstance(connection_data, dict):
                logger.warning(f"⚠️  Background task: connection_data is not a dict (type: {type(connection_data)}), initializing empty dict")
                connection_data = {}
            
            # CRITICAL: Initialize allocated_transaction_ids if it doesn't exist
            if "allocated_transaction_ids" not in connection_data:
                connection_data["allocated_transaction_ids"] = []
                logger.info(f"✅ Background task: Initialized allocated_transaction_ids list")
            else:
                existing_count = len(connection_data.get("allocated_transaction_ids", []))
                logger.info(f"✅ Background task: Found {existing_count} existing allocated transaction IDs")
            
            # DOUBLE-CHECK: Verify transactions haven't been allocated already
            # This prevents double allocation if background task runs multiple times
            allocated_txn_ids = set()
            if connection_data and isinstance(connection_data, dict):
                allocated_txn_ids = set(connection_data.get("allocated_transaction_ids", []))
            
            # Filter out transactions that are already allocated
            filtered_transactions = []
            for txn in new_income_transactions:
                txn_id = txn.get("id", "")
                if txn_id and txn_id in allocated_txn_ids:
                    logger.info(f"⏭️  Background task: Skipping transaction ₹{txn.get('amount')} (ID: {txn_id}) - already allocated")
                    continue
                filtered_transactions.append(txn)
            
            if not filtered_transactions:
                logger.info(f"No new unallocated transactions to process for connection {connection_id} (all were already allocated)")
                return
            
            # Update new_income_transactions to only include unallocated ones
            new_income_transactions = filtered_transactions
            logger.info(f"Background task: Filtered {len(new_income_transactions)} unallocated transactions from {len(new_income_transactions) + len(allocated_txn_ids)} total")
            
            total_new_income = sum(t["amount"] for t in new_income_transactions)
            transaction_details = ", ".join([f"₹{t['amount']}" for t in new_income_transactions])
            logger.info(f"💰 Allocating ₹{total_new_income} new income from connection '{connection.name}' ({transaction_details})...")
            
            # Initialize tool registry (Agentic AI tools)
            tool_registry = ToolRegistry(background_db, user_id)
            
            # Get user data
            user_data = get_real_user_data(background_db, user_id, user)
            
            # Ensure emergency fund goal has proper target
            emergency_analysis = emergency_fund_agent(user_data)
            
            # Get all goals
            goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "connection_sync")
            
            # STEP 0: If no goals exist, create them automatically based on income
            if not goals_result.get("success") or not goals_result.get("goals") or len(goals_result.get("goals", [])) == 0:
                logger.info("No goals found. Creating goals automatically based on connection income...")
                
                # Analyze income to create adaptive goals
                from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
                income_analysis = income_pattern_agent(user_data)
                
                # Calculate average monthly income
                recent_txs = get_last_3_months_transactions(user_data)
                income_txs = [t for t in recent_txs if float(t[1]) > 0]
                total_income = sum(float(t[1]) for t in income_txs) if income_txs else total_new_income
                avg_monthly_income = total_income / max(3, len(income_txs)) if income_txs else total_new_income * 30
                
                if avg_monthly_income == 0:
                    avg_monthly_income = total_new_income * 30
                
                # Calculate adaptive goal targets
                avg_monthly_expenses = avg_monthly_income * 0.7
                emergency_fund_target = int(avg_monthly_expenses * 4.5)
                savings_goal_1_target = int(avg_monthly_income * 2)
                savings_goal_2_target = int(avg_monthly_income * 1.5)
                
                # Ensure minimum values
                emergency_fund_target = max(10000, emergency_fund_target)
                savings_goal_1_target = max(5000, savings_goal_1_target)
                savings_goal_2_target = max(3000, savings_goal_2_target)
                
                # Create goals
                from schemas import GoalCreate
                from crud import create_goal
                from datetime import timedelta
                
                goals_created = []
                
                # Create Emergency Fund
                try:
                    emergency_goal = GoalCreate(
                        name="Emergency Fund",
                        target=emergency_fund_target,
                        type="emergency",
                        deadline=None,
                        saved=0
                    )
                    created_emergency = create_goal(background_db, user_id, emergency_goal)
                    goals_created.append(created_emergency)
                    logger.info(f"Created Emergency Fund goal: ₹{emergency_fund_target:,}")
                except Exception as e:
                    logger.error(f"Error creating emergency fund: {e}")
                
                # Create Savings Goals
                try:
                    savings_goal_1 = GoalCreate(
                        name="Savings Goal 1",
                        target=savings_goal_1_target,
                        type="savings",
                        deadline=(datetime.now() + timedelta(days=180)).isoformat(),
                        saved=0
                    )
                    created_savings1 = create_goal(background_db, user_id, savings_goal_1)
                    goals_created.append(created_savings1)
                    logger.info(f"Created Savings Goal 1: ₹{savings_goal_1_target:,}")
                except Exception as e:
                    logger.error(f"Error creating savings goal 1: {e}")
                
                try:
                    savings_goal_2 = GoalCreate(
                        name="Savings Goal 2",
                        target=savings_goal_2_target,
                        type="savings",
                        deadline=(datetime.now() + timedelta(days=120)).isoformat(),
                        saved=0
                    )
                    created_savings2 = create_goal(background_db, user_id, savings_goal_2)
                    goals_created.append(created_savings2)
                    logger.info(f"Created Savings Goal 2: ₹{savings_goal_2_target:,}")
                except Exception as e:
                    logger.error(f"Error creating savings goal 2: {e}")
                
                if goals_created:
                    logger.info(f"Successfully created {len(goals_created)} goals automatically based on connection income")
                    goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "connection_sync")
            
            if not goals_result.get("success") or not goals_result.get("goals"):
                logger.warning("No goals found after creation attempt, skipping allocation")
                return
            
            goals = goals_result["goals"]
            
            # STEP 1: Update goal targets adaptively based on income changes
            from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
            income_analysis = income_pattern_agent(user_data)
            
            # Calculate average monthly income
            recent_txs = get_last_3_months_transactions(user_data)
            income_txs = [t for t in recent_txs if float(t[1]) > 0]
            total_income = sum(float(t[1]) for t in income_txs) if income_txs else total_new_income
            avg_monthly_income = total_income / max(3, len(income_txs)) if income_txs else total_new_income * 30
            
            if avg_monthly_income == 0:
                avg_monthly_income = total_new_income * 30
            
            # Calculate new recommended targets
            avg_monthly_expenses = avg_monthly_income * 0.7
            new_emergency_target = int(avg_monthly_expenses * 4.5)
            new_savings_1_target = int(avg_monthly_income * 2)
            new_savings_2_target = int(avg_monthly_income * 1.5)
            
            # Ensure minimum values
            new_emergency_target = max(10000, new_emergency_target)
            new_savings_1_target = max(5000, new_savings_1_target)
            new_savings_2_target = max(3000, new_savings_2_target)
            
            # Update emergency fund target adaptively
            if emergency_analysis.get("recommended_buffer"):
                all_emergency_goals = [g for g in goals if g.get("type") == "emergency"]
                active_emergency_goals = [g for g in all_emergency_goals if not g.get("is_completed", False)]
                emergency_goals = active_emergency_goals if active_emergency_goals else all_emergency_goals
                
                for goal in emergency_goals:
                    current_target = float(goal.get("target", 0))
                    recommended = max(emergency_analysis["recommended_buffer"], new_emergency_target)
                    is_completed = goal.get("is_completed", False)
                    
                    if is_completed:
                        continue
                    
                    income_increased = recommended > current_target * 1.2
                    if current_target == 0 or current_target < recommended * 0.8 or income_increased:
                        update_result = tool_registry.execute_tool(
                            ToolType.UPDATE_GOAL,
                            {"goal_id": goal["id"], "target": recommended},
                            "connection_sync"
                        )
                        if update_result.get("success"):
                            logger.info(f"Updated Emergency Fund target from ₹{current_target:,} to ₹{recommended:,} (income-based adjustment)")
            
            # Update savings goals adaptively
            regular_goals = [g for g in goals if g.get("type") != "emergency" and not g.get("is_completed", False)]
            
            if len(regular_goals) > 0:
                goal_1 = regular_goals[0]
                current_target_1 = float(goal_1.get("target", 0))
                if current_target_1 == 0 or current_target_1 < new_savings_1_target * 0.8 or new_savings_1_target > current_target_1 * 1.2:
                    update_result = tool_registry.execute_tool(
                        ToolType.UPDATE_GOAL,
                        {"goal_id": goal_1["id"], "target": new_savings_1_target},
                        "connection_sync"
                    )
                    if update_result.get("success"):
                        logger.info(f"Updated '{goal_1.get('name')}' target from ₹{current_target_1:,} to ₹{new_savings_1_target:,} (income-based adjustment)")
            
            if len(regular_goals) > 1:
                goal_2 = regular_goals[1]
                current_target_2 = float(goal_2.get("target", 0))
                if current_target_2 == 0 or current_target_2 < new_savings_2_target * 0.8 or new_savings_2_target > current_target_2 * 1.2:
                    update_result = tool_registry.execute_tool(
                        ToolType.UPDATE_GOAL,
                        {"goal_id": goal_2["id"], "target": new_savings_2_target},
                        "connection_sync"
                    )
                    if update_result.get("success"):
                        logger.info(f"Updated '{goal_2.get('name')}' target from ₹{current_target_2:,} to ₹{new_savings_2_target:,} (income-based adjustment)")
            
            # Refresh goals after updates
            goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "connection_sync")
            if goals_result.get("success"):
                goals = goals_result["goals"]
            
            # Use LLM to determine optimal allocation percentages based on financial context
            active_goals = [g for g in goals if not g.get("is_completed", False)]
            
            # Initialize allocation_actions list (will be populated if allocations happen)
            allocation_actions = []
            
            if active_goals:
                # Calculate recent expenses for context
                recent_txs = user_data.get("transactions", [])
                expense_txs = [t for t in recent_txs if isinstance(t, (list, tuple)) and len(t) > 1 and float(t[1]) < 0]
                recent_expenses = abs(sum(float(t[1]) for t in expense_txs)) / max(1, len(expense_txs) / 30) if expense_txs else None
                
                # Get LLM-determined allocation percentages
                allocation_plan = determine_allocation_percentages(
                    income_amount=total_new_income,
                    user_data=user_data,
                    goals=active_goals,
                    recent_expenses=recent_expenses
                )
                
                logger.info(f"LLM Allocation Plan: {allocation_plan.get('reasoning', 'N/A')} - Emergency: {allocation_plan.get('emergency_fund', {}).get('percent', 0)}%, Goals: {sum(g.get('percent', 0) for g in allocation_plan.get('goal_allocations', []))}%, Remaining: {allocation_plan.get('remaining_percent', 0)}%")
                
                # Allocate to Emergency Fund (if exists and not completed)
                emergency_goals = [g for g in active_goals if g.get("type") == "emergency"]
                if emergency_goals and allocation_plan.get("emergency_fund", {}).get("amount", 0) > 0:
                    emergency_goal = emergency_goals[0]
                    emergency_target = float(emergency_goal.get("target", 0))
                    emergency_saved = float(emergency_goal.get("saved", 0))
                    emergency_remaining = emergency_target - emergency_saved
                    emergency_allocation = allocation_plan.get("emergency_fund", {}).get("amount", 0)
                    
                    if emergency_remaining > 0 and emergency_target > 0:
                        emergency_allocation = min(emergency_remaining, emergency_allocation)
                        if emergency_allocation > 0:
                            result = tool_registry.execute_tool(
                                ToolType.ALLOCATE_TO_GOAL,
                                {"goal_id": emergency_goal["id"], "amount": emergency_allocation},
                                "connection_sync"
                            )
                            if result.get("success"):
                                allocation_actions.append(result)
                                logger.info(f"Auto-allocated ₹{emergency_allocation} ({allocation_plan.get('emergency_fund', {}).get('percent', 0)}%) to Emergency Fund from connection income (LLM-determined)")
                
                # Allocate to regular goals based on LLM percentages
                regular_goals = [g for g in active_goals if g.get("type") != "emergency"]
                goal_allocations = allocation_plan.get("goal_allocations", [])
                
                # Match LLM allocation plan to actual goals
                for goal_alloc in goal_allocations:
                    goal_id = goal_alloc.get("goal_id")
                    goal_amount = goal_alloc.get("amount", 0)
                    
                    # Find matching goal
                    matching_goal = None
                    for goal in regular_goals:
                        if str(goal.get("id")) == str(goal_id):
                            matching_goal = goal
                            break
                    
                    if not matching_goal and regular_goals:
                        # If goal_id doesn't match, use first available goal
                        matching_goal = regular_goals[0]
                        regular_goals = regular_goals[1:]  # Remove to avoid duplicate allocation
                    
                    if matching_goal and goal_amount > 0:
                        goal_target = float(matching_goal.get("target", 0))
                        goal_saved = float(matching_goal.get("saved", 0))
                        goal_remaining = goal_target - goal_saved
                        
                        if goal_target == 0:
                            logger.warning(f"Goal '{matching_goal.get('name')}' has target 0, skipping allocation")
                            continue
                        
                        if goal_remaining > 0:
                            goal_allocation = min(goal_remaining, goal_amount)
                            if goal_allocation > 0:
                                result = tool_registry.execute_tool(
                                    ToolType.ALLOCATE_TO_GOAL,
                                    {"goal_id": matching_goal["id"], "amount": goal_allocation},
                                    "connection_sync"
                                )
                                if result.get("success"):
                                    allocation_actions.append(result)
                                    logger.info(f"Auto-allocated ₹{goal_allocation} ({goal_alloc.get('percent', 0)}%) to goal '{matching_goal['name']}' from connection income (LLM-determined)")
                
                if allocation_actions:
                    total_allocated = sum(a.get("allocated", 0) for a in allocation_actions)
                    remaining_for_user = total_new_income - total_allocated
                    logger.info(f"Successfully allocated ₹{total_allocated} ({(total_allocated/total_new_income*100):.1f}%) from ₹{total_new_income} connection income to {len(allocation_actions)} goals using LLM-determined percentages. User has ₹{remaining_for_user} ({(remaining_for_user/total_new_income*100):.1f}%) remaining.")
                    
                    # Update savings streak (non-blocking)
                    try:
                        from services.streak_service import update_savings_streak
                        streak_result = update_savings_streak(background_db, str(user_id), total_allocated)
                        if streak_result.get("current_streak", 0) > 0:
                            logger.info(f"Savings streak updated: {streak_result.get('message', '')}")
                    except Exception as streak_error:
                        logger.warning(f"Failed to update savings streak: {streak_error}")
                    
                    # Prepare allocation details for email
                    from email_service import send_income_allocation_email
                    
                    try:
                        user = get_user_by_id(background_db, str(user_id))
                        if user:
                            email_allocations = []
                            for action in allocation_actions:
                                goal_id = action.get("goal_id")
                                allocated_amount = action.get("allocated", 0)
                                percent = (allocated_amount / total_new_income * 100) if total_new_income > 0 else 0
                                
                                # Get goal details
                                goal_name = "Unknown Goal"
                                goal_type = "savings"
                                for goal in active_goals:
                                    if str(goal.get("id")) == str(goal_id):
                                        goal_name = goal.get("name", "Unknown Goal")
                                        goal_type = goal.get("type", "savings")
                                        break
                                
                                email_allocations.append({
                                    "goal_name": goal_name,
                                    "amount": allocated_amount,
                                    "percent": percent,
                                    "goal_type": goal_type
                                })
                            
                            # Send email notification
                            user_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email.split('@')[0]
                            send_income_allocation_email(
                                email=user.email,
                                user_name=user_name,
                                income_amount=total_new_income,
                                allocations=email_allocations,
                                total_allocated=total_allocated,
                                remaining_amount=remaining_for_user,
                                transaction_date=None,  # Use current date for sync
                                transactions=new_income_transactions
                            )
                    except Exception as email_error:
                        logger.error(f"Failed to send income allocation email during sync: {email_error}", exc_info=True)
            else:
                logger.info(f"No active goals found - income allocation skipped (goals will be created first)")
            
            # CRITICAL: Mark these transactions as allocated by storing their IDs in connection metadata
            # This prevents double allocation even if last_sync is reset
            # IMPORTANT: Only mark as allocated if actual allocations happened (allocation_actions is not empty)
            # If there are no active goals, DON'T mark them as allocated so they can be allocated later when goals are created
            if allocation_actions and new_income_transactions:
                # Get transaction IDs that were processed (allocated or skipped due to no goals)
                allocated_ids = [t.get("id") for t in new_income_transactions if t.get("id")]
                
                if allocated_ids:
                    # Ensure connection_data exists and is a dict
                    if connection_data is None:
                        connection_data = {}
                    elif isinstance(connection_data, str):
                        try:
                            connection_data = json.loads(connection_data)
                        except:
                            connection_data = {}
                    
                    if not isinstance(connection_data, dict):
                        connection_data = {}
                    
                    # Initialize allocated_transaction_ids if it doesn't exist
                    if "allocated_transaction_ids" not in connection_data:
                        connection_data["allocated_transaction_ids"] = []
                    
                    # Add new IDs (avoid duplicates)
                    existing_allocated = set(connection_data["allocated_transaction_ids"])
                    new_ids = [tid for tid in allocated_ids if tid and tid not in existing_allocated]
                    
                    if new_ids:
                        connection_data["allocated_transaction_ids"].extend(new_ids)
                        
                        # Save updated connection_data back to database
                        from schemas import ConnectionUpdate
                        from crud import update_connection
                        connection_update = ConnectionUpdate(connection_data=connection_data)
                        
                        # CRITICAL: Log what we're about to save
                        logger.info(f"🔄 Background task: About to save connection_data with {len(connection_data.get('transactions', []))} transactions, {len(connection_data.get('allocated_transaction_ids', []))} allocated IDs")
                        
                        updated_connection = update_connection(background_db, connection_id, user_id, connection_update)
                        
                        # CRITICAL: update_connection already commits, but verify it worked
                        # No need to commit again - update_connection handles it
                        logger.info(f"✅ Background task: update_connection completed (it commits internally)")
                        
                        # CRITICAL: Verify the data was saved by querying directly
                        from sqlalchemy import text
                        result = background_db.execute(
                            text("SELECT connection_data FROM payment_connections WHERE id = :id"),
                            {"id": connection_id}
                        ).first()
                        
                        if result and result[0]:
                            import json
                            saved_data = json.loads(result[0])
                            saved_txn_count = len(saved_data.get("transactions", []))
                            saved_allocated_count = len(saved_data.get("allocated_transaction_ids", []))
                            logger.info(f"✅ Background task: Verified {saved_txn_count} transactions and {saved_allocated_count} allocated IDs in database")
                        else:
                            logger.error(f"❌ Background task: CRITICAL - connection_data is NULL in database after commit!")
                        
                        # CRITICAL: Verify the data was saved
                        if updated_connection and updated_connection.connection_data:
                            if isinstance(updated_connection.connection_data, dict):
                                saved_ids = updated_connection.connection_data.get("allocated_transaction_ids", [])
                                logger.info(f"✅ Marked {len(new_ids)} transaction IDs as allocated in connection metadata: {new_ids}")
                                logger.info(f"✅ Verified {len(saved_ids)} total allocated transaction IDs saved to database")
                            else:
                                logger.warning(f"⚠️  Background task: connection_data is not a dict after update (type: {type(updated_connection.connection_data)})")
                        else:
                            logger.error(f"❌ Background task: CRITICAL - connection_data is None after update_connection!")
                    else:
                        logger.info(f"ℹ️  Background task: All {len(allocated_ids)} transaction IDs were already in allocated_transaction_ids list")
                else:
                    logger.warning(f"⚠️  Background task: No transaction IDs found in new_income_transactions to mark as allocated")
            else:
                logger.warning(f"⚠️  Background task: new_income_transactions is empty, cannot mark transaction IDs as allocated")
            
            # Update last_sync after allocation completes to reflect when allocation happened
            # This ensures next sync uses correct cutoff time
            if allocation_actions:
                # CRITICAL: Expire ALL connection objects from the session to prevent SQLAlchemy
                # from trying to save them with dict connection_data (which causes "can't adapt type 'dict'" error)
                # get_connection_by_id parses connection_data to dict, and SQLAlchemy can't save dicts to String columns
                from models import PaymentConnection
                for obj in list(background_db.identity_map.values()):
                    if isinstance(obj, PaymentConnection):
                        background_db.expire(obj)
                        logger.debug(f"Expired PaymentConnection object {obj.id} from session to prevent dict save error")
                
                # CRITICAL: Update last_sync directly via SQL to avoid stale session data
                # Don't use get_connection_by_id as it might return stale connection_data
                from sqlalchemy import text
                from datetime import datetime, timezone
                try:
                    background_db.execute(
                        text("UPDATE payment_connections SET last_sync = :last_sync WHERE id = :id AND user_id = :user_id"),
                        {
                            "id": connection_id,
                            "user_id": user_id,
                            "last_sync": datetime.now(timezone.utc)
                        }
                    )
                    background_db.commit()
                    logger.debug(f"Updated connection last_sync after allocation (via direct SQL to avoid stale data)")
                except Exception as e:
                    logger.error(f"Failed to update last_sync: {e}", exc_info=True)
                    background_db.rollback()
        finally:
            background_db.close()
            logger.info(f"BACKGROUND TASK COMPLETED: Income allocation for connection {connection_id}")
    except Exception as e:
        logger.error(f"❌ ERROR in income allocation from sync {connection_id}: {e}", exc_info=True)


def allocate_income_from_new_connection(user_id: UUID, connection_id: UUID):
    """Background task to allocate income from a newly added connection"""
    logger.info(f"BACKGROUND TASK STARTED: Allocating income from new connection {connection_id} for user {user_id}")
    try:
        from database import SessionLocal
        from crud import get_user_connections, get_user_by_id
        from routers.coach import get_real_user_data
        from services.agentic_ai import ToolRegistry, ToolType
        from services.ai_coach import emergency_fund_agent, determine_allocation_percentages
        from datetime import datetime, timedelta, timezone
        import json
        
        background_db = SessionLocal()
        try:
            user = get_user_by_id(background_db, str(user_id))
            if not user:
                logger.warning(f"User not found for income allocation: {user_id}")
                return
            
            # Get the connection
            connections = get_user_connections(background_db, user_id, status_filter="connected", parse_json=True)
            connection = next((c for c in connections if str(c.id) == str(connection_id)), None)
            
            if not connection:
                logger.warning(f"Connection {connection_id} not found for income allocation")
                return
            
            # Parse connection data
            connection_data = connection.connection_data
            if connection_data is None:
                connection_data = {}
            elif isinstance(connection_data, str):
                try:
                    connection_data = json.loads(connection_data)
                except:
                    connection_data = {}
            
            # Ensure connection_data is a dict
            if not isinstance(connection_data, dict):
                    connection_data = {}
            
            # Check for income transactions in the last 7 days
            if connection_data and "transactions" in connection_data:
                transactions = connection_data.get("transactions", [])
                if not isinstance(transactions, list):
                    transactions = []
                
                # Find income transactions (credit) that occurred AFTER connection was created
                # This prevents re-allocating income when disconnecting and reconnecting
                connection_created_at = connection.created_at
                if connection_created_at:
                    connection_created_at = to_ist(connection_created_at)
                else:
                    # If no created_at, use last_sync or current time as fallback
                    connection_created_at = connection.last_sync
                    if connection_created_at:
                        connection_created_at = to_ist(connection_created_at)
                    else:
                        connection_created_at = get_ist_now()
                
                # Only allocate income from transactions AFTER connection was created
                # This ensures we don't re-allocate income when reconnecting
                new_income_transactions = []
                
                for txn in transactions:
                    if not isinstance(txn, dict):
                        continue
                            
                    # Check if it's an income transaction (credit)
                    if txn.get("type", "").lower() == "credit":
                        amount = float(txn.get("amount", 0))
                        if amount > 0:
                            # Check transaction date
                            txn_date = None
                            if txn.get("timestamp"):
                                try:
                                    if isinstance(txn["timestamp"], str):
                                        # Parse timestamp and ensure it's timezone-aware
                                        txn_date_str = txn["timestamp"].replace("Z", "+00:00")
                                        txn_date = datetime.fromisoformat(txn_date_str)
                                        # If timezone-naive, assume UTC then convert to IST
                                        if txn_date.tzinfo is None:
                                            txn_date = txn_date.replace(tzinfo=timezone.utc)
                                        txn_date = to_ist(txn_date)
                                    else:
                                        txn_date = txn["timestamp"]
                                        # If timezone-naive, assume UTC then convert to IST
                                        if isinstance(txn_date, datetime):
                                            if txn_date.tzinfo is None:
                                                txn_date = txn_date.replace(tzinfo=timezone.utc)
                                            txn_date = to_ist(txn_date)
                                except Exception as e:
                                    logger.warning(f"Error parsing transaction timestamp: {e}")
                                    pass
                            
                            # Only allocate income from transactions that occurred AFTER connection was created
                            # This prevents double allocation when disconnecting and reconnecting
                            if txn_date and txn_date >= connection_created_at:
                                txn_id = txn.get("id", "")
                                new_income_transactions.append({
                                    "amount": amount,
                                    "date": txn_date,
                                    "description": txn.get("description", "Income from connection"),
                                    "id": txn_id  # Store ID for tracking
                                })
                                logger.debug(f"Including transaction ₹{amount} (ID: {txn_id}) from {txn_date} (after connection created at {connection_created_at})")
                            else:
                                logger.debug(f"Skipping transaction ₹{amount} from {txn_date} (before connection created at {connection_created_at})")
                
                # If we found new income (transactions after connection creation), allocate it
                if new_income_transactions:
                    total_new_income = sum(t["amount"] for t in new_income_transactions)
                    logger.info(f"Found ₹{total_new_income} new income from connection '{connection.name}' (transactions after {connection_created_at}). Triggering allocation...")
                    
                    # Initialize tool registry (Agentic AI tools)
                    tool_registry = ToolRegistry(background_db, user_id)
                    
                    # Get user data
                    user_data = get_real_user_data(background_db, user_id, user)
                    
                    # Ensure emergency fund goal has proper target
                    emergency_analysis = emergency_fund_agent(user_data)
                    
                    # Get all goals
                    goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "new_connection_allocation")
                    
                    if goals_result.get("success") and goals_result.get("goals"):
                        goals = goals_result["goals"]
                        active_goals = [g for g in goals if not g.get("is_completed", False)]
                        
                        if active_goals:
                            # Calculate recent expenses for context
                            from services.ai_coach import get_last_3_months_transactions
                            recent_txs = get_last_3_months_transactions(user_data)
                            expense_txs = [t for t in recent_txs if float(t[1]) < 0]
                            recent_expenses = abs(sum(float(t[1]) for t in expense_txs)) if expense_txs else None
                            
                            # Get LLM-determined allocation percentages
                            logger.info(f"Calling determine_allocation_percentages for ₹{total_new_income} income...")
                            try:
                                allocation_plan = determine_allocation_percentages(
                                    income_amount=total_new_income,
                                    user_data=user_data,
                                    goals=active_goals,
                                    recent_expenses=recent_expenses
                                )
                                logger.info(f"LLM Allocation Plan for new connection income: {allocation_plan.get('reasoning', 'N/A')}")
                            except Exception as alloc_error:
                                logger.error(f"Error in determine_allocation_percentages: {alloc_error}", exc_info=True)
                                # Use default allocation plan
                                allocation_plan = {
                                    "success": False,
                                    "emergency_fund": {"percent": 10.0, "amount": int(total_new_income * 0.1)},
                                    "goal_allocations": [
                                        {"goal_id": g.get("id"), "percent": 15.0, "amount": int(total_new_income * 0.15)}
                                        for g in active_goals[:2] if g.get("type") != "emergency"
                                    ],
                                    "total_allocation_percent": 40.0,
                                    "spending_percent": 40.0,
                                    "investment_percent": 20.0,
                                    "remaining_percent": 60.0,
                                    "remaining_amount": int(total_new_income * 0.6),
                                    "investment_amount": int(total_new_income * 0.2),
                                    "reasoning": "Default allocation (error occurred)"
                                }
                                logger.warning(f"Using default allocation plan due to error")
                            
                            allocation_actions = []
                            
                            # Allocate to Emergency Fund
                            emergency_goals = [g for g in active_goals if g.get("type") == "emergency"]
                            emergency_fund_allocation_info = allocation_plan.get("emergency_fund", {})
                            if emergency_goals and emergency_fund_allocation_info.get("amount", 0) > 0:
                                emergency_goal = emergency_goals[0]
                                emergency_target = float(emergency_goal.get("target", 0))
                                emergency_saved = float(emergency_goal.get("saved", 0))
                                emergency_remaining = emergency_target - emergency_saved
                                
                                if emergency_remaining > 0 and emergency_target > 0:
                                    emergency_allocation = emergency_fund_allocation_info.get("amount", 0)
                                    emergency_allocation = min(emergency_remaining, emergency_allocation)
                                    if emergency_allocation > 0:
                                        result = tool_registry.execute_tool(
                                            ToolType.ALLOCATE_TO_GOAL,
                                            {"goal_id": emergency_goal["id"], "amount": emergency_allocation},
                                            "new_connection_allocation"
                                        )
                                        if result.get("success"):
                                            allocation_actions.append(result)
                                            logger.info(f"Auto-allocated ₹{emergency_allocation} ({emergency_fund_allocation_info.get('percent', 0)}%) to Emergency Fund from new connection income (LLM-determined)")
                            
                            # Allocate to regular goals
                            goal_allocations = allocation_plan.get("goal_allocations", [])
                            regular_goals = [g for g in active_goals if g.get("type") != "emergency"]
                            
                            for goal_alloc in goal_allocations:
                                goal_id_from_llm = goal_alloc.get("goal_id")
                                goal_amount = goal_alloc.get("amount", 0)
                                
                                if goal_id_from_llm and goal_amount > 0:
                                    # Try exact match first
                                    matching_goal = next((g for g in regular_goals if str(g.get("id")) == str(goal_id_from_llm)), None)
                                    
                                    # If no exact match, try to find by partial match (handles LLM typos)
                                    if not matching_goal:
                                        # Try matching first 8 characters (UUID prefix)
                                        goal_id_prefix = str(goal_id_from_llm)[:8] if len(str(goal_id_from_llm)) >= 8 else str(goal_id_from_llm)
                                        potential_matches = [g for g in regular_goals if str(g.get("id", ""))[:8] == goal_id_prefix]
                                        if len(potential_matches) == 1:
                                            matching_goal = potential_matches[0]
                                            logger.warning(f"LLM goal_id '{goal_id_from_llm}' didn't match exactly, but found match by prefix: '{matching_goal.get('id')}' for goal '{matching_goal.get('name')}'")
                                    
                                    # If still no match, try to match by goal order (fallback)
                                    if not matching_goal and regular_goals:
                                        # Use goal order from LLM response as fallback
                                        goal_index = goal_allocations.index(goal_alloc)
                                        if goal_index < len(regular_goals):
                                            matching_goal = regular_goals[goal_index]
                                            logger.warning(f"LLM goal_id '{goal_id_from_llm}' didn't match any goal, using goal order fallback: '{matching_goal.get('name')}' (ID: {matching_goal.get('id')})")
                                    
                                    if matching_goal:
                                        goal_target = float(matching_goal.get("target", 0))
                                        goal_saved = float(matching_goal.get("saved", 0))
                                        goal_remaining = goal_target - goal_saved
                                        
                                        if goal_target == 0:
                                            logger.warning(f"Goal '{matching_goal.get('name')}' has target 0, skipping allocation")
                                            continue
                                        
                                        if goal_remaining > 0:
                                            goal_allocation = min(goal_remaining, goal_amount)
                                            if goal_allocation > 0:
                                                result = tool_registry.execute_tool(
                                                    ToolType.ALLOCATE_TO_GOAL,
                                                    {"goal_id": matching_goal["id"], "amount": goal_allocation},
                                                    "new_connection_allocation"
                                                )
                                                if result.get("success"):
                                                    allocation_actions.append(result)
                                                    logger.info(f"Auto-allocated ₹{goal_allocation} ({goal_alloc.get('percent', 0)}%) to goal '{matching_goal['name']}' from new connection income (LLM-determined)")
                                                else:
                                                    logger.error(f"Failed to allocate ₹{goal_allocation} to goal '{matching_goal.get('name')}': {result.get('error', 'Unknown error')}")
                                        else:
                                            logger.warning(f"Goal '{matching_goal.get('name')}' is already completed (remaining: ₹{goal_remaining}), skipping allocation")
                                    else:
                                        logger.warning(f"Could not find matching goal for LLM goal_id '{goal_id_from_llm}'. Available goal IDs: {[str(g.get('id')) for g in regular_goals]}")
                            
                            if allocation_actions:
                                total_allocated = sum(a.get("allocated", 0) for a in allocation_actions)
                                remaining_for_user = total_new_income - total_allocated
                                logger.info(f"✅ Successfully allocated ₹{total_allocated} ({(total_allocated/total_new_income*100):.1f}%) from ₹{total_new_income} new connection income to {len(allocation_actions)} goals using LLM-determined percentages. User has ₹{remaining_for_user} ({(remaining_for_user/total_new_income*100):.1f}%) remaining.")
                                
                                # Update savings streak (non-blocking)
                                try:
                                    from services.streak_service import update_savings_streak
                                    streak_result = update_savings_streak(background_db, str(user_id), total_allocated)
                                    if streak_result.get("current_streak", 0) > 0:
                                        logger.info(f"Savings streak updated: {streak_result.get('message', '')}")
                                except Exception as streak_error:
                                    logger.warning(f"Failed to update savings streak: {streak_error}")
                                
                                # Prepare allocation details for email
                                from email_service import send_income_allocation_email
                                email_allocations = []
                                for action in allocation_actions:
                                    goal_id = action.get("goal_id")
                                    allocated_amount = action.get("allocated", 0)
                                    percent = (allocated_amount / total_new_income * 100) if total_new_income > 0 else 0
                                    
                                    # Get goal details
                                    goal_name = "Unknown Goal"
                                    goal_type = "savings"
                                    for goal in active_goals:
                                        if str(goal.get("id")) == str(goal_id):
                                            goal_name = goal.get("name", "Unknown Goal")
                                            goal_type = goal.get("type", "savings")
                                            break
                                    
                                    email_allocations.append({
                                        "goal_name": goal_name,
                                        "amount": allocated_amount,
                                        "percent": percent,
                                        "goal_type": goal_type
                                    })
                                
                                # Send email notification
                                try:
                                    user_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email.split('@')[0]
                                    # Use CURRENT date/time for email (not transaction date)
                                    # This shows when the allocation happened, not when transactions occurred
                                    current_date = get_ist_now()
                                    send_income_allocation_email(
                                        email=user.email,
                                        user_name=user_name,
                                        income_amount=total_new_income,
                                        allocations=email_allocations,
                                        total_allocated=total_allocated,
                                        remaining_amount=remaining_for_user,
                                        transaction_date=current_date,
                                        transactions=new_income_transactions
                                    )
                                except Exception as email_error:
                                    logger.error(f"Failed to send income allocation email: {email_error}", exc_info=True)
                                
                                # Mark these transactions as allocated by storing their IDs in connection metadata
                                if allocation_actions and new_income_transactions:
                                    # Get transaction IDs that were just allocated
                                    allocated_ids = [t.get("id") for t in new_income_transactions if t.get("id")]
                                    
                                    if allocated_ids:
                                        # Ensure connection_data exists and is a dict
                                        if connection_data is None:
                                            connection_data = {}
                                        elif isinstance(connection_data, str):
                                            try:
                                                connection_data = json.loads(connection_data)
                                            except:
                                                connection_data = {}
                                        
                                        if not isinstance(connection_data, dict):
                                            connection_data = {}
                                        
                                        # Initialize allocated_transaction_ids if it doesn't exist
                                        if "allocated_transaction_ids" not in connection_data:
                                            connection_data["allocated_transaction_ids"] = []
                                        
                                        # Add new IDs (avoid duplicates)
                                        existing_allocated = set(connection_data["allocated_transaction_ids"])
                                        new_ids = [tid for tid in allocated_ids if tid and tid not in existing_allocated]
                                        connection_data["allocated_transaction_ids"].extend(new_ids)
                                        
                                        # Save updated connection_data back to database
                                        from schemas import ConnectionUpdate
                                        from crud import update_connection
                                        connection_update = ConnectionUpdate(connection_data=connection_data)
                                        update_connection(background_db, connection_id, user_id, connection_update)
                                        
                                        logger.info(f"✅ Marked {len(new_ids)} transaction IDs as allocated in connection metadata: {new_ids}")
                            else:
                                logger.info(f"No allocation made - goals may be completed or no active goals found")
                        else:
                            logger.info(f"No active goals found - income allocation skipped (goals will be created first)")
                    else:
                        logger.info(f"No goals found yet - income allocation skipped (goals will be created first, then income can be allocated on next sync)")
                else:
                    logger.info(f"No new income (transactions after connection creation at {connection_created_at}) found in connection '{connection.name}' - skipping allocation")
                
                # Detect new spending transactions around connection creation (last 12 hours)
                expense_window_start = connection_created_at - timedelta(hours=12)
                new_expense_transactions = []
                for txn in transactions:
                    if not isinstance(txn, dict):
                        continue
                    if str(txn.get("type", "")).lower() != "debit":
                        continue
                    amount = float(txn.get("amount", 0))
                    if amount <= 0:
                        continue
                    txn_date = None
                    if txn.get("timestamp"):
                        txn_date = _normalize_timestamp(txn.get("timestamp"))
                    if txn_date and txn_date >= expense_window_start:
                        description = txn.get("description", f"Expense via {connection.name}")
                        category = _format_spending_category(description)
                        new_expense_transactions.append({
                            "amount": amount,
                            "date": txn_date,
                            "description": description,
                            "category": category,
                        })
                
                if new_expense_transactions:
                    logger.info(f"Sending {len(new_expense_transactions)} spending notifications from connection '{connection.name}'")
                    notify_connection_spending(background_db, user, new_expense_transactions)
            else:
                logger.info(f"No transaction data found in new connection '{connection.name}' - skipping allocation")
        finally:
            background_db.close()
            logger.info(f"BACKGROUND TASK COMPLETED: Income allocation for connection {connection_id}")
    except Exception as e:
        logger.error(f"❌ ERROR in income allocation from new connection {connection_id}: {e}", exc_info=True)

@router.post("", response_model=ConnectionResponse)
def connect_payment_gateway(
    connection: ConnectionCreate,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Connect a payment gateway and automatically generate goals if this is the first connection"""
    # Load mock data for the connection
    mock_data = load_mock_data(connection.name)
    
    # Merge mock data with provided connection_data
    # Note: create_connection will handle preserving allocated_transaction_ids if reconnecting
    if connection.connection_data:
        connection.connection_data = {**mock_data, **connection.connection_data}
    else:
        connection.connection_data = mock_data
    
    db_connection = create_connection(db, user_id, connection)
    
    # Schedule goal processing in background (non-blocking)
    logger.info(f"Scheduling background task to process goals for user {user_id} after connection creation")
    background_tasks.add_task(process_goals_after_connection, user_id)
    logger.info(f"Background task scheduled. Connection {db_connection.id} created successfully.")
    
    # Also schedule income allocation for new connection (if it has recent income)
    background_tasks.add_task(allocate_income_from_new_connection, user_id, db_connection.id)
    logger.info(f"Income allocation task scheduled for new connection {db_connection.id}")
    
    # Return connection immediately (don't wait for goal processing)
    # Goal creation/updates happen in background via BackgroundTasks
    return db_connection

@router.delete("/{connection_id}", response_model=dict)
def disconnect_payment_gateway(
    connection_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Disconnect a payment gateway and return its data"""
    connection_data = disconnect_connection(db, connection_id, user_id)
    
    return {
        "message": "Connection disconnected successfully",
        "connection_data": connection_data
    }

@router.post("/{connection_id}/sync", response_model=ConnectionResponse)
def sync_payment_gateway(
    connection_id: UUID,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Sync a payment gateway connection and automatically allocate new income to goals"""
    existing_connection = get_connection_by_id(db, connection_id, user_id)
    if not existing_connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    previous_last_sync = existing_connection.last_sync
    
    # IMPORTANT: Get allocated_transaction_ids BEFORE syncing
    # This prevents losing them if connection_data is None
    existing_allocated_ids = set()
    if existing_connection.connection_data:
        try:
            import json
            if isinstance(existing_connection.connection_data, str):
                existing_conn_data = json.loads(existing_connection.connection_data)
            else:
                existing_conn_data = existing_connection.connection_data
            if isinstance(existing_conn_data, dict):
                existing_allocated_ids = set(existing_conn_data.get("allocated_transaction_ids", []))
                logger.info(f"📋 Preserved {len(existing_allocated_ids)} allocated transaction IDs before sync")
        except:
            pass
    
    connection = sync_connection(db, connection_id, user_id)
    
    # IMPORTANT: Refresh connection to ensure we have the latest data from database
    # sync_connection might have updated connection_data, so we need fresh data
    db.refresh(connection)
    
    # After syncing, check for new income transactions and allocate them
    try:
        from services.agentic_ai import ToolRegistry, ToolType
        from routers.coach import get_real_user_data
        from services.ai_coach import emergency_fund_agent
        from datetime import datetime, timedelta, timezone
        
        # Get user
        user = get_user_by_id(db, str(user_id))
        if not user:
            logger.warning(f"User not found for allocation: {user_id}")
            return connection
        
        # Parse connection data
        # IMPORTANT: After sync_connection, connection_data might be a string (JSON) or dict
        # We need to handle both cases because SQLAlchemy returns stored value (JSON string) from DB
        connection_data_raw = connection.connection_data
        logger.info(f"🔍 Raw connection_data type after sync: {type(connection_data_raw)}, is None: {connection_data_raw is None}")
        
        if connection_data_raw is None:
            logger.warning(f"⚠️  Connection '{connection.name}' has connection_data = None after sync")
            connection_data = {}
        elif isinstance(connection_data_raw, str):
            import json
            try:
                connection_data = json.loads(connection_data_raw)
                logger.info(f"✅ Parsed connection_data from JSON string for '{connection.name}' (length: {len(connection_data_raw)} chars)")
                logger.info(f"✅ Parsed dict has keys: {list(connection_data.keys()) if isinstance(connection_data, dict) else 'NOT A DICT'}")
            except Exception as e:
                logger.error(f"❌ Failed to parse connection_data JSON for '{connection.name}': {e}")
                logger.error(f"❌ JSON string preview: {connection_data_raw[:200] if connection_data_raw else 'None'}...")
                connection_data = {}
        elif isinstance(connection_data_raw, dict):
            logger.info(f"✅ connection_data is already a dict for '{connection.name}' with keys: {list(connection_data_raw.keys())}")
            connection_data = connection_data_raw
        else:
            logger.warning(f"⚠️  Connection '{connection.name}' has connection_data of unexpected type: {type(connection_data_raw)}")
            connection_data = {}
        
        # Ensure connection_data is a dict
        if not isinstance(connection_data, dict):
            logger.error(f"❌ connection_data is not a dict after parsing for '{connection.name}', resetting to empty dict")
            logger.error(f"❌ Final connection_data type: {type(connection_data)}, value: {str(connection_data)[:200]}")
            connection_data = {}
        
        # Restore allocated_transaction_ids if they were lost during sync
        # But make sure we don't overwrite transactions that were just loaded
        if existing_allocated_ids:
            # Check if allocated_transaction_ids exist in connection_data
            current_allocated = set(connection_data.get("allocated_transaction_ids", []))
            # Merge with preserved IDs to ensure we have all of them
            merged_allocated_ids = existing_allocated_ids.union(current_allocated)
            
            if len(merged_allocated_ids) > len(current_allocated):
                # We have more IDs to restore, update connection_data
                connection_data["allocated_transaction_ids"] = list(merged_allocated_ids)
                logger.info(f"🔄 Restored {len(merged_allocated_ids)} allocated transaction IDs after sync (had {len(current_allocated)}, preserved {len(existing_allocated_ids)})")
                # IMPORTANT: Preserve connection_data before update_connection
                # because update_connection might lose it
                preserved_connection_data = connection_data.copy()
                # Save it back
                from schemas import ConnectionUpdate
                connection_update = ConnectionUpdate(connection_data=connection_data)
                update_connection(db, connection_id, user_id, connection_update)
                # Use preserved data instead of re-fetching (which might return None)
                connection_data = preserved_connection_data
                logger.info(f"🔄 After update_connection: Using preserved connection_data, keys: {list(connection_data.keys())}")
            else:
                logger.info(f"🔄 Allocated transaction IDs already present: {len(current_allocated)} IDs in connection_data")
        
        # Check for new income transactions since last sync (or last 7 days if no previous sync)
        # Handle both "transactions" (for UPI files) and "entries" (for cash_income.json)
        transactions = []
        
        # CRITICAL: Ensure connection_data is a dict before processing
        # After update_connection, it might have been reset, so re-parse if needed
        if not isinstance(connection_data, dict):
            logger.warning(f"⚠️  connection_data is not a dict before processing, attempting to re-parse...")
            # Try to get fresh data from connection object
            if connection and connection.connection_data:
                if isinstance(connection.connection_data, str):
                    import json
                    try:
                        connection_data = json.loads(connection.connection_data)
                        logger.info(f"✅ Re-parsed connection_data from connection object, keys: {list(connection_data.keys())}")
                    except Exception as e:
                        logger.error(f"❌ Failed to re-parse connection_data: {e}")
                        connection_data = {}
                elif isinstance(connection.connection_data, dict):
                    connection_data = connection.connection_data
                    logger.info(f"✅ Got connection_data from connection object, keys: {list(connection_data.keys())}")
                else:
                    connection_data = {}
            else:
                connection_data = {}
        
        # Log what we have before processing
        logger.info(f"🔍 connection_data type: {type(connection_data)}, is None: {connection_data is None}, is dict: {isinstance(connection_data, dict)}")
        logger.info(f"🔍 connection_data truthy check: {bool(connection_data)}, len if dict: {len(connection_data) if isinstance(connection_data, dict) else 'N/A'}")
        if isinstance(connection_data, dict) and connection_data:
            logger.info(f"🔍 connection_data keys: {list(connection_data.keys())}")
        
        if connection_data and isinstance(connection_data, dict):
            logger.info(f"🔍 Connection data keys: {list(connection_data.keys())}")
            if "transactions" in connection_data:
                transactions = connection_data.get("transactions", [])
                logger.info(f"📋 Found {len(transactions)} transactions in connection_data for '{connection.name}'")
                # Log first few transaction IDs to verify they're loaded
                if transactions:
                    sample_ids = [t.get("id", "no-id")[:30] for t in transactions[:3] if isinstance(t, dict)]
                    logger.info(f"📋 Sample transaction IDs: {sample_ids}")
            elif "entries" in connection_data:
                # For cash_income.json, entries are income transactions
                entries = connection_data.get("entries", [])
                logger.info(f"📋 Found {len(entries)} entries in connection_data for '{connection.name}'")
                # Convert entries to transaction format for processing
                for entry in entries:
                    if isinstance(entry, dict):
                        # Convert entry to transaction-like format
                        txn = {
                            "type": "credit",  # All entries in cash_income are income
                            "amount": entry.get("amount", 0),
                            "description": entry.get("description", "Cash Income"),
                            "timestamp": None,  # Will use date field
                            "date": entry.get("date"),
                            "id": entry.get("id", "")  # Preserve entry ID
                        }
                        transactions.append(txn)
                if transactions:
                    sample_ids = [t.get("id", "no-id")[:30] for t in transactions[:3]]
                    logger.info(f"📋 Sample entry IDs: {sample_ids}")
            else:
                logger.warning(f"⚠️  Connection '{connection.name}' has no 'transactions' or 'entries' in connection_data")
        else:
            logger.warning(f"⚠️  Connection '{connection.name}' has no connection_data or it's not a dict")
        
        if not isinstance(transactions, list):
            transactions = []
            logger.warning(f"⚠️  Transactions is not a list, resetting to empty list")
        
        # Determine cutoff time: use previous_last_sync if available, otherwise connection creation time
        today = get_ist_now()
        
        # Get connection creation time as the absolute minimum cutoff
        # Transactions before connection was created should NEVER be allocated
        connection_created_at = connection.created_at
        if connection_created_at:
            connection_created_at = to_ist(connection_created_at)
        else:
            # Fallback: if no created_at, use a very old date to be safe
            connection_created_at = today - timedelta(days=365)
        
        if previous_last_sync:
            previous_last_sync = to_ist(previous_last_sync)
            # Use the later of: last_sync OR connection creation time
            # This ensures we never allocate transactions from before connection was created
            cutoff_time = max(previous_last_sync, connection_created_at)
        else:
            # If no previous sync, use connection creation time (not last 7 days)
            # This prevents allocating old transactions when syncing for the first time
            cutoff_time = connection_created_at
        
        logger.info(f"🕐 Cutoff time set to: {cutoff_time} (connection created: {connection_created_at}, last_sync: {previous_last_sync})")
        
        # Get list of already-allocated transaction IDs from connection metadata
        # This prevents double allocation even if last_sync is reset or transactions are re-added
        # Also merge with preserved IDs from before sync
        allocated_txn_ids = existing_allocated_ids.copy() if 'existing_allocated_ids' in locals() else set()
        if connection_data and isinstance(connection_data, dict):
            allocated_txn_ids.update(connection_data.get("allocated_transaction_ids", []))
        logger.info(f"📋 Found {len(allocated_txn_ids)} previously allocated transaction IDs in connection metadata")
        
        new_income_transactions = []
        
        logger.info(f"🔍 Processing {len(transactions)} transactions to find income (credit) transactions...")
        credit_count = 0
        for txn in transactions:
            if not isinstance(txn, dict):
                logger.debug(f"⏭️  Skipping non-dict transaction: {type(txn)}")
                continue
            
            # Check if it's an income transaction (credit)
            txn_type = txn.get("type", "").lower()
            if txn_type == "credit":
                credit_count += 1
                amount = float(txn.get("amount", 0))
                if amount > 0:
                    # Check transaction date - handle both timestamp and date fields
                    # This is critical for transactions added through admin panel
                    txn_date = None
                    if txn.get("timestamp"):
                        try:
                            if isinstance(txn["timestamp"], str):
                                # Parse timestamp and ensure it's timezone-aware
                                # Handle both ISO format with Z and without
                                txn_date_str = txn["timestamp"].replace("Z", "+00:00")
                                if "+" not in txn_date_str and txn_date_str.count(":") == 2:
                                    # If no timezone info, assume UTC
                                    txn_date_str += "+00:00"
                                txn_date = datetime.fromisoformat(txn_date_str)
                                # If timezone-naive, assume UTC then convert to IST
                                if txn_date.tzinfo is None:
                                    txn_date = txn_date.replace(tzinfo=timezone.utc)
                                txn_date = to_ist(txn_date)
                            else:
                                txn_date = txn["timestamp"]
                                # If timezone-naive, assume UTC then convert to IST
                                if isinstance(txn_date, datetime):
                                    if txn_date.tzinfo is None:
                                        txn_date = txn_date.replace(tzinfo=timezone.utc)
                                    txn_date = to_ist(txn_date)
                        except Exception as e:
                            logger.warning(f"Error parsing transaction timestamp '{txn.get('timestamp')}': {e}")
                            pass
                    elif txn.get("date"):
                        # Handle date field (for cash_income.json entries)
                        try:
                            date_str = txn["date"]
                            if isinstance(date_str, str):
                                # Parse date string (format: YYYY-MM-DD)
                                # Try parsing as date first, then add time if needed
                                if "T" in date_str or " " in date_str:
                                    # Has time component
                                    txn_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                                else:
                                    # Just date, set to start of day
                                    txn_date = datetime.fromisoformat(date_str)
                                # Convert to IST
                                if txn_date.tzinfo is None:
                                    txn_date = txn_date.replace(tzinfo=timezone.utc)
                                txn_date = to_ist(txn_date)
                            elif isinstance(date_str, datetime):
                                txn_date = to_ist(date_str)
                        except Exception as e:
                            logger.warning(f"Error parsing transaction date '{txn.get('date')}': {e}")
                            pass
                    
                    # If no timestamp or date, use current time (for newly added transactions without timestamp)
                    # This should rarely happen for admin-added transactions, but handle gracefully
                    if not txn_date:
                        logger.warning(f"Transaction {txn.get('id', 'unknown')} has no timestamp or date, using current time")
                        txn_date = today
                    
                    # Get transaction ID to track which ones have been allocated
                    # Admin panel always provides IDs (txn_recent_XXX or entry_recent_XXX)
                    txn_id = txn.get("id", "")
                    if not txn_id:
                        logger.warning(f"Transaction missing ID - amount: ₹{amount}, date: {txn_date}, description: {txn.get('description', 'N/A')[:50]}")
                        # Generate a stable ID for tracking if missing (shouldn't happen for admin-panel transactions)
                        txn_id = f"auto_{txn_date.strftime('%Y%m%d')}_{int(amount)}_{hash(str(txn.get('description', ''))[:20]) % 10000}"
                    
                    # FIRST CHECK: Skip if this transaction ID has already been allocated
                    # This prevents double allocation even if sync is called multiple times
                    if txn_id and txn_id in allocated_txn_ids:
                        logger.info(f"⏭️  Skipping transaction ₹{amount} (ID: {txn_id[:30]}...) from {txn_date} - already allocated (found in connection metadata)")
                        continue
                    
                    # SECOND CHECK: Only allocate transactions that are:
                    # 1. After the cutoff time (connection creation OR last sync, whichever is later)
                    # 2. OR in the future (scheduled transactions)
                    # CRITICAL: Never allocate transactions from before connection was created
                    is_future_date = txn_date > today
                    is_after_cutoff = txn_date > cutoff_time  # Strictly after cutoff (not equal)
                    is_after_connection_creation = txn_date > connection_created_at  # Additional safety check
                    
                    # Include transaction ONLY if:
                    # - It's in the future (scheduled), OR
                    # - It's after cutoff AND after connection creation (double safety check)
                    # Removed "admin panel transaction" special case - date is the only criteria
                    if is_future_date or (is_after_cutoff and is_after_connection_creation):
                        new_income_transactions.append({
                            "amount": amount,
                            "date": txn_date,
                            "description": txn.get("description", "Income from connection"),
                            "id": txn_id  # Store ID for tracking
                        })
                        if is_future_date:
                            reason = "future date"
                        else:
                            reason = "after cutoff"
                        logger.info(f"✅ Including NEW transaction ₹{amount} (ID: {txn_id[:30]}...) from {txn_date} (reason: {reason}, cutoff: {cutoff_time}, connection_created: {connection_created_at})")
                    else:
                        if not is_after_connection_creation:
                            logger.info(f"⏭️  Skipping transaction ₹{amount} (ID: {txn_id[:30]}...) from {txn_date} - BEFORE connection creation at {connection_created_at}")
                        else:
                            logger.info(f"⏭️  Skipping transaction ₹{amount} (ID: {txn_id[:30]}...) from {txn_date} (before cutoff {cutoff_time}, not future)")
        
        # Log summary of transaction processing
        logger.info(f"📊 Found {credit_count} credit transactions out of {len(transactions)} total transactions")
        total_checked = sum(1 for txn in transactions if isinstance(txn, dict) and txn.get("type", "").lower() == "credit" and float(txn.get("amount", 0)) > 0)
        skipped_count = total_checked - len(new_income_transactions)
        logger.info(f"📊 Transaction Processing Summary: Checked {total_checked} income transactions (amount > 0), {len(new_income_transactions)} NEW (will allocate), {skipped_count} skipped (already allocated or before cutoff)")
        
        if total_checked == 0 and len(transactions) > 0:
            # Debug: Show what types of transactions we have
            transaction_types = {}
            for txn in transactions:
                if isinstance(txn, dict):
                    txn_type = txn.get("type", "unknown")
                    transaction_types[txn_type] = transaction_types.get(txn_type, 0) + 1
            logger.warning(f"⚠️  No credit transactions found! Transaction types in data: {transaction_types}")
        
        # If we found new income, schedule allocation in background (non-blocking)
        # This prevents timeout - allocation happens asynchronously
        if new_income_transactions:
            total_new_income = sum(t["amount"] for t in new_income_transactions)
            transaction_details = ", ".join([f"₹{t['amount']}" for t in new_income_transactions])
            logger.info(f"💰 Found ₹{total_new_income} new income from connection '{connection.name}' ({transaction_details}). Scheduling allocation in background...")
            
            # Schedule allocation in background task (non-blocking)
            background_tasks.add_task(allocate_income_from_sync, user_id, connection_id, new_income_transactions, previous_last_sync)
            logger.info(f"Background allocation task scheduled for connection {connection_id}")

        # Send spending notifications for new debit transactions since last sync (or last 7 days)
        expense_cutoff = previous_last_sync
        if expense_cutoff:
            if expense_cutoff.tzinfo is None:
                expense_cutoff = to_ist(expense_cutoff)
            expense_cutoff = expense_cutoff - timedelta(minutes=5)
        else:
            expense_cutoff = today - timedelta(days=7)
        
        new_expense_transactions = []
        for txn in transactions:
            if not isinstance(txn, dict):
                continue
            if str(txn.get("type", "")).lower() != "debit":
                continue
            amount = float(txn.get("amount", 0))
            if amount <= 0:
                continue
            txn_date = _normalize_timestamp(txn.get("timestamp"))
            if txn_date and txn_date >= expense_cutoff:
                description = txn.get("description", f"Expense via {connection.name}")
                category = _format_spending_category(description)
                new_expense_transactions.append({
                    "amount": amount,
                    "date": txn_date,
                    "description": description,
                    "category": category,
                })
        
        if new_expense_transactions:
            logger.info(f"Sending {len(new_expense_transactions)} spending notifications from connection '{connection.name}' after sync")
            notify_connection_spending(db, user, new_expense_transactions)
    except Exception as e:
        # Don't fail sync if allocation fails
        logger.error(f"Error in automatic income allocation during sync: {e}", exc_info=True)
    
    # IMPORTANT: Ensure connection_data is a dict before returning (response model expects dict, not JSON string)
    # Refresh connection to get latest data
    db.refresh(connection)
    if connection.connection_data:
        if isinstance(connection.connection_data, str):
            import json
            try:
                connection.connection_data = json.loads(connection.connection_data)
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"Failed to parse connection_data before returning response for '{connection.name}': {e}")
                # Initialize with full structure including empty arrays
                connection.connection_data = {
                    "allocated_transaction_ids": [],
                    "transactions": [],
                    "entries": [],
                    "monthly_summary": {},
                    "account_id": None,
                    "status": "connected",
                    "balance": 0
                }
        # If it's already a dict, we're good
    elif connection.connection_data is None:
        # If connection_data is None, initialize with full structure
        logger.warning(f"Connection '{connection.name}' has NULL connection_data after sync - initializing empty structure")
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

@router.get("/{connection_id}", response_model=ConnectionResponse)
def get_connection(
    connection_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific connection by ID"""
    connection = get_connection_by_id(db, connection_id, user_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    return connection

@router.patch("/{connection_id}", response_model=ConnectionResponse)
def update_connection_details(
    connection_id: UUID,
    connection_update: ConnectionUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Update connection details"""
    connection = update_connection(db, connection_id, user_id, connection_update)
    return connection

