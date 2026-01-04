#!/usr/bin/env tsx
/**
 * Test script for webhook renewal job
 * Usage: npm run test:webhook-renewal
 */

import { renewExpiringWebhooks } from '../src/jobs/webhook-renewal.job.js';
import { prisma } from '../src/server.js';

console.log('=== Testing Webhook Renewal Job ===\n');

try {
  // Show current webhook status
  const webhooks = await prisma.calendarWebhook.findMany({
    include: {
      client: {
        select: { name: true },
      },
    },
  });

  console.log(`Found ${webhooks.length} webhook(s):\n`);
  webhooks.forEach((webhook) => {
    const expiresIn = webhook.expiration.getTime() - Date.now();
    const hoursUntilExpiration = Math.floor(expiresIn / (1000 * 60 * 60));

    console.log(`  Client: ${webhook.client.name}`);
    console.log(`  Channel ID: ${webhook.channelId}`);
    console.log(`  Expires: ${webhook.expiration.toISOString()}`);
    console.log(`  Time until expiration: ${hoursUntilExpiration} hours`);
    console.log(`  Is Active: ${webhook.isActive}`);
    console.log('');
  });

  // Run the job
  console.log('Running webhook renewal job...\n');
  await renewExpiringWebhooks();

  // Show updated status
  const updatedWebhooks = await prisma.calendarWebhook.findMany({
    include: {
      client: {
        select: { name: true },
      },
    },
  });

  console.log('\n=== After Renewal ===\n');
  updatedWebhooks.forEach((webhook) => {
    const expiresIn = webhook.expiration.getTime() - Date.now();
    const hoursUntilExpiration = Math.floor(expiresIn / (1000 * 60 * 60));

    console.log(`  Client: ${webhook.client.name}`);
    console.log(`  Expires: ${webhook.expiration.toISOString()}`);
    console.log(`  Time until expiration: ${hoursUntilExpiration} hours`);
    console.log(`  Is Active: ${webhook.isActive}`);
    console.log('');
  });

  console.log('✅ Test completed successfully!\n');
} catch (err) {
  console.error('❌ Test failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
