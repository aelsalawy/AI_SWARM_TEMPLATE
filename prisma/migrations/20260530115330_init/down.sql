-- Rollback: Drop all tables and enums created by init migration
-- Order: drop tables with foreign keys first (reverse of creation order), then enums

-- Drop tables (reverse FK dependency order)
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "sprints";
DROP TABLE IF EXISTS "requirements";
DROP TABLE IF EXISTS "test_runs";
DROP TABLE IF EXISTS "bug_comments";
DROP TABLE IF EXISTS "bugs";
DROP TABLE IF EXISTS "agents";
DROP TABLE IF EXISTS "task_history";
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "project_members";
DROP TABLE IF EXISTS "projects";
DROP TABLE IF EXISTS "cart_sessions";
DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "vendors";
DROP TABLE IF EXISTS "expenses";
DROP TABLE IF EXISTS "customers";
DROP TABLE IF EXISTS "sale_items";
DROP TABLE IF EXISTS "sales";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "tenant_settings";
DROP TABLE IF EXISTS "tenants";
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "login_history";
DROP TABLE IF EXISTS "users";

-- Drop enums
DROP TYPE IF EXISTS "CartSessionStatus";
DROP TYPE IF EXISTS "TenantStatus";
DROP TYPE IF EXISTS "BillingPlan";
DROP TYPE IF EXISTS "VendorStatus";
DROP TYPE IF EXISTS "RecurringInterval";
DROP TYPE IF EXISTS "ExpenseType";
DROP TYPE IF EXISTS "TrackingMethod";
DROP TYPE IF EXISTS "ProductLifecycle";
DROP TYPE IF EXISTS "SaleStatus";
DROP TYPE IF EXISTS "AgentStatus";
DROP TYPE IF EXISTS "SprintStatus";
DROP TYPE IF EXISTS "ProjectStatus";
DROP TYPE IF EXISTS "RunStatus";
DROP TYPE IF EXISTS "RequirementStatus";
DROP TYPE IF EXISTS "BugPriority";
DROP TYPE IF EXISTS "BugStatus";
DROP TYPE IF EXISTS "TaskPriority";
DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "AccountStatus";
DROP TYPE IF EXISTS "UserRole";