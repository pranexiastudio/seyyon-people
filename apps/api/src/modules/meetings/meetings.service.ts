import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus } from '@seyyon/shared';

@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMeetings(tenantId: string, employeeId?: string) {
    return this.prisma.meeting.findMany({
      where: {
        tenantId,
        ...(employeeId
          ? {
              OR: [
                { organizerId: employeeId },
                { attendees: { some: { employeeId } } },
              ],
            }
          : {}),
      },
      include: {
        attendees: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async createMeeting(
    tenantId: string,
    organizerId: string,
    data: {
      title: string;
      description?: string;
      startTime: string;
      endTime: string;
      locationOrUrl?: string;
      attendeeIds?: string[];
    }
  ) {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (end <= start) {
      throw new BadRequestException('Meeting end time must be after start time');
    }

    // Double-booking conflict check for organizer
    const conflict = await this.prisma.meeting.findFirst({
      where: {
        tenantId,
        organizerId,
        status: MeetingStatus.SCHEDULED,
        OR: [
          { startTime: { lte: end }, endTime: { gte: start } },
        ],
      },
    });

    if (conflict) {
      throw new BadRequestException(`Schedule conflict: You already have meeting "${conflict.title}" during this time window`);
    }

    if (data.attendeeIds && data.attendeeIds.length > 0) {
      const validAttendeesCount = await this.prisma.employee.count({
        where: {
          tenantId,
          id: { in: data.attendeeIds },
        },
      });
      if (validAttendeesCount !== data.attendeeIds.length) {
        throw new BadRequestException('One or more meeting attendees do not belong to this organization');
      }
    }

    const meetingLink = data.locationOrUrl || `https://meet.google.com/sey-${Math.random().toString(36).substring(2, 7)}-${Math.random().toString(36).substring(2, 6)}`;

    const meeting = await this.prisma.meeting.create({
      data: {
        tenantId,
        organizerId,
        title: data.title,
        description: data.description,
        startTime: start,
        endTime: end,
        locationOrUrl: meetingLink,
        status: MeetingStatus.SCHEDULED,
        attendees: {
          create: (data.attendeeIds || []).map((empId) => ({
            employeeId: empId,
            status: 'INVITED',
          })),
        },
      },
      include: {
        attendees: {
          include: { employee: true },
        },
      },
    });

    return meeting;
  }

  async respondInvitation(
    tenantId: string,
    meetingId: string,
    employeeId: string,
    status: 'ACCEPTED' | 'DECLINED',
    notes?: string
  ) {
    if (!employeeId) {
      throw new BadRequestException('Employee profile required to respond to meeting invitations');
    }

    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, tenantId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.meetingAttendee.upsert({
      where: { meetingId_employeeId: { meetingId, employeeId } },
      update: { status, responseNotes: notes },
      create: { meetingId, employeeId, status, responseNotes: notes },
    });
  }
}
