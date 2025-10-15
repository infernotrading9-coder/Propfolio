import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

interface User {
  id: string;
  email: string;
  name?: string | null;
  hashedPassword?: string;
}

const USERS_STORAGE_KEY = 'propfolio_users';

function getUsersData(): User[] {
  try {
    const data = localStorage.getItem(USERS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading users from localStorage:', error);
    return [];
  }
}

function setUsersData(users: User[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Error writing users to localStorage:', error);
  }
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const users = getUsersData();
  
  // Check if user already exists
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    throw new Error('User already exists');
  }

  // Hash password if provided (for regular signup)
  let hashedPassword = undefined;
  if (password) {
    hashedPassword = await bcrypt.hash(password, 12);
  }

  const newUser: User = {
    id: uuidv4(),
    email,
    name,
    hashedPassword
  };

  users.push(newUser);
  setUsersData(users);

  // Return user without password
  const { hashedPassword: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const users = getUsersData();
  return users.find(u => u.email === email) || null;
}

export async function validatePassword(user: User, password: string): Promise<boolean> {
  if (!user.hashedPassword) {
    return false; // Google users don't have passwords
  }
  
  return await bcrypt.compare(password, user.hashedPassword);
}