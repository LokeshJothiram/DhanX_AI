"""
Agentic AI System - Fully Autonomous Financial Coaching Agent
Implements tool calling, planning, reasoning, and autonomous action execution
"""

import os
import datetime
import statistics
import re
import logging
import json
from typing import Dict, List, Optional, Any, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from config import settings
from sqlalchemy.orm import Session
from uuid import UUID
from decimal import Decimal

logger = logging.getLogger(__name__)

# ------------------------- TOOL REGISTRY -------------------------

class ToolType(str, Enum):
    """Types of tools available to agents"""
    CREATE_GOAL = "create_goal"
    UPDATE_GOAL = "update_goal"
    ALLOCATE_TO_GOAL = "allocate_to_goal"
    CREATE_TRANSACTION = "create_transaction"
    GET_GOALS = "get_goals"
    GET_TRANSACTIONS = "get_transactions"
    ANALYZE_INCOME = "analyze_income"
    ANALYZE_SPENDING = "analyze_spending"
    SUGGEST_SAVINGS = "suggest_savings"

@dataclass
class Tool:
    """Represents a tool that agents can use"""
    name: str
    description: str
    parameters: Dict[str, Any]
    function: Callable
    requires_confirmation: bool = False
    
@dataclass
class ToolCall:
    """Represents a tool call by an agent"""
    tool_name: str
    arguments: Dict[str, Any]
    agent: str
    timestamp: datetime.datetime = field(default_factory=datetime.datetime.now)
    executed: bool = False
    result: Optional[Any] = None
    error: Optional[str] = None

@dataclass
class AgentMemory:
    """Memory/state for tracking agent actions"""
    actions_taken: List[ToolCall] = field(default_factory=list)
    observations: List[str] = field(default_factory=list)
    reflections: List[str] = field(default_factory=list)
    last_updated: datetime.datetime = field(default_factory=datetime.datetime.now)

