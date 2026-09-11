/**
 * Fix task assignments, link requirements, and create QA test tasks
 * for Planthouse ERP project.
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

// Requirement ID map
const REQ: Record<string, string> = {
  'REQ-01': '8f6fRl4jmte9gLnkxWrs',
  'REQ-02': 'jjQ1Cn5FAnM5GuH03utx',
  'REQ-03': 'lF34yjn4Cgqcejv7Ko2G',
  'REQ-04': '2s2tb6cSV03m88QrfalW',
  'REQ-05': 'bp1DtAVi91KWLtWXeYB5',
  'REQ-06': 'BCV17zgVgHaGYU0LMaBQ',
  'REQ-07': '225lFdDhk1yPoIOpVFsy',
  'REQ-08': 'Wgu36STzhpWAfcEqAlBF',
  'REQ-09': 'SexI8zSXdjQuKBvU0H0m',
  'REQ-10': 'w2GM6Crcmf0OGMAuPuvt',
  'REQ-11': 'D2uFshpWWSjnY3qcFcDU',
};

// Task updates: taskId → { assignedAgentId, requirementIds }
const TASK_UPDATES: Record<string, { assignedAgentId: string; requirementIds: string[]; status: string }> = {
  // Phase 1
  'Gw4GLNyMNzZtgNgTJ6iE': { // P1.1: Express Server + Firebase Admin Setup
    assignedAgentId: 'agent:seniordev',
    requirementIds: [REQ['REQ-09']],
    status: 'To Do'
  },
  'HeXjClugELJdr9WHvhkt': { // P1.2: Firestore Schema & Tenant Middleware
    assignedAgentId: 'agent:swarch',
    requirementIds: [REQ['REQ-01']],
    status: 'To Do'
  },
  'fWsVA3ZQxygOT8JJDQH0': { // P1.3: Auth API — Firebase Auth + Role Middleware
    assignedAgentId: 'agent:seniordev',
    requirementIds: [REQ['REQ-02'], REQ['REQ-10']],
    status: 'To Do'
  },
  'M0VNVuWdrJbEX3r4WBhP': { // P1.4: Product & Category API
    assignedAgentId: 'agent:dev',
    requirementIds: [REQ['REQ-03']],
    status: 'To Do'
  },
  'gIASWLa1lPohp1unpmWV': { // P1.5: Frontend Auth — Login/Register + Route Guards
    assignedAgentId: 'agent:uidev',
    requirementIds: [REQ['REQ-02']],
    status: 'To Do'
  },
  // Phase 2
  'S8Thhu7QmuxRXCNwrpWe': { // P2.1: POS Terminal — Cart + Checkout + Receipt
    assignedAgentId: 'agent:uidev',
    requirementIds: [REQ['REQ-04']],
    status: 'To Do'
  },
  'lIYh9GEBUX4pSUh0ER98': { // P2.2: POS API — Sales Transactions
    assignedAgentId: 'agent:dev',
    requirementIds: [REQ['REQ-04']],
    status: 'To Do'
  },
  'ZyUTxPLhRqFgdgCkpvRK': { // P2.3: Customer & Loyalty API
    assignedAgentId: 'agent:dev',
    requirementIds: [REQ['REQ-05']],
    status: 'To Do'
  },
  'oDMKHXlDa6allbU7Smi5': { // P2.4: Customer UI — CRM Views + Loyalty Dashboard
    assignedAgentId: 'agent:uidev',
    requirementIds: [REQ['REQ-05']],
    status: 'To Do'
  },
  'usAvEjyYbfxasLOz9AdT': { // P2.5: Product & Inventory UI
    assignedAgentId: 'agent:uidev',
    requirementIds: [REQ['REQ-03']],
    status: 'To Do'
  },
  'eee9GqlVrCmLz95Q6mew': { // P2.6: POS UI — Terminal + Transaction History
    assignedAgentId: 'agent:uxdev',
    requirementIds: [REQ['REQ-04']],
    status: 'To Do'
  },
  'gwthQ2Wyt9i9weajSx66': { // P2.7: Expenses API
    assignedAgentId: 'agent:dev',
    requirementIds: [REQ['REQ-06']],
    status: 'To Do'
  },
  'R2JS3kfPkOO3HxoESB8q': { // P2.8: Financial Reports API
    assignedAgentId: 'agent:seniordev',
    requirementIds: [REQ['REQ-06']],
    status: 'To Do'
  },
  'tQGkluvcqyPERc4msGuo': { // P2.9: Super Admin API
    assignedAgentId: 'agent:seniordev',
    requirementIds: [REQ['REQ-07']],
    status: 'To Do'
  },
  'D5A2W8uEvCJrSayA9KPV': { // P2.10: Super Admin UI
    assignedAgentId: 'agent:uxdev',
    requirementIds: [REQ['REQ-07']],
    status: 'To Do'
  },
  'LKovCRSlKi1BZHxctOfD': { // P2.11: Dashboard UI
    assignedAgentId: 'agent:uxdev',
    requirementIds: [REQ['REQ-08']],
    status: 'To Do'
  },
  'JHd8NcGhrlJFW2h1Ztfn': { // P2.12: Bulk Import/Export
    assignedAgentId: 'agent:dev',
    requirementIds: [REQ['REQ-11']],
    status: 'To Do'
  },
};

// QA Test tasks — one per requirement, assigned to QA-Ops
const QA_TEST_TASKS = [
  { title: 'QA: Multi-Tenant Data Isolation Tests', reqId: REQ['REQ-01'], reqNum: 'REQ-01', description: 'Write and execute test cases for multi-tenant data isolation.\n\nTest scenarios:\n- Tenant A cannot access Tenant B data\n- All API endpoints enforce tenantId scoping\n- Super Admin bypass works correctly\n- Firestore rules block cross-tenant reads/writes\n- API returns 403 for wrong tenant access\n\nReference: REQ-01 acceptance criteria' },
  { title: 'QA: Auth & RBAC Tests', reqId: REQ['REQ-02'], reqNum: 'REQ-02', description: 'Write and execute test cases for authentication and role-based access.\n\nTest scenarios:\n- User registration and login with email/password\n- Role enforcement on API endpoints (cashier vs manager vs admin vs super_admin)\n- Token refresh works correctly\n- Protected routes reject unauthenticated requests\n- Role escalation prevention\n\nReference: REQ-02 acceptance criteria' },
  { title: 'QA: Product & Inventory Lifecycle Tests', reqId: REQ['REQ-03'], reqNum: 'REQ-03', description: 'Write and execute test cases for product and inventory management.\n\nTest scenarios:\n- Product CRUD within tenant scope\n- Stock level updates on sale\n- Low-stock alert triggers at threshold\n- Excel bulk import with validation\n- Inventory lifecycle status transitions\n- Category management\n\nReference: REQ-03 acceptance criteria' },
  { title: 'QA: POS Terminal Tests', reqId: REQ['REQ-04'], reqNum: 'REQ-04', description: 'Write and execute test cases for the POS terminal.\n\nTest scenarios:\n- Cart management (add, remove, qty adjust)\n- Price override restricted by role\n- Transaction totals calculated correctly (tax, discounts)\n- Receipt PDF generation\n- Inventory deducted on sale completion\n- Offline queue sync without data loss\n- End-of-day Z-report accuracy\n\nReference: REQ-04 acceptance criteria' },
  { title: 'QA: CRM & Loyalty Tests', reqId: REQ['REQ-05'], reqNum: 'REQ-05', description: 'Write and execute test cases for customer relationship management.\n\nTest scenarios:\n- Customer CRUD and search (name/phone/email)\n- Loyalty points earned on purchase\n- Points redemption at checkout\n- Purchase history per customer\n- Bulk customer import with duplicate detection\n\nReference: REQ-05 acceptance criteria' },
  { title: 'QA: Expense & Financial Tracking Tests', reqId: REQ['REQ-06'], reqNum: 'REQ-06', description: 'Write and execute test cases for expense and financial tracking.\n\nTest scenarios:\n- Expense CRUD with category and type (OPEX/CAPEX)\n- P&L report generation for date ranges\n- OPEX vs CAPEX split accuracy\n- Financial dashboard data correctness\n- Export to Excel/PDF\n\nReference: REQ-06 acceptance criteria' },
  { title: 'QA: Super Admin Portal Tests', reqId: REQ['REQ-07'], reqNum: 'REQ-07', description: 'Write and execute test cases for super admin portal.\n\nTest scenarios:\n- Tenant provisioning in under 2 minutes\n- User assignment to multiple tenants with different roles\n- Audit logging for all admin actions\n- Tenant suspension blocks access immediately\n- Cross-tenant analytics accuracy\n\nReference: REQ-07 acceptance criteria' },
  { title: 'QA: Dashboard & Analytics Tests', reqId: REQ['REQ-08'], reqNum: 'REQ-08', description: 'Write and execute test cases for the dashboard.\n\nTest scenarios:\n- Dashboard loads within 2 seconds\n- KPIs reflect real-time data\n- Charts render for daily/weekly/monthly views\n- Click-through from dashboard to detail views\n- Responsive layout for tablet and desktop\n\nReference: REQ-08 acceptance criteria' },
  { title: 'QA: Deployment & Infrastructure Tests', reqId: REQ['REQ-09'], reqNum: 'REQ-09', description: 'Write and execute test cases for deployment infrastructure.\n\nTest scenarios:\n- Health check endpoint returns status\n- SSL certificate valid on erp.swarmbuzz.online\n- Server auto-restarts on failure\n- CORS only allows erp.swarmbuzz.online\n- Build and deploy single command works\n\nReference: REQ-09 acceptance criteria' },
  { title: 'QA: Security & Performance Tests', reqId: REQ['REQ-10'], reqNum: 'REQ-10', description: 'Write and execute test cases for security and performance.\n\nTest scenarios:\n- Rate limiting returns 429 after 100 req/min\n- No unauthenticated API access\n- Input validation on all endpoints\n- Firestore rules tested and verified\n- API response time < 500ms under load\n\nReference: REQ-10 acceptance criteria' },
  { title: 'QA: Bulk Import/Export Tests', reqId: REQ['REQ-11'], reqNum: 'REQ-11', description: 'Write and execute test cases for bulk import and export.\n\nTest scenarios:\n- Product import from Excel with validation errors reported\n- Customer import with duplicate detection\n- Export sales data filtered by date range\n- Import templates downloadable for each entity\n- 1000+ row import performance\n\nReference: REQ-11 acceptance criteria' },
];

async function run() {
  console.log('\n🔧 Fixing task assignments and linking requirements...\n');

  // Update existing tasks
  for (const [taskId, update] of Object.entries(TASK_UPDATES)) {
    const taskRef = db.collection('tasks').doc(taskId);
    const doc = await taskRef.get();
    if (!doc.exists) {
      console.log(`  ⚠️  Task ${taskId} not found, skipping`);
      continue;
    }
    const current = doc.data();
    await taskRef.update({
      assignedAgentId: update.assignedAgentId,
      requirementIds: update.requirementIds,
      status: update.status,
      history: [
        ...(current?.history || []),
        { action: 'reassigned', from: 'agent:pm', to: update.assignedAgentId, changedBy: 'agent:cto', timestamp: Timestamp.now() }
      ],
      updatedAt: Timestamp.now()
    });
    console.log(`  ✅ ${current?.title?.slice(0, 55)} → ${update.assignedAgentId} | reqs: ${update.requirementIds.length}`);
  }

  // Update requirements to link back to tasks
  console.log('\n🔗 Linking requirements → tasks...');
  const reqToTasks: Record<string, string[]> = {};
  for (const [taskId, update] of Object.entries(TASK_UPDATES)) {
    for (const reqId of update.requirementIds) {
      if (!reqToTasks[reqId]) reqToTasks[reqId] = [];
      reqToTasks[reqId].push(taskId);
    }
  }
  for (const [reqId, taskIds] of Object.entries(reqToTasks)) {
    const reqRef = db.collection('requirements').doc(reqId);
    await reqRef.update({
      taskIds,
      updatedAt: Timestamp.now()
    });
    console.log(`  ✅ ${reqId.slice(0, 12)} → ${taskIds.length} tasks`);
  }

  // Create QA test tasks
  console.log('\n🧪 Creating QA test tasks...\n');
  for (const qa of QA_TEST_TASKS) {
    const docRef = await db.collection('tasks').add({
      title: qa.title,
      description: qa.description,
      priority: 'High',
      epic: 'QA',
      status: 'Blocked', // Can't test until dev tasks are done
      projectId: PLANHOUSE_PROJECT,
      createdBy: 'agent:cto',
      ownerId,
      assignedAgentId: 'agent:qaops',
      requirementIds: [qa.reqId],
      testCaseIds: [],
      comments: [],
      history: [
        { action: 'created', agentId: 'agent:cto', timestamp: Timestamp.now() },
        { action: 'assigned', agentId: 'agent:qaops', changedBy: 'agent:cto', timestamp: Timestamp.now() },
        { action: 'status-set', from: '', to: 'Blocked', note: 'Waiting for implementation tasks to complete', changedBy: 'agent:cto', timestamp: Timestamp.now() }
      ],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log(`  ✅ ${qa.title} → ${docRef.id}`);
  }

  console.log('\n🎉 All done!');
  console.log('   Tasks updated: 17');
  console.log('   Requirements linked: 11');
  console.log('   QA test tasks created: 11');
  console.log('\n📋 Workflow:');
  console.log('   To Do → (Dev implements) → Review → (Arch reviews) → Reviewed → (QA tests) → Tested → (CTO reviews) → Done → Push');
}

run().catch(err => { console.error('Failed:', err); process.exit(1); });
