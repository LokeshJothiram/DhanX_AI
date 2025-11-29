"""
Hybrid Goal Target Calculator
Uses formulas as base, LLM for intelligent refinement
"""

import logging
from typing import Dict, List, Optional, Any
from services.ai_coach import call_llm
import json
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def calculate_base_targets(avg_monthly_income: float) -> Dict[str, int]:
    """
    Calculate base goal targets using proven financial formulas.
    This ensures reliability and speed.
    
    Args:
        avg_monthly_income: Average monthly income
    
    Returns:
        Dictionary with base target amounts
    """
    avg_monthly_expenses = avg_monthly_income * 0.7
    
    return {
        "emergency_fund": max(10000, int(avg_monthly_expenses * 4.5)),
        "savings_goal_1": max(5000, int(avg_monthly_income * 2)),
        "savings_goal_2": max(3000, int(avg_monthly_income * 1.5))
    }


def refine_targets_with_llm(
    base_targets: Dict[str, int],
    user_data: Dict,
    avg_monthly_income: float,
    avg_monthly_expenses: float,
    spending_patterns: Optional[Dict] = None
) -> Dict[str, int]:
    """
    Use LLM to intelligently refine goal targets based on user context.
    This adds personalization while maintaining reliability.
    
    Args:
        base_targets: Base targets from formulas
        user_data: User's financial data
        avg_monthly_income: Average monthly income
        avg_monthly_expenses: Average monthly expenses
        spending_patterns: Optional spending pattern analysis
    
    Returns:
        Refined target amounts (falls back to base if LLM fails)
    """
    try:
        # Prepare context for LLM
        spending_rate = (avg_monthly_expenses / avg_monthly_income * 100) if avg_monthly_income > 0 else 70
        savings_rate = 100 - spending_rate
        
        # Get user location if available
        user_location = user_data.get("location", "India")
        
        # Analyze income patterns to determine job type
        transactions = user_data.get("transactions", [])
        income_sources = {}
        if transactions:
            for txn in transactions:
                if len(txn) >= 3 and float(txn[1]) > 0:  # Income transaction
                    category = txn[2] if len(txn) > 2 else "cash_income"
                    income_sources[category] = income_sources.get(category, 0) + float(txn[1])
        
        # Determine job type from income patterns
        is_gig_worker = False
        is_salaried = False
        if "delivery" in str(income_sources).lower() or "cash_income" in str(income_sources).lower():
            is_gig_worker = True
        elif "salary" in str(income_sources).lower():
            is_salaried = True
        
        job_type = "salaried" if is_salaried else ("gig worker" if is_gig_worker else "mixed/unknown")
        
        # Determine income level
        income_level = "low" if avg_monthly_income < 30000 else ("medium" if avg_monthly_income < 75000 else "high")
        
        # Prepare prompt
        prompt = f"""You are an expert financial advisor for users in {user_location}. Refine goal targets intelligently based on comprehensive user context.

BASE TARGETS (calculated from income):
- Emergency Fund: ₹{base_targets['emergency_fund']:,}
- Savings Goal 1: ₹{base_targets['savings_goal_1']:,}
- Savings Goal 2: ₹{base_targets['savings_goal_2']:,}

USER'S FINANCIAL CONTEXT:
- Average Monthly Income: ₹{avg_monthly_income:,.0f} ({income_level} income)
- Average Monthly Expenses: ₹{avg_monthly_expenses:,.0f}
- Spending Rate: {spending_rate:.1f}%
- Savings Rate: {savings_rate:.1f}%
- Job Type: {job_type}
- Location: {user_location}

INTELLIGENT REFINEMENT RULES:
1. Emergency Fund: Adjust based on:
   - Job stability: Gig workers need 6-8 months (irregular income), Salaried need 3-4 months (stable)
   - Income level: High income (>₹75k) can afford more, Low income (<₹30k) needs realistic targets
   - Location: Metro cities (Mumbai, Delhi, Bangalore) need 20-30% more due to higher costs
   - Savings rate: If saving <20%, reduce target; if saving >40%, can increase
   - Base: ₹{base_targets['emergency_fund']:,} (4.5 months expenses)
   - BE SMART: Don't just reduce by 1 month - make meaningful adjustments based on ALL factors

2. Savings Goals: Adjust based on:
   - Income level: 
     * Low income (<₹30k): Keep targets realistic (1-1.5 months income)
     * Medium income (₹30k-₹75k): Standard targets (1.5-2 months income)
     * High income (>₹75k): Can set higher targets (2-3 months income)
   - Savings rate: 
     * If saving >35%: Can increase targets by 20-30%
     * If saving <25%: Reduce targets by 10-20% to be achievable
   - Job type: Gig workers need more flexible targets
   - Base Goal 1: ₹{base_targets['savings_goal_1']:,} (2 months income)
   - Base Goal 2: ₹{base_targets['savings_goal_2']:,} (1.5 months income)
   - BE ADAPTIVE: Adjust both goals intelligently, not just keep them the same

3. MINIMUM CONSTRAINTS (never go below):
   - Emergency Fund: ₹10,000
   - Savings Goal 1: ₹5,000
   - Savings Goal 2: ₹3,000

4. MAXIMUM CONSTRAINTS (be realistic):
   - Don't set targets > 6 months income for savings goals
   - Don't set emergency fund > 12 months expenses

Return ONLY a JSON object with refined targets:
{{
  "emergency_fund": 56700,
  "savings_goal_1": 36000,
  "savings_goal_2": 27000,
  "reasoning": "Brief explanation of refinements"
}}

IMPORTANT:
- Return ONLY the JSON object, no other text
- All amounts must be integers (no decimals)
- Make MEANINGFUL adjustments (not just 1 month reduction) based on ALL factors
- Consider income level, job type, location, and savings rate TOGETHER
- If user is high income (>₹75k) with good savings rate (>30%), consider INCREASING targets
- If user is low income (<₹30k) or gig worker, be more conservative
- Provide detailed reasoning explaining ALL factors considered"""

        # Call LLM
        response = call_llm(prompt, temperature=0.3)
        response_text = response.get("text", "").strip()
        
        # Parse JSON response - handle multiple formats
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            # Try to extract JSON from code blocks
            parts = response_text.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("{") and part.endswith("}"):
                    response_text = part
                    break
        elif "{" in response_text and "}" in response_text:
            # Extract JSON object from text
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start >= 0 and end > start:
                response_text = response_text[start:end]
        
        try:
            refined = json.loads(response_text)
            
            # Validate and apply refinements with min/max constraints
            max_emergency = int(avg_monthly_expenses * 12)  # Max 12 months expenses
            max_savings_1 = int(avg_monthly_income * 6)  # Max 6 months income
            max_savings_2 = int(avg_monthly_income * 6)  # Max 6 months income
            
            refined_targets = {
                "emergency_fund": max(10000, min(max_emergency, int(refined.get("emergency_fund", base_targets["emergency_fund"])))),
                "savings_goal_1": max(5000, min(max_savings_1, int(refined.get("savings_goal_1", base_targets["savings_goal_1"])))),
                "savings_goal_2": max(3000, min(max_savings_2, int(refined.get("savings_goal_2", base_targets["savings_goal_2"]))))
            }
            
            reasoning = refined.get("reasoning", "LLM refinement applied")
            
            # Log detailed comparison: Base formulas vs LLM refinements
            logger.info("=" * 80)
            logger.info("GOAL TARGET CALCULATION - FORMULAS vs LLM REFINEMENT")
            logger.info("=" * 80)
            logger.info(f"📊 BASE FORMULAS (calculated from income):")
            logger.info(f"   Emergency Fund: ₹{base_targets['emergency_fund']:,} (4.5 months expenses)")
            logger.info(f"   Savings Goal 1: ₹{base_targets['savings_goal_1']:,} (2 months income)")
            logger.info(f"   Savings Goal 2: ₹{base_targets['savings_goal_2']:,} (1.5 months income)")
            logger.info(f"")
            logger.info(f"🤖 LLM REFINEMENT:")
            logger.info(f"   Reasoning: {reasoning}")
            logger.info(f"   Emergency Fund: ₹{base_targets['emergency_fund']:,} → ₹{refined_targets['emergency_fund']:,} (change: {refined_targets['emergency_fund'] - base_targets['emergency_fund']:+,})")
            logger.info(f"   Savings Goal 1: ₹{base_targets['savings_goal_1']:,} → ₹{refined_targets['savings_goal_1']:,} (change: {refined_targets['savings_goal_1'] - base_targets['savings_goal_1']:+,})")
            logger.info(f"   Savings Goal 2: ₹{base_targets['savings_goal_2']:,} → ₹{refined_targets['savings_goal_2']:,} (change: {refined_targets['savings_goal_2'] - base_targets['savings_goal_2']:+,})")
            logger.info(f"")
            logger.info(f"✅ FINAL TARGETS (after LLM refinement):")
            logger.info(f"   Emergency Fund: ₹{refined_targets['emergency_fund']:,}")
            logger.info(f"   Savings Goal 1: ₹{refined_targets['savings_goal_1']:,}")
            logger.info(f"   Savings Goal 2: ₹{refined_targets['savings_goal_2']:,}")
            logger.info("=" * 80)
            
            return refined_targets
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Failed to parse LLM response: {e}. Response: {response_text[:200]}. Using base targets.")
            return base_targets
            
    except Exception as e:
        logger.warning(f"LLM refinement failed: {e}. Using base targets.")
        return base_targets


