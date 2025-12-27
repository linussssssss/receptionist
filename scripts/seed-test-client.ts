import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Replace with your actual Twilio phone number
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '+17655905563';

  const client = await prisma.client.upsert({
    where: { phoneNumber: twilioNumber },
    update: {},
    create: {
      name: 'Test Dental Practice',
      industry: 'dental',
      phoneNumber: twilioNumber,
      email: 'test@example.com',
      businessHours: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '09:00', end: '17:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '14:00' },
      },
      greetingMessage:
        'Guten Tag, Sie haben die Zahnarztpraxis Dr. Test erreicht. Wie kann ich Ihnen helfen?',
      llmSystemPrompt: `Du bist eine freundliche Rezeptionistin für eine Zahnarztpraxis in Deutschland. 
Deine Aufgaben:
- Termine vereinbaren
- Fragen zu Öffnungszeiten beantworten
- Bei Notfällen an den Zahnarzt weiterleiten
Sei höflich, professionell und verwende Sie-Form.`,
      escalationRules: {
        keywords: ['Notfall', 'Schmerzen', 'sofort', 'dringend'],
        transferAfterFailedAttempts: 2,
      },
      isActive: true,
    },
  });

  console.log('Test client created:', client);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });