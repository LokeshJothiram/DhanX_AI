"""
AI Coach Service - Autonomous Financial Coaching Agent
Implements four agents: income_pattern_agent, spending_watchdog_agent,
goal_planner_agent, emergency_fund_agent
Uses Gemini LLM for final response generation
"""

import os
import datetime
import statistics
import re
import logging
import json
from typing import Dict, List, Optional, Any
from config import settings

logger = logging.getLogger(__name__)

# ------------------------- UTILITIES -------------------------

def safe_parse_date(x):
    """Parse a date string (YYYY-MM-DD) or return if already a date.
    Returns a datetime.date or None on failure.
    """
    if isinstance(x, datetime.date):
        return x
    if not x:
        return None
    try:
        # Accept partial ISO-like dates
        return datetime.date.fromisoformat(str(x))
    except Exception:
        # try common fallback formats
        for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.datetime.strptime(str(x), fmt).date()
            except Exception:
                continue
    return None


def ensure_transactions_list(user_data: Dict):
    """Normalize transactions from user data"""
    txs = user_data.get("transactions", [])
    if not isinstance(txs, list):
        return []
    # normalize tuples to (date_str, amount, category, source)
    normalized = []
    for t in txs:
        try:
            date = t[0] if isinstance(t, (list, tuple)) else t.get("date", "")
            amount = float(t[1] if isinstance(t, (list, tuple)) else t.get("amount", 0))
            category = t[2] if isinstance(t, (list, tuple)) and len(t) > 2 else t.get("category", "uncategorized")
            source = t[3] if isinstance(t, (list, tuple)) and len(t) > 3 else t.get("source", "unknown")
            normalized.append((str(date), amount, category, source))
        except Exception:
            continue
    return normalized


def last_n_transactions(user_data: Dict, n=30):
    """Get last N transactions sorted by date"""
    txs = ensure_transactions_list(user_data)
    with_dates = []
    for t in txs:
        d = safe_parse_date(t[0])
        if d is None:
            continue
        with_dates.append((d, t[1], t[2], t[3]))
    with_dates.sort(key=lambda x: x[0], reverse=True)
    # convert back to string dates for consistency
    return [(d.isoformat(), amt, cat, src) for d, amt, cat, src in with_dates[:n]]


def get_last_3_months_transactions(user_data: Dict):
    """Get transactions from the last 3 months"""
    txs = ensure_transactions_list(user_data)
    cutoff_date = datetime.date.today() - datetime.timedelta(days=90)
    
    with_dates = []
    for t in txs:
        d = safe_parse_date(t[0])
        if d is None:
            continue
        if d >= cutoff_date:
            with_dates.append((d, t[1], t[2], t[3]))
    
    with_dates.sort(key=lambda x: x[0], reverse=True)
    return [(d.isoformat(), amt, cat, src) for d, amt, cat, src in with_dates]


# ------------------------- AGENTS -------------------------

def income_pattern_agent(user_data: Dict) -> Dict[str, Any]:
    """Analyze income cadence; return summary and next expected date (ISO string).
    Also detects if income was recently received (for gig workers with weekly payments).
    Guarded to avoid errors on small datasets.
    """
    txs = [t for t in ensure_transactions_list(user_data) if t[2] in ("cash_income", "salary", "delivery", "income")]
    if not txs:
        return {"summary": "No income transactions found.", "pattern": None, "recent_income": None}

    dates = [safe_parse_date(t[0]) for t in txs]
    dates = [d for d in dates if d is not None]
    amounts = [int(t[1]) for t in txs]
    if not dates or not amounts:
        return {"summary": "Insufficient income data.", "pattern": None, "recent_income": None}

    dates_sorted = sorted(dates)
    gaps = []
    for i in range(1, len(dates_sorted)):
        gaps.append((dates_sorted[i] - dates_sorted[i-1]).days)
    median_gap = int(statistics.median(gaps)) if gaps else 7
    avg_income = int(statistics.mean(amounts)) if amounts else 0
    next_expected = (dates_sorted[-1] + datetime.timedelta(days=median_gap)).isoformat()
    
    # Check for recent income (within last 7 days - for weekly gig workers)
    today = datetime.date.today()
    recent_income_txs = []
    recent_income_total = 0
    for i, tx in enumerate(txs):
        tx_date = safe_parse_date(tx[0])
        if tx_date:
            days_ago = (today - tx_date).days
            if 0 <= days_ago <= 7:  # Income received in last 7 days
                recent_income_txs.append({
                    "date": tx[0],
                    "amount": int(tx[1]),
                    "days_ago": days_ago
                })
                recent_income_total += int(tx[1])
    
    recent_income_info = None
    if recent_income_txs:
        recent_income_info = {
            "received": True,
            "total_amount": recent_income_total,
            "transactions": recent_income_txs,
            "message": f"💰 You received ₹{recent_income_total} in the last 7 days! Consider allocating it to your goals."
        }

    return {
        "summary": f"Avg income ≈ ₹{avg_income} every {median_gap} days.",
        "median_gap_days": median_gap,
        "avg_income": avg_income,
        "next_expected_date": next_expected,
        "recent_income": recent_income_info,
    }


def spending_watchdog_agent(user_data: Dict, query_text: Optional[str] = None) -> Dict[str, Any]:
    """Analyze spending and produce interventions. Safe for empty data."""
    recent = last_n_transactions(user_data, n=60)
    outflows = [t for t in recent if float(t[1]) < 0]
    total_out = -sum(float(t[1]) for t in outflows) if outflows else 0.0

    # Estimate period covered (days between newest and oldest tx in recent list)
    days_covered = 14
    try:
        if recent:
            dates = [safe_parse_date(t[0]) for t in recent]
            dates = [d for d in dates if d is not None]
            if dates and len(dates) > 1:
                days_covered = max(1, (max(dates) - min(dates)).days)
    except Exception:
        days_covered = 14

    avg_daily_out = (total_out / days_covered) if days_covered else total_out
    pref_save = int(user_data.get("settings", {}).get("preferred_daily_save", 50))
    intervention = None
    if avg_daily_out > pref_save * 2:
        intervention = {
            "type": "nudge",
            "message": f"Your avg daily spending (~₹{int(avg_daily_out)}) looks high. Try micro-savings of ₹{pref_save}/day.",
            "action": "suggest_daily_save",
            "amount": pref_save,
        }

    large_spends = [t for t in outflows if -float(t[1]) > 500]
    tips = []
    if large_spends:
        tips.append(f"Found {len(large_spends)} large spend(s) recently. Consider planning for them with a separate goal.")

    return {"avg_daily_out": int(avg_daily_out), "intervention": intervention, "tips": tips}


