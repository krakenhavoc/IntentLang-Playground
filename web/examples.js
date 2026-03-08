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
];
