import { PrismaClient, UserRole, EmploymentType, EmployeeStatus, AttendanceStatus, AttendancePunchSource, LeaveType, LeaveStatus, PayrollStatus, TaskStatus, TaskPriority, ChannelType, MeetingStatus, AuditAction, PlanTier, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Seyyon People database seed...');

  // 1. Seed Subscription Plans
  console.log('📦 Seeding Subscription Plans...');
  const plans = [
    {
      tier: PlanTier.STARTER,
      name: 'Starter Plan',
      priceMonthly: 2999.00,
      priceYearly: 29990.00,
      maxEmployees: 25,
      featuresJson: {
        coreHrms: true,
        attendance: true,
        leave: true,
        payroll: false,
        chat: true,
        tasks: false,
        storageLimitGb: 10,
      },
    },
    {
      tier: PlanTier.PROFESSIONAL,
      name: 'Professional Plan',
      priceMonthly: 7999.00,
      priceYearly: 79990.00,
      maxEmployees: 150,
      featuresJson: {
        coreHrms: true,
        attendance: true,
        leave: true,
        payroll: true,
        chat: true,
        tasks: true,
        biometricIntegration: true,
        storageLimitGb: 100,
      },
    },
    {
      tier: PlanTier.ENTERPRISE,
      name: 'Enterprise Plan',
      priceMonthly: 19999.00,
      priceYearly: 199990.00,
      maxEmployees: 1000,
      featuresJson: {
        coreHrms: true,
        attendance: true,
        leave: true,
        payroll: true,
        chat: true,
        tasks: true,
        biometricIntegration: true,
        customRoles: true,
        dedicatedAccountManager: true,
        storageLimitGb: 1000,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: plan,
      create: plan,
    });
  }

  const proPlan = await prisma.subscriptionPlan.findUnique({
    where: { tier: PlanTier.PROFESSIONAL },
  });

  // Common password hashes
  const saltRounds = 10;
  const defaultPasswordHash = await bcrypt.hash('Password123!', saltRounds);
  const superAdminPasswordHash = await bcrypt.hash('SeyyonAdminSecure2026!', saltRounds);

  // 2. Seed Platform SuperAdmin
  console.log('👑 Seeding Platform Super Admin...');
  await prisma.user.upsert({
    where: { email: 'superadmin@seyyonpeople.com' },
    update: {},
    create: {
      email: 'superadmin@seyyonpeople.com',
      passwordHash: superAdminPasswordHash,
      firstName: 'Platform',
      lastName: 'SuperAdmin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      isActive: true,
    },
  });

  // 3. Seed Tenant 1: Acme Technologies
  console.log('🏢 Seeding Tenant 1: Acme Technologies...');
  const acmeTenant = await prisma.tenant.upsert({
    where: { slug: 'acme-tech' },
    update: {},
    create: {
      name: 'Acme Technologies Pvt Ltd',
      slug: 'acme-tech',
      domain: 'acmetech.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      planTier: PlanTier.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
      maxEmployees: 150,
      address: 'Prestige Tech Cloud, 4th Floor, Whitefield, Bengaluru, Karnataka 560066',
      subscription: {
        create: {
          planId: proPlan!.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date('2026-01-01'),
          currentPeriodEnd: new Date('2026-12-31'),
        },
      },
    },
  });

  // Acme Departments
  const deptEngineering = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'ENG' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      name: 'Engineering & Technology',
      code: 'ENG',
      description: 'Core software engineering and architecture team',
    },
  });

  const deptHR = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'HR' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      name: 'People Operations & HR',
      code: 'HR',
      description: 'Talent management, employee relations, and culture',
    },
  });

  const deptProduct = await prisma.department.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'PROD' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      name: 'Product & Design',
      code: 'PROD',
      description: 'Product strategy, UI/UX design, and user research',
    },
  });

  // Acme Designations
  const desigVp = await prisma.designation.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'VP-ENG' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      title: 'VP of Engineering',
      code: 'VP-ENG',
      departmentId: deptEngineering.id,
      level: 5,
    },
  });

  const desigLead = await prisma.designation.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'LEAD-ARCH' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      title: 'Technical Lead & Architect',
      code: 'LEAD-ARCH',
      departmentId: deptEngineering.id,
      level: 4,
    },
  });

  const desigSeniorDev = await prisma.designation.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'SR-DEV' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      title: 'Senior Full Stack Engineer',
      code: 'SR-DEV',
      departmentId: deptEngineering.id,
      level: 3,
    },
  });

  const desigHrDirector = await prisma.designation.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'HR-DIR' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      title: 'Director of People Ops',
      code: 'HR-DIR',
      departmentId: deptHR.id,
      level: 5,
    },
  });

  const desigProductDesigner = await prisma.designation.upsert({
    where: { tenantId_code: { tenantId: acmeTenant.id, code: 'SR-UIUX' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      title: 'Senior Product Designer',
      code: 'SR-UIUX',
      departmentId: deptProduct.id,
      level: 3,
    },
  });

  // Acme Shifts
  const defaultShift = await prisma.shift.create({
    data: {
      tenantId: acmeTenant.id,
      name: 'General Day Shift (IST)',
      startTime: '09:00',
      endTime: '18:00',
      gracePeriodMinutes: 15,
      halfDayThresholdHours: 4.0,
      isDefault: true,
    },
  });

  // Acme Holidays
  const holidays = [
    { name: 'Republic Day', date: new Date('2026-01-26'), year: 2026 },
    { name: 'May Day', date: new Date('2026-05-01'), year: 2026 },
    { name: 'Independence Day', date: new Date('2026-08-15'), year: 2026 },
    { name: 'Gandhi Jayanti', date: new Date('2026-10-02'), year: 2026 },
    { name: 'Diwali Festival', date: new Date('2026-11-08'), year: 2026 },
    { name: 'Christmas Day', date: new Date('2026-12-25'), year: 2026 },
  ];
  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { tenantId_date: { tenantId: acmeTenant.id, date: h.date } },
      update: {},
      create: { tenantId: acmeTenant.id, ...h },
    });
  }

  // Acme Leave Types
  const leaveConfigs = [
    { name: 'Casual Leave', code: LeaveType.CASUAL, totalAnnualDays: 12.0 },
    { name: 'Sick Leave', code: LeaveType.SICK, totalAnnualDays: 12.0 },
    { name: 'Earned / Privilege Leave', code: LeaveType.EARNED, totalAnnualDays: 18.0 },
    { name: 'Maternity Leave', code: LeaveType.MATERNITY, totalAnnualDays: 180.0 },
  ];
  const createdLeaveConfigs: Record<string, any> = {};
  for (const lc of leaveConfigs) {
    createdLeaveConfigs[lc.code] = await prisma.leaveTypeConfig.upsert({
      where: { tenantId_code: { tenantId: acmeTenant.id, code: lc.code } },
      update: {},
      create: { tenantId: acmeTenant.id, ...lc, isPaid: true, requiresApproval: true },
    });
  }

  // Acme Employees & Users
  console.log('👥 Seeding Acme Employees...');

  // 1. Alex Morgan (Company Admin)
  const empAlex = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: acmeTenant.id, employeeCode: 'EMP-001' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      employeeCode: 'EMP-001',
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'admin@acmetech.com',
      phone: '+91 98765 43210',
      dateOfJoining: new Date('2022-01-10'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptEngineering.id,
      designationId: desigVp.id,
      panNumber: 'ABCDE1234F',
      bankAccount: '918237461928',
      bankIfsc: 'HDFC0001234',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@acmetech.com' },
    update: {},
    create: {
      email: 'admin@acmetech.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      role: UserRole.COMPANY_ADMIN,
      tenantId: acmeTenant.id,
      employeeId: empAlex.id,
    },
  });

  // 2. Priya Sharma (HR Admin)
  const empPriya = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: acmeTenant.id, employeeCode: 'EMP-002' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      employeeCode: 'EMP-002',
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'hr@acmetech.com',
      phone: '+91 98765 43211',
      dateOfJoining: new Date('2022-03-15'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptHR.id,
      designationId: desigHrDirector.id,
      panNumber: 'FGHIJ5678K',
      bankAccount: '123456789012',
      bankIfsc: 'ICIC0000456',
    },
  });

  await prisma.user.upsert({
    where: { email: 'hr@acmetech.com' },
    update: {},
    create: {
      email: 'hr@acmetech.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Priya',
      lastName: 'Sharma',
      role: UserRole.HR_ADMIN,
      tenantId: acmeTenant.id,
      employeeId: empPriya.id,
    },
  });

  // 3. David Chen (Manager / Lead Architect)
  const empDavid = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: acmeTenant.id, employeeCode: 'EMP-003' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      employeeCode: 'EMP-003',
      firstName: 'David',
      lastName: 'Chen',
      email: 'manager@acmetech.com',
      phone: '+91 98765 43212',
      dateOfJoining: new Date('2022-06-01'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptEngineering.id,
      designationId: desigLead.id,
      managerId: empAlex.id,
      panNumber: 'KLMNO9012P',
      bankAccount: '567890123456',
      bankIfsc: 'SBIN0007890',
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@acmetech.com' },
    update: {},
    create: {
      email: 'manager@acmetech.com',
      passwordHash: defaultPasswordHash,
      firstName: 'David',
      lastName: 'Chen',
      role: UserRole.MANAGER,
      tenantId: acmeTenant.id,
      employeeId: empDavid.id,
    },
  });

  // 4. Sara Jenkins (Employee / Senior Engineer)
  const empSara = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: acmeTenant.id, employeeCode: 'EMP-004' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      employeeCode: 'EMP-004',
      firstName: 'Sara',
      lastName: 'Jenkins',
      email: 'employee@acmetech.com',
      phone: '+91 98765 43213',
      dateOfJoining: new Date('2023-02-14'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptEngineering.id,
      designationId: desigSeniorDev.id,
      managerId: empDavid.id,
      panNumber: 'QRSTU3456V',
      bankAccount: '789012345678',
      bankIfsc: 'KKBK0001122',
    },
  });

  await prisma.user.upsert({
    where: { email: 'employee@acmetech.com' },
    update: {},
    create: {
      email: 'employee@acmetech.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Sara',
      lastName: 'Jenkins',
      role: UserRole.EMPLOYEE,
      tenantId: acmeTenant.id,
      employeeId: empSara.id,
    },
  });

  // 5. Rahul Verma (Employee / UI/UX Designer)
  const empRahul = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: acmeTenant.id, employeeCode: 'EMP-005' } },
    update: {},
    create: {
      tenantId: acmeTenant.id,
      employeeCode: 'EMP-005',
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul@acmetech.com',
      phone: '+91 98765 43214',
      dateOfJoining: new Date('2023-05-20'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptProduct.id,
      designationId: desigProductDesigner.id,
      managerId: empDavid.id,
      panNumber: 'WXYZ12345A',
      bankAccount: '901234567890',
      bankIfsc: 'AXIS0003344',
    },
  });

  await prisma.user.upsert({
    where: { email: 'rahul@acmetech.com' },
    update: {},
    create: {
      email: 'rahul@acmetech.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Rahul',
      lastName: 'Verma',
      role: UserRole.EMPLOYEE,
      tenantId: acmeTenant.id,
      employeeId: empRahul.id,
    },
  });

  // Seed Leave Balances for 2026
  console.log('🏖 Seeding Leave Balances & Requests...');
  const employees = [empAlex, empPriya, empDavid, empSara, empRahul];
  for (const emp of employees) {
    for (const lc of leaveConfigs) {
      await prisma.leaveBalance.upsert({
        where: {
          tenantId_employeeId_leaveTypeId_year: {
            tenantId: acmeTenant.id,
            employeeId: emp.id,
            leaveTypeId: createdLeaveConfigs[lc.code].id,
            year: 2026,
          },
        },
        update: {},
        create: {
          tenantId: acmeTenant.id,
          employeeId: emp.id,
          leaveTypeId: createdLeaveConfigs[lc.code].id,
          year: 2026,
          allocatedDays: lc.totalAnnualDays,
          usedDays: 2.0,
          pendingDays: 0.0,
          remainingDays: lc.totalAnnualDays - 2.0,
        },
      });
    }
  }

  // Pending Leave Request by Sara Jenkins
  await prisma.leaveRequest.create({
    data: {
      tenantId: acmeTenant.id,
      employeeId: empSara.id,
      leaveTypeId: createdLeaveConfigs[LeaveType.CASUAL].id,
      startDate: new Date('2026-10-20'),
      endDate: new Date('2026-10-21'),
      totalDays: 2.0,
      reason: 'Attending family wedding ceremony',
      status: LeaveStatus.PENDING,
    },
  });

  // Seed Today's Attendance Records
  console.log('⏰ Seeding Attendance Records...');
  const today = new Date('2026-10-15');
  await prisma.attendanceRecord.createMany({
    data: [
      {
        tenantId: acmeTenant.id,
        employeeId: empAlex.id,
        date: today,
        checkInTime: new Date('2026-10-15T08:55:00+05:30'),
        status: AttendanceStatus.PRESENT,
        totalWorkHours: 8.5,
        source: AttendancePunchSource.WEB,
      },
      {
        tenantId: acmeTenant.id,
        employeeId: empPriya.id,
        date: today,
        checkInTime: new Date('2026-10-15T09:02:00+05:30'),
        status: AttendanceStatus.PRESENT,
        totalWorkHours: 8.0,
        source: AttendancePunchSource.WEB,
      },
      {
        tenantId: acmeTenant.id,
        employeeId: empDavid.id,
        date: today,
        checkInTime: new Date('2026-10-15T09:25:00+05:30'),
        status: AttendanceStatus.LATE,
        lateMinutes: 25,
        totalWorkHours: 7.5,
        source: AttendancePunchSource.BIOMETRIC_DEVICE,
      },
      {
        tenantId: acmeTenant.id,
        employeeId: empSara.id,
        date: today,
        checkInTime: new Date('2026-10-15T08:58:00+05:30'),
        status: AttendanceStatus.PRESENT,
        totalWorkHours: 8.2,
        source: AttendancePunchSource.BIOMETRIC_DEVICE,
      },
      {
        tenantId: acmeTenant.id,
        employeeId: empRahul.id,
        date: today,
        status: AttendanceStatus.ON_LEAVE,
        totalWorkHours: 0.0,
        source: AttendancePunchSource.MANUAL_ENTRY,
      },
    ],
    skipDuplicates: true,
  });

  // Seed Salary Structures (Indian Structure: Basic 50%, HRA 25%, Allowances 25%)
  console.log('💰 Seeding Salary Structures & Payroll...');
  for (const emp of employees) {
    const isLeadOrAbove = emp.id === empAlex.id || emp.id === empPriya.id || emp.id === empDavid.id;
    const basic = isLeadOrAbove ? 75000.00 : 45000.00;
    const hra = basic * 0.50; // 50% of Basic
    const specialAllowance = basic * 0.35;
    const conveyance = 3000.00;

    await prisma.salaryStructure.create({
      data: {
        tenantId: acmeTenant.id,
        employeeId: emp.id,
        effectiveFromDate: new Date('2026-04-01'),
        basicSalary: basic,
        hra: hra,
        specialAllowance: specialAllowance,
        conveyance: conveyance,
        pfApplicable: true,
        esiApplicable: false,
        ptApplicable: true,
        tdsProjectedMonthly: isLeadOrAbove ? 8500.00 : 3200.00,
        isCurrent: true,
      },
    });
  }

  // Previous Month Finalized Payroll (September 2026)
  const sepCycle = await prisma.payrollCycle.create({
    data: {
      tenantId: acmeTenant.id,
      month: 9,
      year: 2026,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      status: PayrollStatus.FINALIZED,
      totalGross: 485000.00,
      totalDeductions: 58200.00,
      totalNet: 426800.00,
      processedById: empPriya.id,
      approvedById: empAlex.id,
      finalizedAt: new Date('2026-09-30T17:00:00Z'),
    },
  });

  // September Payslip for Sara Jenkins
  await prisma.payslip.create({
    data: {
      tenantId: acmeTenant.id,
      payrollCycleId: sepCycle.id,
      employeeId: empSara.id,
      payslipNumber: 'PAY-2026-09-0004',
      totalWorkingDays: 30,
      daysPresent: 30,
      lossOfPayDays: 0,
      basicSalary: 45000.00,
      hra: 22500.00,
      specialAllowance: 15750.00,
      otherAllowances: 3000.00,
      grossEarnings: 86250.00,
      pfEmployee: 1800.00,
      esiEmployee: 0.00,
      professionalTax: 208.00,
      incomeTaxTds: 3200.00,
      otherDeductions: 0.00,
      totalDeductions: 5208.00,
      netPay: 81042.00,
      paymentMode: 'BANK_TRANSFER',
      paymentStatus: 'PAID',
      paidAt: new Date('2026-10-01'),
    },
  });

  // Current Month Payroll in Review (October 2026)
  await prisma.payrollCycle.create({
    data: {
      tenantId: acmeTenant.id,
      month: 10,
      year: 2026,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      status: PayrollStatus.REVIEW,
      totalGross: 485000.00,
      totalDeductions: 58200.00,
      totalNet: 426800.00,
      processedById: empPriya.id,
    },
  });

  // Seed Work Management: Projects & Tasks
  console.log('📌 Seeding Projects & Work Management...');
  const projMobile = await prisma.project.create({
    data: {
      tenantId: acmeTenant.id,
      name: 'Seyyon Mobile App v2',
      code: 'PRJ-MOB',
      description: 'Native iOS and Android client for on-the-go employee self-service',
      status: 'ACTIVE',
      startDate: new Date('2026-08-01'),
      ownerId: empDavid.id,
    },
  });

  await prisma.task.createMany({
    data: [
      {
        tenantId: acmeTenant.id,
        projectId: projMobile.id,
        title: 'Implement FaceID & Biometric Authentication Flow',
        description: 'Integrate native device biometric prompt with secure JWT refresh token exchange',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        creatorId: empDavid.id,
        assigneeId: empSara.id,
        dueDate: new Date('2026-10-25'),
        estimatedHours: 24.0,
      },
      {
        tenantId: acmeTenant.id,
        projectId: projMobile.id,
        title: 'Design Dark Mode Design Tokens & Mobile Components',
        description: 'Provide high-contrast accessible tokens conforming to WCAG AA guidelines',
        status: TaskStatus.COMPLETED,
        priority: TaskPriority.MEDIUM,
        creatorId: empDavid.id,
        assigneeId: empRahul.id,
        dueDate: new Date('2026-10-10'),
        estimatedHours: 16.0,
      },
      {
        tenantId: acmeTenant.id,
        projectId: projMobile.id,
        title: 'Push Notification Channel Integration',
        description: 'Configure FCM / APNS background workers for leave approval and task updates',
        status: TaskStatus.TODO,
        priority: TaskPriority.URGENT,
        creatorId: empDavid.id,
        assigneeId: empSara.id,
        dueDate: new Date('2026-10-30'),
        estimatedHours: 18.0,
      },
    ],
  });

  // Seed Chat Channels & Messages
  console.log('💬 Seeding Team Collaboration & Chat...');
  const userAlex = await prisma.user.findUnique({ where: { email: 'admin@acmetech.com' } });
  const userSara = await prisma.user.findUnique({ where: { email: 'employee@acmetech.com' } });
  const userDavid = await prisma.user.findUnique({ where: { email: 'manager@acmetech.com' } });

  const channelGeneral = await prisma.chatChannel.create({
    data: {
      tenantId: acmeTenant.id,
      name: 'general-announcements',
      type: ChannelType.COMPANY,
      description: 'Company-wide updates, town hall announcements, and celebrations',
      createdById: userAlex!.id,
    },
  });

  await prisma.chatMember.createMany({
    data: [
      { channelId: channelGeneral.id, userId: userAlex!.id, role: 'ADMIN' },
      { channelId: channelGeneral.id, userId: userDavid!.id, role: 'MEMBER' },
      { channelId: channelGeneral.id, userId: userSara!.id, role: 'MEMBER' },
    ],
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        channelId: channelGeneral.id,
        senderId: userAlex!.id,
        content: 'Welcome to Seyyon People! Our all-in-one HRMS and workforce portal is now live across all departments. 🎉',
      },
      {
        channelId: channelGeneral.id,
        senderId: userDavid!.id,
        content: 'Engineering teams are already synced up with the new Task boards and attendance tracking. Great rollout!',
      },
    ],
  });

  // Seed Meetings
  console.log('📅 Seeding Meetings & Calendar...');
  const meetingSync = await prisma.meeting.create({
    data: {
      tenantId: acmeTenant.id,
      title: 'Weekly Engineering Architecture Sync',
      description: 'Review microservice event schemas, DB migration strategy, and PR review queues',
      startTime: new Date('2026-10-16T11:00:00+05:30'),
      endTime: new Date('2026-10-16T12:00:00+05:30'),
      organizerId: empDavid.id,
      locationOrUrl: 'https://meet.google.com/sey-tech-sync',
      status: MeetingStatus.SCHEDULED,
    },
  });

  await prisma.meetingAttendee.createMany({
    data: [
      { meetingId: meetingSync.id, employeeId: empDavid.id, status: 'ACCEPTED' },
      { meetingId: meetingSync.id, employeeId: empSara.id, status: 'ACCEPTED' },
      { meetingId: meetingSync.id, employeeId: empRahul.id, status: 'INVITED' },
    ],
  });

  // Seed Tenant 2: Starlight Healthcare (Proving Multi-Tenant Isolation)
  console.log('🏥 Seeding Tenant 2: Starlight Healthcare (for Isolation Tests)...');
  const starlightTenant = await prisma.tenant.upsert({
    where: { slug: 'starlight-health' },
    update: {},
    create: {
      name: 'Starlight Healthcare Network',
      slug: 'starlight-health',
      domain: 'starlight.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      planTier: PlanTier.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      maxEmployees: 500,
    },
  });

  const deptMedical = await prisma.department.create({
    data: {
      tenantId: starlightTenant.id,
      name: 'Cardiology & Intensive Care',
      code: 'CARDIO',
    },
  });

  const desigChiefSurgeon = await prisma.designation.create({
    data: {
      tenantId: starlightTenant.id,
      title: 'Chief Cardio Thoracic Surgeon',
      code: 'CHIEF-SURGEON',
      departmentId: deptMedical.id,
      level: 5,
    },
  });

  const empMarcus = await prisma.employee.create({
    data: {
      tenantId: starlightTenant.id,
      employeeCode: 'STAR-001',
      firstName: 'Dr. Marcus',
      lastName: 'Reed',
      email: 'admin@starlight.com',
      dateOfJoining: new Date('2021-04-01'),
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: deptMedical.id,
      designationId: desigChiefSurgeon.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@starlight.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Dr. Marcus',
      lastName: 'Reed',
      role: UserRole.COMPANY_ADMIN,
      tenantId: starlightTenant.id,
      employeeId: empMarcus.id,
    },
  });

  // Seed Centralized Audit Log
  console.log('🛡 Seeding Initial Audit Logs...');
  await prisma.auditLog.create({
    data: {
      tenantId: acmeTenant.id,
      userId: userAlex!.id,
      userEmail: userAlex!.email,
      action: AuditAction.LOGIN,
      entityType: 'AUTH',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  console.log('✅ Seyyon People Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
