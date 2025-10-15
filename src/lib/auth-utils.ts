// import bcrypt from "bcryptjs";
// Commented out to prevent WebAssembly issues in browser
// These functions are not used in the current frontend implementation
// import { db } from "./db";
// import { users } from "./schema";
// import { eq } from "drizzle-orm";

// These functions are commented out to prevent WebAssembly issues in the browser
// They are not used in the current frontend implementation
// All authentication is handled via temporary storage

/*
export async function createUser(email: string, password: string, name?: string) {
  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("User already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const newUser = await db
    .insert(users)
    .values({
      email,
      hashedPassword,
      name,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

  return newUser[0];
}

export async function getUserById(id: string) {
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user[0] || null;
}
*/
