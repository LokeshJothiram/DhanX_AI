"""
Affordability Analysis Router - AI-powered purchase affordability checker
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import (
    get_user_by_email, get_user_connections, get_user_goals, 
    get_user_transactions
)
from routers.coach import get_real_user_data, map_description_to_category
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/affordability", tags=["affordability"])
security = HTTPBearer()


class AffordabilityRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Purchase amount in rupees")
    description: Optional[str] = Field(None, description="Optional description of what they want to buy")


class AffordabilityResponse(BaseModel):
    can_afford: bool
    recommendation: str  # "yes", "no", "maybe", "wait"
    confidence: float  # 0.0 to 1.0
    reasoning: str
    financial_impact: dict
    suggestions: list[str]


def calculate_user_financial_metrics(db: Session, user_id) -> dict:
    """Calculate comprehensive financial metrics for affordability analysis"""
    from models import User, ManualTransaction, Goal
    
    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    
    # Get all transactions
    transactions = get_user_transactions(db, user_id)
    
    # Calculate income and expenses
    total_income = Decimal('0')
    total_expenses = Decimal('0')
    
    # Get last 30 days transactions
    # Ensure timezone-aware datetime for comparison
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    recent_income = Decimal('0')
    recent_expenses = Decimal('0')
    
    for txn in transactions:
        amount = Decimal(str(txn.amount))
        # Ensure transaction_date is timezone-aware for comparison
        txn_date = txn.transaction_date
        if txn_date.tzinfo is None:
            # If naive, assume UTC
            txn_date = txn_date.replace(tzinfo=timezone.utc)
        elif txn_date.tzinfo != timezone.utc:
            # Convert to UTC if different timezone
            txn_date = txn_date.astimezone(timezone.utc)
        
        if txn.type == 'income':
            total_income += amount
            if txn_date >= thirty_days_ago:
                recent_income += amount
        elif txn.type == 'expense':
            total_expenses += amount
            if txn_date >= thirty_days_ago:
                recent_expenses += amount
    
    # Get all active goals
    goals = get_user_goals(db, user_id, include_completed=False)
    total_allocated_to_goals = Decimal('0')
    active_goals_count = len(goals)
    emergency_fund = Decimal('0')
    
    for goal in goals:
        saved = Decimal(str(goal.saved))
        target = Decimal(str(goal.target))
        total_allocated_to_goals += saved
        if goal.type == 'emergency':
            emergency_fund += saved
    
    # Calculate available balance
    net_income = total_income - total_expenses
    available_cash = net_income - total_allocated_to_goals
    
    # Log warning if negative (data inconsistency)
    # This can happen if user had savings before using the app or data entry errors
    if available_cash < 0:
        logger.warning(f"User {user_id}: Available cash is negative ({available_cash}). Net income: {net_income}, Allocated: {total_allocated_to_goals}. This indicates allocated funds exceed net income.")
    
    # Calculate monthly averages
    # Estimate months from transaction history
    if transactions:
        # Get first transaction date, ensuring timezone-aware
        first_transaction_dates = []
        for txn in transactions:
            txn_date = txn.transaction_date
            if txn_date.tzinfo is None:
                txn_date = txn_date.replace(tzinfo=timezone.utc)
            elif txn_date.tzinfo != timezone.utc:
                txn_date = txn_date.astimezone(timezone.utc)
            first_transaction_dates.append(txn_date)
        
        first_transaction = min(first_transaction_dates)
        now = datetime.now(timezone.utc)
        months_active = max(1, (now - first_transaction).days / 30)
        avg_monthly_income = float(total_income) / months_active
        avg_monthly_expenses = float(total_expenses) / months_active
    else:
        avg_monthly_income = float(recent_income)
        avg_monthly_expenses = float(recent_expenses)
    
    # Get monthly budget if set
    monthly_budget = float(user.monthly_budget) if user.monthly_budget else None
    
    return {
        "available_cash": float(available_cash),
        "total_income": float(total_income),
        "total_expenses": float(total_expenses),
        "net_income": float(net_income),
        "total_allocated_to_goals": float(total_allocated_to_goals),
        "recent_income_30d": float(recent_income),
        "recent_expenses_30d": float(recent_expenses),
        "avg_monthly_income": avg_monthly_income,
        "avg_monthly_expenses": avg_monthly_expenses,
        "monthly_budget": monthly_budget,
        "active_goals_count": active_goals_count,
        "emergency_fund": float(emergency_fund),
        "goals": [
            {
                "name": goal.name,
                "type": goal.type,
                "target": float(goal.target),
                "saved": float(goal.saved),
                "remaining": float(goal.target - goal.saved),
                "deadline": goal.deadline.isoformat() if goal.deadline else None,
            }
            for goal in goals
        ]
    }


def analyze_affordability_with_ai(amount: float, financial_data: dict, user_data: dict, description: Optional[str] = None) -> dict:
    """
    Use Agentic AI (LLM) to analyze if user can afford a purchase.
    This uses the same LLM system as the coach for intelligent analysis.
    """
    from services.ai_coach import call_llm
    from services.ai_coach import income_pattern_agent, spending_watchdog_agent, goal_planner_agent, emergency_fund_agent
    
    available_cash = financial_data["available_cash"]
    avg_monthly_income = financial_data["avg_monthly_income"]
    avg_monthly_expenses = financial_data["avg_monthly_expenses"]
    monthly_budget = financial_data.get("monthly_budget")
    emergency_fund = financial_data["emergency_fund"]
    active_goals = financial_data["goals"]
    recent_expenses_30d = financial_data["recent_expenses_30d"]
    recent_income_30d = financial_data["recent_income_30d"]
    
    # Calculate metrics
    purchase_percentage_of_income = (amount / avg_monthly_income * 100) if avg_monthly_income > 0 else 0
    purchase_percentage_of_available = (amount / available_cash * 100) if available_cash > 0 else 0
    
    # Run AI agents to get comprehensive financial analysis
    logger.info("Running AI agents for affordability analysis...")
    income_analysis = income_pattern_agent(user_data)
    spending_analysis = spending_watchdog_agent(user_data, f"Can I afford a purchase of ₹{amount:,.2f}?")
    goals_analysis = goal_planner_agent(user_data, f"Should I buy something for ₹{amount:,.2f}?", income_data=income_analysis)
    emergency_analysis = emergency_fund_agent(user_data)
    
    # Build comprehensive prompt for LLM
    purchase_desc = description or f"a purchase worth ₹{amount:,.2f}"
    
    prompt = f"""You are a financial advisor analyzing whether a user can afford a purchase.