def goal_planner_agent(user_data: Dict, user_query: Optional[str] = None, income_data: Optional[Dict] = None) -> Dict[str, Any]:
    """Create new goals if requested in user_query; otherwise return suggestions.
    If income is received and goals exist, recommends allocating income to goals.
    Uses safer parsing and updates user in-memory state.
    """
    goals = user_data.get("goals", [])
    
    # Check if user wants to create a new goal
    if user_query and isinstance(user_query, str) and any(k in user_query.lower() for k in ["save for", "i want to save", "new goal", "create goal", "add goal"]):
        m = re.search(r"₹\s*([0-9,]+)", user_query)
        if not m:
            # fallback: look for plain numbers
            m = re.search(r"(\d{3,}(?:,\d{3})*)", user_query)
        amount = int(m.group(1).replace(",", "")) if m else 1000
        gid = f"g{len(goals)+1}"
        new_goal = {"id": gid, "name": "Quick goal from chat", "target": amount, "saved": 0}
        goals.append(new_goal)
        user_data["goals"] = goals
        return {"created": new_goal, "message": f"Created goal of ₹{amount}"}

    # If user has existing goals, check for recent income and recommend allocation
    if goals and income_data:
        # PRIORITY 1: Check if income was JUST RECEIVED (for gig workers with weekly payments)
        recent_income_info = income_data.get("recent_income")
        if recent_income_info and recent_income_info.get("received"):
            # Income was received in last 7 days - AUTOMATIC RECOMMENDATION!
            received_amount = recent_income_info.get("total_amount", 0)
            recommendations = []
            total_needed = sum(g.get("target", 0) - g.get("saved", 0) for g in goals)
            
            if total_needed > 0 and received_amount > 0:
                # Calculate allocation suggestions for RECEIVED income
                # For weekly gig workers, suggest 40% TOTAL distributed across goals (not per goal)
                total_allocation_amount = int(received_amount * 0.4)
                
                # Filter goals that need allocation
                goals_needing_allocation = [g for g in goals if (g.get("target", 0) - g.get("saved", 0)) > 0]
                
                if goals_needing_allocation:
                    # Distribute 40% total across all goals needing allocation
                    num_goals = len(goals_needing_allocation)
                    per_goal_amount = total_allocation_amount // num_goals if num_goals > 0 else 0
                    
                    for goal in goals_needing_allocation:
                        remaining = goal.get("target", 0) - goal.get("saved", 0)
                        if remaining > 0:
                            # Suggest allocating a portion of RECEIVED income (distributed share)
                            suggested_allocation = min(remaining, per_goal_amount)
                            if suggested_allocation > 0:
                                recommendations.append({
                                    "goal_id": goal.get("id"),
                                    "goal_name": goal.get("name"),
                                    "remaining": remaining,
                                    "suggested_allocation": suggested_allocation,
                                    "message": f"Allocate ₹{suggested_allocation} from your ₹{received_amount} weekly payment to '{goal.get('name')}'"
                                })
                
                if recommendations:
                    return {
                        "existing_goals": goals,
                        "income_received": received_amount,
                        "recent_income_detected": True,
                        "recommendations": recommendations,
                        "message": f"🎉 Weekly payment received! You got ₹{received_amount}. Here's how to allocate it to your goals:",
                        "action": "suggest_income_allocation",
                        "priority": "high"
                    }
        
        # PRIORITY 2: Check if income is expected soon (fallback)
        recent_income = income_data.get("avg_income", 0)
        next_income_date = income_data.get("next_expected_date")
        
        # Check if there's income expected soon (within next 3 days)
        today = datetime.date.today()
        if next_income_date:
            try:
                next_date = safe_parse_date(next_income_date)
                if next_date and (next_date - today).days <= 3:
                    # Income is expected soon
                    recommendations = []
                    total_needed = sum(g.get("target", 0) - g.get("saved", 0) for g in goals)
                    
                    if total_needed > 0 and recent_income > 0:
                        # Calculate allocation suggestions
                        for goal in goals:
                            remaining = goal.get("target", 0) - goal.get("saved", 0)
                            if remaining > 0:
                                # Suggest allocating a portion of expected income
                                suggested_allocation = min(remaining, int(recent_income * 0.3))  # 30% of income per goal
                                if suggested_allocation > 0:
                                    recommendations.append({
                                        "goal_id": goal.get("id"),
                                        "goal_name": goal.get("name"),
                                        "remaining": remaining,
                                        "suggested_allocation": suggested_allocation,
                                        "message": f"Allocate ₹{suggested_allocation} from next income to '{goal.get('name')}'"
                                    })
                        
                        if recommendations:
                            return {
                                "existing_goals": goals,
                                "income_received": recent_income,
                                "recent_income_detected": False,
                                "recommendations": recommendations,
                                "message": f"You have ₹{recent_income} income expected soon. Consider allocating it to your goals!",
                                "action": "suggest_income_allocation",
                                "priority": "medium"
                            }
            except Exception:
                pass
    
    # Default: return existing goals and general suggestions
    pref = int(user_data.get("settings", {}).get("preferred_daily_save", 50))
    suggestion = {"daily_target": pref, "monthly_savings": pref * 30}
    return {"suggestion": suggestion, "existing_goals": goals}


def emergency_fund_agent(user_data: Dict) -> Dict[str, Any]:
    """Estimate recommended emergency buffer safely."""
    inc = [t for t in ensure_transactions_list(user_data) if t[2] in ("cash_income", "salary", "delivery", "income")]
    incomes = [int(t[1]) for t in inc] if inc else []
    avg_income = int(statistics.mean(incomes)) if incomes else 0

    cutoff = datetime.date.today() - datetime.timedelta(days=30)
    recent_inc = [t for t in inc if safe_parse_date(t[0]) and safe_parse_date(t[0]) >= cutoff]
    monthly_total = sum(int(t[1]) for t in recent_inc) if recent_inc else avg_income
    buffer = int(max(1000, monthly_total * 0.5))

    pattern = income_pattern_agent(user_data)
    dry_warning = None
    if pattern.get("median_gap_days", 0) > 10:
        dry_warning = f"Income gaps ~{pattern['median_gap_days']} days — consider a buffer of ₹{buffer}."

    return {"recommended_buffer": buffer, "dry_warning": dry_warning}


