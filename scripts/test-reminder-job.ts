#!/usr/bin/env tsx
/**
 * Test script for appointment reminder job
 * Usage: npm run test:appointment-reminder
 */

import { sendAppointmentReminders } from '../src/jobs/appointment-reminder.job.js';
import { prisma } from '../src/server.js';

console.log('=== Testing Appointment Reminder Job ===\n');

try {
  // Show current pending reminders
  const pendingReminders = await prisma.appointment.findMany({
    where: {
      reminderSent: false,
      customerEmail: {
        not: null,
        not: '',
      },
      status: {
        in: ['PENDING', 'CONFIRMED'],
      },
    },
    include: {
      client: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      datetime: 'asc',
    },
    take: 10,
  });

  console.log(`Found ${pendingReminders.length} appointment(s) pending reminders:\n`);

  if (pendingReminders.length === 0) {
    console.log('  No appointments need reminders.\n');
    console.log('To test:');
    console.log('1. Create an appointment with a customerEmail');
    console.log('2. Ensure status is PENDING or CONFIRMED');
    console.log('3. Run this script again\n');
  } else {
    pendingReminders.forEach((appointment, index) => {
      const appointmentDate = new Date(appointment.datetime);
      console.log(`  ${index + 1}. ${appointment.customerName}`);
      console.log(`     Client: ${appointment.client.name}`);
      console.log(`     Email: ${appointment.customerEmail}`);
      console.log(`     Date: ${appointmentDate.toLocaleString('de-DE')}`);
      console.log(`     Status: ${appointment.status}`);
      console.log('');
    });

    // Run the job
    console.log('Running appointment reminder job...\n');
    await sendAppointmentReminders();

    // Show updated status
    const stillPending = await prisma.appointment.findMany({
      where: {
        reminderSent: false,
        customerEmail: {
          not: null,
          not: '',
        },
        status: {
          in: ['PENDING', 'CONFIRMED'],
        },
      },
      orderBy: {
        datetime: 'asc',
      },
      take: 10,
    });

    const sent = pendingReminders.length - stillPending.length;

    console.log('\n=== Results ===\n');
    console.log(`  Reminders to send: ${pendingReminders.length}`);
    console.log(`  Successfully sent: ${sent}`);
    console.log(`  Still pending: ${stillPending.length}`);
    console.log('');

    if (stillPending.length > 0) {
      console.log('Remaining pending reminders:');
      stillPending.forEach((appointment, index) => {
        console.log(`  ${index + 1}. ${appointment.customerName} - ${appointment.customerEmail}`);
      });
      console.log('');
    }

    // Show recent sent reminders
    const recentSent = await prisma.appointment.findMany({
      where: {
        reminderSent: true,
        reminderSentAt: {
          gte: new Date(Date.now() - 60000), // Last minute
        },
      },
      orderBy: {
        reminderSentAt: 'desc',
      },
      take: 5,
    });

    if (recentSent.length > 0) {
      console.log('Recently sent reminders (last minute):');
      recentSent.forEach((appointment, index) => {
        console.log(
          `  ${index + 1}. ${appointment.customerName} - ${appointment.customerEmail} (sent ${Math.floor((Date.now() - appointment.reminderSentAt!.getTime()) / 1000)}s ago)`
        );
      });
      console.log('');
    }
  }

  console.log('✅ Test completed!\n');
} catch (err) {
  console.error('❌ Test failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
