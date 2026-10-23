import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaveStatus } from '@seyyon/shared';

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalances(tenantId: string, employeeId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();
    return this.prisma.leaveBalance.findMany({
      where: { tenantId, employeeId, year: targetYear },
      include: { leaveType: true },
    });
  }

  async applyLeave(
    tenantId: string,
    employeeId: string,
    dto: { leaveTypeId: string; startDate: string; endDate: string; totalDays: number; reason: string }
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const year = startDate.getFullYear();

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot precede start date');
    }

    // Check Balance
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        tenantId_employeeId_leaveTypeId_year: {
          tenantId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          year,
        },
      },
      include: { leaveType: true },
    });

    if (!balance) {
      throw new BadRequestException('No leave balance allocated for this leave category');
    }

    if (balance.remainingDays < dto.totalDays) {
      throw new BadRequestException(
        `Insufficient leave balance. Remaining: ${balance.remainingDays} days, requested: ${dto.totalDays} days`
      );
    }

    // Check Overlaps
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException('You already have an active leave application overlapping with these dates');
    }

    // Create Request & Update Pending Balance
    const [request] = await this.prisma.$transaction([
      this.prisma.leaveRequest.create({
        data: {
          tenantId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate,
          endDate,
          totalDays: dto.totalDays,
          reason: dto.reason,
          status: LeaveStatus.PENDING,
        },
        include: { leaveType: true },
      }),
      this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: balance.pendingDays + dto.totalDays,
          remainingDays: balance.remainingDays - dto.totalDays,
        },
      }),
    ]);

    return request;
  }

  async getMyRequests(tenantId: string, employeeId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { tenantId, employeeId },
      include: { leaveType: true },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async getPendingApprovals(tenantId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { tenantId, status: LeaveStatus.PENDING },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: true,
          },
        },
        leaveType: true,
      },
      orderBy: { appliedAt: 'asc' },
    });
  }

  async updateRequestStatus(
    tenantId: string,
    requestId: string,
    status: LeaveStatus.APPROVED | LeaveStatus.REJECTED,
    approverId: string,
    notes?: string
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { leaveType: true },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.employeeId === approverId) {
      throw new ForbiddenException('Employees cannot approve or reject their own leave requests');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException(`Leave request has already been ${request.status.toLowerCase()}`);
    }

    const year = request.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        tenantId_employeeId_leaveTypeId_year: {
          tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
    });

    if (!balance) {
      throw new NotFoundException('Leave balance record not found');
    }

    if (status === LeaveStatus.APPROVED) {
      await this.prisma.$transaction([
        this.prisma.leaveRequest.update({
          where: { id: requestId },
          data: {
            status: LeaveStatus.APPROVED,
            approvedAt: new Date(),
            approvedById: approverId,
            approverNotes: notes,
          },
        }),
        this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: Math.max(0, balance.pendingDays - request.totalDays),
            usedDays: balance.usedDays + request.totalDays,
          },
        }),
      ]);
    } else {
      // REJECTED - restore remaining days
      await this.prisma.$transaction([
        this.prisma.leaveRequest.update({
          where: { id: requestId },
          data: {
            status: LeaveStatus.REJECTED,
            approvedAt: new Date(),
            approvedById: approverId,
            approverNotes: notes,
          },
        }),
        this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: Math.max(0, balance.pendingDays - request.totalDays),
            remainingDays: balance.remainingDays + request.totalDays,
          },
        }),
      ]);
    }

    return { success: true, message: `Leave request ${status.toLowerCase()} successfully` };
  }

  async getHolidays(tenantId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();
    return this.prisma.holiday.findMany({
      where: { tenantId, year: targetYear },
      orderBy: { date: 'asc' },
    });
  }
}