# ------------------------- LLM HELPER -------------------------

def call_llm(prompt: str, temperature: float = 0.2) -> Dict[str, str]:
    """Optional LLM caller. If GEMINI_API_KEY is set, tries multiple methods to call Gemini.
    Tries: google-generativeai SDK directly, then langchain, then fallback stub.
    """
    api_key = os.getenv("GEMINI_API_KEY") or settings.gemini_api_key
    if not api_key:
        safe_text = (prompt or "")[:800].replace("\n", " ")
        return {"text": "[LLM stub - no API key] " + safe_text}
    
    # Method 1: Try google-generativeai SDK directly (most reliable)
    last_error = None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        
        # Try to find a working model - prioritize 2.5 flash
        try:
            models = genai.list_models()
            model_name = None
            # First, try to find 2.5 flash specifically
            for model in models:
                if 'generateContent' in model.supported_generation_methods:
                    if '2.5' in model.name and 'flash' in model.name.lower():
                        model_name = model.name
                        break
            # If not found, try 2.0 flash
            if not model_name:
                for model in models:
                    if 'generateContent' in model.supported_generation_methods:
                        if '2.0' in model.name and 'flash' in model.name.lower():
                            model_name = model.name
                            break
            # Fallback to any flash model
            if not model_name:
                for model in models:
                    if 'generateContent' in model.supported_generation_methods:
                        if 'flash' in model.name.lower():
                            model_name = model.name
                            break
            # Last resort: any available model
            if not model_name:
                for model in models:
                    if 'generateContent' in model.supported_generation_methods:
                        model_name = model.name
                        break
            
            if model_name:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt, generation_config={"temperature": temperature})
                return {"text": response.text}
        except Exception as e:
            last_error = str(e)
            logger.warning("Direct SDK call failed, trying fallback: %s", e)
            # Check for specific error types
            error_str = str(e).lower()
            if "quota" in error_str or "limit" in error_str or "429" in error_str:
                logger.error("API quota/limit exceeded: %s", e)
                return {"text": "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"}
            if "invalid" in error_str and "api" in error_str and "key" in error_str:
                logger.error("Invalid API key: %s", e)
                return {"text": "[LLM Error: Invalid API key. Please check your GEMINI_API_KEY configuration.]"}
            if "permission" in error_str or "403" in error_str:
                logger.error("API permission denied: %s", e)
                return {"text": "[LLM Error: API permission denied. Please check your Gemini API key permissions.]"}
            
            # Try 2.5 flash model names directly
            for model_name in ["gemini-2.5-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"]:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = model.generate_content(prompt, generation_config={"temperature": temperature})
                    return {"text": response.text}
                except Exception as model_err:
                    error_str = str(model_err).lower()
                    if "quota" in error_str or "limit" in error_str or "429" in error_str:
                        logger.error("API quota/limit exceeded for model %s: %s", model_name, model_err)
                        return {"text": "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"}
                    last_error = str(model_err)
                    continue
    except ImportError:
        logger.warning("google-generativeai SDK not installed")
        pass
    except Exception as e:
        last_error = str(e)
        error_str = str(e).lower()
        if "quota" in error_str or "limit" in error_str or "429" in error_str:
            logger.error("API quota/limit exceeded: %s", e)
            return {"text": "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"}
        logger.warning("google-generativeai SDK failed: %s", e)
    
    # Method 2: Try langchain with different model names - prioritize 2.5 flash
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        # Try 2.5 flash first, then fallbacks
        model_names = [
            "gemini-2.5-flash",
            "gemini-2.0-flash-exp",
            "models/gemini-2.5-flash",
            "models/gemini-2.0-flash-exp",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro"
        ]
        for model_name in model_names:
            try:
                llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=temperature)
                resp = llm.invoke(prompt)
                return {"text": resp.content if hasattr(resp, 'content') else str(resp)}
            except Exception as lang_err:
                error_str = str(lang_err).lower()
                if "quota" in error_str or "limit" in error_str or "429" in error_str:
                    logger.error("API quota/limit exceeded for LangChain model %s: %s", model_name, lang_err)
                    return {"text": "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"}
                last_error = str(lang_err)
                continue
    except ImportError:
        logger.warning("langchain_google_genai not installed")
        pass
    except Exception as e:
        last_error = str(e)
        error_str = str(e).lower()
        if "quota" in error_str or "limit" in error_str or "429" in error_str:
            logger.error("API quota/limit exceeded in LangChain: %s", e)
            return {"text": "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"}
        logger.warning("LangChain call failed: %s", e)
    
    # Fallback stub with better error message
    safe_text = (prompt or "")[:800].replace("\n", " ")
    error_msg = "[LLM failed - no working model found]"
    if last_error:
        error_str = last_error.lower()
        if "quota" in error_str or "limit" in error_str or "429" in error_str:
            error_msg = "[LLM Error: API quota/limit exceeded. Please check your Gemini API key limits or try again later.]"
        elif "invalid" in error_str and "api" in error_str and "key" in error_str:
            error_msg = "[LLM Error: Invalid API key. Please check your GEMINI_API_KEY configuration.]"
        elif "permission" in error_str or "403" in error_str:
            error_msg = "[LLM Error: API permission denied. Please check your Gemini API key permissions.]"
        else:
            error_msg = f"[LLM failed - Last error: {last_error[:200]}]"
    return {"text": error_msg + " " + safe_text}


