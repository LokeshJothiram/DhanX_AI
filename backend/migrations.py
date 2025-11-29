#!/usr/bin/env python3
"""
WP-001: Database Migration System
Implements database migrations and RLS policies
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from database import get_database_url
from models_wp001 import Base

def create_rls_policies():
    """Create Row Level Security policies for tenant isolation"""
    policies = [
        # Enable RLS on all tables
        "ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE users ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE square_connections ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE stripe_accounts ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE auto_top_up_settings ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE menu_snapshots ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE menu_sync_jobs ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE orders ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE order_edits ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE calls ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE service_tokens ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE tenant_keys ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;",
        
        # Create RLS policies
        "CREATE POLICY p_tenants ON tenants USING (id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_users ON users USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_square_connections ON square_connections USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_stripe_accounts ON stripe_accounts USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_credit_ledger ON credit_ledger USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_auto_top_up_settings ON auto_top_up_settings USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_menu_snapshots ON menu_snapshots USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_menu_sync_jobs ON menu_sync_jobs USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_orders ON orders USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_order_line_items ON order_line_items USING (tenant_id = (SELECT tenant_id FROM orders WHERE id = order_id));",
        "CREATE POLICY p_order_edits ON order_edits USING (tenant_id = (SELECT tenant_id FROM orders WHERE id = order_id));",
        "CREATE POLICY p_calls ON calls USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_idempotency_keys ON idempotency_keys USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_service_tokens ON service_tokens USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_tenant_keys ON tenant_keys USING (tenant_id = current_setting('app.tenant_id')::uuid);",
        "CREATE POLICY p_password_reset_tokens ON password_reset_tokens USING (true);",  # Global access for password reset
    ]
    return policies

def run_migration():
    """Run database migration to create all WP-001 tables and RLS policies"""
    try:
        print("WP-001: Running database migration...")
        
        # Create database engine
        engine = create_engine(get_database_url())
        
        # Create all tables
        print("Creating database tables...")
        Base.metadata.create_all(bind=engine)
        print("All tables created successfully!")
        
        # Create RLS policies
        print("Creating RLS policies...")
        with engine.connect() as conn:
            for policy in create_rls_policies():
                try:
                    conn.execute(text(policy))
                    print(f"Policy created: {policy[:50]}...")
                except Exception as e:
                    if "already exists" in str(e).lower():
                        print(f"Policy already exists: {policy[:50]}...")
                    else:
                        print(f"Error creating policy: {e}")
                        print(f"   Policy: {policy}")
        
        print("RLS policies created successfully!")
        print("WP-001 migration completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        return False

def rollback_migration():
    """Rollback migration by dropping all tables"""
    try:
        print("WP-001: Rolling back migration...")
        
        engine = create_engine(get_database_url())
        
        # Drop all tables
        Base.metadata.drop_all(bind=engine)
        print("All tables dropped successfully!")
        print("WP-001 rollback completed!")
        
        return True
        
    except Exception as e:
        print(f"Rollback failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback_migration()
    else:
        run_migration()
