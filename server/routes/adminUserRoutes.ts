/**
 * Administrator user management and first-time account registration.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { toAdminUserResponse } from "../adminUsers";
import { buildAssignableRoles } from "../assignableRoles";
import { requireAdmin, requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { db } from "../db";
import { requireInvestigatorDesignationManager } from "../investigatorDesignationPolicy";
import { logError } from "../logger";
import { respondWriteFailure } from "../writeFailureDetail";
import { ACCESS_ROLES, JOB_TITLE_TAB_ALIASES, matchesJobTitle } from "@shared/constants";
import { roleGroups, scientists, userRoleAssignments, users } from "@shared/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

export function registerAdminUserRoutes(app: Express): void {
  // ── Admin: user management ─────────────────────────────────────────────────

  // GET /api/admin/users — list all users (admin/superadmin only)
  app.get('/api/admin/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          user: {
            id: users.id,
            username: users.username,
            name: users.name,
            email: users.email,
            role: users.role,
            scientistId: users.scientistId,
            lastLoginAt: users.lastLoginAt,
          },
          profileJobTitle: scientists.jobTitle,
        })
        .from(users)
        .leftJoin(scientists, eq(users.scientistId, scientists.id))
        .orderBy(users.name);
      // One query for every assignment, then grouped in memory — a per-user
      // lookup here would be one query per row.
      const assignments = await db
        .select({ userId: userRoleAssignments.userId, name: roleGroups.name })
        .from(userRoleAssignments)
        .innerJoin(roleGroups, eq(userRoleAssignments.roleGroupId, roleGroups.id));
      const secondaryByUser = new Map<number, string[]>();
      for (const assignment of assignments) {
        const list = secondaryByUser.get(assignment.userId) ?? [];
        list.push(assignment.name);
        secondaryByUser.set(assignment.userId, list);
      }
      res.json(rows.map(({ user, profileJobTitle }) =>
        toAdminUserResponse(user, profileJobTitle, (secondaryByUser.get(user.id) ?? []).sort())
      ));
    } catch (err) {
      logError('Error fetching users', "routes", err);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // GET /api/admin/roles — matrix roles plus the two assignable built-ins.
  // role_groups is the canonical matrix source, so newly-added matrix roles
  // automatically become available in User Management.
  const ensureDefaultRoleGroups = async () => {
    await db
      .insert(roleGroups)
      .values(
        ACCESS_ROLES.map((name) => ({
          name,
          description: 'Default access-matrix role',
        }))
      )
      .onConflictDoNothing({ target: roleGroups.name });
  };

  app.get('/api/admin/roles', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      await ensureDefaultRoleGroups();
      const matrixRoles = await db
        .select({ name: roleGroups.name })
        .from(roleGroups)
        .orderBy(roleGroups.name);
      res.json(buildAssignableRoles(matrixRoles.map((entry) => entry.name)));
    } catch (err) {
      logError('Error fetching assignable roles', "routes", err);
      res.status(500).json({ message: 'Failed to fetch assignable roles' });
    }
  });
  // PUT /api/admin/users/:id/secondary-roles — replace a user's secondary roles
  //
  // Secondary roles are additive: access is the union of the primary and these.
  // Administrator rights are normally granted this way, so this endpoint can
  // escalate privilege and is administrator-only, like the primary-role route.
  app.put('/api/admin/users/:id/secondary-roles', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid user id' });

    const { roles } = req.body as { roles?: unknown };
    if (!Array.isArray(roles) || roles.some((role) => typeof role !== 'string')) {
      return res.status(400).json({ message: 'roles must be an array of role names' });
    }
    const requested = [...new Set((roles as string[]).map((role) => role.trim()).filter(Boolean))];

    // superadmin is granted by SUPER_ADMIN_EMAIL alone, never through the API.
    if (requested.includes('superadmin')) {
      return res.status(400).json({ message: 'superadmin cannot be assigned' });
    }
    // "user" is the absence of a role, so it is meaningless as a secondary.
    if (requested.includes('user')) {
      return res.status(400).json({ message: '"user" is the default role and cannot be a secondary role' });
    }

    try {
      const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: 'User not found' });

      await ensureDefaultRoleGroups();
      const groups = requested.length
        ? await db.select({ id: roleGroups.id, name: roleGroups.name })
            .from(roleGroups)
            .where(inArray(roleGroups.name, requested))
        : [];

      // "admin" is a legitimate secondary but is not a matrix role, so it has
      // no role_groups row until one is created for it.
      const known = new Set(groups.map((group) => group.name));
      const missing = requested.filter((role) => !known.has(role));
      if (missing.length) {
        const [created] = await db
          .insert(roleGroups)
          .values(missing.map((name) => ({ name, description: 'Assignable access role' })))
          .onConflictDoNothing({ target: roleGroups.name })
          .returning();
        void created;
        const refreshed = await db.select({ id: roleGroups.id, name: roleGroups.name })
          .from(roleGroups)
          .where(inArray(roleGroups.name, requested));
        groups.splice(0, groups.length, ...refreshed);
      }

      // Deliberately NOT filtered against the current primary role. Dropping a
      // secondary that duplicates the primary reads as tidy but is a trap: grant
      // `admin` as a secondary while `admin` is still the primary and it is
      // silently stored as nothing, so moving the primary to another role
      // afterwards leaves the person with no administrator rights and no sign
      // that anything was discarded. Access is the union of every slot, so
      // holding one role in both costs nothing.
      void target.role;
      const keep = groups;

      // Snapshot current secondary roles before replacing them.
      const prevAssignments = await db
        .select({ name: roleGroups.name })
        .from(userRoleAssignments)
        .innerJoin(roleGroups, eq(userRoleAssignments.roleGroupId, roleGroups.id))
        .where(eq(userRoleAssignments.userId, id));
      const prevRoles = prevAssignments.map((a) => a.name).sort();

      await db.transaction(async (tx: any) => {
        await tx.delete(userRoleAssignments).where(eq(userRoleAssignments.userId, id));
        if (keep.length) {
          await tx.insert(userRoleAssignments).values(
            keep.map((group) => ({
              userId: id,
              roleGroupId: group.id,
              // The demo session uses id 0, which is not a real user row, so
              // `??` wrote 0 and the users foreign key rejected the insert:
              // granting any secondary role in demo mode failed outright,
              // while clearing them all succeeded because that deletes only.
              // `||` records nobody instead.
              assignedBy: req.session?.user?.id || null,
            })),
          );
        }
      });

      const nextRoles = keep.map((group) => group.name).sort();
      await req.audit.logUpdate(
        "user_role_assignments", id,
        { userId: id, secondaryRoles: prevRoles },
        { userId: id, secondaryRoles: nextRoles },
        `Secondary roles replaced by admin`,
      );

      res.json({ id, secondaryRoles: nextRoles });
    } catch (err) {
      logError('Error updating secondary roles', "routes", err);
      res.status(500).json({ message: 'Failed to update secondary roles' });
    }
  });

  // PATCH /api/admin/users/:id/role — change a user's role
  app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid user id' });

    const { role } = req.body as { role: string };
    // superadmin can only be set via SUPER_ADMIN_EMAIL — never by this API.
    // role-name-ok: validates the value being assigned, not the caller.
    if (!role || role === 'superadmin') {
      return res.status(400).json({ message: 'Invalid role' });
    }

    try {
      await ensureDefaultRoleGroups();
      // role-name-ok: classifies the submitted role name, not the caller.
    const isBuiltInRole = role === 'user' || role === 'admin';
      const [matrixRole] = isBuiltInRole
        ? [undefined]
        : await db
            .select({ name: roleGroups.name })
            .from(roleGroups)
            .where(eq(roleGroups.name, role))
            .limit(1);
      if (!isBuiltInRole && !matrixRole) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const [before] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
      const updated = await storage.updateUser(id, { role } as any);
      if (!updated) return res.status(404).json({ message: 'User not found' });

      await req.audit.logUpdate(
        "users", id,
        { role: before?.role ?? null },
        { role },
        `Primary role changed by admin`,
      );

      res.json(updated);
    } catch (err) {
      respondWriteFailure(res, 'Failed to update role', err);
    }
  });

  /**
   * POST /api/admin/users/provision-by-job-title
   *
   * Creates an account for every staff member with the given job title who has
   * none. Takes the job title group rather than being written once per title:
   * Investigators and Physicians need exactly the same thing, and a second copy
   * of eighty lines would drift from the first.
   *
   * Investigator eligibility is the Investigator *access role*, which lives on
   * an account -- so a person holding the job title but no account cannot be
   * made a PI, and an import that assigns them one is refused. This closes that
   * gap by giving them an account to hold the role.
   *
   * The accounts are created with the restricted `user` role, not Investigator.
   * Seeding a privilege from a job title is exactly the coupling that was
   * removed when eligibility moved to the access role; an administrator grants
   * Investigator deliberately in User Management afterwards. Every account
   * therefore starts fail-closed, like any other new account.
   *
   * Pass `dryRun` to see the plan without writing anything.
   */
  app.post('/api/admin/users/provision-by-job-title', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const body = req.body as {
      dryRun?: boolean;
      jobTitleGroup?: string;
      scientistIds?: unknown;
    } | undefined;
    const dryRun = body?.dryRun === true;

    // Named people take precedence over a job title group, so the same
    // machinery serves "everyone titled Physician" and "this one person" --
    // the username derivation, the collision handling and the reasons for
    // skipping are worth having in one place rather than two.
    const explicitIds = Array.isArray(body?.scientistIds)
      ? [...new Set((body!.scientistIds as unknown[])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0))]
      : null;

    const group = (body?.jobTitleGroup ?? 'investigator').trim();
    const titles = explicitIds ? [] : JOB_TITLE_TAB_ALIASES[group];
    if (!explicitIds && !titles) {
      return res.status(400).json({
        message: `"${group}" is not a job title group. Known: ${Object.keys(JOB_TITLE_TAB_ALIASES).join(', ')}`,
      });
    }
    if (explicitIds && explicitIds.length === 0) {
      return res.status(400).json({ message: 'No valid scientist ids were sent.' });
    }

    try {
      const allScientists = await storage.getScientists();
      const existingUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          scientistId: users.scientistId,
        })
        .from(users);

      const takenUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
      const linkedScientistIds = new Set(
        existingUsers.map((u) => u.scientistId).filter((v): v is number => v != null),
      );
      const takenEmails = new Set(
        existingUsers.map((u) => (u.email ?? '').trim().toLowerCase()).filter(Boolean),
      );

      const candidates = explicitIds
        ? allScientists.filter((scientist: any) => explicitIds.includes(scientist.id))
        : allScientists.filter((scientist: any) => matchesJobTitle(scientist.jobTitle, titles!));

      const toCreate: Array<{ scientistId: number; username: string; name: string; email: string }> = [];
      const skipped: Array<{ name: string; reason: string }> = [];

      for (const scientist of candidates as any[]) {
        const name = [scientist.firstName, scientist.lastName].filter(Boolean).join(' ').trim()
          || scientist.email
          || `Scientist ${scientist.id}`;
        if (linkedScientistIds.has(scientist.id)) {
          skipped.push({ name, reason: 'Already has an account' });
          continue;
        }
        const email = (scientist.email ?? '').trim();
        if (!email) {
          // The username an external provider would send is derived from the
          // address, so without one there is nothing to match a future sign-in.
          skipped.push({ name, reason: 'No email on the staff profile' });
          continue;
        }
        if (takenEmails.has(email.toLowerCase())) {
          skipped.push({ name, reason: 'Another account already uses this email' });
          continue;
        }

        const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
        if (!base) {
          skipped.push({ name, reason: 'Email does not yield a usable username' });
          continue;
        }
        let username = base;
        let suffix = 2;
        while (takenUsernames.has(username)) username = `${base}${suffix++}`;

        takenUsernames.add(username);
        takenEmails.add(email.toLowerCase());
        toCreate.push({ scientistId: scientist.id, username, name, email });
      }

      if (dryRun || toCreate.length === 0) {
        return res.json({ dryRun: true, created: [], plan: toCreate, skipped });
      }

      const created = await db.transaction(async (tx: any) =>
        tx
          .insert(users)
          .values(
            toCreate.map((entry) => ({
              username: entry.username,
              name: entry.name,
              email: entry.email,
              // NOT NULL with no default. Empty means no local password is set,
              // so the account cannot be signed into with one -- the same state
              // every account restored from an archive is in. An external
              // provider matches on username and adopts the row on first login.
              password: '',
              role: 'user',
              scientistId: entry.scientistId,
            })),
          )
          .returning({ id: users.id, username: users.username, name: users.name }),
      );

      res.json({ dryRun: false, created, plan: toCreate, skipped });
    } catch (err) {
      logError(`Error provisioning ${group} accounts`, "routes", err);
      res.status(500).json({ message: `Failed to create ${group} accounts` });
    }
  });

  // POST /api/register — first-time user links their account to a scientist/staff profile
  app.post(
    '/api/register',
    requireAuth,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    const sessionUser = (req.session as any)?.user;
    if (!sessionUser) return res.status(401).json({ message: 'Not authenticated' });
    if (sessionUser.scientistId) {
      return res.status(400).json({ message: 'Already registered' });
    }

    const { firstName, lastName, jobTitle, staffType, honorificTitle, department } = req.body as {
      firstName: string; lastName: string; jobTitle: string; staffType: string;
      honorificTitle?: string; department?: string;
    };
    if (!firstName || !lastName || !jobTitle || !staffType) {
      return res.status(400).json({ message: 'firstName, lastName, jobTitle and staffType are required' });
    }

    try {
      let scientistId: number;
      try {
        scientistId = await db.transaction(async (tx) => {
          // Adopt the staff profile that already exists for this address before
          // making another one. Matched ignoring case: staff records here are
          // lower-case while Active Directory returns the address as registered
          // -- "WHendrickx@..." for "whendrickx@..." -- and comparing literally
          // created a second profile for somebody already in the table, which
          // then had to be merged by hand.
          //
          // Registration still creates a profile for anyone the directory does
          // not know; it just stops being the only thing it can do.
          const normalisedEmail = String(sessionUser.email ?? '').trim().toLowerCase();
          if (normalisedEmail) {
            const [existing] = await tx
              .select({ id: scientists.id })
              .from(scientists)
              .where(sql`lower(${scientists.email}) = ${normalisedEmail}`)
              .limit(1);
            if (existing) {
              const [linkedToExisting] = await tx
                .update(users)
                .set({ scientistId: existing.id })
                .where(and(eq(users.id, sessionUser.id), isNull(users.scientistId)))
                .returning({ id: users.id });
              if (!linkedToExisting) throw new Error('REGISTRATION_ALREADY_LINKED');
              return existing.id;
            }
          }

          const [created] = await tx
            .insert(scientists)
            .values({
              firstName,
              lastName,
              email: sessionUser.email,
              jobTitle,
              staffType,
              honorificTitle: honorificTitle || '',
              department: department || null,
            } as any)
            .returning({ id: scientists.id });
          if (!created) throw new Error('Failed to create profile');

          const [linkedUser] = await tx
            .update(users)
            .set({ scientistId: created.id })
            .where(and(eq(users.id, sessionUser.id), isNull(users.scientistId)))
            .returning({ id: users.id });
          if (!linkedUser) throw new Error('REGISTRATION_ALREADY_LINKED');
          return created.id;
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'REGISTRATION_ALREADY_LINKED') {
          throw error;
        }
        const [alreadyLinked] = await db
          .select({ scientistId: users.scientistId })
          .from(users)
          .where(eq(users.id, sessionUser.id))
          .limit(1);
        if (!alreadyLinked?.scientistId) throw error;
        scientistId = alreadyLinked.scientistId;
      }

      (req.session as any).user = {
        ...sessionUser,
        scientistId,
        needsRegistration: false,
      };
      await new Promise<void>((resolve) => {
        req.session.save((error) => {
          if (error) {
            logError('Registration session save failed after profile was linked', "routes", error);
          }
          resolve();
        });
      });
      res.json({ user: (req.session as any).user });
    } catch (err) {
      logError('Error during registration', "routes", err);
      res.status(500).json({ message: 'Failed to create profile' });
    }
    }
  );
}
