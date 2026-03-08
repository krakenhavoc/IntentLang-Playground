export const EXAMPLES = [
  {
    name: "Fund Transfer",
    source: `module TransferFunds

--- A fund transfer system between accounts.

entity Account {
  id: UUID
  owner: String
  balance: Decimal(precision: 2)
  currency: CurrencyCode
  status: Active | Frozen | Closed
}

action Transfer {
  from: Account
  to: Account
  amount: Decimal(precision: 2)

  requires {
    from.status == Active
    to.status == Active
    from.currency == to.currency
    amount > 0
    from.balance >= amount
    from.id != to.id
  }

  ensures {
    from.balance == old(from.balance) - amount
    to.balance == old(to.balance) + amount
  }
}

action FreezeAccount {
  account: Account

  requires {
    account.status == Active
  }

  ensures {
    account.status == Frozen
  }
}

invariant NoNegativeBalances {
  forall a: Account => a.balance >= 0
}

edge_cases {
  when amount > 10000.00 => require_approval(level: "manager")
}`,
    requests: [
      {
        name: "Valid Transfer",
        action: "Transfer",
        params: {
          from: { id: "acc-001", owner: "Alice", balance: 500.00, currency: "USD", status: "Active" },
          to: { id: "acc-002", owner: "Bob", balance: 200.00, currency: "USD", status: "Active" },
          amount: 150.00,
        },
        state: {
          Account: [
            { id: "acc-001", owner: "Alice", balance: 500.00, currency: "USD", status: "Active" },
            { id: "acc-002", owner: "Bob", balance: 200.00, currency: "USD", status: "Active" },
          ],
        },
      },
      {
        name: "Insufficient Balance",
        action: "Transfer",
        params: {
          from: { id: "acc-001", owner: "Alice", balance: 50.00, currency: "USD", status: "Active" },
          to: { id: "acc-002", owner: "Bob", balance: 200.00, currency: "USD", status: "Active" },
          amount: 150.00,
        },
        state: {},
      },
      {
        name: "Frozen Account",
        action: "Transfer",
        params: {
          from: { id: "acc-001", owner: "Alice", balance: 500.00, currency: "USD", status: "Frozen" },
          to: { id: "acc-002", owner: "Bob", balance: 200.00, currency: "USD", status: "Active" },
          amount: 100.00,
        },
        state: {},
      },
      {
        name: "Freeze Account",
        action: "FreezeAccount",
        params: {
          account: { id: "acc-001", owner: "Alice", balance: 500.00, currency: "USD", status: "Active" },
        },
        state: {},
      },
    ],
  },
  {
    name: "Shopping Cart",
    source: `module ShoppingCart

--- A shopping cart with stock validation and checkout.

entity Product {
  id: UUID
  name: String
  price: Decimal(precision: 2)
  stock: Int
  status: Available | Discontinued
}

entity CartItem {
  product: Product
  quantity: Int
}

entity Cart {
  id: UUID
  owner: UUID
  items: List<CartItem>
  checked_out: Bool
}

action AddItem {
  cart: Cart
  product: Product
  quantity: Int

  requires {
    cart.checked_out == false
    product.status == Available
    quantity > 0
    product.stock >= quantity
  }

  ensures {
    exists item: CartItem =>
      item.product == product &&
      item.quantity == quantity
  }
}

action Checkout {
  cart: Cart

  requires {
    cart.checked_out == false
  }

  ensures {
    cart.checked_out == true
  }
}

invariant StockNonNegative {
  forall p: Product => p.stock >= 0
}

invariant CartItemsPositive {
  forall item: CartItem => item.quantity > 0
}

edge_cases {
  when product.status == Discontinued => reject("Product is no longer available")
}`,
    requests: [
      {
        name: "Add Item",
        action: "AddItem",
        params: {
          cart: { id: "cart-001", owner: "user-001", items: [], checked_out: false },
          product: { id: "prod-001", name: "Widget", price: 29.99, stock: 100, status: "Available" },
          quantity: 2,
        },
        state: {
          Product: [{ id: "prod-001", name: "Widget", price: 29.99, stock: 100, status: "Available" }],
        },
      },
      {
        name: "Out of Stock",
        action: "AddItem",
        params: {
          cart: { id: "cart-001", owner: "user-001", items: [], checked_out: false },
          product: { id: "prod-001", name: "Widget", price: 29.99, stock: 0, status: "Available" },
          quantity: 1,
        },
        state: {},
      },
      {
        name: "Checkout",
        action: "Checkout",
        params: {
          cart: { id: "cart-001", owner: "user-001", items: [], checked_out: false },
        },
        state: {},
      },
      {
        name: "Already Checked Out",
        action: "Checkout",
        params: {
          cart: { id: "cart-001", owner: "user-001", items: [], checked_out: true },
        },
        state: {},
      },
    ],
  },
  {
    name: "Auth System",
    source: `module Authentication

--- User authentication with session management.

entity User {
  id: UUID
  email: Email
  status: Active | Suspended
  failed_attempts: Int
}

entity Session {
  id: UUID
  user: User
  revoked: Bool
}

action Login {
  user: User

  requires {
    user.status == Active
    user.failed_attempts < 5
  }

  ensures {
    exists s: Session =>
      s.user == user &&
      s.revoked == false
  }
}

action Logout {
  session: Session

  requires {
    session.revoked == false
  }

  ensures {
    session.revoked == true
  }
}

invariant MaxFailedAttempts {
  forall u: User =>
    u.status == Active => u.failed_attempts < 10
}`,
    requests: [
      {
        name: "Login Active User",
        action: "Login",
        params: {
          user: { id: "user-001", email: "alice@example.com", status: "Active", failed_attempts: 0 },
        },
        state: {
          User: [{ id: "user-001", email: "alice@example.com", status: "Active", failed_attempts: 0 }],
        },
      },
      {
        name: "Login Locked User",
        action: "Login",
        params: {
          user: { id: "user-001", email: "alice@example.com", status: "Active", failed_attempts: 5 },
        },
        state: {},
      },
      {
        name: "Login Suspended",
        action: "Login",
        params: {
          user: { id: "user-001", email: "alice@example.com", status: "Suspended", failed_attempts: 0 },
        },
        state: {},
      },
      {
        name: "Logout",
        action: "Logout",
        params: {
          session: { id: "sess-001", user: { id: "user-001" }, revoked: false },
        },
        state: {},
      },
    ],
  },
  {
    name: "RBAC",
    source: `module AccessControl

--- Role-based access control system.

entity User {
  id: UUID
  name: String
  role: Admin | Editor | Viewer
  active: Bool
}

entity Resource {
  id: UUID
  name: String
  owner: User
  public: Bool
}

action GrantAccess {
  user: User
  resource: Resource
  requester: User

  requires {
    requester.role == Admin
    requester.active == true
    user.active == true
  }

  ensures {
    user.role == Editor
  }
}

action DeleteResource {
  resource: Resource
  requester: User

  requires {
    requester.role == Admin || requester.id == resource.owner.id
    requester.active == true
  }
}

invariant AdminExists {
  exists u: User => u.role == Admin && u.active == true
}`,
    requests: [
      {
        name: "Admin Grants Access",
        action: "GrantAccess",
        params: {
          user: { id: "user-002", name: "Bob", role: "Viewer", active: true },
          resource: { id: "res-001", name: "Report", owner: { id: "user-001" }, public: false },
          requester: { id: "user-001", name: "Alice", role: "Admin", active: true },
        },
        state: {
          User: [
            { id: "user-001", name: "Alice", role: "Admin", active: true },
            { id: "user-002", name: "Bob", role: "Viewer", active: true },
          ],
        },
      },
      {
        name: "Non-Admin Denied",
        action: "GrantAccess",
        params: {
          user: { id: "user-003", name: "Charlie", role: "Viewer", active: true },
          resource: { id: "res-001", name: "Report", owner: { id: "user-001" }, public: false },
          requester: { id: "user-002", name: "Bob", role: "Editor", active: true },
        },
        state: {},
      },
      {
        name: "Owner Deletes Resource",
        action: "DeleteResource",
        params: {
          resource: { id: "res-001", name: "Report", owner: { id: "user-001" }, public: false },
          requester: { id: "user-001", name: "Alice", role: "Editor", active: true },
        },
        state: {},
      },
    ],
  },
  {
    name: "API Gateway",
    source: `module ApiGateway

--- API gateway with rate limiting, authentication, and routing.
--- Validates incoming requests against defined routes, enforces
--- rate limits per client, and forwards authenticated traffic.

entity Route {
  path: String
  method: String
  backend: String
  requires_auth: Bool
  rate_limit: Int
  status: Active | Deprecated | Disabled
}

entity Client {
  id: UUID
  api_key: String
  name: String
  tier: Free | Pro | Enterprise
  request_count: Int
  window_start: DateTime
  status: Active | Revoked
}

entity Request {
  id: UUID
  client: Client
  route: Route
  timestamp: DateTime
  status: Pending | Forwarded | Rejected | RateLimited
}

action ForwardRequest {
  --- Route an authenticated request to its backend service.
  client: Client
  route: Route

  requires {
    client.status == Active
    route.status == Active
    client.request_count < route.rate_limit
  }

  ensures {
    client.request_count == old(client.request_count) + 1
    exists r: Request =>
      r.client == client &&
      r.route == route &&
      r.status == Forwarded
  }

  properties {
    atomic: true
    max_latency_ms: 100
    audit_logged: true
  }
}

action ResetRateLimit {
  --- Reset request counter for a client at the start of a new window.
  client: Client

  requires {
    client.status == Active
  }

  ensures {
    client.request_count == 0
  }

  properties {
    idempotent: true
  }
}

action RevokeClient {
  --- Revoke a client's API access.
  client: Client
  reason: String

  requires {
    client.status == Active
  }

  ensures {
    client.status == Revoked
  }

  properties {
    audit_logged: true
    requires_role: "admin"
  }
}

invariant RateLimitRespected {
  forall r: Request =>
    r.status == Forwarded =>
      r.client.request_count <= r.route.rate_limit
}

invariant NoRevokedAccess {
  forall r: Request =>
    r.client.status == Revoked =>
      r.status != Forwarded
}

edge_cases {
  when client.status == Revoked => reject("API key has been revoked")
  when route.status == Disabled => reject("This endpoint is disabled")
  when route.status == Deprecated => allow(note: "Deprecated endpoint, migrate to v2")
  when client.request_count >= route.rate_limit => reject("Rate limit exceeded. Try again later.")
}`,
    requests: [
      {
        name: "Forward Request",
        action: "ForwardRequest",
        params: {
          client: { id: "cli-001", api_key: "key-abc", name: "Acme Corp", tier: "Pro", request_count: 5, window_start: "2025-01-01T00:00:00Z", status: "Active" },
          route: { path: "/api/v1/users", method: "GET", backend: "user-service", requires_auth: true, rate_limit: 100, status: "Active" },
        },
        state: {},
      },
      {
        name: "Rate Limited",
        action: "ForwardRequest",
        params: {
          client: { id: "cli-002", api_key: "key-xyz", name: "Free User", tier: "Free", request_count: 10, window_start: "2025-01-01T00:00:00Z", status: "Active" },
          route: { path: "/api/v1/data", method: "GET", backend: "data-service", requires_auth: true, rate_limit: 10, status: "Active" },
        },
        state: {},
      },
      {
        name: "Reset Rate Limit",
        action: "ResetRateLimit",
        params: {
          client: { id: "cli-001", api_key: "key-abc", name: "Acme Corp", tier: "Pro", request_count: 50, window_start: "2025-01-01T00:00:00Z", status: "Active" },
        },
        state: {},
      },
      {
        name: "Revoke Client",
        action: "RevokeClient",
        params: {
          client: { id: "cli-003", api_key: "key-bad", name: "Bad Actor", tier: "Free", request_count: 0, window_start: "2025-01-01T00:00:00Z", status: "Active" },
          reason: "Terms of service violation",
        },
        state: {},
      },
    ],
  },
  {
    name: "Data Pipeline",
    source: `module DataPipeline

--- A data pipeline system with staged processing, validation,
--- retry logic, and dead-letter handling for failed records.

entity Record {
  id: UUID
  payload: String
  source: String
  stage: Ingested | Validated | Transformed | Loaded | Failed
  retry_count: Int
  error_message: String?
  created_at: DateTime
  updated_at: DateTime
}

entity Pipeline {
  id: UUID
  name: String
  status: Running | Paused | Failed
  records_processed: Int
  records_failed: Int
  started_at: DateTime
}

entity DeadLetterEntry {
  record: Record
  pipeline: Pipeline
  failure_reason: String
  failed_at: DateTime
}

action IngestRecord {
  --- Accept a new record into the pipeline.
  pipeline: Pipeline
  payload: String
  source: String

  requires {
    pipeline.status == Running
  }

  ensures {
    exists r: Record =>
      r.payload == payload &&
      r.source == source &&
      r.stage == Ingested &&
      r.retry_count == 0
  }

  properties {
    idempotent: false
    audit_logged: true
  }
}

action ValidateRecord {
  --- Run validation rules on an ingested record.
  record: Record

  requires {
    record.stage == Ingested
  }

  ensures {
    record.stage == Validated
  }
}

action TransformRecord {
  --- Apply transformations to a validated record.
  record: Record

  requires {
    record.stage == Validated
  }

  ensures {
    record.stage == Transformed
  }
}

action LoadRecord {
  --- Load a transformed record into the target system.
  record: Record
  pipeline: Pipeline

  requires {
    record.stage == Transformed
    pipeline.status == Running
  }

  ensures {
    record.stage == Loaded
    pipeline.records_processed == old(pipeline.records_processed) + 1
  }

  properties {
    atomic: true
    audit_logged: true
  }
}

action FailRecord {
  --- Mark a record as failed and send to dead letter queue.
  record: Record
  pipeline: Pipeline
  reason: String

  requires {
    record.stage != Failed
    record.stage != Loaded
  }

  ensures {
    record.stage == Failed
    record.error_message == reason
    pipeline.records_failed == old(pipeline.records_failed) + 1
    exists d: DeadLetterEntry =>
      d.record == record &&
      d.failure_reason == reason
  }

  properties {
    audit_logged: true
  }
}

action RetryRecord {
  --- Retry a failed record from its last successful stage.
  record: Record

  requires {
    record.stage == Failed
    record.retry_count < 3
  }

  ensures {
    record.stage == Ingested
    record.retry_count == old(record.retry_count) + 1
    record.error_message == null
  }
}

invariant MaxRetries {
  forall r: Record => r.retry_count <= 3
}

invariant FailedRecordsTracked {
  forall r: Record =>
    r.stage == Failed =>
      exists d: DeadLetterEntry => d.record == r
}

invariant PipelineConsistency {
  forall p: Pipeline =>
    p.records_processed >= 0 && p.records_failed >= 0
}

edge_cases {
  when pipeline.status == Paused => reject("Pipeline is paused")
  when pipeline.status == Failed => reject("Pipeline has failed. Investigate before resuming.")
  when record.retry_count >= 3 => reject("Max retries exceeded. Record sent to dead letter queue.")
}`,
    requests: [
      {
        name: "Ingest Record",
        action: "IngestRecord",
        params: {
          pipeline: { id: "pipe-001", name: "ETL-Main", status: "Running", records_processed: 42, records_failed: 3, started_at: "2025-01-01T00:00:00Z" },
          payload: "{\"user_id\": 123, \"event\": \"signup\"}",
          source: "kafka-topic-events",
        },
        state: {},
      },
      {
        name: "Validate Record",
        action: "ValidateRecord",
        params: {
          record: { id: "rec-001", payload: "{\"user_id\": 123}", source: "kafka", stage: "Ingested", retry_count: 0, error_message: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:01Z" },
        },
        state: {},
      },
      {
        name: "Load Record",
        action: "LoadRecord",
        params: {
          record: { id: "rec-001", payload: "{\"user_id\": 123}", source: "kafka", stage: "Transformed", retry_count: 0, error_message: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:02Z" },
          pipeline: { id: "pipe-001", name: "ETL-Main", status: "Running", records_processed: 42, records_failed: 3, started_at: "2025-01-01T00:00:00Z" },
        },
        state: {},
      },
      {
        name: "Retry Failed Record",
        action: "RetryRecord",
        params: {
          record: { id: "rec-002", payload: "{\"bad\": true}", source: "kafka", stage: "Failed", retry_count: 1, error_message: "validation failed", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:01:00Z" },
        },
        state: {},
      },
    ],
  },
];
