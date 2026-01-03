import { PrismaClient } from '@prisma/client';
import { buildReceptionistPrompt, defaultBusinessContext } from '../src/prompts/receptionist.prompt.js';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('TWILIO_PHONE_NUMBER environment variable is required for seeding');
  }

  // Build the full system prompt from the current hardcoded version
  const systemPrompt = buildReceptionistPrompt(defaultBusinessContext);

  // Build greeting message
  const greetingMessage = `${defaultBusinessContext.companyName}, guten Tag! Wie kann ich Ihnen helfen?`;

  // Convert opening hours to business hours JSON format
  const businessHours = {
    monday: { start: '08:00', end: '18:00' },
    tuesday: { start: '08:00', end: '18:00' },
    wednesday: { start: '08:00', end: '14:00' },
    thursday: { start: '08:00', end: '18:00' },
    friday: { start: '08:00', end: '16:00' },
    saturday: { closed: true },
    sunday: { closed: true },
  };

  // Default escalation rules
  const escalationRules = {
    keywords: ['notfall', 'dringend', 'schmerzen', 'sofort', 'hilfe', 'kritisch'],
    action: 'transfer_to_human',
    message: 'Einen Moment bitte, ich verbinde Sie mit einem Mitarbeiter',
  };

  // Check if client already exists
  const existingClient = await prisma.client.findUnique({
    where: { phoneNumber },
  });

  if (existingClient) {
    console.log('📝 Client already exists, updating...');
    const updatedClient = await prisma.client.update({
      where: { phoneNumber },
      data: {
        name: defaultBusinessContext.companyName,
        industry: 'dental',
        email: null,
        businessHours,
        greetingMessage,
        llmSystemPrompt: systemPrompt,
        voiceId: process.env.ELEVENLABS_VOICE_ID || null,
        useElevenLabsTTS: !!process.env.ELEVENLABS_VOICE_ID, // Enable if voice ID is set
        escalationRules,
        isActive: true,
      },
    });
    console.log('✅ Updated client:', updatedClient.name);
  } else {
    console.log('📝 Creating new client...');
    const client = await prisma.client.create({
      data: {
        name: defaultBusinessContext.companyName,
        industry: 'dental',
        phoneNumber,
        email: null,
        businessHours,
        greetingMessage,
        llmSystemPrompt: systemPrompt,
        voiceId: process.env.ELEVENLABS_VOICE_ID || null,
        useElevenLabsTTS: !!process.env.ELEVENLABS_VOICE_ID, // Enable if voice ID is set
        escalationRules,
        isActive: true,
      },
    });
    console.log('✅ Created client:', client.name);
  }

  console.log('🎉 Database seed completed!');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
