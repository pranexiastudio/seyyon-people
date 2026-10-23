import { MeetingsService } from './meetings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeetingStatus } from '@seyyon/shared';

describe('Meetings Cross-Tenant Security & Tenant Isolation', () => {
  let service: MeetingsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      meeting: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      meetingAttendee: {
        upsert: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    };

    service = new MeetingsService(mockPrisma as PrismaService);
  });

  describe('Meeting Invitation Response Cross-Tenant Scoping (respondInvitation)', () => {
    it('should reject response when target meetingId belongs to a different tenant', async () => {
      // Meeting lookup scoped to tenantId returns null
      mockPrisma.meeting.findFirst.mockResolvedValue(null);

      await expect(
        service.respondInvitation('tenant-acme', 'meeting-globex-123', 'emp-acme-01', 'ACCEPTED')
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.meeting.findFirst).toHaveBeenCalledWith({
        where: { id: 'meeting-globex-123', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.meetingAttendee.upsert).not.toHaveBeenCalled();
    });

    it('should reject response when employeeId belongs to a different tenant', async () => {
      mockPrisma.meeting.findFirst.mockResolvedValue({
        id: 'meeting-acme-01',
        tenantId: 'tenant-acme',
      });
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.respondInvitation('tenant-acme', 'meeting-acme-01', 'emp-alien-01', 'ACCEPTED')
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith({
        where: { id: 'emp-alien-01', tenantId: 'tenant-acme' },
      });
      expect(mockPrisma.meetingAttendee.upsert).not.toHaveBeenCalled();
    });

    it('should require employee profile when responding', async () => {
      await expect(
        service.respondInvitation('tenant-acme', 'meeting-acme-01', '', 'ACCEPTED')
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow valid response when meeting and employee both belong to authenticated tenant', async () => {
      mockPrisma.meeting.findFirst.mockResolvedValue({
        id: 'meeting-acme-01',
        tenantId: 'tenant-acme',
      });
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-acme-01',
        tenantId: 'tenant-acme',
      });
      mockPrisma.meetingAttendee.upsert.mockResolvedValue({
        id: 'ma-01',
        meetingId: 'meeting-acme-01',
        employeeId: 'emp-acme-01',
        status: 'ACCEPTED',
      });

      const result = await service.respondInvitation(
        'tenant-acme',
        'meeting-acme-01',
        'emp-acme-01',
        'ACCEPTED',
        'Will attend in person'
      );

      expect(result.status).toBe('ACCEPTED');
      expect(mockPrisma.meetingAttendee.upsert).toHaveBeenCalledWith({
        where: { meetingId_employeeId: { meetingId: 'meeting-acme-01', employeeId: 'emp-acme-01' } },
        update: { status: 'ACCEPTED', responseNotes: 'Will attend in person' },
        create: { meetingId: 'meeting-acme-01', employeeId: 'emp-acme-01', status: 'ACCEPTED', responseNotes: 'Will attend in person' },
      });
    });
  });

  describe('Meeting Creation Cross-Tenant Attendees Check (createMeeting)', () => {
    it('should reject meeting creation if attendeeIds contains employees from another tenant', async () => {
      // 2 attendees requested, but only 1 found in tenant
      mockPrisma.employee.count.mockResolvedValue(1);

      await expect(
        service.createMeeting('tenant-acme', 'emp-organizer', {
          title: 'Cross-Tenant Leak Meeting',
          startTime: '2026-11-01T10:00:00Z',
          endTime: '2026-11-01T11:00:00Z',
          attendeeIds: ['emp-acme-01', 'emp-globex-alien'],
        })
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.employee.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-acme',
          id: { in: ['emp-acme-01', 'emp-globex-alien'] },
        },
      });
      expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
    });
  });
});
