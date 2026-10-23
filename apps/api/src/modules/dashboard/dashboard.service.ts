import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus, LeaveStatus, TaskStatus, UserRole } from '@seyyon/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(tenantId: string, user: any) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If platform super admin without tenant, return platform overview
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN && !tenantId) {
      const [tenantsCount, usersCount, plans] = await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.user.count(),
        this.prisma.subscriptionPlan.findMany(),
      ]);
      return {
        isPlatformAdmin: true,
        tenantsCount,
        usersCount,
        plans,
      };
    }

    // Tenant-scoped queries
    const [
      totalEmployees,
      activeEmployees,
      departmentsCount,
      todayAttendance,
      pendingLeaves,
      pendingCorrections,
      pendingTasks,
      upcomingMeetings,
      latestPayroll,
      recentDepartments,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.department.count({ where: { tenantId } }),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, date: today },
        select: { status: true },
      }),
      this.prisma.leaveRequest.count({ where: { tenantId, status: LeaveStatus.PENDING } }),
      this.prisma.attendanceCorrectionRequest.count({ where: { tenantId, status: LeaveStatus.PENDING } }),
      this.prisma.task.count({
        where: {
          tenantId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          ...(user.role === UserRole.EMPLOYEE && user.employeeId ? { assigneeId: user.employeeId } : {}),
        },
      }),
      this.prisma.meeting.count({
        where: {
          tenantId,
          startTime: { gte: new Date() },
        },
      }),
      this.prisma.payrollCycle.findFirst({
        where: { tenantId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      this.prisma.department.findMany({
        where: { tenantId },
        select: { id: true, name: true, _count: { select: { employees: true } } },
      }),
    ]);

    // Attendance breakdown
    const attendanceSummary = {
      present: todayAttendance.filter((a) => a.status === AttendanceStatus.PRESENT).length,
      late: todayAttendance.filter((a) => a.status === AttendanceStatus.LATE).length,
      halfDay: todayAttendance.filter((a) => a.status === AttendanceStatus.HALF_DAY).length,
      absent: Math.max(0, activeEmployees - todayAttendance.length),
      onLeave: todayAttendance.filter((a) => a.status === AttendanceStatus.ON_LEAVE).length,
    };

    const isFinancialAuthorized = [UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN].includes(user.role);

    return {
      totalEmployees,
      activeEmployees,
      departmentsCount,
      attendanceToday: attendanceSummary,
      pendingApprovals: {
        leaveRequests: pendingLeaves,
        attendanceCorrections: pendingCorrections,
        pendingTasks,
      },
      upcomingMeetingsCount: upcomingMeetings,
      departmentDistribution: recentDepartments.map((d) => ({
        name: d.name,
        count: d._count.employees,
      })),
      ...(isFinancialAuthorized && latestPayroll
        ? {
            payrollSummary: {
              currentPeriod: `${latestPayroll.month}/${latestPayroll.year}`,
              status: latestPayroll.status,
              totalGross: Number(latestPayroll.totalGross),
              totalNet: Number(latestPayroll.totalNet),
            },
          }
        : {}),
    };
  }
}
