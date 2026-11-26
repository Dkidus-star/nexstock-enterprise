import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./db";

const DEMO_PASSWORD = "Password123!";

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const demoUsers = [
    { email: "admin@acmelogistics.io", name: "Elena Vance" },
    { email: "manager@acmelogistics.io", name: "Marcus Chen" },
    { email: "staff@acmelogistics.io", name: "Priya Nair" },
    { email: "admin@vanguardsupply.io", name: "David Okafor" },
    { email: "manager@vanguardsupply.io", name: "Sofia Lindqvist" },
  ];

  const userMap = new Map<string, { id: string; email: string }>();
  for (const u of demoUsers) {
    const record = await db.orm.public.User.upsert({
      create: { email: u.email, name: u.name, passwordHash },
      update: { name: u.name, passwordHash },
      conflictOn: { email: u.email },
    });
    userMap.set(u.email, record);
  }
  return userMap;
}

async function seedTenants(
  userMap: Map<string, { id: string; email: string }>,
) {
  const tenantDefs = [
    {
      name: "Acme Logistics",
      slug: "acme-logistics",
      members: [
        { email: "admin@acmelogistics.io", role: "ADMIN" as const },
        { email: "manager@acmelogistics.io", role: "MANAGER" as const },
        { email: "staff@acmelogistics.io", role: "STAFF" as const },
      ],
      warehouses: [
        { name: "East Coast Fulfillment Hub", location: "Newark, NJ" },
        { name: "Midwest Distribution Center", location: "Chicago, IL" },
      ],
      categories: [
        "Industrial Sensors",
        "Packaging & Crates",
        "Safety Gear",
        "Hydraulics",
        "Power Tools",
      ],
    },
    {
      name: "Vanguard Supply Co.",
      slug: "vanguard-supply",
      members: [
        { email: "admin@vanguardsupply.io", role: "ADMIN" as const },
        { email: "manager@vanguardsupply.io", role: "MANAGER" as const },
      ],
      warehouses: [
        { name: "West Coast Port Depot", location: "Long Beach, CA" },
        { name: "Southwest Cold Chain", location: "Phoenix, AZ" },
      ],
      categories: [
        "Server Hardware",
        "Networking Cables",
        "Rack Enclosures",
        "Power Distribution",
      ],
    },
  ];

  const seededTenants = [];

  for (const t of tenantDefs) {
    const org = await db.orm.public.Organization.upsert({
      create: { name: t.name, slug: t.slug },
      update: { name: t.name },
      conflictOn: { slug: t.slug },
    });

    for (const m of t.members) {
      const user = userMap.get(m.email)!;
      await db.orm.public.Membership.upsert({
        create: { userId: user.id, organizationId: org.id, role: m.role },
        update: { role: m.role },
        conflictOn: { userId: user.id, organizationId: org.id },
      });
    }

    const existingWarehouses = await db.orm.public.Warehouse.where({
      organizationId: org.id,
    }).all();

    const warehouses =
      existingWarehouses.length > 0
        ? existingWarehouses
        : await db.orm.public.Warehouse.createAll(
            t.warehouses.map((w) => ({
              name: w.name,
              location: w.location,
              organizationId: org.id,
            })),
          );

    const categories = [];
    for (const catName of t.categories) {
      const cat = await db.orm.public.Category.upsert({
        create: { name: catName, organizationId: org.id },
        update: { name: catName },
        conflictOn: { organizationId: org.id, name: catName },
      });
      categories.push(cat);
    }

    seededTenants.push({ org, warehouses, categories });
  }

  return seededTenants;
}

