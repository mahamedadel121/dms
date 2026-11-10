# How to add a new request type

This guide is for HR and the Super User. It says what can be done from the web app today, what needs the API, and when a developer must write a module.

## 1. Decide what you need

| You want to add | Can be done without code? | How |
|---|---|---|
| A new **expense type** for driver expenses (for example "Parking") | Yes | Web: Master data > Expense types (`/master/expense-types`) |
| A new **approval step** or change an approval route for driver expenses | Yes | Web: Workflows (`/workflows`), draft, publish |
| A new **receipt layout** for driver expenses | Partly: edit the existing template | Web: Templates (`/templates`) |
| A **new kind of request** that has no vehicle, GL or SAP part (for example "Purchase request" with its own categories, approvers and PDF) | Mostly. Creating the request type needs the API (section 3); the approval route and categories then use the web screens. There is no web screen to submit it (section 5). | API + web |
| A new request type that **also** needs vehicles, GL accounts, cost centers, treasury payment or SAP posting | No. A developer must write a request module (section 6). | Code |

Rule of thumb: if the request has the same shape as a driver expense (a list of amounts, receipts, approvers, a final payment) and needs no vehicle or SAP logic, a new request type is enough. Anything that depends on vehicles, GL accounts or SAP needs a module.

## 2. Who can do what

- Creating a request type needs the permission `request_types.manage`. In the base seed only the Super User (`admin`) has it.
- Expense types, workflow editing and templates need `masterdata.manage` (expense types, read-write master data), `workflows.manage` and `templates.manage`. The seed gives `templates.manage` and `workflows.manage` only to the Super User; grant them in Roles (`/admin/roles`) if HR must edit them.
- Publishing a workflow version makes it live for **new** requests. Requests already in progress keep the version they started with (the request is pinned to its workflow version).

## 3. Create the request type (API, Super User)

The web app has no screen for request types. Create one with the API (use a REST client or a script with a Super User token):

```
POST /api/v1/request-types
Authorization: Bearer <access token of a user with request_types.manage>
Content-Type: application/json

{
  "code": "PURCHASE_REQUEST",          // A-Z, 0-9, _ only; unique
  "nameAr": "طلب شراء",
  "nameEn": "Purchase request",
  "departmentId": null,                // optional department id
  "numberPrefix": "PR",                // 1-4 characters A-Z/0-9; unique; numbers look like PR-26-000001
  "moduleKey": null,                   // null = generic request (no module hooks)
  "headerFields": [],                  // extra header fields (FieldDefinition objects)
  "hasLines": true,                    // true = the request has amount lines
  "channels": ["WEB"],                 // TELEGRAM and/or WEB
  "settings": {},
  "isActive": true
}
```

The server does the following in one transaction: creates the request type, an empty `Workflow` for it, and workflow **version 1 as a DRAFT with no steps**. Audit entry: `request_type.create`.

Check the result in Workflows (`/workflows`): the new type appears with a draft version 1.

## 4. Add line categories (expense types for the new type)

The Expense types screen writes only to the expense request type (the first request type with `moduleKey = expense`). For any other request type, add categories with the API (permission `request_types.manage`):

```
POST /api/v1/request-types/<requestTypeId>/line-categories
{
  "code": "OFFICE_SUPPLIES",
  "nameAr": "مستلزمات مكتبية",
  "nameEn": "Office supplies",
  "icon": "📎",
  "sortOrder": 1,
  "isActive": true,
  "extraFields": [],                   // e.g. a text field "supplier"
  "minAttachments": 1,                 // receipts required per line
  "maxAttachments": 10,
  "maxAmountWarning": null,            // optional: warn above this amount
  "approvalRoleIds": []                // extra roles that must approve lines of this category
}
```

Edit later with `PATCH /api/v1/request-types/<id>/line-categories/<categoryId>`. Categories are never deleted: deactivate them with `isActive: false`.

`approvalRoleIds` is how an extra approver is added for one category. The workflow step must then use the condition "the expense type requires this role" (section 5.2, `LINE_CATEGORY_REQUIRES_ROLE`).

## 5. Build the approval route (web)

### 5.1 Open the workflow

Workflows (`/workflows`) > the new type > the draft version. The editor shows the version list, **Add step**, **Save**, **Simulate** and **Publish**. A published version is read-only. To change it, use **New draft from this version**.

### 5.2 Steps

Each step has:

