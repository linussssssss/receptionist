import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting admin user seed...');

  // Get configuration from environment or use defaults
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
  const ADMIN_NAME = process.env.ADMIN_NAME || 'System Admin';
  const CLIENT_NAME = process.env.CLIENT_NAME || 'Demo Client';
  const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

  console.log(`📧 Admin email: ${ADMIN_EMAIL}`);
  console.log(`👤 Admin name: ${ADMIN_NAME}`);
  console.log(`🏢 Client name: ${CLIENT_NAME}`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL.toLowerCase() },
  });

  if (existingUser) {
    console.log('⚠️  Admin user already exists');
    console.log(`   ID: ${existingUser.id}`);
    console.log(`   Email: ${existingUser.email}`);
    console.log(`   Name: ${existingUser.name}`);
    console.log(`   Role: ${existingUser.role}`);
    return;
  }

  // Find or create client
  let client = await prisma.client.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!client) {
    console.log('🏢 Creating demo client...');
    client = await prisma.client.create({
      data: {
        name: CLIENT_NAME,
        timezone: 'Europe/Berlin',
        language: 'de',
        businessHours: {
          monday: { open: '09:00', close: '17:00', enabled: true },
          tuesday: { open: '09:00', close: '17:00', enabled: true },
          wednesday: { open: '09:00', close: '17:00', enabled: true },
          thursday: { open: '09:00', close: '17:00', enabled: true },
          friday: { open: '09:00', close: '17:00', enabled: true },
          saturday: { open: '09:00', close: '13:00', enabled: false },
          sunday: { open: '09:00', close: '13:00', enabled: false },
        },
      },
    });
    console.log(`✅ Client created: ${client.name} (ID: ${client.id})`);
  } else {
    console.log(`✅ Using existing client: ${client.name} (ID: ${client.id})`);
  }

  // Hash password
  console.log('🔒 Hashing password...');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  // Create admin user
  console.log('👤 Creating admin user...');
  const adminUser = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      name: ADMIN_NAME,
      role: 'ADMIN',
      clientId: client.id,
      isActive: true,
      emailVerified: true,
    },
  });

  console.log('✅ Admin user created successfully!');
  console.log(`   ID: ${adminUser.id}`);
  console.log(`   Email: ${adminUser.email}`);
  console.log(`   Name: ${adminUser.name}`);
  console.log(`   Role: ${adminUser.role}`);
  console.log(`   Client: ${client.name}`);
  console.log('');
  console.log('🔑 Login credentials:');
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log('');
  console.log('🚀 You can now login at: POST http://localhost:3000/api/auth/login');
}

main()
  .catch((err) => {
    console.error('❌ Error seeding admin user:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