async function seedCatalogAndOrders(
  tenants: Awaited<ReturnType<typeof seedTenants>>,
  userMap: Map<string, { id: string; email: string }>,
) {
  const prefixes = [
    "Pro",
    "Heavy-Duty",
    "Industrial",
    "Precision",
    "Enterprise",
    "Compact",
  ];
  const suffixes = ["Unit", "Assembly", "Module", "Kit", "Array", "Pack"];
  const statuses = ["PENDING", "PROCESSING", "FULFILLED", "CANCELLED"] as const;

  for (const { org, warehouses, categories } of tenants) {
    const adminEmail =
      org.slug === "acme-logistics"
        ? "admin@acmelogistics.io"
        : "admin@vanguardsupply.io";
    const actor = userMap.get(adminEmail)!;

    // Seed 60 SKUs per tenant (120 SKUs total across both workspaces)
    const products = [];
    for (let i = 1; i <= 60; i++) {
      const category = categories[i % categories.length];
      const warehouse = warehouses[i % warehouses.length];
      const sku = `${org.slug.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`;
      const name = `${prefixes[i % prefixes.length]} ${category.name.split(" ")[0]} ${suffixes[i % suffixes.length]} #${i}`;
      const stockQuantity = i % 7 === 0 ? 4 : 25 + ((i * 7) % 180);
      const price = (19.5 + ((i * 13.75) % 450)).toFixed(2);

      const product = await db.orm.public.Product.upsert({
        create: {
          sku,
          name,
          description: `B2B commercial grade ${category.name.toLowerCase()} stored at ${warehouse.name}.`,
          price,
          stockQuantity,
          lowStockAlert: 10,
          organizationId: org.id,
          warehouseId: warehouse.id,
          categoryId: category.id,
        },
        update: { stockQuantity, price },
        conflictOn: { organizationId: org.id, sku },
      });
      products.push(product);
    }

    // Seed initial stock movements if none exist for the first product
    const existingMovements = await db.orm.public.StockMovement.where({
      productId: products[0].id,
    }).first();

    if (!existingMovements) {
      await db.orm.public.StockMovement.createAll(
        products.slice(0, 20).map((p) => ({
          productId: p.id,
          type: "STOCK_IN" as const,
          quantityChange: p.stockQuantity,
          previousStock: 0,
          newStock: p.stockQuantity,
          reference: "INITIAL-SEED",
          userId: actor.id,
        })),
      );
    }

    // Seed 12 historical B2B orders per tenant (24 orders total)
    for (let o = 1; o <= 12; o++) {
      const orderNumber = `PO-${org.slug.slice(0, 4).toUpperCase()}-${202600 + o}`;
      const existingOrder = await db.orm.public.Order.where({
        organizationId: org.id,
        orderNumber,
      }).first();

      if (!existingOrder) {
        const itemA = products[(o * 2) % products.length];
        const itemB = products[(o * 2 + 1) % products.length];
        const qtyA = 2 + (o % 5);
        const qtyB = 1 + (o % 4);
        const totalAmount = (
          Number(itemA.price) * qtyA +
          Number(itemB.price) * qtyB
        ).toFixed(2);

        const order = await db.orm.public.Order.create({
          orderNumber,
          status: statuses[o % statuses.length],
          totalAmount,
          organizationId: org.id,
        });

        await db.orm.public.OrderItem.createAll([
          {
            orderId: order.id,
            productId: itemA.id,
            quantity: qtyA,
            unitPrice: String(itemA.price),
          },
          {
            orderId: order.id,
            productId: itemB.id,
            quantity: qtyB,
            unitPrice: String(itemB.price),
          },
        ]);
      }
    }

    // Seed initial immutable audit log entry
    const existingAudit = await db.orm.public.AuditLog.where({
      organizationId: org.id,
      action: "WORKSPACE_SEEDED",
    }).first();

    if (!existingAudit) {
      await db.orm.public.AuditLog.create({
        action: "WORKSPACE_SEEDED",
        entityType: "Organization",
        entityId: org.id,
        userId: actor.id,
        organizationId: org.id,
        metadata: {
          productsSeeded: products.length,
          warehouses: warehouses.length,
          categories: categories.length,
        },
      });
    }
  }
}

async function main() {
  console.log("Seeding NexStock Enterprise...");
  const userMap = await seedUsers();
  const tenants = await seedTenants(userMap);
  await seedCatalogAndOrders(tenants, userMap);
  console.log(
    "Seeding complete: 120 SKUs, 24 B2B orders, and audit logs ready.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
