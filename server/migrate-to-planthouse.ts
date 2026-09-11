/**
 * One-time migration: re-create all Planthouse ERP requirements and tasks
 * under the correct project (pJYmvMpWSTIbaPIuCFDL) in the named Firestore DB.
 */
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!;
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
const ownerId = process.env.DEFAULT_OWNER_ID || '';
const PLANHOUSE_PROJECT = 'pJYmvMpWSTIbaPIuCFDL';

const app = getApps().length === 0 ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }) : getApps()[0];
const db = getFirestore(app, databaseId);

// --- Requirements data ---
const requirements = [
  {
    title: "REQ-01: Multi-Tenant Data Isolation",
    description: "Each tenant (plant shop) must have fully isolated data. All Firestore queries must be scoped to the authenticated users tenantId. No tenant should ever see another tenants data.\n\nKey aspects:\n- Firestore security rules enforce tenantId matching on all reads/writes\n- Server-side middleware resolves and validates tenant context from auth token\n- Super Admin role bypasses tenant scoping for cross-tenant management\n- Document-level isolation (not database-level)\n\nAcceptance Criteria:\n- Tenant A cannot read/write Tenant Bs data\n- Super Admin can list and manage all tenants\n- All API endpoints validate tenant ownership before operations",
    priority: "Critical",
    status: "Approved",
    type: "Functional",
    epic: "Multi-Tenancy"
  },
  {
    title: "REQ-02: Authentication & Role-Based Access Control",
    description: "Firebase Auth integration with 4-tier role system: super_admin, manager, admin, cashier.\n\nKey aspects:\n- Firebase Auth for login/registration with email+password\n- Custom claims for role assignment stored in Firebase Auth token\n- JWT token validation middleware on all protected routes\n- Role-based route guards on frontend\n- Session management and token refresh\n\nAcceptance Criteria:\n- Users can register and login with email/password\n- Roles are enforced on both API and UI level\n- Cashier can only access POS, not admin settings\n- Manager can access all tenant-scoped features\n- Super Admin can switch between tenants",
    priority: "Critical",
    status: "Approved",
    type: "Functional",
    epic: "Auth"
  },
  {
    title: "REQ-03: Product & Inventory Lifecycle Management",
    description: "Full product catalog with inventory lifecycle tracking specific to botanical/plant retail.\n\nKey aspects:\n- Product CRUD with internal_code, name, category, cost_price, sell_price\n- Plant lifecycle stages: Seed → Growing → Mature → Sold\n- Stock level tracking with low-stock alerts\n- Category management for plant types\n- Bulk import via Excel (xlsx)\n- Barcode/QR code support for quick lookup\n\nAcceptance Criteria:\n- Products can be created, edited, deleted within a tenant\n- Stock levels update automatically on sale\n- Low stock alerts trigger when below threshold\n- Excel bulk import works for 1000+ products\n- Inventory lifecycle status visible per product",
    priority: "High",
    status: "Approved",
    type: "Functional",
    epic: "Inventory"
  },
  {
    title: "REQ-04: Point-of-Sale Terminal",
    description: "Full POS system for processing plant sales with offline capability.\n\nKey aspects:\n- Cart management: add/remove items, quantity adjustment, price override (if allowed)\n- Transaction processing: calculate totals, tax, discounts\n- Receipt generation as PDF (jsPDF + autotable)\n- Offline transaction queue with sync when back online\n- Multiple payment methods (cash, card)\n- Transaction history and receipt re-printing\n- End-of-day cash-up/Z-report\n\nAcceptance Criteria:\n- Cashier can scan/select products, build cart, and checkout\n- Receipt PDF generated and printable\n- Sales recorded in Firestore with inventory deduction\n- Offline sales queued and synced without data loss\n- Transaction search and history available",
    priority: "High",
    status: "Approved",
    type: "Functional",
    epic: "POS"
  },
  {
    title: "REQ-05: Customer Relationship Management & Loyalty",
    description: "CRM system for plant collectors and retail customers with loyalty points.\n\nKey aspects:\n- Customer profiles: name, phone, email, address\n- Loyalty points: earn on purchase, redeem for discounts\n- Purchase history linked to customer\n- Customer segmentation and search\n- Bulk customer import\n- Customer-facing purchase history lookup\n\nAcceptance Criteria:\n- Customers can be created, searched, and edited\n- Loyalty points auto-calculated on sale completion\n- Points can be redeemed at POS for discounts\n- Full purchase history visible per customer\n- Customer search by name/phone/email",
    priority: "High",
    status: "Approved",
    type: "Functional",
    epic: "CRM"
  },
  {
    title: "REQ-06: Expense & Financial Tracking",
    description: "Financial module for OPEX/CAPEX tracking and basic reporting per tenant.\n\nKey aspects:\n- Expense CRUD with category, amount, date, type (OPEX/CAPEX)\n- Expense categories customizable per tenant\n- Revenue tracking from sales data\n- Profit & Loss report per period\n- Cash flow summary\n- Financial dashboard with charts (Recharts)\n- Export to PDF/Excel\n\nAcceptance Criteria:\n- Expenses can be logged, categorized, and tracked\n- OPEX vs CAPEX split visible\n- P&L report generates for any date range\n- Dashboard shows revenue, costs, profit trends\n- Data exportable to Excel/PDF",
    priority: "High",
    status: "Approved",
    type: "Functional",
    epic: "Financials"
  },
  {
    title: "REQ-07: Super Admin Portal",
    description: "Centralized admin portal for managing all tenants, global users, and system-wide settings.\n\nKey aspects:\n- Tenant provisioning: create, configure, suspend, delete tenants\n- Tenant settings: theme, price override toggle, Shopify integration flag\n- Global user management: create users, assign to tenants, set roles\n- Cross-tenant analytics dashboard\n- Audit logging for all admin actions\n- System health monitoring\n\nAcceptance Criteria:\n- Super Admin can provision new tenants in under 2 minutes\n- Users can be assigned to multiple tenants with different roles\n- All admin actions logged with timestamp and user\n- Tenant suspension blocks all tenant access immediately\n- System dashboard shows tenant count, active users, storage usage",
    priority: "High",
    status: "Approved",
    type: "Functional",
    epic: "SuperAdmin"
  },
  {
    title: "REQ-08: Dashboard & Real-Time Analytics",
    description: "Executive dashboard with real-time KPIs, charts, and actionable insights per tenant.\n\nKey aspects:\n- Today sales, revenue, profit margins\n- Top-selling products and categories\n- Inventory alerts (low stock, dead stock)\n- Customer acquisition trends\n- Sales trends charts (daily, weekly, monthly)\n- POS transaction summary\n- Real-time data via Firestore listeners\n\nAcceptance Criteria:\n- Dashboard loads within 2 seconds\n- All KPIs reflect real-time data\n- Charts render correctly for daily/weekly/monthly views\n- Click-through from dashboard to detail views\n- Responsive layout for tablet (POS) and desktop",
    priority: "Medium",
    status: "Approved",
    type: "Functional",
    epic: "Dashboard"
  },
  {
    title: "REQ-09: Deployment & Infrastructure",
    description: "Production deployment on VPS with Caddy reverse proxy, SSL, Docker containerization.\n\nKey aspects:\n- Express server on port 3002 (separate from ALM on 3001)\n- Caddy reverse proxy: erp.swarmbuzz.online → localhost:3002\n- SSL auto-provisioning via Caddy/Let Encrypt\n- Docker containerization (reuse existing OpenClaw container or separate)\n- Environment configuration via .env\n- Health check endpoint\n- Automated build and deploy pipeline\n\nAcceptance Criteria:\n- App accessible at erp.swarmbuzz.online with valid SSL\n- Health check endpoint returns status\n- Server auto-restarts on failure\n- Build and deploy is a single command sequence",
    priority: "High",
    status: "Approved",
    type: "Non-Functional",
    epic: "Deploy"
  },
  {
    title: "REQ-10: Security & Performance Requirements",
    description: "Non-functional requirements for security, performance, and reliability.\n\nKey aspects:\n- Rate limiting on all API endpoints (100 req/min per user)\n- CORS configured for erp.swarmbuzz.online only\n- Input validation on all endpoints (Zod or Joi)\n- Firestore security rules enforce tenant isolation\n- API response time < 500ms for all endpoints\n- 99.9% uptime target\n- Automated backup strategy for Firestore data\n- Error handling with structured error responses\n- Audit logging for sensitive operations\n\nAcceptance Criteria:\n- No unauthenticated API access possible\n- Rate limiting returns 429 after threshold\n- All inputs validated before processing\n- Firestore rules tested and verified\n- Performance benchmarks under load documented",
    priority: "High",
    status: "Approved",
    type: "Non-Functional",
    epic: "Security"
  },
  {
    title: "REQ-11: Bulk Data Import & Export",
    description: "Bulk data import and export capabilities for all major entities.\n\nKey aspects:\n- Excel import for products, customers, and inventory\n- CSV/Excel export for sales, expenses, customer lists\n- Template downloads for each import type\n- Validation and error reporting on import\n- Progress indicator for large imports\n- Support for 1000+ row imports\n\nAcceptance Criteria:\n- Product import from Excel with validation errors reported\n- Customer import with duplicate detection\n- Export sales data filtered by date range\n- Import templates downloadable for each entity type",
    priority: "Medium",
    status: "Approved",
    type: "Functional",
    epic: "Admin"
  }
];

