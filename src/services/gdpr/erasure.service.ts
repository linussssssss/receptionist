/**
 * Data Erasure Service
 * GDPR Article 17 - Right to Erasure ("Right to be Forgotten")
 *
 * Handles complete deletion of personal data for a specific data subject
 * identified by phone number or email.
 */

import { PrismaClient, ErasureStatus } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

const serviceLogger = logger.child({ service: 'erasure' });

export interface ErasureResult {
  success: boolean;
  requestId: string;
  deletedCalls: number;
  deletedMessages: number;
  anonymizedAppointments: number;
  deletedFromCalendar: boolean;
  errors: string[];
}

export interface DataSubjectSearchResult {
  found: boolean;
  callCount: number;
  messageCount: number;
  appointmentCount: number;
  oldestRecord?: Date;
  newestRecord?: Date;
}

/**
 * Hash identifier for audit logging (don't store raw PII in audit logs)
 */
function hashIdentifier(identifier: string): string {
  return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
}

/**
 * Search for data subject by phone number or email
 */
export async function searchDataSubject(
  prisma: PrismaClient,
  clientId: string,
  identifier: string,
  identifierType: 'phone' | 'email'
): Promise<DataSubjectSearchResult> {
  serviceLogger.info(
    { clientId, identifierType, identifierHash: hashIdentifier(identifier) },
    'Searching for data subject'
  );

  let callCount = 0;
  let messageCount = 0;
  let appointmentCount = 0;
  let oldestRecord: Date | undefined;
  let newestRecord: Date | undefined;

  if (identifierType === 'phone') {
    // Search calls by phone number
    const calls = await prisma.call.findMany({
      where: {
        clientId,
        callerNumber: identifier,
      },
      select: {
        id: true,
        startTime: true,
        _count: { select: { messages: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    callCount = calls.length;
    messageCount = calls.reduce((sum, call) => sum + call._count.messages, 0);

    if (calls.length > 0) {
      oldestRecord = calls[0].startTime;
      newestRecord = calls[calls.length - 1].startTime;
    }

    // Search appointments by phone
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId,
        customerPhone: identifier,
        anonymizedAt: null,
      },
      select: { id: true, datetime: true },
      orderBy: { datetime: 'asc' },
    });

    appointmentCount = appointments.length;

    if (appointments.length > 0) {
      if (!oldestRecord || appointments[0].datetime < oldestRecord) {
        oldestRecord = appointments[0].datetime;
      }
      if (!newestRecord || appointments[appointments.length - 1].datetime > newestRecord) {
        newestRecord = appointments[appointments.length - 1].datetime;
      }
    }
  } else {
    // Search appointments by email
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId,
        customerEmail: identifier,
        anonymizedAt: null,
      },
      select: { id: true, datetime: true },
      orderBy: { datetime: 'asc' },
    });

    appointmentCount = appointments.length;

    if (appointments.length > 0) {
      oldestRecord = appointments[0].datetime;
      newestRecord = appointments[appointments.length - 1].datetime;
    }
  }

  const found = callCount > 0 || appointmentCount > 0;

  serviceLogger.info(
    { found, callCount, messageCount, appointmentCount },
    'Data subject search completed'
  );

  return {
    found,
    callCount,
    messageCount,
    appointmentCount,
    oldestRecord,
    newestRecord,
  };
}

/**
 * Create an erasure request (requires admin approval)
 */
export async function createErasureRequest(
  prisma: PrismaClient,
  clientId: string,
  requestedBy: string,
  identifier: string,
  identifierType: 'phone' | 'email'
): Promise<string> {
  const request = await prisma.erasureRequest.create({
    data: {
      clientId,
      requestedBy,
      subjectIdentifier: identifier,
      status: 'PENDING',
    },
  });

  serviceLogger.info(
    {
      requestId: request.id,
      clientId,
      identifierType,
      identifierHash: hashIdentifier(identifier),
    },
    'Erasure request created'
  );

  // Create audit log entry
  await prisma.auditLog.create({
    data: {
      action: 'ERASURE_REQUEST_CREATED',
      userId: requestedBy,
      clientId,
      resourceType: 'ErasureRequest',
      resourceId: request.id,
      subjectHash: hashIdentifier(identifier),
      ipAddress: 'system',
      userAgent: 'erasure-service',
      details: { identifierType },
    },
  });

  return request.id;
}

/**
 * Approve an erasure request (admin only)
 */
export async function approveErasureRequest(
  prisma: PrismaClient,
  requestId: string,
  approvedBy: string
): Promise<void> {
  await prisma.erasureRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      approvedBy,
    },
  });

  serviceLogger.info({ requestId, approvedBy }, 'Erasure request approved');
}

/**
 * Reject an erasure request
 */
export async function rejectErasureRequest(
  prisma: PrismaClient,
  requestId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  await prisma.erasureRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      approvedBy: rejectedBy,
      recordsDeleted: { rejectionReason: reason },
    },
  });

  serviceLogger.info({ requestId, rejectedBy, reason }, 'Erasure request rejected');
}

