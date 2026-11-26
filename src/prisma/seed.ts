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

async function main() {
  console.log("Seeding NexStock Enterprise...");
  const userMap = await seedUsers();
  const tenants = await seedTenants(userMap);
  console.log(
    `Seeded ${userMap.size} users and ${tenants.length} isolated tenants.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
