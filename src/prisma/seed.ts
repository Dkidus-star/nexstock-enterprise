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

  const users = [];
  for (const u of demoUsers) {
    const record = await db.orm.public.User.upsert({
      create: { email: u.email, name: u.name, passwordHash },
      update: { name: u.name, passwordHash },
      conflictOn: { email: u.email },
    });
    users.push(record);
  }

  return users;
}

async function main() {
  console.log("Seeding NexStock Enterprise...");
  const users = await seedUsers();
  console.log(`Seeded ${users.length} demo users.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