PURCHASE DETAILS:
- Amount: ₹{amount:,.2f}
- Description: {purchase_desc}

USER'S FINANCIAL SITUATION:
- Available Cash: ₹{available_cash:,.2f}
- Average Monthly Income: ₹{avg_monthly_income:,.2f}
- Average Monthly Expenses: ₹{avg_monthly_expenses:,.2f}
- Recent Income (30 days): ₹{recent_income_30d:,.2f}
- Recent Expenses (30 days): ₹{recent_expenses_30d:,.2f}
- Monthly Budget: {'₹' + str(monthly_budget) + ',.2f' if monthly_budget else 'Not set'}
- Emergency Fund: ₹{emergency_fund:,.2f}
- Active Savings Goals: {len(active_goals)}
- Purchase is {purchase_percentage_of_income:.1f}% of monthly income
- Purchase is {purchase_percentage_of_available:.1f}% of available cash

AI AGENT ANALYSIS:
Income Pattern: {json.dumps(income_analysis, default=str)}
Spending Analysis: {json.dumps(spending_analysis, default=str)}
Goals Analysis: {json.dumps(goals_analysis, default=str)}
Emergency Fund: {json.dumps(emergency_analysis, default=str)}

Active Goals Details:
{json.dumps(active_goals, default=str, indent=2) if active_goals else "No active goals"}

TASK:
Analyze if the user can afford this purchase. Consider:
1. Available cash vs purchase amount
2. Impact on monthly budget and spending patterns
3. Impact on savings goals and emergency fund
4. Income stability and patterns
5. Recent spending trends
6. Financial health and sustainability