| Field (screen label) | Meaning |
|---|---|
| Step type (`نوع الخطوة`) | `Specific role` (one role) or `Dynamic roles from expense types` (one step that adds one approval per extra role required by the categories of the request) |
| Key (`المفتاح`) | Lowercase letters, digits and `_`. Unique in the version. |
| Name AR / EN | Shown to approvers and in the PDF. Both are required. |
| Role (`الدور`) | Role that approves. The step is visible in that role's inbox. |
| Action (`الإجراء`) | `Approval` (موافقة) or `Payment (treasury)` (دفع). Only one payment step, it must be the last step and cannot be in a parallel group. |
| Parallel group (`المجموعة المتوازية`) | Consecutive steps with the same group name run in parallel. The request moves on when all of them are approved. |
| SLA hours (`المهلة`) | Hours until the step is "delayed". Reminders go out every `workflow.slaReminderIntervalHours`. |
| Can edit amounts / reclassify (`يمكنه تعديل المبالغ` / `تغيير نوع المصروف`) | Lets this step change amounts or categories, if the user also has the matching permission. |
| Allowed actions (`الإجراءات المسموحة`) | Approve, request correction, send back, reject. |
| Checklist (`قائمة التأكيد`) | Items the approver must tick before approving. Required items block the approval. |
| Condition (`شرط التفعيل`) | When the step applies (below). |

Conditions:

- `Always` (`دائماً`): the step applies to every request.
- `Expense type requires this role` (`نوع المصروف يتطلب هذا الدور`): applies when a line's category lists this step's role in its extra approval roles.
- `Some line is one of these types` (`يوجد بند من الأنواع`): applies when a line has one of the chosen categories.
- `Total amount` (`إجمالي المبلغ`): compare the request total with a value (greater than, greater or equal, less than, less or equal, equal).
- `Field` (`حقل`): compare a header or module field (for example the odometer, the department code).
- `AND`, `OR`, `NOT` combine the rules.

A step whose condition is false is recorded as "not applicable" and skipped. Conditions are re-checked when the request reaches the step.

### 5.3 Simulate, then publish

1. Press **Save** (the draft must be saved before simulation).
2. Under **Simulate**, choose categories and a total amount and press simulate. The result shows which steps apply.
3. Fix any issues the editor lists (for example "a step needs a role", "keys must be unique").
4. **Publish**. The new version becomes ACTIVE, the previous ACTIVE version is archived, and new requests of this type use it.

A request type with no ACTIVE workflow version refuses submissions ("has no active workflow").

## 6. Templates (receipt layout)

- Requests without a template version use the default layout (generic request). A request type can be used without a template.
- Existing templates can be edited in Templates (`/templates/<id>`): create a version, edit the configuration, preview, publish.
- **There is no screen or API call that creates a new template.** The base seed creates the driver expense template. A new template for another request type needs a developer (a seed change or a database insert). Until then the default layout is used.

## 7. Test the new type

1. Simulate the workflow (section 5.3).
2. Submit a test request. Submission is available through the API only (`POST /api/v1/requests`, permission `requests.create`, channel `WEB`). There is no web submission screen and the Telegram bot only submits the driver expense type.
3. Open the request (`/requests/<id>`) and check the steps, approvals and the PDF (`/requests/<id>/pdf`).
4. Test the reject and correction paths with a test user.

Test requests stay in the database: the application does not delete requests. Ask a developer if test data must be removed.

## 8. When a module is needed

Write a module (a developer task) when the new type needs any of the following:

- vehicles, drivers and assignments, or the stopped-vehicle rule
- GL accounts per category, cost centers, or a treasury payment with an accounting entry
- SAP posting (see `docs/SAP_INTEGRATION.md`)
- odometer or other checks at submission (`validateSubmission`)
- Telegram submission: the bot's flow is currently fixed to `DRIVER_EXPENSE` (`apps/bot/src/flow.ts`, `REQUEST_TYPE_CODE`).

The steps for a developer, in short (see `docs/ARCHITECTURE.md` section 1.2 for the design):

1. Create a folder in `packages/core/src/<module>` with a `RequestModule` (hooks: `validateSubmission`, `afterCreate`, `conditionFacts`, `onPaid`, `templateData`, `detailExtras`, and others as needed). Add the module's own tables to the Prisma schema with a migration. The core must not import the module.
2. Register it with `registerModule` at start-up in every process that handles requests: the API bootstrap, the bot, the worker and the tests (the expense module does this with `registerExpenseModule()`).
3. Set `moduleKey` on the request type to the module's key.
4. Add API controllers in `apps/api/src/<module>` with permission decorators on every handler.
5. Add web screens under `apps/web/src/app/(app)/` for the module's own data.
6. Write tests with `setupTestDb('<name>')`, never on the `dms` database.

Do not change the core tables for one request type. Use the existing JSON columns or the module's own tables.