def calculate_goal_targets(
    avg_monthly_income: float,
    user_data: Dict,
    use_llm_refinement: bool = True,
    spending_patterns: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Calculate goal targets using hybrid approach.
    
    Args:
        avg_monthly_income: Average monthly income
        user_data: User's financial data
        use_llm_refinement: Whether to use LLM for refinement (default: True)
        spending_patterns: Optional spending pattern analysis
    
    Returns:
        Dictionary with targets and metadata
    """
    # Step 1: Calculate base targets (always reliable)
    base_targets = calculate_base_targets(avg_monthly_income)
    avg_monthly_expenses = avg_monthly_income * 0.7
    
    logger.info(f"📐 CALCULATING GOAL TARGETS - Income: ₹{avg_monthly_income:,.0f}/month, Expenses: ₹{avg_monthly_expenses:,.0f}/month")
    
    # Step 2: Refine with LLM if enabled (adds intelligence)
    if use_llm_refinement:
        logger.info("🤖 LLM refinement enabled - refining targets based on user context...")
        refined_targets = refine_targets_with_llm(
            base_targets,
            user_data,
            avg_monthly_income,
            avg_monthly_expenses,
            spending_patterns
        )
        
        return {
            "targets": refined_targets,
            "base_targets": base_targets,
            "refined": True,
            "method": "hybrid_llm"
        }
    else:
        return {
            "targets": base_targets,
            "base_targets": base_targets,
            "refined": False,
            "method": "formula_only"
        }