def determine_allocation_percentages(
    income_amount: float,
    user_data: Dict,
    goals: List[Dict],
    recent_expenses: Optional[float] = None
) -> Dict[str, Any]:
    """
    Use LLM to intelligently determine allocation percentages for new income.
    This adapts to the user's financial situation, goal progress, and spending patterns.
    
    Args:
        income_amount: The new income amount received
        user_data: User's financial data (transactions, goals, etc.)
        goals: List of active goals with their progress
        recent_expenses: Optional recent monthly expenses for context
    
    Returns:
        Dictionary with allocation percentages and amounts for each goal
    """
    try:
        # Prepare goals summary
        emergency_goals = [g for g in goals if g.get("type") == "emergency" and not g.get("is_completed", False)]
        regular_goals = [g for g in goals if g.get("type") != "emergency" and not g.get("is_completed", False)]
        
        goals_summary = []
        today = datetime.date.today()
        
        for goal in emergency_goals + regular_goals[:3]:  # Limit to 3 regular goals
            target = float(goal.get("target", 0))
            saved = float(goal.get("saved", 0))
            remaining = target - saved
            progress = (saved / target * 100) if target > 0 else 0
            
            # Calculate deadline information
            deadline = goal.get("deadline")
            days_until_deadline = None
            urgency = "low"
            
            if deadline:
                try:
                    # Parse deadline (could be string or datetime)
                    deadline_date = None
                    if isinstance(deadline, str):
                        # Try parsing as ISO datetime first (handles "2025-11-22T00:00:00+05:30")
                        try:
                            # Remove timezone info and parse as datetime, then get date
                            if 'T' in deadline:
                                # ISO datetime string with time
                                dt = datetime.datetime.fromisoformat(deadline.replace('Z', '+00:00'))
                                deadline_date = dt.date()
                            else:
                                # Just a date string
                                deadline_date = safe_parse_date(deadline)
                        except Exception:
                            # Fallback to safe_parse_date
                            deadline_date = safe_parse_date(deadline)
                    elif isinstance(deadline, datetime.datetime):
                        deadline_date = deadline.date()
                    elif isinstance(deadline, datetime.date):
                        deadline_date = deadline
                    
                    if deadline_date:
                        days_until_deadline = (deadline_date - today).days
                        
                        # Determine urgency based on days until deadline and progress
                        if days_until_deadline < 0:
                            urgency = "overdue"
                        elif days_until_deadline <= 30:
                            urgency = "urgent"  # Less than 1 month
                        elif days_until_deadline <= 90:
                            urgency = "moderate"  # 1-3 months
                        elif days_until_deadline <= 180:
                            urgency = "normal"  # 3-6 months
                        else:
                            urgency = "low"  # More than 6 months
                        
                        # If progress is low and deadline is approaching, increase urgency
                        if progress < 50 and days_until_deadline <= 60:
                            urgency = "urgent"
                except Exception as e:
                    logger.warning(f"Error parsing deadline for goal {goal.get('id')}: {e}")
            
            goal_info = {
                "id": goal.get("id"),
                "name": goal.get("name"),
                "type": goal.get("type", "savings"),
                "target": target,
                "saved": saved,
                "remaining": remaining,
                "progress_percent": progress,
                "deadline": deadline.isoformat() if isinstance(deadline, (datetime.datetime, datetime.date)) else (deadline if deadline else None),
                "days_until_deadline": days_until_deadline,
                "urgency": urgency
            }
            
            goals_summary.append(goal_info)
        
        # Sort goals by urgency (most urgent first)
        urgency_order = {"overdue": 0, "urgent": 1, "moderate": 2, "normal": 3, "low": 4}
        goals_summary.sort(key=lambda g: (
            urgency_order.get(g.get("urgency", "low"), 4),
            g.get("days_until_deadline") if g.get("days_until_deadline") is not None else 9999,
            -g.get("progress_percent", 0)  # Lower progress = higher priority
        ))
        
        # Calculate financial context
        recent_txs = get_last_3_months_transactions(user_data)
        income_txs = [t for t in recent_txs if float(t[1]) > 0]
        expense_txs = [t for t in recent_txs if float(t[1]) < 0]
        
        avg_monthly_income = sum(float(t[1]) for t in income_txs) / max(1, len(income_txs) / 30) if income_txs else income_amount * 30
        avg_monthly_expenses = abs(sum(float(t[1]) for t in expense_txs)) / max(1, len(expense_txs) / 30) if expense_txs else (recent_expenses or avg_monthly_income * 0.7)
        
        savings_rate = ((avg_monthly_income - avg_monthly_expenses) / avg_monthly_income * 100) if avg_monthly_income > 0 else 20
        
        # Emergency fund status
        emergency_status = "not_started"
        emergency_progress = 0
        if emergency_goals:
            ef_goal = emergency_goals[0]
            ef_target = float(ef_goal.get("target", 0))
            ef_saved = float(ef_goal.get("saved", 0))
            if ef_target > 0:
                emergency_progress = (ef_saved / ef_target * 100)
                if emergency_progress >= 100:
                    emergency_status = "completed"
                elif emergency_progress >= 50:
                    emergency_status = "halfway"
                elif emergency_progress > 0:
                    emergency_status = "in_progress"
        
        # Build prompt for LLM
        prompt = f"""You are a smart financial coach for users in India. Determine the optimal allocation percentages for a new income of ₹{income_amount:,.0f}.

User's Financial Context:
- Average Monthly Income: ₹{avg_monthly_income:,.0f}
- Average Monthly Expenses: ₹{avg_monthly_expenses:,.0f}
- Savings Rate: {savings_rate:.1f}%
- Emergency Fund Status: {emergency_status} ({emergency_progress:.1f}% complete)

Active Goals ({len(goals_summary)} goals) - SORTED BY URGENCY (most urgent first):
{json.dumps(goals_summary, indent=2, default=str)}

IMPORTANT: Each goal shows:
- "urgency": "overdue" (past deadline), "urgent" (<30 days), "moderate" (30-90 days), "normal" (90-180 days), "low" (>180 days)
- "days_until_deadline": Number of days until deadline (negative = overdue)
- "progress_percent": How much of the goal is already saved
- "remaining": Amount still needed to reach target

ALLOCATION PRIORITY: Goals with fewer days until deadline and lower progress should receive HIGHER percentages!

Rules:
1. Total allocation to goals MUST be exactly 40% of income (leave 40% for spending and 20% for investment)
2. Emergency Fund: Allocate 10% if not completed, 0% if completed
3. Regular Goals: Distribute remaining 30% allocation based on PRIORITY ORDER:
   - **HIGHEST PRIORITY: Goals with "urgent" urgency** (deadline < 30 days or overdue) - allocate 20-25% each
   - **HIGH PRIORITY: Goals with "moderate" urgency** (deadline 30-90 days) - allocate 15-20% each
   - **MEDIUM PRIORITY: Goals with "normal" urgency** (deadline 90-180 days) - allocate 10-15% each
   - **LOW PRIORITY: Goals with "low" urgency** (deadline > 180 days) - allocate 5-10% each
   - If multiple urgent goals exist, prioritize the one with:
     a) Fewer days until deadline (most urgent first)
     b) Lower progress percentage (needs more help)
     c) Higher remaining amount needed
4. **CRITICAL: Total allocation MUST be exactly 40% - no more, no less**
5. **CRITICAL: Goals with approaching deadlines MUST receive higher allocation percentages**
6. Distribute the 30% (after 10% emergency fund) across regular goals based on urgency

Return ONLY a JSON object with this exact format:
{{
  "emergency_fund_percent": 10.0,
  "goal_allocations": [
    {{
      "goal_id": "goal-id-1",
      "percent": 15.0
    }},
    {{
      "goal_id": "goal-id-2",
      "percent": 15.0
    }}
  ],
  "total_allocation_percent": 40.0,
  "spending_percent": 40.0,
  "investment_percent": 20.0,
  "remaining_percent": 60.0,
  "reasoning": "Brief explanation of allocation strategy"
}}

Important:
- All percentages must be numbers (not strings)
- total_allocation_percent (40%) + spending_percent (40%) + investment_percent (20%) should equal 100
- emergency_fund_percent + sum of goal_allocations percentages should equal total_allocation_percent (40%)
- Return ONLY the JSON object, no other text"""

        logger.info(f"LLM Prompt for Allocation: {prompt}")
        
        # Call LLM with timeout protection
        try:
            logger.info("Calling LLM for allocation percentages...")
            llm_response = call_llm(prompt, temperature=0.3)
            llm_text = llm_response.get("text", "")
            logger.info(f"LLM response received (length: {len(llm_text)} chars)")
        except Exception as llm_error:
            logger.error(f"LLM call failed with error: {llm_error}", exc_info=True)
            llm_text = ""
        
        # Extract JSON from response
        json_match = re.search(r'\{[^{}]*"emergency_fund_percent"[^{}]*\}', llm_text, re.DOTALL)
        if not json_match:
            # Try to find JSON block
            json_match = re.search(r'\{.*"total_allocation_percent".*\}', llm_text, re.DOTALL)
        
        if json_match:
            try:
                allocation_data = json.loads(json_match.group(0))
                
                # Validate and normalize percentages
                emergency_percent = float(allocation_data.get("emergency_fund_percent", 10))
                goal_allocations = allocation_data.get("goal_allocations", [])
                total_allocation = float(allocation_data.get("total_allocation_percent", 40))
                spending_percent = float(allocation_data.get("spending_percent", 40))
                investment_percent = float(allocation_data.get("investment_percent", 20))
                remaining = float(allocation_data.get("remaining_percent", 60))
                
                # Enforce fixed percentages: 40% savings/goals, 40% spending, 20% investment
                total_allocation = 40.0  # Fixed at 40%
                spending_percent = 40.0  # Fixed at 40%
                investment_percent = 20.0  # Fixed at 20%
                remaining = 60.0  # 40% spending + 20% investment
                
                # Ensure emergency fund is reasonable (10% of total allocation)
                emergency_percent = max(0, min(15, emergency_percent))  # Cap at 15%
                
                # Calculate actual amounts
                emergency_amount = int(income_amount * emergency_percent / 100)
                
                goal_amounts = []
                for goal_alloc in goal_allocations:
                    goal_id = goal_alloc.get("goal_id")
                    percent = float(goal_alloc.get("percent", 0))
                    percent = max(0, min(25, percent))  # Cap each goal at 25%
                    amount = int(income_amount * percent / 100)
                    goal_amounts.append({
                        "goal_id": goal_id,
                        "percent": percent,
                        "amount": amount
                    })
                
                result = {
                    "success": True,
                    "emergency_fund": {
                        "percent": emergency_percent,
                        "amount": emergency_amount
                    },
                    "goal_allocations": goal_amounts,
                    "total_allocation_percent": total_allocation,
                    "spending_percent": spending_percent,
                    "investment_percent": investment_percent,
                    "remaining_percent": remaining,
                    "remaining_amount": int(income_amount * remaining / 100),
                    "investment_amount": int(income_amount * investment_percent / 100),
                    "reasoning": allocation_data.get("reasoning", "LLM-determined allocation")
                }
                
                logger.info(f"LLM Allocation Result: {json.dumps(result, indent=2, default=str)}")
                return result
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM JSON response: {e}")
                logger.error(f"LLM Response: {llm_text}")
        
        # Fallback to default allocation if LLM fails
        logger.warning("LLM allocation failed, using default percentages")
        return {
            "success": False,
            "emergency_fund": {"percent": 10.0, "amount": int(income_amount * 0.1)},
            "goal_allocations": [
                {"goal_id": g.get("id"), "percent": 15.0, "amount": int(income_amount * 0.15)}
                for g in regular_goals[:2]
            ],
            "total_allocation_percent": 40.0,
            "spending_percent": 40.0,
            "investment_percent": 20.0,
            "remaining_percent": 60.0,
            "remaining_amount": int(income_amount * 0.6),
            "investment_amount": int(income_amount * 0.2),
            "reasoning": "Default allocation (LLM unavailable)"
        }
        
    except Exception as e:
        logger.error(f"Error in determine_allocation_percentages: {e}", exc_info=True)
        # Fallback to default
        regular_goals = [g for g in goals if g.get("type") != "emergency" and not g.get("is_completed", False)]
        return {
            "success": False,
            "emergency_fund": {"percent": 10.0, "amount": int(income_amount * 0.1)},
            "goal_allocations": [
                {"goal_id": g.get("id"), "percent": 15.0, "amount": int(income_amount * 0.15)}
                for g in regular_goals[:2]
            ],
            "total_allocation_percent": 40.0,
            "remaining_percent": 60.0,
            "remaining_amount": int(income_amount * 0.6),
            "reasoning": "Default allocation (error occurred)"
        }