Provide your analysis in the following JSON format:
{{
    "can_afford": true/false,
    "recommendation": "yes"/"no"/"maybe"/"wait",
    "confidence": 0.0-1.0,
    "reasoning": "ONE SHORT SENTENCE explaining the recommendation (max 100 characters, be concise)",
    "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
}}

IMPORTANT: Keep "reasoning" to ONE SHORT SENTENCE (max 100 characters). Be concise and direct.
Be honest and practical. If they can't afford it, suggest alternatives. If they can, confirm but remind them to stay on track with goals.
"""
    
    logger.info(f"Calling LLM for affordability analysis...")
    logger.info(f"Prompt length: {len(prompt)} characters")
    
    try:
        # Call LLM
        llm_response = call_llm(prompt, temperature=0.3)
        llm_text = llm_response.get("text", "")
        
        logger.info(f"LLM Response: {llm_text[:500]}...")
        
        # Parse JSON from LLM response
        # LLM might return JSON wrapped in markdown code blocks
        import re
        json_match = re.search(r'\{[^{}]*"can_afford"[^{}]*\}', llm_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
        else:
            # Try to extract JSON from code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', llm_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON object directly
                json_str = llm_text
        
        # Parse JSON
        try:
            ai_result = json.loads(json_str)
        except json.JSONDecodeError:
            # If JSON parsing fails, extract key information from text
            logger.warning("Failed to parse JSON from LLM response, using fallback")
            # Fallback: extract information from text
            can_afford_text = "yes" if "yes" in llm_text.lower() or "can afford" in llm_text.lower() else "no"
            recommendation = "yes" if "yes" in can_afford_text else ("maybe" if "maybe" in llm_text.lower() else "no")
            
            ai_result = {
                "can_afford": available_cash >= amount * 0.9,  # Fallback logic
                "recommendation": recommendation,
                "confidence": 0.6,
                "reasoning": llm_text[:300] if llm_text else "AI analysis completed",
                "suggestions": ["Review your budget before making this purchase", "Consider saving for this purchase"]
            }
        
        # Ensure all required fields
        reasoning = ai_result.get("reasoning", "Based on your financial situation, this purchase requires careful consideration.")
        # Truncate reasoning to single line and max 150 characters for display
        reasoning = reasoning.split('.')[0] if '.' in reasoning else reasoning
        reasoning = reasoning[:150].strip()
        
        result = {
            "can_afford": ai_result.get("can_afford", available_cash >= amount),
            "recommendation": ai_result.get("recommendation", "maybe"),
            "confidence": float(ai_result.get("confidence", 0.5)),
            "reasoning": reasoning,
            "financial_impact": {
                "available_cash_before": available_cash,
                "available_cash_after": available_cash - amount,
                "purchase_percentage_of_income": round(purchase_percentage_of_income, 1),
                "purchase_percentage_of_available": round(purchase_percentage_of_available, 1),
            },
            "suggestions": ai_result.get("suggestions", [])
        }
        
        # Validate confidence range
        result["confidence"] = max(0.0, min(1.0, result["confidence"]))
        
        # Ensure suggestions is a list
        if not isinstance(result["suggestions"], list):
            result["suggestions"] = [str(result["suggestions"])] if result["suggestions"] else []
        
        logger.info(f"AI Affordability Analysis Result: {result['recommendation']} (confidence: {result['confidence']:.2f})")
        
        return result
        
    except Exception as e:
        logger.exception("Error in AI affordability analysis, using fallback")
        # Fallback to rule-based if AI fails
        return analyze_affordability_fallback(amount, financial_data, description)


@router.post("/analyze", response_model=AffordabilityResponse)
async def analyze_affordability(
    request: AffordabilityRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Analyze if user can afford a purchase based on their financial data.
    
    Request body:
    {
        "amount": 5000.0,
        "description": "New smartphone"  // optional
    }
    
    Returns:
    {
        "can_afford": true/false,
        "recommendation": "yes"/"no"/"maybe"/"wait",
        "confidence": 0.0-1.0,
        "reasoning": "Detailed explanation...",
        "financial_impact": {...},
        "suggestions": ["suggestion1", "suggestion2"]
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
        
        logger.info(f"Analyzing affordability for user {user.id}: ₹{request.amount} - {request.description or 'No description'}")
        
        # Calculate financial metrics
        financial_data = calculate_user_financial_metrics(db, user.id)
        
        # Get user data in the format expected by AI agents (same as coach)
        user_data = get_real_user_data(db, user.id, user)
        
        # Analyze with Agentic AI
        result = analyze_affordability_with_ai(
            request.amount,
            financial_data,
            user_data,
            request.description
        )
        
        logger.info(f"Affordability analysis result: {result['recommendation']} (confidence: {result['confidence']:.2f})")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error analyzing affordability")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze affordability: {str(e)}"
        )


def analyze_affordability_fallback(amount: float, financial_data: dict, description: Optional[str] = None) -> dict:
    """
    Fallback rule-based analysis if AI fails.
    This is a simplified version of the original rule-based system.
    """
    available_cash = financial_data["available_cash"]
    avg_monthly_income = financial_data["avg_monthly_income"]
    avg_monthly_expenses = financial_data["avg_monthly_expenses"]
    monthly_budget = financial_data.get("monthly_budget")
    emergency_fund = financial_data["emergency_fund"]
    active_goals = financial_data["goals"]
    recent_expenses_30d = financial_data["recent_expenses_30d"]
    
    purchase_percentage_of_income = (amount / avg_monthly_income * 100) if avg_monthly_income > 0 else 0
    purchase_percentage_of_available = (amount / available_cash * 100) if available_cash > 0 else 0
    
    reasoning_parts = []
    suggestions = []
    confidence = 0.5
    
    if available_cash >= amount:
        reasoning_parts.append(f"You have ₹{available_cash:,.2f} available, which covers this purchase.")
        confidence += 0.2
    else:
        shortfall = amount - available_cash
        reasoning_parts.append(f"You're short by ₹{shortfall:,.2f}. Your available cash is ₹{available_cash:,.2f}.")
        confidence -= 0.3
    
    if monthly_budget:
        projected_monthly_spend = recent_expenses_30d + amount
        if projected_monthly_spend <= monthly_budget:
            reasoning_parts.append(f"This purchase fits within your monthly budget.")
            confidence += 0.1
        else:
            over_budget = projected_monthly_spend - monthly_budget
            reasoning_parts.append(f"This would exceed your monthly budget by ₹{over_budget:,.2f}.")
            confidence -= 0.2
            suggestions.append("Consider waiting until next month or reducing other expenses.")
    
    if purchase_percentage_of_income > 50:
        reasoning_parts.append(f"This purchase is {purchase_percentage_of_income:.1f}% of your monthly income - quite significant.")
        confidence -= 0.2
        suggestions.append("Consider saving for this purchase over a few months instead.")
    
    if confidence >= 0.7:
        recommendation = "yes"
        can_afford = True
    elif confidence >= 0.5:
        recommendation = "maybe"
        can_afford = available_cash >= amount * 0.8
    elif confidence >= 0.3:
        recommendation = "wait"
        can_afford = False
    else:
        recommendation = "no"
        can_afford = False
    
    if not suggestions:
        if can_afford:
            suggestions.append("You can afford this! Make sure it aligns with your financial goals.")
        else:
            suggestions.append("Consider saving for this purchase over time.")
    
    reasoning = " ".join(reasoning_parts) if reasoning_parts else f"Based on your financial situation, this purchase of ₹{amount:,.2f} would have a {purchase_percentage_of_available:.1f}% impact on your available cash."
    
    return {
        "can_afford": can_afford,
        "recommendation": recommendation,
        "confidence": max(0.0, min(1.0, confidence)),
        "reasoning": reasoning,
        "financial_impact": {
            "available_cash_before": available_cash,
            "available_cash_after": available_cash - amount,
            "purchase_percentage_of_income": round(purchase_percentage_of_income, 1),
            "purchase_percentage_of_available": round(purchase_percentage_of_available, 1),
        },
        "suggestions": suggestions
    }