/**
 * Execute data erasure for a specific data subject
 * This is the main erasure function that deletes/anonymizes all PII
 */
export async function executeErasure(
  prisma: PrismaClient,
  requestId: string,
  executedBy: string
): Promise<ErasureResult> {
  const result: ErasureResult = {
    success: false,
    requestId,
    deletedCalls: 0,
    deletedMessages: 0,
    anonymizedAppointments: 0,
    deletedFromCalendar: false,
    errors: [],
  };

  // Get the erasure request
  const request = await prisma.erasureRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    result.errors.push('Erasure request not found');
    return result;
  }

  if (request.status !== 'APPROVED') {
    result.errors.push(`Erasure request is not approved (status: ${request.status})`);
    return result;
  }

  const { clientId, subjectIdentifier } = request;
  const identifierHash = hashIdentifier(subjectIdentifier);

  serviceLogger.info(
    { requestId, clientId, identifierHash },
    'Executing data erasure'
  );

  try {
    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Find all calls from this phone number
      const calls = await tx.call.findMany({
        where: {
          clientId,
          callerNumber: subjectIdentifier,
        },
        select: { id: true },
      });

      const callIds = calls.map((c) => c.id);

      // 2. Delete all messages from these calls
      if (callIds.length > 0) {
        const deletedMessages = await tx.message.deleteMany({
          where: {
            callId: { in: callIds },
          },
        });
        result.deletedMessages = deletedMessages.count;
      }

      // 3. Delete all calls
      if (callIds.length > 0) {
        const deletedCalls = await tx.call.deleteMany({
          where: {
            id: { in: callIds },
          },
        });
        result.deletedCalls = deletedCalls.count;
      }

      // 4. Anonymize appointments (by phone)
      const anonymizedByPhone = await tx.appointment.updateMany({
        where: {
          clientId,
          customerPhone: subjectIdentifier,
          anonymizedAt: null,
        },
        data: {
          customerName: '[ERASED]',
          customerPhone: '[ERASED]',
          customerEmail: null,
          reason: '[ERASED]',
          notes: null,
          anonymizedAt: new Date(),
        },
      });

      // 5. Anonymize appointments (by email if identifier looks like email)
      let anonymizedByEmail = 0;
      if (subjectIdentifier.includes('@')) {
        const emailResult = await tx.appointment.updateMany({
          where: {
            clientId,
            customerEmail: subjectIdentifier,
            anonymizedAt: null,
          },
          data: {
            customerName: '[ERASED]',
            customerPhone: '[ERASED]',
            customerEmail: null,
            reason: '[ERASED]',
            notes: null,
            anonymizedAt: new Date(),
          },
        });
        anonymizedByEmail = emailResult.count;
      }

      result.anonymizedAppointments = anonymizedByPhone.count + anonymizedByEmail;

      // 6. Update erasure request status
      await tx.erasureRequest.update({
        where: { id: requestId },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          recordsDeleted: {
            calls: result.deletedCalls,
            messages: result.deletedMessages,
            appointments: result.anonymizedAppointments,
          },
        },
      });

      // 7. Create audit log
      await tx.auditLog.create({
        data: {
          action: 'ERASURE_EXECUTED',
          userId: executedBy,
          clientId,
          resourceType: 'ErasureRequest',
          resourceId: requestId,
          subjectHash: identifierHash,
          ipAddress: 'system',
          userAgent: 'erasure-service',
          details: {
            deletedCalls: result.deletedCalls,
            deletedMessages: result.deletedMessages,
            anonymizedAppointments: result.anonymizedAppointments,
          },
        },
      });
    });

    result.success = true;
    serviceLogger.info(
      {
        requestId,
        deletedCalls: result.deletedCalls,
        deletedMessages: result.deletedMessages,
        anonymizedAppointments: result.anonymizedAppointments,
      },
      'Data erasure completed successfully'
    );
  } catch (error) {
    result.errors.push(`Erasure failed: ${error}`);
    serviceLogger.error({ error, requestId }, 'Data erasure failed');

    // Log failure
    await prisma.auditLog.create({
      data: {
        action: 'ERASURE_FAILED',
        userId: executedBy,
        clientId,
        resourceType: 'ErasureRequest',
        resourceId: requestId,
        subjectHash: identifierHash,
        ipAddress: 'system',
        userAgent: 'erasure-service',
        details: { error: String(error) },
      },
    });
  }

  return result;
}

/**
 * Get all erasure requests for a client
 */
export async function getErasureRequests(
  prisma: PrismaClient,
  clientId: string,
  status?: ErasureStatus
) {
  return prisma.erasureRequest.findMany({
    where: {
      clientId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single erasure request
 */
export async function getErasureRequest(
  prisma: PrismaClient,
  requestId: string
) {
  return prisma.erasureRequest.findUnique({
    where: { id: requestId },
  });
}
