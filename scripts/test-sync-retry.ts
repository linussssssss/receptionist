#!/usr/bin/env tsx
/**
 * Test script for sync retry job
 * Usage: npm run test:sync-retry
 */

import { retryFailedSyncs } from '../src/jobs/sync-retry.job.js';
import { prisma } from '../src/server.js';

console.log('=== Testing Sync Retry Job ===\n');

try {
  // Show current failed syncs
  const failedSyncs = await prisma.calendarSync.findMany({
    where: {
      status: 'FAILED',
    },
    include: {
      appointment: {
        select: {
          customerName: true,
          datetime: true,
        },
      },
      client: {
        select: { name: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  console.log(`Found ${failedSyncs.length} failed sync(s):\n`);

  if (failedSyncs.length === 0) {
    console.log('  No failed syncs found. Everything is working! ✅\n');
  } else {
    failedSyncs.forEach((sync, index) => {
      const minutesSinceCreation = Math.floor(
        (Date.now() - sync.createdAt.getTime()) / (1000 * 60)
      );

      console.log(`  ${index + 1}. ${sync.operation} (${sync.direction})`);
      console.log(`     Appointment: ${sync.appointment?.customerName || 'N/A'}`);
      console.log(`     Client: ${sync.client.name}`);
      console.log(`     Retry Count: ${sync.retryCount}`);
      console.log(`     Error: ${sync.errorMessage}`);
      console.log(`     Age: ${minutesSinceCreation} minutes`);
      console.log('');
    });
  }

  // Run the job
  console.log('Running sync retry job...\n');
  await retryFailedSyncs();

  // Show updated status
  const stillFailed = await prisma.calendarSync.findMany({
    where: {
      status: 'FAILED',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  const succeeded = failedSyncs.length - stillFailed.length;
  const skipped = await prisma.calendarSync.count({
    where: {
      status: 'SKIPPED',
      updatedAt: {
        gte: new Date(Date.now() - 5000), // Last 5 seconds
      },
    },
  });

  console.log('\n=== Results ===\n');
  console.log(`  Retried: ${failedSyncs.length} sync(s)`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Still Failed: ${stillFailed.length}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('');

  if (stillFailed.length > 0) {
    console.log('Remaining failures:');
    stillFailed.forEach((sync, index) => {
      console.log(`  ${index + 1}. Retry ${sync.retryCount}/5 - ${sync.errorMessage}`);
    });
    console.log('');
  }

  // Show sync statistics
  const stats = await prisma.calendarSync.groupBy({
    by: ['status'],
    _count: {
      status: true,
    },
  });

  console.log('Overall sync statistics:');
  stats.forEach((stat) => {
    console.log(`  ${stat.status}: ${stat._count.status}`);
  });
  console.log('');

  console.log('✅ Test completed!\n');
} catch (err) {
  console.error('❌ Test failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