// --- Tasks data ---
const tasks = [
  {
    title: "P1.1: Express Server + Firebase Admin Setup",
    description: "Set up the Express.js backend server with Firebase Admin SDK for Planthouse ERP.\n\nDeliverables:\n- Express server on port 3002 with TypeScript\n- Firebase Admin SDK initialized (ESM-safe dotenv, same pattern as ALM)\n- Health check endpoint: GET /api/health\n- CORS configured for erp.swarmbuzz.online\n- Error handling middleware\n- Request logging middleware\n- Environment config via .env\n\nReference: ADR-002 (Backend API Architecture), ADR-005 (Deployment)\nRepo: /home/node/.openclaw/workspace-cto/Planthouse_ERP\nDO NOT modify any existing ALM server code.",
    priority: "Critical",
    epic: "Deploy",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P1.2: Firestore Schema & Tenant Middleware",
    description: "Design and implement the Firestore schema for multi-tenant data isolation.\n\nDeliverables:\n- Firestore collections: tenants, users, products, categories, customers, sales, expenses\n- Tenant resolver middleware: extract tenantId from auth token, inject into req\n- All routes use tenantId scoping\n- Super Admin bypass for cross-tenant queries\n- Schema documentation in /docs/schema.md\n\nReference: REQ-01 (Multi-Tenancy), REQ-02 (Auth)\nDepends on: P1.1",
    priority: "Critical",
    epic: "Multi-Tenancy",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P1.3: Auth API — Firebase Auth Integration + Role Middleware",
    description: "Build the authentication API with Firebase Auth and role-based access control.\n\nEndpoints:\n- POST /api/auth/register — register with email+password, assign role\n- POST /api/auth/login — authenticate and return custom token\n- POST /api/auth/refresh — refresh ID token\n- GET /api/auth/me — get current user profile with role\n- PATCH /api/auth/profile — update profile\n\nMiddleware:\n- requireAuth — validate Firebase ID token\n- requireRole(...roles) — check user role against allowed list\n- resolveTenant — extract tenantId, validate membership\n\nRoles: super_admin, manager, admin, cashier\nDepends on: P1.1, P1.2",
    priority: "Critical",
    epic: "Auth",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P1.4: Product & Category API — CRUD + Inventory Tracking",
    description: "Build the Product and Category API with inventory lifecycle.\n\nProduct endpoints:\n- GET /api/products — list (filter by category, status, search)\n- GET /api/products/:id — detail\n- POST /api/products — create\n- PATCH /api/products/:id — update\n- DELETE /api/products/:id — soft delete\n- PATCH /api/products/:id/stock — adjust stock level\n\nCategory endpoints:\n- GET /api/categories — list\n- POST /api/categories — create\n- PATCH /api/categories/:id — update\n- DELETE /api/categories/:id — delete (if no products)\n\nAll scoped to tenantId.\nDepends on: P1.2, P1.3",
    priority: "High",
    epic: "Inventory",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P1.5: Frontend Auth — Login/Register + Route Guards",
    description: "Implement the frontend authentication flow.\n\nDeliverables:\n- Login page with email+password\n- Registration page with role selection (admin only)\n- Auth context provider with Firebase Auth\n- Protected route wrapper (requireAuth, requireRole)\n- Token refresh interceptor\n- Redirect to dashboard on login\n- Logout with session cleanup\n\nDepends on: P1.3",
    priority: "High",
    epic: "Auth",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.1: POS Terminal — Cart + Checkout + Receipt",
    description: "Build the full POS terminal interface.\n\nFeatures:\n- Product search/scan → add to cart\n- Cart: adjust qty, remove items, price override (manager+)\n- Calculate subtotal, tax, discounts\n- Payment: cash, card\n- Receipt PDF generation (jsPDF + autotable)\n- Sale recorded → inventory deducted\n- End-of-day Z-report\n\nDepends on: P1.4, P1.5",
    priority: "High",
    epic: "POS",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.2: POS API — Sales Transactions + Inventory Deduction",
    description: "Build the Sales Transaction API.\n\nEndpoints:\n- POST /api/sales — create sale (atomic: write sale + deduct inventory)\n- GET /api/sales — list (filter by date, cashier, payment method)\n- GET /api/sales/:id — detail with line items\n- GET /api/sales/:id/receipt — generate receipt PDF\n- GET /api/sales/daily-summary — Z-report data\n- POST /api/sales/:id/refund — process refund\n\nAtomic operations using Firestore batch writes.\nDepends on: P1.4, P1.3",
    priority: "High",
    epic: "POS",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.3: Customer & Loyalty API — CRM + Points",
    description: "Build the Customer and Loyalty API.\n\nCustomer endpoints:\n- GET /api/customers — list (search by name/phone/email)\n- GET /api/customers/:id — profile with purchase history\n- POST /api/customers — create\n- PATCH /api/customers/:id — update\n- POST /api/customers/import — bulk import\n\nLoyalty:\n- Auto-earn points on sale completion\n- GET /api/customers/:id/points — balance\n- POST /api/customers/:id/redeem — redeem points for discount\n\nDepends on: P1.2, P1.3",
    priority: "High",
    epic: "CRM",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.4: Customer UI — CRM Views + Loyalty Dashboard",
    description: "Build the frontend CRM views.\n\nViews:\n- Customer list with search/filter\n- Customer profile page (details, purchase history, loyalty points)\n- Customer create/edit form\n- Loyalty points redemption at POS checkout\n- Bulk import dialog (Excel upload)\n\nDepends on: P2.3, P1.5",
    priority: "High",
    epic: "CRM",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.5: Product & Inventory UI — Catalog Management",
    description: "Build the frontend product and inventory views.\n\nViews:\n- Product list with filters (category, status, stock level)\n- Product create/edit form (with image upload)\n- Category management page\n- Stock adjustment dialog\n- Low-stock alerts dashboard\n- Inventory lifecycle status per product\n- Excel bulk import for products\n\nDepends on: P1.4, P1.5",
    priority: "High",
    epic: "Inventory",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.6: POS UI — Terminal + Transaction History",
    description: "Build the POS terminal frontend.\n\nViews:\n- POS terminal (full-screen, tablet-optimized)\n- Product search grid with quick-add\n- Cart sidebar with totals\n- Payment modal (cash/card)\n- Receipt preview and print\n- Transaction history list\n- Z-report view\n\nDepends on: P2.1, P2.2, P1.5",
    priority: "High",
    epic: "POS",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.7: Expenses API — CRUD + OPEX/CAPEX Tracking",
    description: "Build the Expenses API with categorization and financial reporting.\n\nEndpoints:\n- GET /api/expenses — list (filter by category, type, date range)\n- GET /api/expenses/:id — get expense detail\n- POST /api/expenses — create expense\n- PATCH /api/expenses/:id — update expense\n- DELETE /api/expenses/:id — soft delete\n- GET /api/expenses/summary — totals by category, OPEX vs CAPEX\n- GET /api/expenses/categories — list tenant expense categories\n\nDepends on: P1.3, P1.4",
    priority: "High",
    epic: "Financials",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.8: Financial Reports API — P&L + Cash Flow",
    description: "Build financial reporting endpoints.\n\nEndpoints:\n- GET /api/reports/profit-loss — P&L for date range\n- GET /api/reports/cash-flow — cash flow summary\n- GET /api/reports/revenue-by-category — revenue breakdown\n- GET /api/reports/top-products — best sellers\n- GET /api/reports/export — export report to Excel/PDF\n\nDepends on: P2.2, P2.7",
    priority: "Medium",
    epic: "Financials",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.9: Super Admin API — Tenant Management + User Provisioning",
    description: "Build the Super Admin API for cross-tenant management.\n\nEndpoints (super_admin only):\n- GET /api/admin/tenants — list all tenants\n- POST /api/admin/tenants — provision new tenant\n- PATCH /api/admin/tenants/:id — update tenant settings\n- DELETE /api/admin/tenants/:id — suspend/delete tenant\n- GET /api/admin/users — list all users across tenants\n- POST /api/admin/users — create user and assign to tenant\n- PATCH /api/admin/users/:id — update user role/tenant assignment\n- GET /api/admin/analytics — cross-tenant stats\n- GET /api/admin/audit-logs — view all audit logs\n\nDepends on: P1.2, P1.3, P1.4",
    priority: "High",
    epic: "SuperAdmin",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.10: Super Admin UI — Tenant & User Management",
    description: "Replace mock SuperAdminView with real cross-tenant management.\n\nDeliverables:\n- Tenant list with status (Active/Suspended)\n- Provision new tenant form (name, settings, theme)\n- Edit tenant settings\n- Suspend/activate tenant toggle\n- User list across all tenants\n- Create user and assign to tenant with role\n- Edit user roles and tenant assignments\n- Cross-tenant analytics cards\n- Audit log viewer\n\nOnly visible to super_admin role.\nDepends on: P2.9, P1.5",
    priority: "Medium",
    epic: "SuperAdmin",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.11: Dashboard UI — KPIs + Charts + Real-Time",
    description: "Build the executive dashboard.\n\nWidgets:\n- Today's sales, revenue, profit margin cards\n- Top-selling products chart\n- Category breakdown pie chart\n- Sales trend line chart (daily/weekly/monthly toggle)\n- Low-stock alerts list\n- Customer acquisition trend\n- POS transaction summary\n\nReal-time via Firestore onSnapshot listeners.\nDepends on: P2.2, P2.5, P2.6, P1.5",
    priority: "Medium",
    epic: "Dashboard",
    assignedAgentId: "agent:pm",
    status: "To Do"
  },
  {
    title: "P2.12: Bulk Import/Export API + UI",
    description: "Build bulk data import and export features.\n\nImport:\n- POST /api/import/products — Excel upload, validate, bulk create\n- POST /api/import/customers — Excel upload, validate, bulk create\n- GET /api/import/template/:type — download template\n\nExport:\n- GET /api/export/sales — filtered Excel/PDF\n- GET /api/export/expenses — filtered Excel/PDF\n- GET /api/export/customers — customer list\n\nUI:\n- Import dialog with file upload, progress bar, error report\n- Export dialog with date range filters and format selection\n\nDepends on: P1.4, P2.3, P2.7",
    priority: "Medium",
    epic: "Admin",
    assignedAgentId: "agent:pm",
    status: "To Do"
  }
];

