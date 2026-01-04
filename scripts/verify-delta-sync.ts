#!/usr/bin/env tsx
/**
 * Verify delta sync is working correctly
 * Usage: npm run test:delta-sync
 */

import { prisma } from '../src/server.js';

console.log('=== Verifying Delta Sync Configuration ===\n');

try {
  // Get all clients with Google Calendar enabled
  const clients = await prisma.client.findMany({
    where: {
      integrations: {
        path: ['googleCalendar', 'enabled'],
        equals: true,
      },
    },
    select: {
      id: true,
      name: true,
      integrations: true,
    },
  });

  if (clients.length === 0) {
    console.log('⚠️  No clients with Google Calendar integration enabled.\n');
    console.log('To test delta sync:');
    console.log('1. Go to http://localhost:3001/settings?tab=integrations');
    console.log('2. Connect Google Calendar');
    console.log('3. Run this script again\n');
    process.exit(0);
  }

  console.log(`Found ${clients.length} client(s) with Google Calendar:\n`);

  for (const client of clients) {
    const integrations = client.integrations as any;
    const gcal = integrations?.googleCalendar;

    console.log(`📅 ${client.name}`);
    console.log(`   Client ID: ${client.id}`);
    console.log(`   Calendar: ${gcal?.calendarId || 'N/A'}`);
    console.log(`   Enabled: ${gcal?.enabled ? '✅' : '❌'}`);
    console.log(`   Sync Token: ${gcal?.syncToken ? '✅ Present' : '❌ Not set'}`);
    console.log(`   Last Sync: ${gcal?.lastSyncAt || 'Never'}`);
    console.log('');

    // Check webhook status
    const webhook = await prisma.calendarWebhook.findUnique({
      where: { clientId: client.id },
    });

    if (webhook) {
      const expiresIn = webhook.expiration.getTime() - Date.now();
      const hoursUntilExpiration = Math.floor(expiresIn / (1000 * 60 * 60));

      console.log(`   Webhook:`);
      console.log(`     Channel ID: ${webhook.channelId}`);
      console.log(`     Active: ${webhook.isActive ? '✅' : '❌'}`);
      console.log(`     Expires in: ${hoursUntilExpiration} hours`);
    } else {
      console.log(`   Webhook: ❌ Not configured`);
    }
    console.log('');

    // Check recent sync activity
    const recentSyncs = await prisma.calendarSync.findMany({
      where: {
        clientId: client.id,
        direction: 'INBOUND',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    if (recentSyncs.length > 0) {
      console.log(`   Recent Inbound Syncs (last 5):`);
      recentSyncs.forEach((sync) => {
        const age = Math.floor((Date.now() - sync.createdAt.getTime()) / (1000 * 60));
        console.log(`     • ${sync.operation} - ${sync.status} (${age}m ago)`);
      });
    } else {
      console.log(`   Recent Inbound Syncs: None yet`);
    }
    console.log('');
  }

  // Overall sync stats
  console.log('=== Overall Sync Statistics ===\n');

  const inboundStats = await prisma.calendarSync.groupBy({
    by: ['status'],
    where: {
      direction: 'INBOUND',
    },
    _count: {
      status: true,
    },
  });

  console.log('Inbound Sync Status:');
  if (inboundStats.length === 0) {
    console.log('  No inbound syncs yet');
  } else {
    inboundStats.forEach((stat) => {
      const icon = stat.status === 'SUCCESS' ? '✅' : stat.status === 'FAILED' ? '❌' : '⏳';
      console.log(`  ${icon} ${stat.status}: ${stat._count.status}`);
    });
  }
  console.log('');

  // Check if delta sync is likely working
  const hasToken = clients.some((c) => (c.integrations as any)?.googleCalendar?.syncToken);
  const hasRecentSyncs = await prisma.calendarSync.count({
    where: {
      direction: 'INBOUND',
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  });

  console.log('=== Delta Sync Status ===\n');

  if (!hasToken) {
    console.log('⚠️  No sync tokens found');
    console.log('   This is normal if you just connected the calendar.');
    console.log('   Sync token will be set after the first webhook notification.\n');
    console.log('To trigger a webhook:');
    console.log('1. Create/update an event in Google Calendar');
    console.log('2. Wait ~10 seconds');
    console.log('3. Run this script again\n');
  } else {
    console.log('✅ Sync tokens are configured!');
    console.log('   Delta sync is active.\n');

    if (hasRecentSyncs > 0) {
      console.log(`✅ ${hasRecentSyncs} inbound sync(s) in the last 24 hours`);
      console.log('   System is actively syncing changes from Google Calendar.\n');
    } else {
      console.log('ℹ️  No recent syncs, but delta sync is ready.');
      console.log('   Try creating/updating an event in Google Calendar.\n');
    }
  }

  console.log('✅ Verification completed!\n');
} catch (err) {
  console.error('❌ Verification failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