# ------------------------- ORCHESTRATOR -------------------------

def orchestrate(user_data: Dict, user_query: str) -> Dict[str, Any]:
    """
    Orchestrate all agents and generate final response using LLM.
    
    Args:
        user_data: Dictionary containing user's transactions, goals, settings
        user_query: User's query/question
    
    Returns:
        Dictionary with results from all agents and LLM response
    """
    logger.info("=" * 80)
    logger.info("ORCHESTRATE CALLED")
    logger.info("=" * 80)
    logger.info(f"User Query: {user_query}")
    
    if not user_data:
        return {"error": "user_data required"}
    
    try:
        logger.info("Running agents...")
        
        # Run income agent first
        income = income_pattern_agent(user_data)
        logger.info(f"Income Agent Result: {json.dumps(income, indent=2, default=str)}")
        
        spend = spending_watchdog_agent(user_data, user_query)
        logger.info(f"Spending Agent Result: {json.dumps(spend, indent=2, default=str)}")
        
        # Pass income data to goal planner so it can recommend allocations
        goals = goal_planner_agent(user_data, user_query, income_data=income)
        logger.info(f"Goals Agent Result: {json.dumps(goals, indent=2, default=str)}")
        
        emerg = emergency_fund_agent(user_data)
        logger.info(f"Emergency Fund Agent Result: {json.dumps(emerg, indent=2, default=str)}")

        # Enhanced prompt for gig workers with weekly payments
        income_note = ""
        if income.get("recent_income") and income["recent_income"].get("received"):
            income_note = f"\n⚠️ IMPORTANT: Weekly payment detected! User received ₹{income['recent_income']['total_amount']} in last 7 days. Prioritize goal allocation recommendations!"
        
        # Get user's preferred language (default to English)
        user_language = user_data.get("language", "en-US")
        language_instruction = "in English"
        if user_language and "hi" in user_language.lower():
            language_instruction = "in simple English (you can include Hindi translations in parentheses if helpful)"
        else:
            language_instruction = "in clear, simple English"
        
        prompt = (
            f"User query: {user_query}\n"
            f"Income summary: {income}\n"
            f"Spending summary: {spend}\n"
            f"Goals: {goals}\n"
            f"Emergency fund advice: {emerg}\n"
            f"{income_note}\n"
            f"Provide a concise action plan (3 bullets) {language_instruction}, with 1 micro-savings suggestion. "
            f"If weekly payment was received, emphasize allocating it to goals immediately. "
            f"Keep the response professional, clear, and actionable."
        )
        logger.info(f"LLM Prompt: {prompt}")
        
        llm_resp = call_llm(prompt)
        logger.info(f"LLM Response: {json.dumps(llm_resp, indent=2, default=str)}")

        result = {
            "income": income,
            "spending": spend,
            "goals": goals,
            "emergency": emerg,
            "llm": llm_resp,
        }
        
        logger.info("=" * 80)
        logger.info("FINAL RESPONSE:")
        logger.info(json.dumps(result, indent=2, default=str))
        logger.info("=" * 80)
        
        return result
    except Exception as e:
        logger.exception("Error in orchestration")
        return {"error": "internal error", "details": str(e)}