async function migrate() {
  console.log(`\n📦 Migrating to Planthouse ERP project (${PLANHOUSE_PROJECT}) in DB: ${databaseId}\n`);

  // Create requirements
  console.log(`📋 Creating ${requirements.length} requirements...`);
  for (const req of requirements) {
    const docRef = await db.collection('requirements').add({
      ...req,
      projectId: PLANHOUSE_PROJECT,
      createdBy: 'agent:cto',
      ownerId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log(`  ✅ ${req.title} → ${docRef.id}`);
  }

  // Create tasks
  console.log(`\n📝 Creating ${tasks.length} tasks...`);
  for (const task of tasks) {
    const docRef = await db.collection('tasks').add({
      ...task,
      projectId: PLANHOUSE_PROJECT,
      createdBy: 'agent:cto',
      ownerId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      comments: [],
      requirementIds: [],
      testCaseIds: [],
      history: []
    });
    console.log(`  ✅ ${task.title} → ${docRef.id}`);
  }

  console.log('\n🎉 Migration complete!');
  console.log(`   Requirements: ${requirements.length}`);
  console.log(`   Tasks: ${tasks.length}`);
  console.log(`   Project: Planthouse ERP (${PLANHOUSE_PROJECT})`);
  console.log(`   Database: ${databaseId}`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
