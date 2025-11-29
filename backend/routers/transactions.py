"""
Transactions Router - Endpoints for managing manual transactions (income/expenses)
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import (
    get_user_by_email,
    create_manual_transaction,
    get_user_transactions,
    delete_transaction,
    get_monthly_transaction_total,
    get_monthly_budget_context,
)
from schemas import ManualTransactionCreate, ManualTransactionResponse, MessageResponse
from typing import List, Optional
from routers.coach import get_real_user_data
from services.agentic_ai import ToolRegistry, ToolType
from services.ai_coach import determine_allocation_percentages
from services.streak_service import update_transaction_streak, update_savings_streak
from email_service import (
    send_spending_activity_email,
    send_spending_budget_warning_email,
    send_spending_budget_exceeded_email,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])
security = HTTPBearer()


def allocate_income_to_goals(user_id, transaction_id, income_amount):
    """Background task to allocate income to goals after transaction is created"""
    logger.info(f"BACKGROUND TASK STARTED: Allocating ₹{income_amount} income to goals for user {user_id}")
    try:
        from database import SessionLocal
        from crud import get_user_by_id
        from routers.coach import get_real_user_data
        from services.agentic_ai import ToolRegistry, ToolType
        from services.ai_coach import determine_allocation_percentages, emergency_fund_agent
        from email_service import send_income_allocation_email
        
        background_db = SessionLocal()
        try:
            user = get_user_by_id(background_db, str(user_id))
            if not user:
                logger.warning(f"User not found for income allocation: {user_id}")
                return
            
            # Get transaction date for email
            from models import ManualTransaction
            transaction = background_db.query(ManualTransaction).filter(ManualTransaction.id == transaction_id).first()
            transaction_date = transaction.transaction_date if transaction else None
            
            # Initialize tool registry (Agentic AI tools)
            tool_registry = ToolRegistry(background_db, user_id)
            
            # Get user data
            user_data = get_real_user_data(background_db, user_id, user)
            
            # STEP 1: Ensure emergency fund goal has proper target
            emergency_analysis = emergency_fund_agent(user_data)
            
            # Get all goals
            goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "transaction_creation")
            
            # STEP 0: If no goals exist, create them automatically based on income
            if not goals_result.get("success") or not goals_result.get("goals") or len(goals_result.get("goals", [])) == 0:
                logger.info("No goals found. Creating goals automatically based on income patterns...")
                
                # Analyze income to create adaptive goals
                from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
                income_analysis = income_pattern_agent(user_data)
                
                # Calculate average monthly income
                recent_txs = get_last_3_months_transactions(user_data)
                income_txs = [t for t in recent_txs if float(t[1]) > 0]
                total_income = sum(float(t[1]) for t in income_txs) if income_txs else income_amount
                avg_monthly_income = total_income / max(3, len(income_txs)) if income_txs else income_amount
                
                # If no historical data, use current income as baseline
                if avg_monthly_income == 0 or not income_txs:
                    avg_monthly_income = income_amount * 30  # Estimate monthly from single transaction
                
                # Calculate emergency fund (3-6 months expenses, assume 70% of income goes to expenses)
                avg_monthly_expenses = avg_monthly_income * 0.7
                emergency_fund_target = int(avg_monthly_expenses * 4.5)  # 4.5 months average
                
                # Create adaptive savings goals based on income
                savings_goal_1_target = int(avg_monthly_income * 2)  # 2 months income
                savings_goal_2_target = int(avg_monthly_income * 1.5)  # 1.5 months income
                
                # Ensure minimum values
                emergency_fund_target = max(10000, emergency_fund_target)
                savings_goal_1_target = max(5000, savings_goal_1_target)
                savings_goal_2_target = max(3000, savings_goal_2_target)
                
                # Create goals using tool registry
                from schemas import GoalCreate
                from crud import create_goal
                from datetime import datetime, timedelta
                
                goals_created = []
                
                # 1. Create Emergency Fund
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
                
                # 2. Create First Savings Goal
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
                
                # 3. Create Second Savings Goal
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
                    logger.info(f"Successfully created {len(goals_created)} goals automatically based on income")
                    # Refresh goals list
                    goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "transaction_creation")
            
            if not goals_result.get("success") or not goals_result.get("goals"):
                logger.warning("No goals found after creation attempt, skipping allocation")
            else:
                goals = goals_result["goals"]
                
                # STEP 1: Update goal targets adaptively based on income changes
                from services.ai_coach import income_pattern_agent, get_last_3_months_transactions
                income_analysis = income_pattern_agent(user_data)
                
                # Calculate average monthly income
                recent_txs = get_last_3_months_transactions(user_data)
                income_txs = [t for t in recent_txs if float(t[1]) > 0]
                total_income = sum(float(t[1]) for t in income_txs) if income_txs else income_amount
                avg_monthly_income = total_income / max(3, len(income_txs)) if income_txs else income_amount
                
                if avg_monthly_income == 0 or not income_txs:
                    avg_monthly_income = income_amount * 30
                
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
                                "transaction_creation"
                            )
                            if update_result.get("success"):
                                logger.info(f"Updated Emergency Fund target from ₹{current_target:,} to ₹{recommended:,}")
                
                # Update savings goals adaptively
                regular_goals = [g for g in goals if g.get("type") != "emergency" and not g.get("is_completed", False)]
                
                if len(regular_goals) > 0:
                    goal_1 = regular_goals[0]
                    current_target_1 = float(goal_1.get("target", 0))
                    if current_target_1 == 0 or current_target_1 < new_savings_1_target * 0.8 or new_savings_1_target > current_target_1 * 1.2:
                        update_result = tool_registry.execute_tool(
                            ToolType.UPDATE_GOAL,
                            {"goal_id": goal_1["id"], "target": new_savings_1_target},
                            "transaction_creation"
                        )
                        if update_result.get("success"):
                            logger.info(f"Updated '{goal_1.get('name')}' target from ₹{current_target_1:,} to ₹{new_savings_1_target:,}")
                
                if len(regular_goals) > 1:
                    goal_2 = regular_goals[1]
                    current_target_2 = float(goal_2.get("target", 0))
                    if current_target_2 == 0 or current_target_2 < new_savings_2_target * 0.8 or new_savings_2_target > current_target_2 * 1.2:
                        update_result = tool_registry.execute_tool(
                            ToolType.UPDATE_GOAL,
                            {"goal_id": goal_2["id"], "target": new_savings_2_target},
                            "transaction_creation"
                        )
                        if update_result.get("success"):
                            logger.info(f"Updated '{goal_2.get('name')}' target from ₹{current_target_2:,} to ₹{new_savings_2_target:,}")
                
                # Refresh goals after updates
                goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "transaction_creation")
                if goals_result.get("success"):
                    goals = goals_result["goals"]
                
                # STEP 2: Use LLM to determine optimal allocation percentages
                active_goals = [g for g in goals if not g.get("is_completed", False)]
                
                if not active_goals:
                    logger.info("No active goals found, skipping allocation")
                else:
                    # Calculate recent expenses for context
                    recent_txs = user_data.get("transactions", [])
                    expense_txs = [t for t in recent_txs if isinstance(t, (list, tuple)) and len(t) > 1 and float(t[1]) < 0]
                    recent_expenses = abs(sum(float(t[1]) for t in expense_txs)) / max(1, len(expense_txs) / 30) if expense_txs else None
                    
                    # Get LLM-determined allocation percentages
                    allocation_plan = determine_allocation_percentages(
                        income_amount=income_amount,
                        user_data=user_data,
                        goals=active_goals,
                        recent_expenses=recent_expenses
                    )
                    
                    logger.info(f"LLM Allocation Plan: {allocation_plan.get('reasoning', 'N/A')} - Emergency: {allocation_plan.get('emergency_fund', {}).get('percent', 0)}%, Goals: {sum(g.get('percent', 0) for g in allocation_plan.get('goal_allocations', []))}%, Remaining: {allocation_plan.get('remaining_percent', 0)}%")
                    
                    allocation_actions = []
                    
                    # Allocate to Emergency Fund
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
                                    "transaction_creation"
                                )
                                if result.get("success"):
                                    allocation_actions.append(result)
                                    logger.info(f"Auto-allocated ₹{emergency_allocation} ({allocation_plan.get('emergency_fund', {}).get('percent', 0)}%) to Emergency Fund (LLM-determined)")
                    
                    # Allocate to regular goals
                    regular_goals = [g for g in active_goals if g.get("type") != "emergency"]
                    goal_allocations = allocation_plan.get("goal_allocations", [])
                    
                    for goal_alloc in goal_allocations:
                        goal_id_from_llm = goal_alloc.get("goal_id")
                        goal_amount = goal_alloc.get("amount", 0)
                        
                        if not goal_id_from_llm or goal_amount <= 0:
                            continue
                        
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
                                        "transaction_creation"
                                    )
                                    if result.get("success"):
                                        allocation_actions.append(result)
                                        logger.info(f"Auto-allocated ₹{goal_allocation} ({goal_alloc.get('percent', 0)}%) to goal '{matching_goal['name']}' (LLM-determined)")
                                    else:
                                        logger.error(f"Failed to allocate ₹{goal_allocation} to goal '{matching_goal.get('name')}': {result.get('error', 'Unknown error')}")
                            else:
                                logger.warning(f"Goal '{matching_goal.get('name')}' is already completed (remaining: ₹{goal_remaining}), skipping allocation")
                        else:
                            if goal_id_from_llm:
                                logger.warning(f"Could not find matching goal for LLM goal_id '{goal_id_from_llm}'. Available goal IDs: {[str(g.get('id')) for g in regular_goals]}")
                    
                    if allocation_actions:
                        total_allocated = sum(a.get("allocated", 0) for a in allocation_actions)
                        remaining_for_user = income_amount - total_allocated
                        logger.info(f"✅ Successfully allocated ₹{total_allocated} ({(total_allocated/income_amount*100):.1f}%) from ₹{income_amount} income to {len(allocation_actions)} goals using LLM-determined percentages. User has ₹{remaining_for_user} ({(remaining_for_user/income_amount*100):.1f}%) remaining for expenses.")
                        
                        # Update savings streak (non-blocking)
                        try:
                            streak_result = update_savings_streak(background_db, str(user_id), total_allocated)
                            if streak_result.get("current_streak", 0) > 0:
                                logger.info(f"Savings streak updated: {streak_result.get('message', '')}")
                        except Exception as streak_error:
                            logger.warning(f"Failed to update savings streak: {streak_error}")
                        
                        # Prepare allocation details for email
                        email_allocations = []
                        for action in allocation_actions:
                            goal_id = action.get("goal_id")
                            allocated_amount = action.get("allocated", 0)
                            percent = (allocated_amount / income_amount * 100) if income_amount > 0 else 0
                            
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
                            send_income_allocation_email(
                                email=user.email,
                                user_name=user_name,
                                income_amount=income_amount,
                                allocations=email_allocations,
                                total_allocated=total_allocated,
                                remaining_amount=remaining_for_user,
                                transaction_date=transaction_date.isoformat() if transaction_date else None
                            )
                        except Exception as email_error:
                            logger.error(f"Failed to send income allocation email: {email_error}", exc_info=True)
                    else:
                        logger.warning(f"No allocation made - goals may have target 0 or are already completed")
        finally:
            background_db.close()
            logger.info(f"BACKGROUND TASK COMPLETED: Income allocation for transaction {transaction_id}")
    except Exception as e:
        logger.error(f"❌ ERROR in background income allocation for transaction {transaction_id}: {e}", exc_info=True)

@router.post("", response_model=ManualTransactionResponse)
async def create_transaction(
    transaction: ManualTransactionCreate,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Create a new manual transaction (income or expense).
    If it's an income transaction, automatically allocates to goals.
    """
    try:
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Validate transaction data
        if not transaction.amount or float(transaction.amount) <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Amount must be greater than 0"
            )
        
        if transaction.type not in ["income", "expense"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Type must be either 'income' or 'expense'"
            )
        
        # Create the transaction
        created_transaction = create_manual_transaction(db, user.id, transaction)
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error creating transaction: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transaction data: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error creating transaction: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create transaction: {str(e)}"
        )
    
    # If it's an income transaction, schedule allocation in background (non-blocking)
    if transaction.type == "income" and float(transaction.amount) > 0:
        income_amount = float(transaction.amount)
        logger.info(f"Income transaction created: ₹{income_amount}. Scheduling automatic allocation in background...")
        background_tasks.add_task(allocate_income_to_goals, user.id, created_transaction.id, income_amount)
        logger.info(f"Background allocation task scheduled for transaction {created_transaction.id}")
    elif transaction.type == "expense" and float(transaction.amount) > 0:
        try:
            expense_amount = float(transaction.amount)
            transaction_date = created_transaction.transaction_date
            budget_context = get_monthly_budget_context(db, user, transaction_date)
            month_total_after = budget_context["total_expense"]
            total_before = max(month_total_after - expense_amount, 0)
            budget_value = budget_context["budget"]
            remaining_budget = budget_context["remaining"]
            user_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email.split('@')[0]
            category_label = created_transaction.category or "General Spending"
            description_label = created_transaction.description or "Expense"
            transaction_date_iso = transaction_date.isoformat() if transaction_date else None
            
            background_tasks.add_task(
                send_spending_activity_email,
                user.email,
                user_name,
                expense_amount,
                category_label,
                description_label,
                month_total_after,
                budget_value,
                remaining_budget,
                transaction_date_iso
            )
            
            if budget_value > 0:
                warning_threshold = budget_value * 0.9
                
                if total_before < warning_threshold <= month_total_after < budget_value:
                    background_tasks.add_task(
                        send_spending_budget_warning_email,
                        user.email,
                        user_name,
                        month_total_after,
                        budget_value,
                        remaining_budget
                    )
                
                if total_before < budget_value <= month_total_after:
                    background_tasks.add_task(
                        send_spending_budget_exceeded_email,
                        user.email,
                        user_name,
                        month_total_after,
                        budget_value,
                        month_total_after - budget_value
                    )
        except Exception as spend_email_error:
            logger.error(f"Failed to schedule spending emails: {spend_email_error}", exc_info=True)
    
    # Update transaction streak (non-blocking)
    try:
        streak_result = update_transaction_streak(db, user.id)
        if streak_result.get("current_streak", 0) > 0:
            logger.info(f"Transaction streak updated: {streak_result.get('message', '')}")
    except Exception as streak_error:
        logger.warning(f"Failed to update transaction streak: {streak_error}")
    
    return created_transaction

@router.get("", response_model=List[ManualTransactionResponse])
async def get_transactions(
    type: Optional[str] = None,  # "income" or "expense"
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get all manual transactions for the current user - optimized with pagination"""
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Default limit to 500 if not specified (prevent loading too much data)
    if limit is None:
        limit = 500
    
    return get_user_transactions(db, user.id, transaction_type=type, limit=limit, offset=offset)

@router.delete("/{transaction_id}", response_model=MessageResponse)
async def delete_user_transaction(
    transaction_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete a transaction"""
    from uuid import UUID
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    delete_transaction(db, UUID(transaction_id), user.id)
    return {"message": "Transaction deleted successfully"}