# ------------------------- AUTO GOAL GENERATION -------------------------

def analyze_and_generate_goals(user_data: Dict) -> Dict[str, Any]:
    """
    Analyze last 3 months of income and spending, then use LLM to generate goals.
    Returns structured goal recommendations including savings goals and emergency fund.
    """
    logger.info("=" * 80)
    logger.info("AUTO GOAL GENERATION - Analyzing last 3 months")
    logger.info("=" * 80)
    
    try:
        # Get last 3 months of transactions
        recent_txs = get_last_3_months_transactions(user_data)
        
        if not recent_txs:
            logger.warning("No transactions found in last 3 months")
            return {
                "goals": [],
                "message": "No transaction data available for analysis"
            }
        
        # Analyze income and spending
        income_txs = [t for t in recent_txs if float(t[1]) > 0]
        expense_txs = [t for t in recent_txs if float(t[1]) < 0]
        
        total_income = sum(float(t[1]) for t in income_txs)
        total_expenses = abs(sum(float(t[1]) for t in expense_txs))
        net_savings = total_income - total_expenses
        avg_monthly_income = total_income / 3
        avg_monthly_expenses = total_expenses / 3
        savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0
        
        # Calculate emergency fund recommendation (3-6 months expenses)
        emergency_fund_min = avg_monthly_expenses * 3
        emergency_fund_max = avg_monthly_expenses * 6
        emergency_fund_recommended = int((emergency_fund_min + emergency_fund_max) / 2)
        
        # Prepare analysis summary for LLM
        analysis_summary = f"""
Financial Analysis (Last 3 Months):
- Total Income: ₹{total_income:,.0f}
- Total Expenses: ₹{total_expenses:,.0f}
- Net Savings: ₹{net_savings:,.0f}
- Average Monthly Income: ₹{avg_monthly_income:,.0f}
- Average Monthly Expenses: ₹{avg_monthly_expenses:,.0f}
- Savings Rate: {savings_rate:.1f}%
- Emergency Fund Recommended: ₹{emergency_fund_recommended:,} (3-6 months expenses)

Income Transactions: {len(income_txs)}
Expense Transactions: {len(expense_txs)}
"""
        
        # Create prompt for LLM to generate goals
        user_language = user_data.get("language", "en-US")
        language_instruction = "in English"
        if user_language and "hi" in user_language.lower():
            language_instruction = "in simple English (you can include Hindi translations in parentheses if helpful)"
        
        prompt = f"""
You are a financial coach for gig workers in India. Based on the following financial analysis, create personalized savings goals.

{analysis_summary}

User Profile:
- Name: {user_data.get('name', 'User')}
- Current Goals: {len(user_data.get('goals', []))} existing goals

Requirements:
1. Create an EMERGENCY FUND goal with target ₹{emergency_fund_recommended:,} (this is mandatory)
2. Create 2-3 additional savings goals based on their income and spending patterns
3. Goals should be realistic and achievable
4. Consider their savings rate ({savings_rate:.1f}%) when setting targets
5. For gig workers, consider weekly/monthly income patterns

Return ONLY a JSON array of goals in this exact format:
[
  {{
    "name": "Emergency Fund",
    "target": {emergency_fund_recommended},
    "type": "emergency",
    "deadline_months": null
  }},
  {{
    "name": "Goal Name",
    "target": 50000,
    "type": "savings",
    "deadline_months": 6
  }}
]

Rules:
- Emergency fund goal must have type "emergency" and deadline_months: null
- Other goals should have type "savings" or specific type
- deadline_months is number of months from now (null for emergency fund)
- Target amounts should be in whole numbers (no decimals)
- Keep goal names short and clear (max 50 characters)
- Return ONLY the JSON array, no other text
"""
        
        logger.info(f"LLM Prompt for Goal Generation: {prompt}")
        
        # Call LLM to generate goals
        llm_response = call_llm(prompt, temperature=0.3)
        llm_text = llm_response.get("text", "")
        
        logger.info(f"LLM Response: {llm_text}")
        
        # Parse LLM response to extract JSON
        goals_list = []
        
        try:
            # Try to extract JSON from response (might have extra text)
            json_match = re.search(r'\[.*\]', llm_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                goals_list = json.loads(json_str)
            else:
                # Try parsing entire response as JSON
                goals_list = json.loads(llm_text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Response was: {llm_text}")
            # Fallback: create default goals
            goals_list = [
                {
                    "name": "Emergency Fund",
                    "target": emergency_fund_recommended,
                    "type": "emergency",
                    "deadline_months": None
                }
            ]
        
        # Validate and format goals
        formatted_goals = []
        today = datetime.date.today()
        
        for goal in goals_list:
            if not isinstance(goal, dict):
                continue
            
            name = goal.get("name", "Savings Goal")
            target = int(goal.get("target", 10000))
            goal_type = goal.get("type", "savings")
            deadline_months = goal.get("deadline_months")
            
            # Fix emergency fund target if it's 0 or too low
            if goal_type == "emergency" and (target == 0 or target < emergency_fund_recommended):
                target = emergency_fund_recommended
                logger.info(f"Fixed Emergency Fund target from {goal.get('target', 0)} to {target}")
            
            # Calculate deadline
            deadline = None
            if deadline_months is not None and deadline_months > 0:
                deadline_date = today + datetime.timedelta(days=deadline_months * 30)
                deadline = deadline_date.isoformat()
            
            formatted_goals.append({
                "name": name,
                "target": target,
                "type": goal_type,
                "deadline": deadline,
                "saved": 0
            })
        
        # Ensure emergency fund goal exists with correct target
        has_emergency = any(g.get("type") == "emergency" for g in formatted_goals)
        if not has_emergency:
            formatted_goals.insert(0, {
                "name": "Emergency Fund",
                "target": emergency_fund_recommended,
                "type": "emergency",
                "deadline": None,
                "saved": 0
            })
        else:
            # Fix any existing emergency fund with wrong target
            for goal in formatted_goals:
                if goal.get("type") == "emergency" and (goal.get("target", 0) == 0 or goal.get("target", 0) < emergency_fund_recommended):
                    goal["target"] = emergency_fund_recommended
                    logger.info(f"Fixed existing Emergency Fund target to {emergency_fund_recommended}")
        
        logger.info(f"Generated {len(formatted_goals)} goals: {json.dumps(formatted_goals, indent=2)}")
        
        return {
            "goals": formatted_goals,
            "analysis": {
                "total_income": total_income,
                "total_expenses": total_expenses,
                "net_savings": net_savings,
                "avg_monthly_income": avg_monthly_income,
                "avg_monthly_expenses": avg_monthly_expenses,
                "savings_rate": savings_rate,
                "emergency_fund_recommended": emergency_fund_recommended
            },
            "message": f"Generated {len(formatted_goals)} goals based on your financial analysis"
        }
        
    except Exception as e:
        logger.exception("Error in auto goal generation")
        return {
            "goals": [],
            "error": str(e),
            "message": "Failed to generate goals automatically"
        }


def analyze_and_update_goals(user_data: Dict, existing_goals: List[Dict]) -> Dict[str, Any]:
    """
    Analyze last 3 months of income and spending, then update existing goals based on new financial patterns.
    Updates emergency fund targets, adjusts goal amounts, and suggests new goals if needed.
    """
    logger.info("=" * 80)
    logger.info("AUTO GOAL UPDATE - Analyzing and updating existing goals")
    logger.info("=" * 80)
    
    try:
        # Get last 3 months of transactions
        recent_txs = get_last_3_months_transactions(user_data)
        
        if not recent_txs:
            logger.warning("No transactions found in last 3 months for goal update")
            return {
                "updated_goals": [],
                "new_goals": [],
                "message": "No transaction data available for analysis"
            }
        
        # Analyze income and spending
        income_txs = [t for t in recent_txs if float(t[1]) > 0]
        expense_txs = [t for t in recent_txs if float(t[1]) < 0]
        
        total_income = sum(float(t[1]) for t in income_txs)
        total_expenses = abs(sum(float(t[1]) for t in expense_txs))
        net_savings = total_income - total_expenses
        avg_monthly_income = total_income / 3
        avg_monthly_expenses = total_expenses / 3
        savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0
        
        # Calculate new emergency fund recommendation
        emergency_fund_min = avg_monthly_expenses * 3
        emergency_fund_max = avg_monthly_expenses * 6
        emergency_fund_recommended = int((emergency_fund_min + emergency_fund_max) / 2)
        
        # Prepare existing goals summary for LLM
        existing_goals_summary = []
        for goal in existing_goals:
            existing_goals_summary.append({
                "name": goal.get("name", "Unknown"),
                "current_target": float(goal.get("target", 0)),
                "saved": float(goal.get("saved", 0)),
                "remaining": float(goal.get("target", 0)) - float(goal.get("saved", 0)),
                "type": goal.get("type", "savings")
            })
        
        # Prepare analysis summary for LLM
        analysis_summary = f"""
Financial Analysis (Last 3 Months - Updated):
- Total Income: ₹{total_income:,.0f}
- Total Expenses: ₹{total_expenses:,.0f}
- Net Savings: ₹{net_savings:,.0f}
- Average Monthly Income: ₹{avg_monthly_income:,.0f}
- Average Monthly Expenses: ₹{avg_monthly_expenses:,.0f}
- Savings Rate: {savings_rate:.1f}%
- Emergency Fund Recommended: ₹{emergency_fund_recommended:,} (3-6 months expenses)

Existing Goals:
{json.dumps(existing_goals_summary, indent=2)}
"""
        
        # Create prompt for LLM to update goals
        user_language = user_data.get("language", "en-US")
        language_instruction = "in English"
        if user_language and "hi" in user_language.lower():
            language_instruction = "in simple English (you can include Hindi translations in parentheses if helpful)"
        
        prompt = f"""
You are a financial coach for gig workers in India. Based on updated financial analysis, review and update existing goals.

{analysis_summary}

User Profile:
- Name: {user_data.get('name', 'User')}
- Current Goals: {len(existing_goals)} goals

Requirements:
1. UPDATE Emergency Fund goal target to ₹{emergency_fund_recommended:,} if current target is different (this is mandatory)
2. REVIEW each existing goal and suggest if target should be INCREASED, DECREASED, or KEPT SAME based on new income/spending patterns
3. If income increased significantly, suggest increasing goal targets
4. If expenses increased, adjust emergency fund accordingly
5. Consider savings rate ({savings_rate:.1f}%) when making recommendations
6. Only suggest NEW goals if there's a clear need (max 1-2 new goals)

Return ONLY a JSON object with this exact format:
{{
  "updated_goals": [
    {{
      "name": "Emergency Fund",
      "current_target": 0,
      "new_target": {emergency_fund_recommended},
      "action": "update",
      "reason": "Emergency fund should be 3-6 months expenses"
    }},
    {{
      "name": "Goal Name",
      "current_target": 5000,
      "new_target": 6000,
      "action": "increase",
      "reason": "Income increased, can save more"
    }}
  ],
  "new_goals": [
    {{
      "name": "New Goal Name",
      "target": 10000,
      "type": "savings",
      "deadline_months": 6,
      "reason": "New financial need identified"
    }}
  ]
}}

Rules:
- "action" can be: "update", "increase", "decrease", or "keep_same"
- Only include goals that need changes (action != "keep_same")
- For emergency fund, always update if current target differs from recommended
- Be conservative - only suggest increases if income significantly improved
- Return ONLY the JSON object, no other text
"""
        
        logger.info(f"LLM Prompt for Goal Update: {prompt}")
        
        # Call LLM to get update recommendations
        llm_response = call_llm(prompt, temperature=0.3)
        llm_text = llm_response.get("text", "")
        
        logger.info(f"LLM Response: {llm_text}")
        
        # Parse LLM response
        update_recommendations = {"updated_goals": [], "new_goals": []}
        
        try:
            # Try to extract JSON from response
            json_match = re.search(r'\{.*\}', llm_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                update_recommendations = json.loads(json_str)
            else:
                # Try parsing entire response as JSON
                update_recommendations = json.loads(llm_text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Response was: {llm_text}")
            # Fallback: at least update emergency fund
            emergency_goal = next((g for g in existing_goals if g.get("type") == "emergency"), None)
            if emergency_goal:
                current_target = float(emergency_goal.get("target", 0))
                if current_target != emergency_fund_recommended:
                    update_recommendations = {
                        "updated_goals": [{
                            "name": emergency_goal.get("name", "Emergency Fund"),
                            "current_target": current_target,
                            "new_target": emergency_fund_recommended,
                            "action": "update",
                            "reason": "Emergency fund should match 3-6 months expenses"
                        }],
                        "new_goals": []
                    }
        
        # Format update recommendations
        formatted_updates = []
        formatted_new_goals = []
        today = datetime.date.today()
        
        # Process updated goals
        for update in update_recommendations.get("updated_goals", []):
            if not isinstance(update, dict):
                continue
            
            # Find matching existing goal
            goal_name = update.get("name", "")
            existing_goal = next((g for g in existing_goals if g.get("name") == goal_name), None)
            
            if existing_goal:
                new_target = int(update.get("new_target", existing_goal.get("target", 0)))
                current_target = float(existing_goal.get("target", 0))
                
                # Only update if target actually changed
                if new_target != current_target:
                    formatted_updates.append({
                        "goal_id": existing_goal.get("id"),
                        "name": goal_name,
                        "current_target": current_target,
                        "new_target": new_target,
                        "action": update.get("action", "update"),
                        "reason": update.get("reason", "Based on updated financial analysis")
                    })
        
        # Process new goals
        for new_goal in update_recommendations.get("new_goals", []):
            if not isinstance(new_goal, dict):
                continue
            
            name = new_goal.get("name", "Savings Goal")
            target = int(new_goal.get("target", 10000))
            goal_type = new_goal.get("type", "savings")
            deadline_months = new_goal.get("deadline_months")
            
            # Calculate deadline
            deadline = None
            if deadline_months is not None and deadline_months > 0:
                deadline_date = today + datetime.timedelta(days=deadline_months * 30)
                deadline = deadline_date.isoformat()
            
            formatted_new_goals.append({
                "name": name,
                "target": target,
                "type": goal_type,
                "deadline": deadline,
                "saved": 0,
                "reason": new_goal.get("reason", "New financial goal identified")
            })
        
        # Always ensure emergency fund is updated if needed
        emergency_goal = next((g for g in existing_goals if g.get("type") == "emergency"), None)
        if emergency_goal:
            current_target = float(emergency_goal.get("target", 0))
            if current_target != emergency_fund_recommended:
                # Check if already in updates
                already_updating = any(u.get("goal_id") == emergency_goal.get("id") for u in formatted_updates)
                if not already_updating:
                    formatted_updates.append({
                        "goal_id": emergency_goal.get("id"),
                        "name": emergency_goal.get("name", "Emergency Fund"),
                        "current_target": current_target,
                        "new_target": emergency_fund_recommended,
                        "action": "update",
                        "reason": f"Emergency fund should be ₹{emergency_fund_recommended:,} (3-6 months expenses)"
                    })
        
        logger.info(f"Goal update recommendations: {len(formatted_updates)} updates, {len(formatted_new_goals)} new goals")
        
        return {
            "updated_goals": formatted_updates,
            "new_goals": formatted_new_goals,
            "analysis": {
                "total_income": total_income,
                "total_expenses": total_expenses,
                "net_savings": net_savings,
                "avg_monthly_income": avg_monthly_income,
                "avg_monthly_expenses": avg_monthly_expenses,
                "savings_rate": savings_rate,
                "emergency_fund_recommended": emergency_fund_recommended
            },
            "message": f"Analyzed financial data: {len(formatted_updates)} goals to update, {len(formatted_new_goals)} new goals suggested"
        }
        
    except Exception as e:
        logger.exception("Error in auto goal update")
        return {
            "updated_goals": [],
            "new_goals": [],
            "error": str(e),
            "message": "Failed to update goals automatically"
        }

