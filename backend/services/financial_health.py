"""
Financial Health Score Service
Calculates a comprehensive financial health score (0-100) for users
based on multiple factors relevant to gig workers
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, date
from decimal import Decimal
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def calculate_financial_health_score(
    db: Session,
    user_id: str,
    goals: List[Any],
    transactions: List[Any],
    monthly_income: float = 0,
    monthly_expenses: float = 0
) -> Dict[str, Any]:
    """
    Calculate comprehensive financial health score (0-100)
    
    Scoring breakdown:
    - Emergency Fund Coverage (0-30 points): Based on emergency fund vs recommended amount
    - Savings Rate (0-25 points): Percentage of income saved
    - Spending Discipline (0-20 points): Budget adherence and spending patterns
    - Goal Completion (0-15 points): Progress on active goals
    - Income Stability (0-10 points): Consistency of income (for gig workers)
    
    Returns:
        {
            "score": 0-100,
            "grade": "A+" to "F",
            "breakdown": {
                "emergency_fund": {...},
                "savings_rate": {...},
                "spending_discipline": {...},
                "goal_completion": {...},
                "income_stability": {...}
            },
            "recommendations": [...],
            "trend": "improving" | "stable" | "declining"
        }
    """
    
    try:
        # Initialize score components
        emergency_fund_score = 0
        savings_rate_score = 0
        spending_discipline_score = 0
        goal_completion_score = 0
        income_stability_score = 0
        
        breakdown = {}
        recommendations = []
        
        # 1. EMERGENCY FUND COVERAGE (0-30 points)
        emergency_goals = [g for g in goals if g.type == "emergency" and not g.is_completed]
        emergency_saved = sum(float(g.saved or 0) for g in emergency_goals)
        emergency_target = sum(float(g.target or 0) for g in emergency_goals)
        
        # Calculate recommended emergency fund (3-6 months expenses)
        recommended_emergency = max(monthly_expenses * 4.5, 10000) if monthly_expenses > 0 else 10000
        
        if emergency_target > 0:
            emergency_progress = (emergency_saved / emergency_target) * 100
            # Score based on progress: 100% = 30 points, 75% = 22.5, 50% = 15, 25% = 7.5, 0% = 0
            emergency_fund_score = min(30, (emergency_progress / 100) * 30)
        elif emergency_saved > 0:
            # Has some emergency savings but no goal
            emergency_progress = (emergency_saved / recommended_emergency) * 100
            emergency_fund_score = min(30, (emergency_progress / 100) * 30)
        else:
            emergency_progress = 0
            emergency_fund_score = 0
        
        breakdown["emergency_fund"] = {
            "score": round(emergency_fund_score, 1),
            "max_score": 30,
            "saved": emergency_saved,
            "target": emergency_target if emergency_target > 0 else recommended_emergency,
            "progress_percent": round(emergency_progress, 1),
            "recommended": recommended_emergency
        }
        
        if emergency_fund_score < 15:
            recommendations.append("Build your emergency fund - aim for 3-6 months of expenses")
        elif emergency_fund_score < 25:
            recommendations.append("Continue building your emergency fund to reach full coverage")
        
        # 2. SAVINGS RATE (0-25 points)
        # Calculate savings rate: (Income - Expenses) / Income * 100
        if monthly_income > 0:
            net_savings = monthly_income - monthly_expenses
            savings_rate = (net_savings / monthly_income) * 100
            
            # Score based on savings rate:
            # 30%+ = 25 points (excellent)
            # 20-30% = 20 points (good)
            # 10-20% = 15 points (fair)
            # 5-10% = 10 points (needs improvement)
            # 0-5% = 5 points (poor)
            # Negative = 0 points
            if savings_rate >= 30:
                savings_rate_score = 25
            elif savings_rate >= 20:
                savings_rate_score = 20
            elif savings_rate >= 10:
                savings_rate_score = 15
            elif savings_rate >= 5:
                savings_rate_score = 10
            elif savings_rate >= 0:
                savings_rate_score = 5
            else:
                savings_rate_score = 0
        else:
            savings_rate = 0
            savings_rate_score = 0
        
        breakdown["savings_rate"] = {
            "score": round(savings_rate_score, 1),
            "max_score": 25,
            "rate_percent": round(savings_rate, 1),
            "monthly_income": monthly_income,
            "monthly_expenses": monthly_expenses,
            "net_savings": monthly_income - monthly_expenses
        }
        
        if savings_rate_score < 10:
            recommendations.append("Increase your savings rate - aim to save at least 10% of income")
        elif savings_rate_score < 20:
            recommendations.append("Great progress! Try to save 20% or more of your income")
        
        # 3. SPENDING DISCIPLINE (0-20 points)
        # Based on budget adherence and spending patterns
        from crud import get_user_by_id
        user = get_user_by_id(db, user_id)
        budget = float(user.monthly_budget) if user and user.monthly_budget else (monthly_income * 0.4 if monthly_income > 0 else 0)
        
        # Check if user has any meaningful financial data
        has_any_data = monthly_income > 0 or monthly_expenses > 0 or len(goals) > 0 or len(transactions) > 0
        
        if budget > 0 and monthly_expenses > 0:
            budget_adherence = (budget - monthly_expenses) / budget * 100
            
            # Score based on budget adherence:
            # Under budget by 10%+ = 20 points
            # Under budget by 0-10% = 18 points
            # Over budget by 0-10% = 12 points
            # Over budget by 10-20% = 8 points
            # Over budget by 20%+ = 4 points
            if budget_adherence >= 10:
                spending_discipline_score = 20
            elif budget_adherence >= 0:
                spending_discipline_score = 18
            elif budget_adherence >= -10:
                spending_discipline_score = 12
            elif budget_adherence >= -20:
                spending_discipline_score = 8
            else:
                spending_discipline_score = 4
        elif budget > 0 and monthly_expenses == 0 and has_any_data:
            # Has budget set but no expenses yet - give neutral score only if user has some data
            budget_adherence = 0
            spending_discipline_score = 10  # Neutral score if budget set but no expenses yet
        else:
            # No budget or no data at all - score should be 0 for new accounts
            budget_adherence = 0
            spending_discipline_score = 0  # No score if no budget and no data
        
        breakdown["spending_discipline"] = {
            "score": round(spending_discipline_score, 1),
            "max_score": 20,
            "budget": budget,
            "actual_spending": monthly_expenses,
            "adherence_percent": round(budget_adherence, 1)
        }
        
        if spending_discipline_score < 12:
            recommendations.append("Control your spending - you're exceeding your budget")
        elif spending_discipline_score < 18:
            recommendations.append("Stay within budget - you're close to your limit")
        
        # 4. GOAL COMPLETION (0-15 points)
        active_goals = [g for g in goals if not g.is_completed]
        completed_goals = [g for g in goals if g.is_completed]
        
        if len(goals) > 0:
            completion_rate = (len(completed_goals) / len(goals)) * 100
            
            # Average progress on active goals
            if active_goals:
                avg_progress = sum((float(g.saved or 0) / float(g.target or 1)) * 100 for g in active_goals) / len(active_goals)
            else:
                avg_progress = 100
            
            # Score: 50% completion + 50% average progress
            goal_completion_score = (completion_rate * 0.5 + avg_progress * 0.5) / 100 * 15
        else:
            goal_completion_score = 0
            completion_rate = 0
            avg_progress = 0
        
        breakdown["goal_completion"] = {
            "score": round(goal_completion_score, 1),
            "max_score": 15,
            "total_goals": len(goals),
            "completed_goals": len(completed_goals),
            "active_goals": len(active_goals),
            "completion_rate": round(completion_rate, 1),
            "avg_progress": round(avg_progress, 1)
        }
        
        if goal_completion_score < 5:
            recommendations.append("Set and work towards financial goals to improve your score")
        elif goal_completion_score < 10:
            recommendations.append("Keep working on your goals - you're making progress!")
        
        # 5. INCOME STABILITY (0-10 points) - Important for gig workers
        # Analyze income consistency over last 3 months
        if len(transactions) > 0:
            income_transactions = [t for t in transactions if t.type == "income"]
            
            if len(income_transactions) >= 3:
                # Calculate income variance
                amounts = [float(t.amount) for t in income_transactions[-12:]]  # Last 12 income transactions
                if len(amounts) >= 3:
                    avg_income = sum(amounts) / len(amounts)
                    variance = sum((x - avg_income) ** 2 for x in amounts) / len(amounts)
                    std_dev = variance ** 0.5
                    
                    # Coefficient of variation (lower is better)
                    cv = (std_dev / avg_income * 100) if avg_income > 0 else 100
                    
                    # Score: Lower CV = higher score
                    # CV < 20% = 10 points (very stable)
                    # CV 20-40% = 8 points (stable)
                    # CV 40-60% = 6 points (moderate)
                    # CV 60-80% = 4 points (unstable)
                    # CV > 80% = 2 points (very unstable)
                    if cv < 20:
                        income_stability_score = 10
                    elif cv < 40:
                        income_stability_score = 8
                    elif cv < 60:
                        income_stability_score = 6
                    elif cv < 80:
                        income_stability_score = 4
                    else:
                        income_stability_score = 2
                else:
                    income_stability_score = 5  # Neutral
                    cv = 0
            else:
                income_stability_score = 5  # Neutral - not enough data
                cv = 0
        else:
            income_stability_score = 0
            cv = 0
        
        breakdown["income_stability"] = {
            "score": round(income_stability_score, 1),
            "max_score": 10,
            "coefficient_of_variation": round(cv, 1),
            "note": "Lower variation = more stable income"
        }
        
        if income_stability_score < 5:
            recommendations.append("Your income is irregular - build a larger emergency fund")
        
        # Calculate total score
        total_score = (
            emergency_fund_score +
            savings_rate_score +
            spending_discipline_score +
            goal_completion_score +
            income_stability_score
        )
        
        # Round to nearest integer
        total_score = round(total_score)
        
        # Check if this is a new account with no data
        has_any_data = monthly_income > 0 or monthly_expenses > 0 or len(goals) > 0 or len(transactions) > 0
        
        # If no data at all, add a helpful recommendation at the beginning
        if not has_any_data and total_score == 0:
            recommendations.insert(0, "Start tracking your income and expenses to get your financial health score")
        
        # Determine grade
        if total_score >= 90:
            grade = "A+"
        elif total_score >= 80:
            grade = "A"
        elif total_score >= 70:
            grade = "B+"
        elif total_score >= 60:
            grade = "B"
        elif total_score >= 50:
            grade = "C+"
        elif total_score >= 40:
            grade = "C"
        elif total_score >= 30:
            grade = "D"
        else:
            grade = "F"
        
        # Determine trend (would need historical data - for now return "stable")
        trend = "stable"
        
        return {
            "score": total_score,
            "grade": grade,
            "breakdown": breakdown,
            "recommendations": recommendations[:3],  # Top 3 recommendations
            "trend": trend,
            "last_calculated": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error calculating financial health score: {e}", exc_info=True)
        return {
            "score": 0,
            "grade": "F",
            "breakdown": {},
            "recommendations": ["Start tracking your finances to get a health score"],
            "trend": "stable",
            "error": str(e)
        }