class ToolRegistry:
    """Registry of tools available to agents"""
    
    def __init__(self, db: Session, user_id: UUID):
        self.db = db
        self.user_id = user_id
        self.tools: Dict[str, Tool] = {}
        self.memory = AgentMemory()
        self._register_tools()
    
    def _register_tools(self):
        """Register all available tools"""
        from crud import (
            create_goal, update_goal, get_user_goals, get_goal_by_id,
            create_manual_transaction, get_user_transactions
        )
        from schemas import GoalCreate, GoalUpdate, ManualTransactionCreate
        from datetime import timezone
        
        # Create Goal Tool
        self.register_tool(
            Tool(
                name=ToolType.CREATE_GOAL,
                description="Create a new savings goal. Use this when user wants to save for something or when analysis suggests a new goal.",
                parameters={
                    "name": {"type": "string", "description": "Goal name"},
                    "target": {"type": "number", "description": "Target amount in rupees"},
                    "type": {"type": "string", "description": "Goal type: 'emergency', 'savings', 'micro-savings', etc."},
                    "deadline_months": {"type": "number", "description": "Deadline in months from now (optional)"}
                },
                function=self._create_goal_tool,
                requires_confirmation=False  # Auto-create for agentic behavior
            )
        )
        
        # Update Goal Tool
        self.register_tool(
            Tool(
                name=ToolType.UPDATE_GOAL,
                description="Update an existing goal's target, saved amount, or other properties.",
                parameters={
                    "goal_id": {"type": "string", "description": "Goal ID to update"},
                    "target": {"type": "number", "description": "New target amount (optional)"},
                    "saved": {"type": "number", "description": "New saved amount (optional)"},
                    "name": {"type": "string", "description": "New goal name (optional)"}
                },
                function=self._update_goal_tool,
                requires_confirmation=False
            )
        )
        
        # Allocate to Goal Tool
        self.register_tool(
            Tool(
                name=ToolType.ALLOCATE_TO_GOAL,
                description="Allocate money from income to a specific goal. Use this when income is received and should be allocated to goals.",
                parameters={
                    "goal_id": {"type": "string", "description": "Goal ID to allocate to"},
                    "amount": {"type": "number", "description": "Amount to allocate in rupees"}
                },
                function=self._allocate_to_goal_tool,
                requires_confirmation=False
            )
        )
        
        # Create Transaction Tool
        self.register_tool(
            Tool(
                name=ToolType.CREATE_TRANSACTION,
                description="Create a manual transaction record (income or expense).",
                parameters={
                    "amount": {"type": "number", "description": "Transaction amount"},
                    "type": {"type": "string", "description": "'income' or 'expense'"},
                    "category": {"type": "string", "description": "Transaction category"},
                    "description": {"type": "string", "description": "Transaction description"}
                },
                function=self._create_transaction_tool,
                requires_confirmation=False
            )
        )
        
        # Get Goals Tool
        self.register_tool(
            Tool(
                name=ToolType.GET_GOALS,
                description="Get all user goals. Use this to check current goals before making recommendations.",
                parameters={},
                function=self._get_goals_tool,
                requires_confirmation=False
            )
        )
        
        # Get Transactions Tool
        self.register_tool(
            Tool(
                name=ToolType.GET_TRANSACTIONS,
                description="Get recent transactions. Use this to analyze spending patterns.",
                parameters={
                    "limit": {"type": "number", "description": "Number of transactions to retrieve (default: 30)"}
                },
                function=self._get_transactions_tool,
                requires_confirmation=False
            )
        )
    
    def register_tool(self, tool: Tool):
        """Register a tool"""
        self.tools[tool.name] = tool
    
    def get_tool(self, name: str) -> Optional[Tool]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """List all available tools with their descriptions"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters
            }
            for tool in self.tools.values()
        ]
    
    # Tool implementations
    def _create_goal_tool(self, **kwargs) -> Dict[str, Any]:
        """Create a goal tool implementation"""
        try:
            from crud import create_goal
            from schemas import GoalCreate
            from datetime import timezone, timedelta
            
            name = kwargs.get("name", "Savings Goal")
            target = Decimal(str(kwargs.get("target", 10000)))
            goal_type = kwargs.get("type", "savings")
            deadline_months = kwargs.get("deadline_months")
            
            deadline = None
            if deadline_months:
                deadline = datetime.datetime.now(timezone.utc) + timedelta(days=deadline_months * 30)
            
            goal_create = GoalCreate(
                name=name,
                target=target,
                type=goal_type,
                deadline=deadline,
                saved=Decimal(0)
            )
            
            goal = create_goal(self.db, self.user_id, goal_create)
            
            self.memory.actions_taken.append(
                ToolCall(
                    tool_name=ToolType.CREATE_GOAL,
                    arguments=kwargs,
                    agent="goal_planner_agent",
                    executed=True,
                    result={"goal_id": str(goal.id), "name": goal.name, "target": float(goal.target)}
                )
            )
            
            return {
                "success": True,
                "goal_id": str(goal.id),
                "name": goal.name,
                "target": float(goal.target),
                "message": f"Created goal '{goal.name}' with target ₹{goal.target}"
            }
        except Exception as e:
            logger.error(f"Error creating goal: {e}")
            return {"success": False, "error": str(e)}
    
    def _update_goal_tool(self, **kwargs) -> Dict[str, Any]:
        """Update goal tool implementation"""
        try:
            from crud import update_goal, get_goal_by_id
            from schemas import GoalUpdate
            from uuid import UUID as UUIDType
            
            goal_id = UUIDType(kwargs.get("goal_id"))
            goal = get_goal_by_id(self.db, goal_id, self.user_id)
            
            if not goal:
                return {"success": False, "error": "Goal not found"}
            
            update_data = {}
            if "target" in kwargs:
                update_data["target"] = Decimal(str(kwargs["target"]))
            if "saved" in kwargs:
                update_data["saved"] = Decimal(str(kwargs["saved"]))
            if "name" in kwargs:
                update_data["name"] = kwargs["name"]
            
            # If target is being increased beyond current saved amount, unmark as completed
            if "target" in update_data and goal.is_completed:
                new_target = update_data["target"]
                if new_target > goal.saved:
                    update_data["is_completed"] = False
                    logger.info(f"Unmarking goal '{goal.name}' as incomplete since target increased to ₹{new_target} (saved: ₹{goal.saved})")
            
            goal_update = GoalUpdate(**update_data)
            updated_goal = update_goal(self.db, goal_id, self.user_id, goal_update)
            
            self.memory.actions_taken.append(
                ToolCall(
                    tool_name=ToolType.UPDATE_GOAL,
                    arguments=kwargs,
                    agent="goal_planner_agent",
                    executed=True,
                    result={"goal_id": str(updated_goal.id), "updated": update_data}
                )
            )
            
            return {
                "success": True,
                "goal_id": str(updated_goal.id),
                "updated": update_data,
                "message": f"Updated goal '{updated_goal.name}'"
            }
        except Exception as e:
            logger.error(f"Error updating goal: {e}")
            return {"success": False, "error": str(e)}
    
    def _allocate_to_goal_tool(self, **kwargs) -> Dict[str, Any]:
        """Allocate money to goal tool implementation"""
        try:
            from crud import get_goal_by_id, update_goal
            from schemas import GoalUpdate
            from uuid import UUID as UUIDType
            
            goal_id = UUIDType(kwargs.get("goal_id"))
            amount = Decimal(str(kwargs.get("amount", 0)))
            
            goal = get_goal_by_id(self.db, goal_id, self.user_id)
            if not goal:
                return {"success": False, "error": "Goal not found"}
            
            new_saved = goal.saved + amount
            if new_saved > goal.target:
                new_saved = goal.target  # Cap at target
            
            goal_update = GoalUpdate(saved=new_saved)
            updated_goal = update_goal(self.db, goal_id, self.user_id, goal_update)
            
            # Check if goal is completed
            is_completed = new_saved >= goal.target
            if is_completed:
                goal_update_complete = GoalUpdate(is_completed=True)
                update_goal(self.db, goal_id, self.user_id, goal_update_complete)
            
            self.memory.actions_taken.append(
                ToolCall(
                    tool_name=ToolType.ALLOCATE_TO_GOAL,
                    arguments=kwargs,
                    agent="goal_planner_agent",
                    executed=True,
                    result={
                        "goal_id": str(updated_goal.id),
                        "allocated": float(amount),
                        "new_saved": float(new_saved),
                        "completed": is_completed
                    }
                )
            )
            
            return {
                "success": True,
                "goal_id": str(updated_goal.id),
                "allocated": float(amount),
                "new_saved": float(new_saved),
                "completed": is_completed,
                "message": f"Allocated ₹{amount} to '{updated_goal.name}'. Total saved: ₹{new_saved}"
            }
        except Exception as e:
            logger.error(f"Error allocating to goal: {e}")
            return {"success": False, "error": str(e)}
    
    def _create_transaction_tool(self, **kwargs) -> Dict[str, Any]:
        """Create transaction tool implementation"""
        try:
            from crud import create_manual_transaction
            from schemas import ManualTransactionCreate
            from datetime import timezone
            
            amount = Decimal(str(kwargs.get("amount", 0)))
            transaction_type = kwargs.get("type", "expense")
            category = kwargs.get("category", "other")
            description = kwargs.get("description", "Transaction")
            
            transaction_create = ManualTransactionCreate(
                amount=abs(amount),
                type=transaction_type,
                category=category,
                description=description,
                source="ai_agent",
                transaction_date=datetime.datetime.now(timezone.utc)
            )
            
            transaction = create_manual_transaction(self.db, self.user_id, transaction_create)
            
            self.memory.actions_taken.append(
                ToolCall(
                    tool_name=ToolType.CREATE_TRANSACTION,
                    arguments=kwargs,
                    agent="spending_watchdog_agent",
                    executed=True,
                    result={"transaction_id": str(transaction.id), "amount": float(amount)}
                )
            )
            
            return {
                "success": True,
                "transaction_id": str(transaction.id),
                "amount": float(amount),
                "type": transaction_type,
                "message": f"Created {transaction_type} transaction: ₹{amount}"
            }
        except Exception as e:
            logger.error(f"Error creating transaction: {e}")
            return {"success": False, "error": str(e)}
    
    def _get_goals_tool(self, **kwargs) -> Dict[str, Any]:
        """Get goals tool implementation"""
        try:
            from crud import get_user_goals
            
            # Include completed goals so agents can see all goals (including completed emergency funds)
            include_completed = kwargs.get("include_completed", True)
            goals = get_user_goals(self.db, self.user_id, include_completed=include_completed)
            
            return {
                "success": True,
                "goals": [
                    {
                        "id": str(g.id),
                        "name": g.name,
                        "target": float(g.target),
                        "saved": float(g.saved),
                        "remaining": float(g.target - g.saved),
                        "type": g.type,
                        "is_completed": g.is_completed,
                        "deadline": g.deadline.isoformat() if g.deadline else None
                    }
                    for g in goals
                ]
            }
        except Exception as e:
            logger.error(f"Error getting goals: {e}")
            return {"success": False, "error": str(e)}
    
    def _get_transactions_tool(self, **kwargs) -> Dict[str, Any]:
        """Get transactions tool implementation"""
        try:
            from crud import get_user_transactions
            
            limit = kwargs.get("limit", 30)
            transactions = get_user_transactions(self.db, self.user_id, limit=limit)
            
            return {
                "success": True,
                "transactions": [
                    {
                        "id": str(t.id),
                        "amount": float(t.amount),
                        "type": t.type,
                        "category": t.category,
                        "description": t.description,
                        "date": t.transaction_date.isoformat()
                    }
                    for t in transactions
                ]
            }
        except Exception as e:
            logger.error(f"Error getting transactions: {e}")
            return {"success": False, "error": str(e)}
    
    def execute_tool(self, tool_name: str, arguments: Dict[str, Any], agent: str) -> Dict[str, Any]:
        """Execute a tool call"""
        tool = self.get_tool(tool_name)
        if not tool:
            return {"success": False, "error": f"Tool '{tool_name}' not found"}
        
        try:
            result = tool.function(**arguments)
            return result
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            return {"success": False, "error": str(e)}


# ------------------------- PLANNING & REASONING -------------------------

class AgentPlanner:
    """Plans which tools agents should use based on analysis"""
    
    def __init__(self, tool_registry: ToolRegistry):
        self.tool_registry = tool_registry
    
    def plan_actions(self, agent_name: str, analysis: Dict[str, Any], user_query: str) -> List[ToolCall]:
        """Plan actions for an agent based on analysis and query"""
        planned_actions = []
        
        if agent_name == "goal_planner_agent":
            planned_actions.extend(self._plan_goal_actions(analysis, user_query))
        elif agent_name == "income_pattern_agent":
            planned_actions.extend(self._plan_income_actions(analysis, user_query))
        elif agent_name == "spending_watchdog_agent":
            planned_actions.extend(self._plan_spending_actions(analysis, user_query))
        elif agent_name == "emergency_fund_agent":
            planned_actions.extend(self._plan_emergency_actions(analysis, user_query))
        
        return planned_actions
    
    def _plan_goal_actions(self, analysis: Dict[str, Any], user_query: str) -> List[ToolCall]:
        """Plan goal-related actions"""
        actions = []
        
        # Check if user wants to create a goal
        if any(k in user_query.lower() for k in ["save for", "i want to save", "new goal", "create goal", "add goal"]):
            m = re.search(r"₹\s*([0-9,]+)", user_query)
            if not m:
                m = re.search(r"(\d{3,}(?:,\d{3})*)", user_query)
            amount = int(m.group(1).replace(",", "")) if m else 1000
            
            goal_type = "savings"
            if "emergency" in user_query.lower():
                goal_type = "emergency"
            
            actions.append(ToolCall(
                tool_name=ToolType.CREATE_GOAL,
                arguments={
                    "name": "Quick goal from chat",
                    "target": amount,
                    "type": goal_type
                },
                agent="goal_planner_agent"
            ))
        
        # Check for income allocation recommendations
        if analysis.get("recommendations"):
            for rec in analysis.get("recommendations", []):
                if rec.get("suggested_allocation", 0) > 0:
                    actions.append(ToolCall(
                        tool_name=ToolType.ALLOCATE_TO_GOAL,
                        arguments={
                            "goal_id": rec.get("goal_id"),
                            "amount": rec.get("suggested_allocation")
                        },
                        agent="goal_planner_agent"
                    ))
        
        return actions
    
    def _plan_income_actions(self, analysis: Dict[str, Any], user_query: str) -> List[ToolCall]:
        """Plan income-related actions"""
        actions = []
        
        # If recent income detected, automatically allocate to goals
        if analysis.get("recent_income") and analysis["recent_income"].get("received"):
            # Get goals first to allocate
            actions.append(ToolCall(
                tool_name=ToolType.GET_GOALS,
                arguments={},
                agent="income_pattern_agent"
            ))
        
        return actions
    
    def _plan_spending_actions(self, analysis: Dict[str, Any], user_query: str) -> List[ToolCall]:
        """Plan spending-related actions"""
        actions = []
        
        # If intervention needed, suggest creating a savings transaction
        if analysis.get("intervention") and analysis["intervention"].get("action") == "suggest_daily_save":
            # Could create a micro-savings goal automatically
            pass
        
        return actions
    
    def _plan_emergency_actions(self, analysis: Dict[str, Any], user_query: str) -> List[ToolCall]:
        """Plan emergency fund actions"""
        actions = []
        
        # Check if emergency fund goal exists, if not create one
        if "emergency" in user_query.lower() or "buffer" in user_query.lower():
            actions.append(ToolCall(
                tool_name=ToolType.GET_GOALS,
                arguments={},
                agent="emergency_fund_agent"
            ))
        
        return actions


# ------------------------- AGENTIC AGENTS -------------------------

def agentic_income_pattern_agent(user_data: Dict, tool_registry: ToolRegistry) -> Dict[str, Any]:
    """Agentic income pattern agent that can take actions"""
    from .ai_coach import income_pattern_agent
    from datetime import datetime, timedelta
    
    # Run base analysis
    analysis = income_pattern_agent(user_data)
    
    # Plan actions
    planner = AgentPlanner(tool_registry)
    planned_actions = planner.plan_actions("income_pattern_agent", analysis, "")
    
    # Execute actions if income was received
    executed_actions = []
    if analysis.get("recent_income") and analysis["recent_income"].get("received"):
        # Check if income transaction was created very recently (within last 5 minutes)
        # If so, it was likely already allocated by the background task, so skip allocation
        recent_income_txs = analysis["recent_income"].get("transactions", [])
        if recent_income_txs:
            # Check if any transaction is from the last 5 minutes
            now = datetime.now()
            very_recent = False
            for tx in recent_income_txs:
                tx_date_str = tx.get("date", "")
                if tx_date_str:
                    try:
                        # Parse date (format: "2025-11-27")
                        tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d")
                        # Check if transaction is from today and very recent
                        if tx_date.date() == now.date():
                            # Check transaction time if available, or assume it's recent if it's today
                            # Since we don't have exact time, we'll check if goals were recently updated
                            very_recent = True
                            break
                    except:
                        pass
            
            # If transaction is very recent, check if goals were recently updated
            if very_recent:
                goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "income_pattern_agent")
                if goals_result.get("success") and goals_result.get("goals"):
                    goals = goals_result["goals"]
                    # Check if any goal was updated in the last 5 minutes
                    # Since we don't have updated_at in the goal data, we'll use a different approach:
                    # Check if the total saved amount seems to have increased recently
                    # For now, we'll skip allocation if transaction is from today to avoid double allocation
                    logger.info(f"Skipping allocation in income_pattern_agent - income transaction is very recent (likely already allocated by background task)")
                    return {
                        **analysis,
                        "agentic_actions": [],
                        "autonomous": False,
                        "skip_reason": "Income already allocated by background task"
                    }
        
        # Get goals first
        goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "income_pattern_agent")
        
        if goals_result.get("success") and goals_result.get("goals"):
            goals = goals_result["goals"]
            received_amount = analysis["recent_income"]["total_amount"]
            
            # Auto-allocate to goals (40% TOTAL distributed across goals, not per goal)
            # Filter out completed goals
            active_goals = [g for g in goals if not g.get("is_completed", False)]
            
            if active_goals:
                # Calculate 40% total to distribute
                total_allocation_amount = int(received_amount * 0.4)
                
                # Distribute across first 2 goals (20% each, or split proportionally)
                goals_to_allocate = active_goals[:2]
                num_goals = len(goals_to_allocate)
                
                if num_goals == 1:
                    per_goal_amount = total_allocation_amount
                else:
                    per_goal_amount = total_allocation_amount // num_goals
                
                for goal in goals_to_allocate:
                    current_target = float(goal.get("target", 0))
                    current_saved = float(goal.get("saved", 0))
                    remaining = current_target - current_saved
                    
                    # If goal has target 0, skip allocation (emergency fund agent should fix this first)
                    if current_target == 0:
                        logger.warning(f"Goal '{goal.get('name')}' has target 0, skipping allocation. Emergency fund agent should update it.")
                        continue
                    
                    if remaining > 0:
                        allocation = min(remaining, per_goal_amount)
                        if allocation > 0:
                            result = tool_registry.execute_tool(
                                ToolType.ALLOCATE_TO_GOAL,
                                {"goal_id": goal["id"], "amount": allocation},
                                "income_pattern_agent"
                            )
                            if result.get("success"):
                                executed_actions.append(result)
    
    return {
        **analysis,
        "agentic_actions": executed_actions,
        "autonomous": len(executed_actions) > 0
    }


def agentic_goal_planner_agent(user_data: Dict, user_query: str, income_data: Optional[Dict], tool_registry: ToolRegistry) -> Dict[str, Any]:
    """Agentic goal planner agent that can create and update goals"""
    from .ai_coach import goal_planner_agent
    from datetime import datetime
    
    # Run base analysis
    analysis = goal_planner_agent(user_data, user_query, income_data)
    
    # Check if income was already allocated (skip if income transaction is very recent)
    # This prevents double allocation when the background task already allocated the income
    if income_data and income_data.get("recent_income") and income_data["recent_income"].get("received"):
        recent_income_txs = income_data["recent_income"].get("transactions", [])
        if recent_income_txs:
            # Check if any transaction is from today (very recent)
            now = datetime.now()
            very_recent = False
            for tx in recent_income_txs:
                tx_date_str = tx.get("date", "")
                if tx_date_str:
                    try:
                        tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d")
                        if tx_date.date() == now.date():
                            very_recent = True
                            break
                    except:
                        pass
            
            # If transaction is very recent, skip allocation to avoid double allocation
            # The background task in allocate_income_to_goals already handled it
            if very_recent:
                logger.info(f"Skipping allocation in goal_planner_agent - income transaction is very recent (likely already allocated by background task)")
                # Still return recommendations but don't execute allocations
                return {
                    **analysis,
                    "agentic_actions": [],
                    "autonomous": False,
                    "skip_reason": "Income already allocated by background task"
                }
    
    # Plan actions
    planner = AgentPlanner(tool_registry)
    planned_actions = planner.plan_actions("goal_planner_agent", analysis, user_query)
    
    # Execute planned actions
    executed_actions = []
    for action in planned_actions:
        result = tool_registry.execute_tool(action.tool_name, action.arguments, action.agent)
        if result.get("success"):
            executed_actions.append(result)
            action.executed = True
            action.result = result
    
    # Check for completed goals and handle them intelligently
    goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "goal_planner_agent")
    if goals_result.get("success") and goals_result.get("goals"):
        goals = goals_result["goals"]
        completed_goals = [g for g in goals if g.get("is_completed", False)]
        
        # Get recent income to determine if we should suggest new goals
        recent_income = 0
        if income_data and income_data.get("recent_income"):
            recent_income = income_data["recent_income"].get("total_amount", 0)
        
        for goal in completed_goals:
            goal_name = goal.get("name", "").lower()
            goal_type = goal.get("type", "")
            goal_target = float(goal.get("target", 0))
            
            # Recurring goal keywords - these should have targets increased
            recurring_keywords = ["vacation", "monthly", "savings", "emergency", "buffer", "reserve", "fund"]
            is_recurring = any(keyword in goal_name for keyword in recurring_keywords) or goal_type == "emergency"
            
            # One-time goal keywords - these should suggest new goals
            one_time_keywords = ["buy", "purchase", "phone", "laptop", "wedding", "car", "house", "gift"]
            is_one_time = any(keyword in goal_name for keyword in one_time_keywords)
            
            # If it's a recurring goal and we have income, increase the target
            if is_recurring and not is_one_time and recent_income > 0:
                # Increase target by 25% to encourage continued saving
                new_target = int(goal_target * 1.25)
                result = tool_registry.execute_tool(
                    ToolType.UPDATE_GOAL,
                    {
                        "goal_id": goal["id"],
                        "target": new_target,
                        # Keep saved amount at previous target (so progress shows correctly)
                        # Note: is_completed will be automatically set to False when target > saved
                    },
                    "goal_planner_agent"
                )
                if result.get("success"):
                    executed_actions.append(result)
                    logger.info(f"Auto-increased target for completed recurring goal '{goal.get('name')}' from ₹{goal_target} to ₹{new_target} (will be unmarked as completed automatically)")
            
            # If it's a one-time goal and we have excess income, create a new goal automatically
            elif is_one_time and recent_income > goal_target * 0.5:  # If income is significant
                # Auto-create a new goal to continue saving momentum
                new_goal_amount = int(recent_income * 0.3)  # 30% of income
                new_goal_name = f"New Savings Goal"  # Generic name, user can rename
                
                # Try to infer a better name from the completed goal
                if "phone" in goal_name:
                    new_goal_name = "Next Phone Upgrade"
                elif "laptop" in goal_name:
                    new_goal_name = "Next Laptop"
                elif "car" in goal_name:
                    new_goal_name = "Car Maintenance Fund"
                elif "wedding" in goal_name:
                    new_goal_name = "Future Savings"
                
                result = tool_registry.execute_tool(
                    ToolType.CREATE_GOAL,
                    {
                        "name": new_goal_name,
                        "target": new_goal_amount,
                        "type": "savings"
                    },
                    "goal_planner_agent"
                )
                if result.get("success"):
                    executed_actions.append(result)
                    logger.info(f"Auto-created new goal '{new_goal_name}' with target ₹{new_goal_amount} after one-time goal '{goal.get('name')}' was completed")
        
        # If all goals are completed and there's income, create a new goal automatically
        active_goals = [g for g in goals if not g.get("is_completed", False)]
        if len(active_goals) == 0 and recent_income > 0:
            new_goal_amount = int(recent_income * 0.4)  # 40% of income
            result = tool_registry.execute_tool(
                ToolType.CREATE_GOAL,
                {
                    "name": "General Savings Goal",
                    "target": new_goal_amount,
                    "type": "savings"
                },
                "goal_planner_agent"
            )
            if result.get("success"):
                executed_actions.append(result)
                logger.info(f"Auto-created new goal 'General Savings Goal' with target ₹{new_goal_amount} since all goals were completed")
    
    # If goal was created, update analysis
    if executed_actions:
        for action_result in executed_actions:
            if "goal_id" in action_result:
                analysis["created"] = {
                    "id": action_result["goal_id"],
                    "name": action_result.get("name", "Goal"),
                    "target": action_result.get("target", 0)
                }
                analysis["message"] = action_result.get("message", "Goal created")
    
    return {
        **analysis,
        "agentic_actions": executed_actions,
        "autonomous": len(executed_actions) > 0
    }


def agentic_spending_watchdog_agent(user_data: Dict, query_text: Optional[str], tool_registry: ToolRegistry) -> Dict[str, Any]:
    """Agentic spending watchdog that can create savings goals"""
    from .ai_coach import spending_watchdog_agent
    
    # Run base analysis
    analysis = spending_watchdog_agent(user_data, query_text)
    
    executed_actions = []
    
    # If spending is too high, could auto-create micro-savings goal
    if analysis.get("intervention") and "micro-savings" in (query_text.lower() if query_text else ""):
        # Check if micro-savings goal exists
        goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "spending_watchdog_agent")
        
        if goals_result.get("success"):
            has_micro_savings = any(g.get("type") == "micro-savings" for g in goals_result.get("goals", []))
            
            if not has_micro_savings and analysis.get("intervention"):
                amount = analysis["intervention"].get("amount", 50)
                result = tool_registry.execute_tool(
                    ToolType.CREATE_GOAL,
                    {
                        "name": "Daily Micro-Savings",
                        "target": amount * 30,  # Monthly target
                        "type": "micro-savings"
                    },
                    "spending_watchdog_agent"
                )
                if result.get("success"):
                    executed_actions.append(result)
    
    return {
        **analysis,
        "agentic_actions": executed_actions,
        "autonomous": len(executed_actions) > 0
    }


def agentic_emergency_fund_agent(user_data: Dict, tool_registry: ToolRegistry) -> Dict[str, Any]:
    """Agentic emergency fund agent that can create or update emergency fund goals"""
    from .ai_coach import emergency_fund_agent
    
    # Run base analysis
    analysis = emergency_fund_agent(user_data)
    
    executed_actions = []
    
    # Check if emergency fund goal exists
    goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "emergency_fund_agent")
    
    if goals_result.get("success") and analysis.get("recommended_buffer"):
        # Get all emergency goals (including completed ones)
        all_emergency_goals = [g for g in goals_result.get("goals", []) if g.get("type") == "emergency"]
        # Prefer active (non-completed) goals
        active_emergency_goals = [g for g in all_emergency_goals if not g.get("is_completed", False)]
        emergency_goals = active_emergency_goals if active_emergency_goals else all_emergency_goals
        
        if not emergency_goals:
            # No emergency fund goal (active or completed) - create one
            result = tool_registry.execute_tool(
                ToolType.CREATE_GOAL,
                {
                    "name": "Emergency Fund",
                    "target": analysis["recommended_buffer"],
                    "type": "emergency"
                },
                "emergency_fund_agent"
            )
            if result.get("success"):
                executed_actions.append(result)
                analysis["emergency_goal_created"] = True
        else:
            # Emergency fund exists - ONLY work with the FIRST/OLDEST emergency goal to prevent duplicates
            # Sort by created_at to get the oldest one
            emergency_goals_sorted = sorted(emergency_goals, key=lambda g: g.get("created_at", ""))
            primary_emergency_goal = emergency_goals_sorted[0] if emergency_goals_sorted else None
            
            if primary_emergency_goal:
                current_target = float(primary_emergency_goal.get("target", 0))
                recommended = analysis["recommended_buffer"]
                is_completed = primary_emergency_goal.get("is_completed", False)
                
                # If goal is completed but recommended buffer increased, create new goal
                if is_completed and recommended > current_target:
                    result = tool_registry.execute_tool(
                        ToolType.CREATE_GOAL,
                        {
                            "name": "Emergency Fund",
                            "target": recommended,
                            "type": "emergency"
                        },
                        "emergency_fund_agent"
                    )
                    if result.get("success"):
                        executed_actions.append(result)
                        analysis["emergency_goal_created"] = True
                # If target is 0 or significantly different from recommended, update it
                elif not is_completed and (current_target == 0 or abs(current_target - recommended) > recommended * 0.2):
                    result = tool_registry.execute_tool(
                        ToolType.UPDATE_GOAL,
                        {
                            "goal_id": primary_emergency_goal["id"],
                            "target": recommended
                        },
                        "emergency_fund_agent"
                    )
                    if result.get("success"):
                        executed_actions.append(result)
                        analysis["emergency_goal_updated"] = True
                
                # Log warning if multiple emergency goals exist (should be cleaned up)
                if len(emergency_goals) > 1:
                    logger.warning(f"Multiple emergency fund goals detected ({len(emergency_goals)}). Using oldest one. Consider cleaning up duplicates.")
    
    return {
        **analysis,
        "agentic_actions": executed_actions,
        "autonomous": len(executed_actions) > 0
    }


# ------------------------- AGENTIC ORCHESTRATOR -------------------------

def agentic_orchestrate(user_data: Dict, user_query: str, db: Session, user_id: UUID) -> Dict[str, Any]:
    """
    Agentic orchestration - agents can now take autonomous actions using tools.
    
    Args:
        user_data: Dictionary containing user's transactions, goals, settings
        user_query: User's query/question
        db: Database session
        user_id: User ID
    
    Returns:
        Dictionary with results from all agents, LLM response, and executed actions
    """
    logger.info("=" * 80)
    logger.info("AGENTIC ORCHESTRATE CALLED")
    logger.info("=" * 80)
    logger.info(f"User Query: {user_query}")
    
    if not user_data:
        return {"error": "user_data required"}
    
    try:
        # Initialize tool registry
        tool_registry = ToolRegistry(db, user_id)
        
        logger.info("Running agentic agents...")
        
        # Run agentic emergency fund agent FIRST (to ensure goals have proper targets)
        emerg = agentic_emergency_fund_agent(user_data, tool_registry)
        logger.info(f"Emergency Fund Agent Result: {json.dumps(emerg, indent=2, default=str)}")
        
        # Run agentic income agent (after emergency fund is set up)
        income = agentic_income_pattern_agent(user_data, tool_registry)
        logger.info(f"Income Agent Result: {json.dumps(income, indent=2, default=str)}")
        
        # Run agentic spending agent
        spend = agentic_spending_watchdog_agent(user_data, user_query, tool_registry)
        logger.info(f"Spending Agent Result: {json.dumps(spend, indent=2, default=str)}")
        
        # Run agentic goal planner (pass income data)
        goals = agentic_goal_planner_agent(user_data, user_query, income, tool_registry)
        logger.info(f"Goals Agent Result: {json.dumps(goals, indent=2, default=str)}")
        
        # Collect all executed actions (emergency fund first, then income)
        all_actions = []
        all_actions.extend(emerg.get("agentic_actions", []))
        all_actions.extend(income.get("agentic_actions", []))
        all_actions.extend(spend.get("agentic_actions", []))
        all_actions.extend(goals.get("agentic_actions", []))
        
        # Enhanced prompt for LLM with action context
        action_summary = ""
        if all_actions:
            action_summary = "\n\n🤖 AUTONOMOUS ACTIONS TAKEN:\n"
            for action in all_actions:
                action_summary += f"- {action.get('message', 'Action executed')}\n"
        
        # Enhanced prompt for gig workers with weekly payments
        income_note = ""
        if income.get("recent_income") and income["recent_income"].get("received"):
            income_note = f"\n⚠️ IMPORTANT: Weekly payment detected! User received ₹{income['recent_income']['total_amount']} in last 7 days. Income has been automatically allocated to goals!"
        
        # Get user's preferred language
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
            f"{action_summary}\n"
            f"Provide a concise action plan (3 bullets) {language_instruction}, with 1 micro-savings suggestion. "
            f"If autonomous actions were taken, acknowledge them in your response. "
            f"Keep the response professional, clear, and actionable."
        )
        logger.info(f"LLM Prompt: {prompt}")
        
        # Call LLM
        from .ai_coach import call_llm
        llm_resp = call_llm(prompt)
        logger.info(f"LLM Response: {json.dumps(llm_resp, indent=2, default=str)}")
        
        result = {
            "income": income,
            "spending": spend,
            "goals": goals,
            "emergency": emerg,
            "llm": llm_resp,
            "agentic_actions": all_actions,
            "autonomous_mode": len(all_actions) > 0,
            "memory": {
                "actions_count": len(all_actions),
                "last_updated": datetime.datetime.now().isoformat()
            }
        }
        
        logger.info("=" * 80)
        logger.info("FINAL AGENTIC RESPONSE:")
        logger.info(json.dumps(result, indent=2, default=str))
        logger.info("=" * 80)
        
        return result
    except Exception as e:
        logger.exception("Error in agentic orchestration")
        return {"error": "internal error", "details": str(e)}


# ------------------------- AUTONOMOUS MONITORING -------------------------

def autonomous_monitor(user_data: Dict, db: Session, user_id: UUID) -> Dict[str, Any]:
    """
    Autonomous monitoring system - proactively checks user data and takes actions.
    This can be called periodically (e.g., daily) to monitor and intervene.
    
    Args:
        user_data: Dictionary containing user's transactions, goals, settings
        db: Database session
        user_id: User ID
    
    Returns:
        Dictionary with monitoring results and any actions taken
    """
    logger.info("=" * 80)
    logger.info("AUTONOMOUS MONITORING CALLED")
    logger.info("=" * 80)
    
    try:
        # Initialize tool registry
        tool_registry = ToolRegistry(db, user_id)
        
        interventions = []
        actions_taken = []
        
        # 1. Check for recent income that needs allocation
        from .ai_coach import income_pattern_agent
        income_analysis = income_pattern_agent(user_data)
        
        if income_analysis.get("recent_income") and income_analysis["recent_income"].get("received"):
            # Income received - check if goals need allocation
            goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "autonomous_monitor")
            
            if goals_result.get("success") and goals_result.get("goals"):
                goals = goals_result["goals"]
                received_amount = income_analysis["recent_income"]["total_amount"]
                
                # Auto-allocate to first 2 goals (40% each)
                for goal in goals[:2]:
                    remaining = goal["remaining"]
                    if remaining > 0:
                        allocation = min(remaining, int(received_amount * 0.4))
                        if allocation > 0:
                            result = tool_registry.execute_tool(
                                ToolType.ALLOCATE_TO_GOAL,
                                {"goal_id": goal["id"], "amount": allocation},
                                "autonomous_monitor"
                            )
                            if result.get("success"):
                                actions_taken.append(result)
                                interventions.append({
                                    "type": "income_allocation",
                                    "message": f"Automatically allocated ₹{allocation} to '{goal['name']}' from recent income",
                                    "priority": "high"
                                })
        
        # 2. Check if emergency fund goal exists
        from .ai_coach import emergency_fund_agent
        emergency_analysis = emergency_fund_agent(user_data)
        
        goals_result = tool_registry.execute_tool(ToolType.GET_GOALS, {}, "autonomous_monitor")
        if goals_result.get("success"):
            has_emergency = any(g.get("type") == "emergency" for g in goals_result.get("goals", []))
            
            if not has_emergency and emergency_analysis.get("recommended_buffer"):
                # Auto-create emergency fund goal
                result = tool_registry.execute_tool(
                    ToolType.CREATE_GOAL,
                    {
                        "name": "Emergency Fund",
                        "target": emergency_analysis["recommended_buffer"],
                        "type": "emergency"
                    },
                    "autonomous_monitor"
                )
                if result.get("success"):
                    actions_taken.append(result)
                    interventions.append({
                        "type": "emergency_fund_creation",
                        "message": f"Created Emergency Fund goal with target ₹{emergency_analysis['recommended_buffer']}",
                        "priority": "medium"
                    })
        
        # 3. Check for high spending patterns
        from .ai_coach import spending_watchdog_agent
        spending_analysis = spending_watchdog_agent(user_data, None)
        
        if spending_analysis.get("intervention"):
            interventions.append({
                "type": "spending_alert",
                "message": spending_analysis["intervention"].get("message", "High spending detected"),
                "priority": "medium"
            })
        
        # 4. Check for goals that are close to completion
        if goals_result.get("success"):
            for goal in goals_result.get("goals", []):
                progress = (goal["saved"] / goal["target"]) * 100 if goal["target"] > 0 else 0
                if progress >= 90 and progress < 100:
                    interventions.append({
                        "type": "goal_progress",
                        "message": f"'{goal['name']}' is {progress:.0f}% complete! Only ₹{goal['remaining']} remaining.",
                        "priority": "low"
                    })
        
        return {
            "monitored": True,
            "interventions": interventions,
            "actions_taken": actions_taken,
            "timestamp": datetime.datetime.now().isoformat(),
            "summary": f"Monitored user finances: {len(interventions)} interventions, {len(actions_taken)} actions taken"
        }
        
    except Exception as e:
        logger.exception("Error in autonomous monitoring")
        return {
            "monitored": False,
            "error": str(e),
            "timestamp": datetime.datetime.now().isoformat()
        }

